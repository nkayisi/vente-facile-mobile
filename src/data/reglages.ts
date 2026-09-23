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
 * « Ce terminal a déjà vu la présentation. »
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ELLE N'EST PAS DANS `CLES_CONSERVEES`, ET C'EST UNE DÉCISION.           │
 * │                                                                          │
 * │ L'allowlist de `db/purge-regles.ts` ne porte que ce qui décrit le        │
 * │ MATÉRIEL posé sur le comptoir : le thème et l'imprimante. « J'ai vu la   │
 * │ présentation » est un fait sur une PERSONNE, pas sur un appareil, et y   │
 * │ glisser cette clé diluerait un invariant écrit pour un confort.          │
 * │                                                                          │
 * │ Conséquence assumée : le carrousel revient après une déconnexion. Le     │
 * │ geste est rare et confirmé ici - le geste quotidien est le verrou par    │
 * │ code, pas la déconnexion - et revoir trois vues après avoir changé de    │
 * │ compte se défend.                                                        │
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
