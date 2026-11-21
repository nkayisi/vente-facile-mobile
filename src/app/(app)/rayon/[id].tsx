import { FicheRayon } from "@/features/stock/fiche-rayon";

/**
 * La fiche d'un rayon, en route : sur un téléphone, et partout où l'on y arrive
 * par un lien. Sur un grand écran, les niveaux de stock l'ouvre dans son volet de droite
 * (voir `ui/liste-fiche.tsx`) ; le corps est le même.
 */
export default function DetailRayon() {
  return <FicheRayon />;
}
