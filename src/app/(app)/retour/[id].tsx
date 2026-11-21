import { FicheRetour } from "@/features/ventes/fiche-retour";

/**
 * La fiche d'un retour, en route : sur un téléphone, et partout où l'on y arrive
 * par un lien. Sur un grand écran, la liste des retours l'ouvre dans son volet de droite
 * (voir `ui/liste-fiche.tsx`) ; le corps est le même.
 */
export default function DetailRetourEcran() {
  return <FicheRetour />;
}
