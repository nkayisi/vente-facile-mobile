/**
 * L'imprimante retenue sur CE terminal.
 *
 * Purement locale : deux caissiers qui se partagent un téléphone partagent
 * aussi l'imprimante posée à côté d'eux, alors qu'une boutique à deux comptoirs
 * en a deux. Le réglage suit donc l'appareil, jamais le compte.
 *
 * Rangé dans `local_settings`, la table clé/valeur JSON qui porte déjà les
 * préférences de l'appareil : un réglage de plus ne vaut pas une migration.
 */
import { eq, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { localSettings } from "@/db/schema";

const CLE = "imprimante";

export type Transport = "embedded" | "bluetooth" | "ble" | "pdf";

export interface ReglageImprimante {
  transport: Transport;
  /** Adresse MAC pour le Bluetooth classique, identifiant système pour le BLE. */
  adresse?: string;
  nom?: string;
  paperWidth: 58 | 80;
  /** Faux sur une imprimante sans massicot : la commande de coupe l'ignorerait
   *  au mieux, ferait avancer le papier de dix centimètres au pire. */
  cut: boolean;
}

export const REGLAGE_PAR_DEFAUT: ReglageImprimante = {
  // `embedded` par défaut, et non `pdf` : un terminal de caisse porte presque
  // toujours son imprimante, et le premier ticket doit sortir sans réglage.
  // `piloteCourant()` retombe de toute façon sur le PDF si rien ne répond.
  transport: "embedded",
  paperWidth: 58,
  cut: true,
};

export async function lireReglage(): Promise<ReglageImprimante> {
  const [ligne] = await db
    .select({ value: localSettings.value })
    .from(localSettings)
    .where(eq(localSettings.key, CLE))
    .limit(1);

  if (!ligne) return REGLAGE_PAR_DEFAUT;
  try {
    return { ...REGLAGE_PAR_DEFAUT, ...(JSON.parse(ligne.value) as ReglageImprimante) };
  } catch {
    // Un réglage illisible ne doit pas empêcher d'imprimer : on repart du défaut.
    return REGLAGE_PAR_DEFAUT;
  }
}

export async function ecrireReglage(reglage: ReglageImprimante): Promise<void> {
  const value = JSON.stringify(reglage);
  await db
    .insert(localSettings)
    .values({ key: CLE, value })
    .onConflictDoUpdate({
      target: localSettings.key,
      set: { value, updatedAt: sql`(unixepoch() * 1000)` },
    });
}
