/**
 * Où l'article reste disponible, pour un membre qui lit tous les entrepôts.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN CONSEIL, JAMAIS UNE BORNE.                                           │
 * │                                                                          │
 * │ On ne vend que le stock de la CAISSE : une ligne au-delà ferme toujours  │
 * │ l'encaissement. Mais le propriétaire, ou le gérant qui « consulte tous » │
 * │ les entrepôts, doit pouvoir dire au client « il en reste à la Réserve »  │
 * │ au lieu de le laisser repartir sans rien (décision 4).                   │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Module PUR : il s'éprouve sans base ni appareil.
 */
import { formatUnitQuantity } from "@vente-facile/core";

import type { DisponibiliteAilleurs } from "./catalogue";

/** Au-delà, la ligne déborderait de la feuille : on dit combien d'autres. */
const AU_PLUS = 3;

/**
 * « Ailleurs : Réserve 12 bouteilles · Boutique Nord 3 bouteilles ».
 *
 * `null` quand il n'y a rien à dire : non demandé (`null`), ou demandé et
 * disponible nulle part ailleurs. Une ligne « Ailleurs : rien » ferait lire un
 * manque là où l'écran du dépôt dit déjà ce qu'il porte.
 */
export function libelleAilleurs(
  ailleurs: readonly DisponibiliteAilleurs[] | null | undefined,
  motDetail: string
): string | null {
  if (!ailleurs || ailleurs.length === 0) return null;
  const montres = ailleurs
    .slice(0, AU_PLUS)
    .map((a) => `${a.entrepot} ${formatUnitQuantity(a.disponible, motDetail)}`);
  const reste = ailleurs.length - montres.length;
  const suite = reste > 0 ? ` · et ${reste} autre${reste >= 2 ? "s" : ""}` : "";
  return `Ailleurs : ${montres.join(" · ")}${suite}`;
}
