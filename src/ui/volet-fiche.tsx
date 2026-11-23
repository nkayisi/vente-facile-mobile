/**
 * Le volet de fiche, sans la navigation : ce que `Screen` et `AppBar` lisent.
 *
 * ⚠ CE MODULE N'IMPORTE PAS `expo-router`, et c'est sa raison d'être. `Screen`
 * est chargé par des tests qui ne montent aucun navigateur ; s'il tirait
 * `liste-fiche.tsx`, il tirerait `expo-router` et chacun de ces tests
 * échouerait au chargement. La partie qui navigue vit dans `liste-fiche.tsx`.
 */
import { createContext, useContext } from "react";
import type { Edge } from "react-native-safe-area-context";

export interface VoletDeFiche {
  id: string;
  fermer: () => void;
}

export const FicheContexte = createContext<VoletDeFiche | null>(null);

/**
 * Les bords qu'un `Screen` posé dans un volet doit prendre : ceux de l'écran
 * hôte, jamais les siens. Une fiche posée à côté d'un onglet, dont la barre du
 * haut porte déjà la marge du système, ajouterait sinon une bande vide de la
 * hauteur de la barre d'état au-dessus de son titre.
 */
export const BordsDuVolet = createContext<Edge[] | null>(null);

/**
 * Vrai pour un écran posé dans la colonne LISTE, à côté de sa fiche.
 *
 * Cette colonne fait moins de 600 points, donc `Screen` n'y pose aucune
 * gouttière et se croit sur un téléphone, où une rangée va d'un bord à l'autre.
 * Mais sa recherche et ses boutons y portent leur `px-4` : les rangées
 * dépassaient donc tout ce qu'il y a au-dessus d'elles de seize points.
 */
export const DansVoletDeListe = createContext(false);

export function useDansVoletDeListe(): boolean {
  return useContext(DansVoletDeListe);
}

/** Le volet où la fiche est posée, ou `null` quand elle est une route. */
export function useVoletDeFiche(): VoletDeFiche | null {
  return useContext(FicheContexte);
}

/** Les bords imposés par le volet, pour `Screen`. `null` hors volet. */
export function useBordsDuVolet(): Edge[] | null {
  return useContext(BordsDuVolet);
}
