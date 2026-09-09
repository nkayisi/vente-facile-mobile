/**
 * Les actes d'une session d'inventaire, et la création au catalogue.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE COMPTAGE S'ÉCRIT DANS LE JOURNAL, PAS DANS LA TABLE TIRÉE.           │
 * │                                                                          │
 * │ On compte debout dans le rayon, souvent sans réseau. Un comptage écrit   │
 * │ localement puis refusé laisserait une feuille qui se croit finie. La     │
 * │ fusion se fait donc à la lecture : la table tirée porte ce que le        │
 * │ serveur sait, le journal ce que le magasinier vient de saisir.           │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import * as Crypto from "expo-crypto";

import { pireEnvoi } from "@/data/envoi";
import { lotEnAttente, type LotEnAttente } from "@/features/sync/attente";
import { enAttenteParType, enqueue, type EtatEnvoi } from "@/sync";

// Le corps de l'acte vit dans le module PUR : ce fichier importe `@/sync`, qui
// ouvre la base SQLite au chargement, et le contrat de transport ne serait
// alors éprouvable sur aucune machine sans appareil. C'est le motif déjà
// retenu pour `payload-mouvement.ts`.
import {
  type ActeEnFile,
  type TransitionSession,
} from "./apparence";
import {
  corpsDeLaSession,
  type SaisieSession,
} from "./nouvelle-session";
import { slugifier } from "./slug";

export type { SaisieSession };
// Le type vit dans `apparence.ts`, module PUR : ce fichier ouvre SQLite au
// chargement. Le réexport garde les appelants en place.
export type { ActeEnFile, TransitionSession };

/**
 * Met une session d'inventaire en file.
 *
 * ⚠ Le nom se compose ICI, à l'instant de l'envoi, et non au montage de
 * l'écran : un formulaire laissé ouvert passé minuit doit enregistrer la date
 * qu'il affichera après, pas celle qu'il affichait avant.
 */
export async function creerSession(saisie: SaisieSession): Promise<string> {
  const id = Crypto.randomUUID();
  await enqueue(id, "inventory_session.create", {
    id,
    ...corpsDeLaSession(saisie, new Date()),
  });
  return id;
}

const TRANSITIONS: TransitionSession[] = ["start", "submit", "validate", "cancel"];

export async function transitionSession(
  sessionId: string,
  transition: TransitionSession
): Promise<string> {
  const id = Crypto.randomUUID();
  await enqueue(id, `inventory_session.${transition}` as never, {
    id,
    session: sessionId,
  });
  return id;
}

/** Un comptage, tel que le magasinier le saisit dans le rayon. */
export interface Comptage {
  ligne: string;
  /** Total en unité de détail. Toujours envoyé : le serveur le retient si la
   *  ligne n'a pas de conditionnement. */
  total: number;
  contenants?: number;
  vrac?: number;
  notes?: string;
}

/**
 * Envoie un lot de comptages.
 *
 * Un LOT et non une ligne à la fois : on compte une allée, puis on enregistre.
 * Une ligne inconnue du serveur est ignorée par lui, pas refusée - le travail
 * du magasinier ne doit pas être condamné par une ligne supprimée entre-temps.
 */
export async function enregistrerComptages(
  sessionId: string,
  comptages: Comptage[]
): Promise<string> {
  const id = Crypto.randomUUID();
  await enqueue(id, "inventory_session.count", {
    id,
    session: sessionId,
    counts: comptages.map((c) => ({
      id: c.ligne,
      quantity_counted: String(c.total),
      ...(c.contenants != null
        ? { counted_package_quantity: String(c.contenants) }
        : {}),
      ...(c.vrac != null ? { counted_loose_quantity: String(c.vrac) } : {}),
      ...(c.notes ? { notes: c.notes } : {}),
    })),
  });
  return id;
}

/** Comptages saisis sur ce terminal et pas encore confirmés, par ligne. */
export interface ComptageEnAttente {
  total: number;
  contenants: number | null;
  vrac: number | null;
  /**
   * Où en est l'envoi de CE comptage.
   *
   * Un comptage bloqué reste affiché - c'est du travail fait dans le rayon, le
   * masquer ferait recompter - mais il n'ouvre pas la soumission : il
   * n'arrivera pas au serveur, qui verrait une feuille incomplète.
   */
  envoi: EtatEnvoi;
}

