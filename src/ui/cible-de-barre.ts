/**
 * Les boutons de la barre du haut : une icône sur un téléphone, une icône ET
 * son libellé là où il y a la place.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UNE ICÔNE SEULE N'EST UNE ÉCONOMIE QUE SUR UN TÉLÉPHONE.                │
 * │                                                                          │
 * │ Sur le rk3568, quatre ronds de 44 points flottaient dans une barre de    │
 * │ 1 600 points, et rien ne disait que la coche voulait dire « synchronisé »│
 * │ ni l'écran « thème automatique » (relevé par l'utilisateur, 2026-11-21). │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ LA CIBLE GARDE SES 44 POINTS DE HAUT, et le `hitSlop={0}` des trois voisines
 * reste nécessaire : elles se touchent toujours.
 */
import type { ViewStyle } from "react-native";

import { useDisposition } from "./disposition";
import { afficheLibelles } from "./disposition-regles";
import { HIT } from "./tokens";

export function useLibellesDeBarre(): boolean {
  return afficheLibelles(useDisposition().largeur);
}

export function styleDeCible(avecLibelle: boolean): ViewStyle {
  return avecLibelle
    ? { height: HIT.min, paddingHorizontal: 10 }
    : { width: HIT.min, height: HIT.min };
}
