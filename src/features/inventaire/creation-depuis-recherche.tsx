/**
 * L'état vide d'une recherche d'article DANS une feuille : il dit que rien ne
 * correspond, et propose de créer l'article (ou nomme sa création en file).
 */
import { EmptyState } from "@/ui";

import { phraseDejaEnFile, type PropositionCreation } from "./use-proposition-creation";

export function CreationDepuisRecherche({ creation }: { creation: PropositionCreation }) {
  return (
    <EmptyState
      variante="carte"
      title="Aucun article ne correspond"
      message={
        creation.dejaEnFile
          ? phraseDejaEnFile(creation.dejaEnFile)
          : creation.action
            ? "Vérifiez l'orthographe, ou créez l'article."
            : "Vérifiez l'orthographe, ou cherchez par son code."
      }
      action={creation.action ?? undefined}
    />
  );
}