export async function comptagesEnAttente(
  sessionId: string
): Promise<Map<string, ComptageEnAttente>> {
  // `avecBloquees` : voir `ComptageEnAttente.envoi`. La lecture ne peut ici
  // que RESSERRER - elle ferme une porte, elle n'affirme aucun acquis.
  const ops = await enAttenteParType<{
    session: string;
    counts?: {
      id: string;
      quantity_counted?: string;
      counted_package_quantity?: string;
      counted_loose_quantity?: string;
    }[];
  }>("inventory_session.count", { avecBloquees: true });

  // Le DERNIER comptage d'une ligne gagne : le magasinier recompte quand il
  // doute, et c'est sa dernière lecture qui vaut.
  const par = new Map<string, ComptageEnAttente>();
  for (const o of ops) {
    if (o.payload.session !== sessionId) continue;
    for (const c of o.payload.counts ?? []) {
      par.set(c.id, {
        total: Number(c.quantity_counted ?? 0),
        contenants:
          c.counted_package_quantity != null
            ? Number(c.counted_package_quantity)
            : null,
        vrac:
          c.counted_loose_quantity != null ? Number(c.counted_loose_quantity) : null,
        // L'état retenu est celui de l'opération retenue, pas le pire : c'est
        // la valeur que le magasinier vient de saisir.
        envoi: o.envoi,
      });
    }
  }
  return par;
}

/** Une session créée sur ce terminal et pas encore confirmée. */
export interface SessionEnAttente {
  id: string;
  nom: string;
  entrepot: string;
  perimetre: string;
  envoi: EtatEnvoi;
  /** Quand elle a été mise en file. */
  le: Date;
}

/**
 * Les sessions créées ici, encore dans le journal.
 *
 * Sans cette lecture, une session tout juste créée serait déclarée
 * « introuvable » par sa propre fiche : elle n'est PAS dans la table tirée, et
 * elle ne doit pas y être. C'est la contrepartie systématique de la règle
 * « on n'écrit rien dans une table tirée ».
 *
 * ⚠ `avecBloquees` est OBLIGATOIRE ici. Sans lui, une session créée puis
 * bloquée - abonnement expiré, droit manquant - disparaît de la liste ET de sa
 * propre fiche, qui la déclare « introuvable » alors que l'opération est
 * vivante et s'appliquera dès le déblocage. Rien n'est pour autant présenté
 * comme acquis : le badge dit « en attente d'un droit ».
 */
export async function creationsEnAttente(): Promise<SessionEnAttente[]> {
  const ops = await enAttenteParType<{
    id: string;
    name?: string;
    warehouse?: string;
    scope_type?: string;
  }>("inventory_session.create", { avecBloquees: true });
  return ops.map((o) => ({
    id: o.payload.id,
    nom: o.payload.name ?? "Session",
    entrepot: o.payload.warehouse ?? "",
    perimetre: o.payload.scope_type ?? "full",
    envoi: o.envoi,
    le: o.occurredAt,
  }));
}

/** L'acte qu'une session attend d'envoyer, et où il en est. */
export interface AttenteSession {
  /** Le plus RÉCENT : c'est le dernier geste du magasinier. */
  acte: ActeEnFile;
  /**
   * Le PIRE état de tous les actes en file pour cette session.
   *
   * Un comptage en file plus une soumission bloquée, ce n'est pas « attend son
   * envoi » : c'est bloqué, et proposer de synchroniser ferait attendre un
   * réseau qui ne débloquera rien.
   */
  envoi: EtatEnvoi;
  le: Date;
}

/**
 * Ce que chaque session attend d'envoyer.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN `Set` NE DISAIT NI QUOI, NI DANS QUEL ÉTAT.                          │
 * │                                                                          │
 * │ Les cinq actes étaient aplatis en identifiants : l'écran savait qu'« une │
 * │ opération » attendait, jamais laquelle, et surtout jamais si elle était  │
 * │ BLOQUÉE. Il annonçait donc « attend son envoi » sur une opération qui    │
 * │ attend une décision, et le marchand cherchait du réseau des jours        │
 * │ durant.                                                                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ `avecBloquees` est OBLIGATOIRE, et ce n'est pas une lecture optimiste :
 * elle ne fait que FERMER une porte. Sans lui, un `start` bloqué sort de la
 * carte, « Démarrer le comptage » redevient actif, et le magasinier met en
 * file un SECOND démarrage. `unblockAll` les libère tous deux : le premier
 * s'applique, le second part en quarantaine avec « session déjà démarrée », et
 * il découvre un refus qu'il n'a jamais provoqué. C'est mot pour mot le défaut
 * de la seconde session de caisse (`features/pos/caisse.ts`).
 *
 * Un `inventory_session.count` n'y entre PAS : un comptage n'est pas une
 * transition d'état, et l'y mêler ferait dire « une opération attend son
 * envoi » à chaque ligne saisie, sur toute la feuille, en permanence. Les
 * comptages se lisent ligne par ligne, dans `comptagesEnAttente`.
 */
