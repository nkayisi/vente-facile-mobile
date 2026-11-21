import { FicheTransfert } from "@/features/stock/fiche-transfert";

/**
 * La fiche d'un transfert, en route : sur un téléphone, et partout où l'on y arrive
 * par un lien. Sur un grand écran, la liste des transferts l'ouvre dans son volet de droite
 * (voir `ui/liste-fiche.tsx`) ; le corps est le même.
 */
export default function DetailTransfertEcran() {
  return <FicheTransfert />;
}
