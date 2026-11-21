import { FicheFournisseur } from "@/features/clients/fiche-fournisseur";

/**
 * La fiche d'un fournisseur, en route : sur un téléphone, et partout où l'on y arrive
 * par un lien. Sur un grand écran, les contacts l'ouvre dans son volet de droite
 * (voir `ui/liste-fiche.tsx`) ; le corps est le même.
 */
export default function FicheFournisseurEcran() {
  return <FicheFournisseur />;
}
