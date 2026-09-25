/**
 * La feuille des seuls filtres de périmètre.
 *
 * Pour les écrans qui n'ont QUE ces deux filtres - le tableau de bord, le
 * stock, l'inventaire, les transferts, les ajustements. Ceux qui en ont
 * d'autres posent `ChampsPerimetre` dans LEUR feuille : deux feuilles
 * superposées donneraient un voile sur un voile, `Sheet` étant un `Modal`.
 */
import { useState } from "react";

import { Button, ListeChoix, Sheet, Text, type DemandeChoix } from "@/ui";

import { ChampsPerimetre } from "./champs-perimetre";
import {
  nombreDeFiltresPerimetre,
  PERIMETRE_VIDE,
  type FiltrePerimetre,
  type OffrePerimetre,
} from "./filtre-perimetre";

export function FeuilleFiltresPerimetre({
  ouvert,
  onFermer,
  valeur,
  onChanger,
  offre,
  /** Ce que le bouton de pied annonce : « Voir les 12 mouvements ». */
  libelleResultats,
}: {
  ouvert: boolean;
  onFermer: () => void;
  valeur: FiltrePerimetre;
  onChanger: (f: FiltrePerimetre) => void;
  offre: OffrePerimetre;
  libelleResultats?: string;
}) {
  const [choix, setChoix] = useState<DemandeChoix | null>(null);
  const reculer = () => (choix ? setChoix(null) : onFermer());

  return (
    <Sheet
      ouvert={ouvert}
      onFermer={reculer}
      titre={choix ? choix.titre : "Filtres"}
      retour={choix ? reculer : undefined}
    >
      {choix ? (
        <ListeChoix
          options={choix.options}
          valeur={choix.valeur}
          onChoisir={(v) => {
            choix.onChoisir(v);
            setChoix(null);
          }}
          libelleVide={choix.libelleVide}
          messageVide={choix.messageVide}
        />
      ) : (
        <>
          <ChampsPerimetre
            offre={offre}
            valeur={valeur}
            onChanger={onChanger}
            setChoix={setChoix}
          />

          {nombreDeFiltresPerimetre(offre) > 0 ? (
            <Button variant="ghost" fullWidth onPress={() => onChanger(PERIMETRE_VIDE)}>
              Réinitialiser les filtres
            </Button>
          ) : null}

          <Button fullWidth size="lg" onPress={onFermer}>
            {libelleResultats ?? "Voir les résultats"}
          </Button>
          <Text variant="caption">
            Les filtres s&apos;appliquent aussitôt : fermer n&apos;annule rien.
          </Text>
        </>
      )}
    </Sheet>
  );
}
