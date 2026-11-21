import { FicheComptage } from "@/features/inventaire/fiche-comptage";

/**
 * La fiche d'une session d'inventaire, en route : sur un téléphone, et partout où l'on y arrive
 * par un lien. Sur un grand écran, la liste des inventaires l'ouvre dans son volet de droite
 * (voir `ui/liste-fiche.tsx`) ; le corps est le même.
 */
export default function FeuilleComptage() {
  return <FicheComptage />;
}
