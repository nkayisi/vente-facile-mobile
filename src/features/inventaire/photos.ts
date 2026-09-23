/**
 * La photo d'un article : rangée localement, envoyée après coup.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ELLE NE PEUT PAS VOYAGER PAR LE JOURNAL, ET CE N'EST PAS UN OUBLI.      │
 * │                                                                          │
 * │ `/sync/operations/` transporte du JSON ; `Product.image` est un          │
 * │ `ImageField`, donc du multipart. Deux voies, dans cet ordre obligé :     │
 * │                                                                          │
 * │  1. `product.create` part par le journal et crée l'article.              │
 * │  2. la photo part par un `PATCH /products/{id}/` multipart.              │
 * │                                                                          │
 * │ L'ordre n'est pas négociable : le second appelle un article qui doit     │
 * │ exister. C'est pourquoi l'envoi attend que l'opération de création ait   │
 * │ QUITTÉ le journal - autrement dit qu'elle ait été appliquée.             │
 * │                                                                          │
 * │ Ce qui rend la manœuvre possible : `product.create` transmet l'ID du     │
 * │ TERMINAL et le serveur le CONSERVE (`local_id` dans `product_create`).   │
 * │ Sans cela il faudrait guetter un identifiant renvoyé, et une photo       │
 * │ perdue en route ne saurait plus qui viser.                               │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import { Directory, File, Paths } from "expo-file-system";
import { eq } from "drizzle-orm";

import { API_BASE_URL } from "@/api/config";
import { currentOrganizationId, ensureFreshTokens } from "@/api/client";
import { db } from "@/db/client";
import { pendingProductPhotos } from "@/db/schema";
import { enAttenteParType } from "@/sync";

import type { PhotoChoisie } from "./champ-photo";

/**
 * Au-delà, on cesse de réessayer tout seul.
 *
 * Un refus qui se répète n'est pas transitoire : c'est un article refusé, un
 * droit manquant, ou un fichier illisible. Marteler le serveur n'y changerait
 * rien, et la file d'envoi doit rester libre pour les ventes.
 */
export const ESSAIS_MAX = 5;

/** Le dossier des photos en attente, hors du cache que le système efface. */
function dossier(): Directory {
  const cible = new Directory(Paths.document, "photos-articles");
  if (!cible.exists) cible.create({ intermediates: true });
  return cible;
}

/**
 * Range la photo et l'inscrit en file.
 *
 * ⚠ Le fichier est COPIÉ. L'URI que rend le sélecteur pointe vers un cache que
 * le système efface dès que le stockage se tend : une photo prise le matin
 * partirait le soir sur un fichier disparu, et le marchand ne saurait jamais
 * pourquoi son article n'en a pas.
 */
export async function rangerPhoto(
  productId: string,
  photo: PhotoChoisie
): Promise<void> {
  const source = new File(photo.uri);
  const cible = new File(dossier(), `${productId}-${photo.nom}`);
  if (cible.exists) cible.delete();
  source.copy(cible);

  await db
    .insert(pendingProductPhotos)
    .values({
      productId,
      uri: cible.uri,
      fileName: photo.nom,
      mimeType: photo.mime,
    })
    .onConflictDoUpdate({
      target: pendingProductPhotos.productId,
      // Une seconde photo REMPLACE la première, compteur d'essais remis à zéro :
      // le marchand vient de dire que c'est celle-là qu'il veut.
      set: {
        uri: cible.uri,
        fileName: photo.nom,
        mimeType: photo.mime,
        attempts: 0,
        lastError: null,
      },
    });
}

export interface ResultatEnvoiPhotos {
  envoyees: number;
  differees: number;
  abandonnees: number;
}

/**
 * Envoie les photos dont l'article est arrivé au serveur.
 *
 * Appelée à la fin d'un cycle de synchronisation, APRÈS la poussée : une photo
 * dont la création est encore en file n'a pas d'article à viser.
 */
export async function envoyerPhotosEnAttente(): Promise<ResultatEnvoiPhotos> {
  const attente = await db.select().from(pendingProductPhotos);
  if (attente.length === 0) {
    return { envoyees: 0, differees: 0, abandonnees: 0 };
  }

  // Les créations ENCORE en file, bloquées comprises : une photo dont l'article
  // n'existe pas côté serveur recevrait un 404, qui compterait comme un échec
  // et finirait par l'abandonner. Elle attend, simplement.
  const creations = await enAttenteParType<{ id?: string }>("product.create", {
    avecBloquees: true,
  });
  const pasEncoreCrees = new Set(
    creations.map((c) => c.payload?.id).filter(Boolean) as string[]
  );

  const resultat: ResultatEnvoiPhotos = { envoyees: 0, differees: 0, abandonnees: 0 };

  for (const ligne of attente) {
    if (pasEncoreCrees.has(ligne.productId)) {
      resultat.differees += 1;
      continue;
    }
    if (ligne.attempts >= ESSAIS_MAX) {
      resultat.abandonnees += 1;
      continue;
    }

    try {
      await televerserPhoto(ligne.productId, ligne.uri, ligne.fileName, ligne.mimeType);
      await oublierPhoto(ligne.productId);
      resultat.envoyees += 1;
    } catch (e) {
      await db
        .update(pendingProductPhotos)
        .set({
          attempts: ligne.attempts + 1,
          lastError: e instanceof Error ? e.message : "Envoi refusé.",
        })
        .where(eq(pendingProductPhotos.productId, ligne.productId));
      resultat.differees += 1;
    }
  }

  return resultat;
}

