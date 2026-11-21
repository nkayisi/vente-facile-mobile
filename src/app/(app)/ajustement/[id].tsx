import { FicheAjustement } from "@/features/stock/fiche-ajustement";

/**
 * La fiche d'un ajustement, en route : sur un téléphone, et partout où l'on y arrive
 * par un lien. Sur un grand écran, la liste des ajustements l'ouvre dans son volet de droite
 * (voir `ui/liste-fiche.tsx`) ; le corps est le même.
 */
export default function DetailAjustementEcran() {
  return <FicheAjustement />;
}
