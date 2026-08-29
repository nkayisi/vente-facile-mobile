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
