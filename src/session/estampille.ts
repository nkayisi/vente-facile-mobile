/**
 * Lecture et écriture de l'estampille, dans `local_settings`.
 *
 * ⚠ **Elle vit dans la BASE, pas dans le trousseau, et c'est délibéré.** Ce
 * qu'elle qualifie est la base locale, pas la session : `clearSession()` emporte
 * le trousseau à chaque déconnexion, alors que l'estampille doit survivre pour
 * que la connexion suivante puisse constater la discordance. Une estampille
 * rangée à côté des jetons disparaîtrait au moment précis où elle sert.
 *
 * Ce fichier ne porte AUCUNE règle : elles vivent dans `proprietaire.ts`, qui
 * n'ouvre pas la base et se teste donc sans appareil. Ici, les entrées et
 * sorties, et rien d'autre.
 */
import { CLE_PROPRIETAIRE } from "@/db/purge-regles";
import { ecrireReglage, lireReglage } from "@/data/reglages";

import type { Estampille } from "./proprietaire";

export async function lireEstampille(): Promise<Estampille | null> {
  const brut = await lireReglage<Estampille | null>(CLE_PROPRIETAIRE, null);
  // Une estampille amputée ne vaut pas mieux qu'aucune : mieux vaut faire
  // arbitrer un humain que comparer sur un champ absent.
  if (!brut || !brut.userId || !brut.organizationId) return null;
  return brut;
}

export async function ecrireEstampille(e: Estampille): Promise<void> {
  await ecrireReglage(CLE_PROPRIETAIRE, e);
}
