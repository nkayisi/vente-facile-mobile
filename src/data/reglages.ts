/**
 * Réglages propres à l'appareil (`local_settings`).
 *
 * Clé/valeur en JSON, jamais synchronisés : le thème, le transport
 * d'impression, la largeur de papier. Deux caissiers qui se partagent un
 * terminal ne se volent pas leur réglage, et le réglage survit hors ligne.
 *
 * **Toutes les lectures tolèrent une base non prête.** Le thème est demandé par
 * un fournisseur monté AU-DESSUS de la base - volontairement, pour que l'écran
 * d'erreur de migration soit lui aussi habillé. Une exception y remonterait
 * jusqu'à la racine et empêcherait l'application de démarrer, pour un réglage
 * de confort.
 */
import { eq } from "drizzle-orm";
import * as Crypto from "expo-crypto";

import { db } from "@/db/client";
import { localSettings } from "@/db/schema";

export async function lireReglage<T>(cle: string, defaut: T): Promise<T> {
  try {
    const [ligne] = await db
      .select()
      .from(localSettings)
      .where(eq(localSettings.key, cle))
      .limit(1);
    if (!ligne) return defaut;
    return JSON.parse(ligne.value) as T;
  } catch {
    return defaut;
  }
}

export async function ecrireReglage(cle: string, valeur: unknown): Promise<void> {
  try {
    await db
      .insert(localSettings)
      .values({ key: cle, value: JSON.stringify(valeur), updatedAt: new Date() })
      .onConflictDoUpdate({
        target: localSettings.key,
        set: { value: JSON.stringify(valeur), updatedAt: new Date() },
      });
  } catch {
    // Un réglage qu'on n'a pas pu écrire se retrouvera au défaut au prochain
    // démarrage. Ce n'est pas une raison pour interrompre l'utilisateur.
  }
}

export const CLE_THEME = "theme.preference";

/**
 * L'identifiant de CETTE installation de l'application.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CHAQUE RECONNEXION CRÉAIT UN APPAREIL DE PLUS CÔTÉ SERVEUR.             │
 * │                                                                          │
 * │ `enroll_device` fait un `create()` sec : un terminal qui se reconnecte - │
 * │ jetons refusés, changement de compte, changement d'établissement -       │
 * │ laissait derrière lui un appareil ACTIF dont plus personne ne détient le │
 * │ jeton, et le gérant voyait sa liste d'appareils s'allonger de fantômes   │
 * │ qu'il n'osait pas révoquer. Cet identifiant dit au serveur « c'est le    │
 * │ même téléphone » : l'enrôlement suivant révoque l'ancien.               │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ IL EST DANS `CLES_CONSERVEES`, ET C'EST TOUT SON OBJET : c'est un fait sur
 *   le MATÉRIEL, comme l'imprimante. Purgé à la déconnexion, il changerait
 *   précisément au moment où il doit rester le même.
 *
 * ⚠ CE N'EST NI UN SECRET NI UN `device_code` : il ne donne accès à rien, et le
 *   code d'appareil, qui numérote les documents, reste attribué par le serveur
 *   et n'est JAMAIS réemployé - une série repartirait de zéro.
 */
export const CLE_INSTALLATION = "appareil.installation";

/** L'identifiant de l'installation, créé au premier appel puis conservé. */
export async function identifiantInstallation(): Promise<string> {
  const connu = await lireReglage<string | null>(CLE_INSTALLATION, null);
  if (connu) return connu;
  const neuf = Crypto.randomUUID();
  await ecrireReglage(CLE_INSTALLATION, neuf);
  return neuf;
}

/**
 * « Ce terminal a déjà vu la présentation. »
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ C'EST UN FAIT SUR L'INSTALLATION, PAS SUR UNE PERSONNE.                 │
 * │                                                                          │
 * │ La première version le tenait pour un fait de COMPTE et le laissait      │
 * │ effacer par la purge : le carrousel revenait après chaque déconnexion.   │
 * │ Décision de l'utilisateur, le 14 novembre 2026 : la présentation est     │
 * │ pour qui VIENT D'INSTALLER l'application. Un caissier qui rend le        │
 * │ terminal à son collègue n'a rien à découvrir, il doit trouver l'écran de │
 * │ connexion.                                                               │
 * │                                                                          │
 * │ D'où DEUX gestes, et il faut les deux :                                  │
 * │ - la clé est dans `CLES_CONSERVEES` (`db/purge-regles.ts`), sans quoi le │
 * │   nettoyage de la déconnexion l'effacerait ;                             │
 * │ - la déconnexion la POSE (`session/provider.tsx`), sans quoi un terminal │
 * │   enrôlé avant que ce drapeau existe ne l'aurait jamais écrit, et        │
 * │   montrerait la présentation à sa première déconnexion.                  │
 * │                                                                          │
 * │ Seule une installation neuve - ou des données effacées par les réglages  │
 * │ du téléphone - la remontre.                                              │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export const CLE_ACCUEIL_VU = "accueil.vu";

/**
 * ⚠ LE DÉFAUT EST « PAS ENCORE VU », et il le faut dans les deux sens.
 *
 * `lireReglage` avale ses erreurs et rend le défaut : sur une base illisible,
 * on remontre donc la présentation. C'est l'oubli qui coûte le moins - un appui
 * sur « Passer » - là où le défaut inverse ferait perdre la présentation à
 * quelqu'un qui ne l'a jamais vue, sans aucun moyen d'y revenir.
 */
export async function accueilDejaVu(): Promise<boolean> {
  return lireReglage(CLE_ACCUEIL_VU, false);
}

export async function marquerAccueilVu(): Promise<void> {
  await ecrireReglage(CLE_ACCUEIL_VU, true);
}
