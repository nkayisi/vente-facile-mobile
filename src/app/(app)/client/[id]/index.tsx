import { FicheClient } from "@/features/clients/fiche-client";

/**
 * La fiche d'un client, en route : sur un téléphone, et partout où l'on y arrive
 * par un lien. Sur un grand écran, les contacts et les créances l'ouvre dans son volet de droite
 * (voir `ui/liste-fiche.tsx`) ; le corps est le même.
 */
export default function FicheClientEcran() {
  return <FicheClient />;
}
