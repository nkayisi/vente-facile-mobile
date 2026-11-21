import { FicheDepense } from "@/features/caisse/fiche-depense";

/**
 * La fiche d'une dépense, en route : sur un téléphone, et partout où l'on y arrive
 * par un lien. Sur un grand écran, la liste des dépenses l'ouvre dans son volet de droite
 * (voir `ui/liste-fiche.tsx`) ; le corps est le même.
 */
export default function DetailDepense() {
  return <FicheDepense />;
}
