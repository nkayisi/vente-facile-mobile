/**
 * Les entrepôts qui bornent le catalogue de CE membre.
 *
 * Un hook d'une ligne, pour que la lecture de l'instantané ne soit pas recopiée
 * dans les quatre écrans qui consultent un catalogue : une répétition de cette
 * forme dérive, et celle-ci déciderait de ce qu'un employé voit.
 *
 * Rend `null` pour le propriétaire et pour la case « Consulter tous » (aucune
 * restriction), et la liste de ses dépôts sinon, possiblement vide. Voir `data/perimetre-catalogue.ts` pour la
 * règle elle-même et pour la réserve sur le tirage.
 */
import { useMemo } from "react";

import { entrepotsDuCatalogue } from "@/data/perimetre-catalogue";
import { useSession } from "@/session/provider";

import { membreDeLaSession } from "./entrepots";

export function usePerimetreCatalogue(): string[] | null {
  const { snapshot } = useSession();
  const membership = snapshot?.membership;

  return useMemo(
    () => entrepotsDuCatalogue(membreDeLaSession(membership)),
    [membership]
  );
}
