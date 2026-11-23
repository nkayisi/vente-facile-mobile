/**
 * Le panier d'un téléphone, plein écran. Sur une tablette, le même corps vit
 * en panneau à côté de la grille du comptoir : voir `PanneauPanier`.
 *
 * Le lecteur de codes intégré y marche aussi, comme sur toute la page du point
 * de vente du web : un scan ouvre la saisie de l'article, un re-scan pendant
 * la saisie (ou pendant l'édition d'une ligne) ajoute 1.
 */
import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";

import type { ArticlePos } from "@/features/pos/catalogue";
import { sessionOuverte } from "@/features/pos/caisse";
import { PanneauPanier } from "@/features/pos/panneau-panier";
import { SelecteurDuComptoir } from "@/features/pos/selecteur-du-comptoir";
import { useScanComptoir } from "@/features/pos/use-scan-comptoir";
import { useToast } from "@/ui";

export default function Panier() {
  const toast = useToast();
  const [choisi, setChoisi] = useState<ArticlePos | null>(null);
  const [entrepot, setEntrepot] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      void sessionOuverte().then((s) => setEntrepot(s?.warehouseId ?? null));
    }, [])
  );

  useScanComptoir({
    entrepot,
    surTrouve: setChoisi,
    // Le bandeau de création vit sur le comptoir, où se trouve la recherche.
    surIntrouvable: (code) =>
      toast.erreur(`Aucun article ne porte le code ${code}. Créez-le depuis le comptoir.`),
  });

  return (
    <>
      <PanneauPanier mode="ecran" />
      <SelecteurDuComptoir article={choisi} onFermer={() => setChoisi(null)} />
    </>
  );
}
