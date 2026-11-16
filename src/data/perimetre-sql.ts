/**
 * Le périmètre d'entrepôt d'une lecture locale, en SQL.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN SEUL CORPS POUR « UN ENTREPÔT » ET « MES ENTREPÔTS ».               │
 * │                                                                          │
 * │ Un choix désigne UN entrepôt ; le défaut d'un membre « Consulter tous    │
 * │ les entrepôts » en désigne PLUSIEURS (les siens), sa base locale portant │
 * │ tous les entrepôts pour que ses filtres élargissent hors ligne. Chaque   │
 * │ lecture écrivait `f.entrepot ? eq(...) : undefined` à la main : la       │
 * │ douzième aurait oublié l'ensemble, et montré tous les entrepôts à qui    │
 * │ n'en a rien demandé.                                                     │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Plusieurs colonnes : la ligne passe si L'UNE d'elles est dans le périmètre
 * (un transfert relie deux entrepôts ; un mouvement de caisse dérive le sien
 * de sa vente, de sa dépense ou de sa session).
 */
import { eq, inArray, isNull, or, sql, type Column, type SQL } from "drizzle-orm";

import type { PorteeEntrepot } from "@/features/perimetre/filtre-perimetre";

export function conditionEntrepot(
  colonnes: Column | readonly Column[],
  f: PorteeEntrepot,
  options: {
    /**
     * Le DÉFAUT garde les lignes sans entrepôt, là où le serveur le fait
     * (`warehouse_include_null` : ventes anciennes, retours). Un CHOIX, lui,
     * reste exact : une ligne dont on ignore le dépôt ne répond pas à « qu'y
     * a-t-il eu dans le dépôt B ? ».
     */
    inclureSansEntrepot?: boolean;
  } = {}
): SQL | undefined {
  const cols = Array.isArray(colonnes) ? colonnes : [colonnes as Column];
  if (f.entrepot) {
    const id = f.entrepot;
    return or(...cols.map((c) => eq(c, id)));
  }
  if (f.entrepots) {
    // Un ensemble VIDE n'est pas « aucune borne » : c'est « rien ».
    if (f.entrepots.length === 0) return sql`1 = 0`;
    const ids = [...f.entrepots];
    return or(
      ...cols.map((c) => inArray(c, ids)),
      ...(options.inclureSansEntrepot ? [isNull(cols[0])] : [])
    );
  }
  return undefined;
}
