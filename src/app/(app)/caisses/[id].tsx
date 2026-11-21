import { FicheCaisse } from "@/features/caisse/fiche-caisse";

/**
 * La fiche d'une caisse, en route : sur un téléphone, et partout où l'on y arrive
 * par un lien. Sur un grand écran, le parc de caisses l'ouvre dans son volet de droite
 * (voir `ui/liste-fiche.tsx`) ; le corps est le même.
 */
export default function DetailCaisse() {
  return <FicheCaisse />;
}
