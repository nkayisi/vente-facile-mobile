import { FicheRequisition } from "@/features/stock/fiche-requisition";

/**
 * La fiche d'une réquisition, en route : sur un téléphone, et partout où l'on y arrive
 * par un lien. Sur un grand écran, la liste des réquisitions l'ouvre dans son volet de droite
 * (voir `ui/liste-fiche.tsx`) ; le corps est le même.
 */
export default function FicheRequisitionEcran() {
  return <FicheRequisition />;
}
