/**
 * Conversion des valeurs reçues, du serveur vers les colonnes locales.
 *
 * Séparé de `ingest.ts`, qui ouvre la base au chargement : cette fonction est
 * de l'arithmétique pure et doit rester testable sans appareil.
 */
import type { ColumnKind } from "./types";

/**
 * Une valeur du serveur, rangée telle que la colonne l'attend.
 *
 * Les décimales restent des CHAÎNES : un panier en francs congolais à sept
 * chiffres perd ses unités en virgule flottante. Les horodatages deviennent des
 * entiers de millisecondes, non ambigus à comparer et à trier, là où l'ISO du
 * serveur porte un décalage horaire qui fausserait un tri lexicographique.
 */
export function coerce(value: unknown, kind: ColumnKind): unknown {
  if (value === null || value === undefined) return null;
  switch (kind) {
    case "datetime":
    case "date": {
      const ms = new Date(String(value)).getTime();
      return Number.isFinite(ms) ? ms : null;
    }
    case "boolean":
      return value ? 1 : 0;
    case "json":
      return typeof value === "string" ? value : JSON.stringify(value);
    default:
      // text, decimal, integer, real : le serveur envoie déjà la bonne forme.
      return value as string | number;
  }
}
