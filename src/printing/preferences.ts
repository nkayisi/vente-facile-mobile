/**
 * L'imprimante retenue sur CE terminal, lue et écrite.
 *
 * Purement locale : deux caissiers qui se partagent un téléphone partagent
 * aussi l'imprimante posée à côté d'eux, alors qu'une boutique à deux comptoirs
 * en a deux. Le réglage suit donc l'appareil, jamais le compte.
 *
 * Rangé dans `local_settings`, la table clé/valeur JSON qui porte déjà les
 * préférences de l'appareil : un réglage de plus ne vaut pas une migration.
 *
 * Ce fichier ne porte AUCUNE règle : elles vivent dans `reglage.ts`, qui
 * n'ouvre pas la base et se teste donc sans appareil. Ici, les entrées et
 * sorties, et rien d'autre.
 */
import { eq, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { localSettings } from "@/db/schema";

import { normaliserReglage, type ReglageImprimante } from "./reglage";

const CLE = "imprimante";

export {
  libelleTransport,
  normaliserReglage,
  REGLAGE_PAR_DEFAUT,
  TRANSPORTS,
  type LienBluetooth,
  type ReglageImprimante,
  type TransportId,
} from "./reglage";

export async function lireReglage(): Promise<ReglageImprimante> {
  const [ligne] = await db
    .select({ value: localSettings.value })
    .from(localSettings)
    .where(eq(localSettings.key, CLE))
    .limit(1);

  if (!ligne) return normaliserReglage(undefined);
  try {
    return normaliserReglage(JSON.parse(ligne.value));
  } catch {
    // Un réglage illisible ne doit pas empêcher d'imprimer : on repart du défaut.
    return normaliserReglage(undefined);
  }
}

/**
 * ⚠ ON NORMALISE AUSSI À L'ÉCRITURE, pour qu'aucune forme héritée ne puisse
 * revenir en base par un appelant distrait. La lecture serait sinon seule à
 * tenir l'invariant, et elle le tiendrait indéfiniment sur une valeur qu'un
 * écran vient de réécrire.
 */
export async function ecrireReglage(reglage: ReglageImprimante): Promise<void> {
  const value = JSON.stringify(normaliserReglage(reglage));
  await db
    .insert(localSettings)
    .values({ key: CLE, value })
    .onConflictDoUpdate({
      target: localSettings.key,
      set: { value, updatedAt: sql`(unixepoch() * 1000)` },
    });
}