/** Retire la ligne ET le fichier : une photo envoyée n'a plus à occuper le disque. */
export async function oublierPhoto(productId: string): Promise<void> {
  const [ligne] = await db
    .select()
    .from(pendingProductPhotos)
    .where(eq(pendingProductPhotos.productId, productId));
  if (ligne) {
    try {
      const f = new File(ligne.uri);
      if (f.exists) f.delete();
    } catch {
      // Un fichier qu'on ne peut pas effacer ne doit pas retenir sa ligne :
      // elle repartirait à chaque cycle sur une photo déjà arrivée.
    }
  }
  await db
    .delete(pendingProductPhotos)
    .where(eq(pendingProductPhotos.productId, productId));
}

/** Combien de photos attendent encore leur envoi. */
export async function nbPhotosEnAttente(): Promise<number> {
  const lignes = await db
    .select({ productId: pendingProductPhotos.productId })
    .from(pendingProductPhotos);
  return lignes.length;
}

/**
 * Efface TOUS les fichiers de photos en attente, ligne par ligne puis le dossier.
 *
 * Appelé par la purge de la base locale, et par elle seule.
 *
 * ⚠ **Le dossier est balayé APRÈS les lignes connues, et il faut les deux.** Les
 * `uri` couvrent ce que la table référence ; le balayage du dossier ramasse ce
 * qu'une purge précédente a laissé - un arrêt entre la suppression du fichier et
 * celle de sa ligne, ou l'inverse. Sans lui, un terminal accumulerait des photos
 * que plus rien ne désigne, sur un stockage qui manque déjà de place.
 *
 * Rend le nombre de fichiers réellement supprimés. Aucune erreur ne remonte : un
 * fichier récalcitrant ne doit pas empêcher une déconnexion d'aboutir.
 */
export async function viderDossierPhotos(): Promise<number> {
  let supprimes = 0;

  const lignes = await db.select({ uri: pendingProductPhotos.uri }).from(pendingProductPhotos);
  for (const ligne of lignes) {
    try {
      const f = new File(ligne.uri);
      if (f.exists) {
        f.delete();
        supprimes += 1;
      }
    } catch {
      // Un fichier qu'on ne peut pas effacer ne retient pas la purge.
    }
  }

  try {
    for (const entree of dossier().list()) {
      try {
        entree.delete();
        supprimes += 1;
      } catch {
        // idem
      }
    }
  } catch {
    // Dossier absent ou illisible : il n'y a rien à ramasser.
  }

  return supprimes;
}

/**
 * Le `PATCH` multipart lui-même.
 *
 * ⚠ On n'écrit PAS `Content-Type` : c'est `fetch` qui doit poser
 * `multipart/form-data; boundary=…`, et la frontière n'est connue que de lui.
 * L'imposer à la main produit un corps que Django ne sait pas découper, et le
 * champ arrive vide - sans erreur, l'article restant simplement sans photo.
 */
async function televerserPhoto(
  productId: string,
  uri: string,
  fileName: string,
  mimeType: string
): Promise<void> {
  const jetons = await ensureFreshTokens();
  const corps = new FormData();
  // La forme `{ uri, name, type }` est celle que React Native attend d'un
  // fichier local ; un `Blob` obligerait à charger la photo en mémoire.
  corps.append("image", { uri, name: fileName, type: mimeType } as unknown as Blob);

  const reponse = await fetch(`${API_BASE_URL}/products/${productId}/`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${jetons.access}`,
      "X-Organization-ID": currentOrganizationId() ?? "",
    },
    body: corps,
  });

  if (!reponse.ok) {
    const texte = await reponse.text().catch(() => "");
    throw new Error(messageDeRefus(reponse.status, texte));
  }
}

/**
 * Un message d'erreur est une PHRASE, jamais une page.
 *
 * Un 404 ou un 500 de Django rend sa page de débogage complète ; la recopier
 * dans un bandeau donnerait deux écrans de balises. Même règle que
 * `readableMessage`.
 */
function messageDeRefus(status: number, corps: string): string {
  if (status === 404) return "L'article n'existe pas encore sur le serveur.";
  if (status === 403) return "Vous n'avez pas le droit de modifier cet article.";
  if (status === 402) return "L'abonnement doit être réglé pour envoyer la photo.";

  const propre = corps.trim();
  if (!propre || propre.startsWith("<") || propre.length > 300) {
    return `La photo a été refusée (erreur ${status}).`;
  }
  try {
    const json = JSON.parse(propre) as Record<string, unknown>;
    const premier = Object.values(json)[0];
    if (Array.isArray(premier) && typeof premier[0] === "string") return premier[0];
    if (typeof premier === "string") return premier;
  } catch {
    // Corps non JSON et pourtant court : on le rend tel quel, il en dit plus
    // qu'un message générique.
  }
  return propre;
}
