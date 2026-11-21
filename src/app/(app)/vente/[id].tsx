import { FicheVente } from "@/features/ventes/fiche-vente";

/**
 * La fiche d'une vente, en route : sur un téléphone, et partout où l'on y
 * arrive par un lien. Sur un grand écran, l'historique l'ouvre dans son volet
 * de droite (voir `ui/liste-fiche.tsx`) ; le corps est le même.
 */
export default function DetailVenteEcran() {
  return <FicheVente />;
}
