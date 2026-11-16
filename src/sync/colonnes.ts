/**
 * Les colonnes que l'ingestion ÉCRIT : celles du manifeste que le schéma local
 * déclare.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ RETIRER UNE COLONNE SE FAIT EN DEUX TEMPS, ET C'EST CE MODULE QUI LE     │
 * │ PERMET.                                                                  │
 * │                                                                          │
 * │ L'insertion nomme les colonnes du MANIFESTE. Un terminal qui a retiré   │
 * │ une colonne de son schéma pendant que le serveur la nomme encore         │
 * │ échouait sur « table has no column named … » - le tirage de la table     │
 * │ s'arrêtait, définitivement. Et l'inverse ne se peut pas : un terminal    │
 * │ ANCIEN dont la colonne est `NOT NULL` sans défaut casse dès que le       │
 * │ serveur cesse de la nommer.                                              │
 * │                                                                          │
 * │ D'où l'ordre : le terminal retire d'abord la colonne de son schéma et    │
 * │ ignore ce qu'il ne connaît plus (ce module) ; le serveur ne la retire    │
 * │ de son manifeste qu'une fois TOUT LE PARC sur une version qui l'ignore,  │
 * │ c'est-à-dire derrière la porte de mise à jour obligatoire. Premier       │
 * │ emploi : `allow_negative_stock` (lot E10).                              │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ UNE TABLE INCONNUE DU SCHÉMA LOCAL GARDE TOUTES SES COLONNES : l'insertion
 * échouera alors bruyamment, et c'est voulu - une table entière qui manque est
 * un schéma à régénérer, pas une colonne en retrait.
 *
 * ⚠ ON NE REMPLIT RIEN : une colonne que le schéma local déclare et que le
 * manifeste ne nomme pas reste absente de l'insertion. Si elle est `NOT NULL`
 * sans défaut, SQLite refuse - c'est le cas exact qui interdit au SERVEUR de
 * retirer une colonne avant le parc.
 *
 * Module PUR : il reçoit la carte des colonnes, il ne lit pas la base.
 */
import type { ColumnSpec } from "./types";

export function colonnesEcrites(
  table: string,
  manifeste: readonly ColumnSpec[],
  connues: ReadonlyMap<string, ReadonlySet<string>>
): ColumnSpec[] {
  const locales = connues.get(table);
  if (!locales) return [...manifeste];
  return manifeste.filter((c) => locales.has(c.name));
}