export async function sessionsEnAttente(): Promise<Map<string, AttenteSession>> {
  const [creations, parTransition] = await Promise.all([
    enAttenteParType<{ id: string }>("inventory_session.create", {
      avecBloquees: true,
    }),
    Promise.all(
      TRANSITIONS.map(async (t) => ({
        acte: t as ActeEnFile,
        ops: await enAttenteParType<{ session: string }>(
          `inventory_session.${t}`,
          { avecBloquees: true }
        ),
      }))
    ),
  ]);

  const actes = [
    ...creations.map((o) => ({
      session: o.payload.id,
      acte: "create" as ActeEnFile,
      envoi: o.envoi,
      le: o.occurredAt,
    })),
    ...parTransition.flatMap(({ acte, ops }) =>
      ops.map((o) => ({
        session: o.payload.session,
        acte,
        envoi: o.envoi,
        le: o.occurredAt,
      }))
    ),
  ];

  const par = new Map<string, AttenteSession>();
  for (const a of actes) {
    if (!a.session) continue;
    const deja = par.get(a.session);
    const plusRecent = !deja || a.le >= deja.le;
    par.set(a.session, {
      acte: plusRecent ? a.acte : deja.acte,
      le: plusRecent ? a.le : deja.le,
      envoi: pireEnvoi([deja?.envoi, a.envoi]),
    });
  }
  return par;
}

// ------------------------------------------------------------------ catalogue

export interface SaisieArticle {
  nom: string;
  sku: string;
  codeBarres?: string;
  categorie?: string | null;
  marque?: string | null;
  unite?: string | null;
  prixVente: number;
  prixAchat: number;
  suitLeStock: boolean;
  seuilReassort?: number;
  /** Conditionnement : nombre d'unités de détail par contenant. */
  unitesParContenant?: number;
  uniteContenant?: string | null;
  notes?: string;
}

export async function creerArticle(saisie: SaisieArticle): Promise<string> {
  const id = Crypto.randomUUID();
  await enqueue(id, "product.create", {
    id,
    name: saisie.nom.trim(),
    slug: slugifier(saisie.nom),
    sku: saisie.sku.trim(),
    ...(saisie.codeBarres?.trim() ? { barcode: saisie.codeBarres.trim() } : {}),
    ...(saisie.categorie ? { category: saisie.categorie } : {}),
    ...(saisie.marque ? { brand: saisie.marque } : {}),
    ...(saisie.unite ? { unit: saisie.unite } : {}),
    selling_price: String(saisie.prixVente),
    cost_price: String(saisie.prixAchat),
    track_inventory: saisie.suitLeStock,
    ...(saisie.seuilReassort != null
      ? { reorder_point: String(saisie.seuilReassort) }
      : {}),
    ...(saisie.unitesParContenant && saisie.unitesParContenant > 1
      ? {
          selling_mode: "both",
          units_per_package: saisie.unitesParContenant,
          ...(saisie.uniteContenant ? { packaging_unit: saisie.uniteContenant } : {}),
        }
      : {}),
    notes: saisie.notes ?? "",
    is_active: true,
  });
  return id;
}

export async function creerReferentiel(
  genre: "category" | "brand" | "unit",
  saisie: { nom: string; symbole?: string; parent?: string | null }
): Promise<string> {
  const id = Crypto.randomUUID();
  await enqueue(id, `${genre}.create` as never, {
    id,
    name: saisie.nom.trim(),
    // Une UNITÉ n'a pas de `slug` : elle porte un symbole.
    ...(genre === "unit"
      ? { symbol: (saisie.symbole ?? saisie.nom).trim() }
      : { slug: slugifier(saisie.nom) }),
    ...(genre === "category" && saisie.parent ? { parent: saisie.parent } : {}),
    is_active: true,
  });
  return id;
}

/** Ce que le catalogue attend d'envoyer, par genre. */
export async function catalogueEnAttente(): Promise<{
  articles: { id: string; nom: string; sku: string }[];
  referentiels: LotEnAttente;
}> {
  const [articles, cats, marques, unites] = await Promise.all([
    enAttenteParType<{ id: string; name: string; sku: string }>("product.create"),
    enAttenteParType<{ id: string }>("category.create"),
    enAttenteParType<{ id: string }>("brand.create"),
    enAttenteParType<{ id: string }>("unit.create"),
  ]);
  return {
    articles: articles.map((o) => ({
      id: o.payload.id,
      nom: o.payload.name,
      sku: o.payload.sku,
    })),
    referentiels: lotEnAttente([...cats, ...marques, ...unites]),
  };
}

export { slugifier };
