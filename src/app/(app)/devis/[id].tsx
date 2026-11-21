import { FicheDevis } from "@/features/ventes/fiche-devis";

/**
 * La fiche d'un devis, en route : sur un téléphone, et partout où l'on y arrive
 * par un lien. Sur un grand écran, la liste des devis l'ouvre dans son volet de droite
 * (voir `ui/liste-fiche.tsx`) ; le corps est le même.
 */
export default function DetailDevisEcran() {
  return <FicheDevis />;
}
