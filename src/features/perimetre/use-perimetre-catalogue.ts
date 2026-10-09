/**
 * Les entrepôts qui bornent le catalogue de CE membre.
 *
 * Un hook d'une ligne, pour que la lecture de l'instantané ne soit pas recopiée
 * dans les quatre écrans qui consultent un catalogue : une répétition de cette
 * forme dérive, et celle-ci déciderait de ce qu'un employé voit.
 *
 * Rend `null` pour le propriétaire (aucune restriction) et la liste de ses
 * dépôts sinon, possiblement vide. Voir `data/perimetre-catalogue.ts` pour la
 * règle elle-même et pour la réserve sur le tirage.
 */
import { useMemo } from "react";

import { entrepotsDuCatalogue } from "@/data/perimetre-catalogue";
import { useSession } from "@/session/provider";

export function usePerimetreCatalogue(): string[] | null {
  const { snapshot } = useSession();
  const role = snapshot?.membership.role ?? null;
  const assignes = snapshot?.membership.assigned_warehouses;

  return useMemo(
    () => entrepotsDuCatalogue(role, assignes ?? []),
    [role, assignes]
  );
}
