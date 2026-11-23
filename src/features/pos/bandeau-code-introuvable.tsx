/**
 * Un code scanné qu'aucun article ne porte.
 *
 * Le web : « Aucun article ne porte le code X. », avec de quoi créer l'article
 * et une croix. Sans ce bandeau, un scan inconnu ne faisait RIEN au comptoir :
 * le caissier rescannait, puis concluait que le lecteur était en panne.
 */
import { preRemplissageDeCreation } from "@/data/terme-creation";
import {
  phraseDejaEnFile,
  usePropositionCreation,
} from "@/features/inventaire/use-proposition-creation";
import { Banner } from "@/ui";

export function BandeauCodeIntrouvable({
  code,
  onFermer,
}: {
  code: string;
  onFermer: () => void;
}) {
  const proposer = usePropositionCreation();
  const { action, dejaEnFile } = proposer(code, { scanne: true });
  return (
    <Banner
      tone="warning"
      title={`Aucun article ne porte le code ${code}.`}
      message={dejaEnFile ? phraseDejaEnFile(dejaEnFile) : undefined}
      action={action ?? undefined}
      onFermer={onFermer}
    />
  );
}

/**
 * Un terme tapé à la main qui a la forme d'un code-barres (8 à 14 chiffres),
 * la règle du web pour l'Entrée de sa recherche. Un nom introuvable, lui, se
 * dit par la grille vide : il n'a rien d'un code.
 */
export function aLaFormeDUnCode(terme: string): boolean {
  return preRemplissageDeCreation(terme)?.champ === "code_barres";
}
