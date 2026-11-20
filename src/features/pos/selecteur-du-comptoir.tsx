/**
 * Le sélecteur de quantité du comptoir, câblé au panier.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA GRILLE ET LE SCAN OUVRENT LE MÊME SÉLECTEUR, CÂBLÉ UNE SEULE FOIS.   │
 * │                                                                          │
 * │ Le scan ajoutait une unité d'office, sans saisie de quantité : on ne     │
 * │ pouvait ni vendre un carton scanné, ni peser. Il ouvre désormais ce     │
 * │ sélecteur. Recopier ses props dans l'écran de scan (stocks, devises,     │
 * │ refus, avertissement) aurait fait deux comptoirs : le jour où l'un      │
 * │ gagne une règle, l'autre l'ignore, et un article accepté à la grille     │
 * │ serait refusé au scan - ou l'inverse.                                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import { useMemo } from "react";
import type { Saisie } from "@vente-facile/core/pos";

import { useMonnaie } from "@/data/devises";
import type { ArticlePos } from "@/features/pos/catalogue";
import { devisesAffichables } from "@/features/pos/affichage-devise";
import { usePanier } from "@/features/pos/panier";
import { SelecteurQuantite } from "@/features/pos/selecteur-quantite";

export function SelecteurDuComptoir({
  article,
  onFermer,
  onAjoute,
}: {
  /** L'article à ajouter ; `null` ferme le sélecteur. */
  article: ArticlePos | null;
  onFermer: () => void;
  /**
   * Après l'ajout. `alerte` : ce qui fermera l'encaissement, lu contre le
   * panier d'AVANT l'ajout - l'appelant le dit, sans que l'ajout soit refusé.
   */
  onAjoute?: (article: ArticlePos, alerte: string | null) => void;
}) {
  const panier = usePanier();
  // `useMonnaie()` et non `panier.devises` : la seconde est la table
  // d'ARITHMÉTIQUE du panier, celle-ci porte la liste des devises de
  // l'établissement, et annoncer dans une monnaie qu'il ne tient pas n'aurait
  // aucun taux à appliquer.
  const money = useMonnaie();
  const devises = useMemo(() => devisesAffichables(money), [money]);

  return (
    <SelecteurQuantite
      article={article}
      visible={!!article}
      onFermer={onFermer}
      scellesDisponibles={article?.stock_packages}
      vracDisponible={article?.stock_loose}
      devises={devises}
      deviseFacture={money.primaryCode}
      // Le motif du refus s'AFFICHE, et le bouton se ferme.
      verifier={(saisie: Saisie) => (article ? panier.verifier(article, saisie) : null)}
      avertir={(saisie: Saisie) => (article ? panier.avertir(article, saisie) : null)}
      onValider={(saisie: Saisie, devise?: string) => {
        if (!article) return;
        if (panier.verifier(article, saisie)) return;
        const alerte = panier.avertir(article, saisie);
        panier.envoyer({
          type: "ajouter",
          article,
          saisie,
          prix: Number(article.selling_price) || 0,
          devise,
        });
        onAjoute?.(article, alerte);
        onFermer();
      }}
    />
  );
}
