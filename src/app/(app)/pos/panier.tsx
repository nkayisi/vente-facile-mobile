/**
 * Le panier d'un téléphone, plein écran. Sur une tablette, le même corps vit
 * en panneau à côté de la grille du comptoir : voir `PanneauPanier`.
 */
import { PanneauPanier } from "@/features/pos/panneau-panier";

export default function Panier() {
  return <PanneauPanier mode="ecran" />;
}
