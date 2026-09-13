/**
 * Une pastille de couleur, telle que le marchand l'a choisie.
 *
 * ⚠ La couleur est une DONNÉE, pas un jeton de thème : elle vient du champ
 * `color` d'une catégorie et vaut ce que le marchand a décidé. Elle a donc le
 * droit d'être une chaîne hexadécimale et de passer par `style` - c'est le
 * précédent de la légende du `DonutChart`. Le garde-fou « aucune couleur en
 * dur » vise les classes Tailwind littérales, qui court-circuiteraient le
 * thème ; celle-ci ne décide de rien à l'écran.
 *
 * ⚠ Le repli est un JETON (`bg-muted`), jamais une couleur inventée : une
 * catégorie créée hors ligne peut n'avoir aucune couleur descendue, et lui en
 * fabriquer une la ferait changer d'aspect à la synchronisation.
 *
 * 10 points, la mesure du back-office (`w-2.5 h-2.5`).
 */
import { View } from "react-native";

import { couleurValide } from "@/features/caisse/categorie";

export function Pastille({
  couleur,
  taille = 10,
}: {
  couleur: string | null | undefined;
  taille?: number;
}) {
  const teinte = couleurValide(couleur);
  return (
    <View
      // `accessibilityElementsHidden` : la couleur ne PORTE aucune information
      // à elle seule - le nom de la catégorie est juste à côté. L'annoncer
      // ferait dire « image » au lecteur d'écran devant chaque rangée.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className={`shrink-0 rounded-full ${teinte ? "" : "bg-muted"}`}
      style={{
        width: taille,
        height: taille,
        ...(teinte ? { backgroundColor: teinte } : {}),
      }}
    />
  );
}
