/**
 * Les marges que le système réserve, et la seule main qui les lit.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UNE SEULE MAIN, PARCE QUE LE PLANCHER NE PEUT PAS S'ÉCRIRE NEUF FOIS.   │
 * │                                                                          │
 * │ Neuf fichiers appelaient `useSafeAreaInsets` chacun de leur côté, et le  │
 * │ garde-fou « un seul propriétaire par bord » ne balayait que `src/ui/`.   │
 * │ Tant que la lecture est éparpillée, une règle qui s'y ajoute est une     │
 * │ règle qu'on oubliera quelque part - et l'endroit oublié sera un bouton   │
 * │ sous la barre gestuelle, que rien ne signale.                            │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ CE FICHIER EST LE SEUL DE `src/` QUI PEUT NOMMER `useSafeAreaInsets` ET
 * `useSafeAreaFrame`. `ui/doctrine.test.ts` le vérifie, sans aucune exception :
 * `brut` et `fenetre` sont exposés ici précisément pour que l'écran de relevé
 * n'ait pas besoin des hooks bruts. Une règle sans exception se tient ; une
 * règle à cinq exceptions se négocie.
 */
import { useMemo } from "react";
import { Dimensions } from "react-native";
import {
  useSafeAreaFrame,
  useSafeAreaInsets,
  type Edge,
} from "react-native-safe-area-context";

import {
  margeBasseEffective,
  verdict,
  type Verdict,
} from "@/features/diagnostic/marge-basse";
import {
  mesuresSimulees,
  useVerdictForce,
} from "@/features/diagnostic/simulation";

export interface MargesSysteme {
  haut: number;
  /** Plancher compris. C'est CETTE valeur qu'un écran pose. */
  bas: number;
  gauche: number;
  droite: number;
  /** Ce que le système ANNONCE. Pour le relevé, jamais pour poser une marge. */
  brut: { top: number; bottom: number; left: number; right: number };
  fenetre: { largeur: number; hauteur: number };
  ecran: { largeur: number; hauteur: number };
  verdict: Verdict;
}

export function useMargesSysteme(): MargesSysteme {
  const insets = useSafeAreaInsets();
  const frame = useSafeAreaFrame();
  const forced = useVerdictForce();

  // ⚠ `Dimensions.get("screen")` n'est PAS réactif, et c'est acceptable ici et
  // seulement ici : l'application est verrouillée en portrait
  // (`orientation: "portrait"`), donc la hauteur PHYSIQUE ne change jamais. Ne
  // pas y substituer `useWindowDimensions` : il mesure la FENÊTRE, qui est
  // justement l'autre terme de la comparaison.
  const ecran = Dimensions.get("screen");

  return useMemo(() => {
    const mesures = mesuresSimulees(
      {
        hauteurEcran: ecran.height,
        hauteurFenetre: frame.height,
        margeBasse: insets.bottom,
      },
      forced
    );
    return {
      haut: insets.top,
      bas: margeBasseEffective(mesures),
      gauche: insets.left,
      droite: insets.right,
      brut: {
        top: insets.top,
        bottom: insets.bottom,
        left: insets.left,
        right: insets.right,
      },
      fenetre: { largeur: frame.width, hauteur: frame.height },
      ecran: { largeur: ecran.width, hauteur: ecran.height },
      verdict: verdict(mesures),
    };
  }, [
    insets.top,
    insets.bottom,
    insets.left,
    insets.right,
    frame.width,
    frame.height,
    ecran.width,
    ecran.height,
    forced,
  ]);
}

/**
 * Les bords qu'un écran réserve quand il ne dit rien.
 *
 * ⚠ LE BAS EN FAIT PARTIE, et ne l'a pas toujours fait : sans lui, le bouton
 * « Enregistrer » de tous les formulaires se pose sur l'indicateur d'accueil
 * d'un iPhone et sur la barre gestuelle d'un Android récent, là où le système
 * intercepte le geste.
 */
export const BORDS_PAR_DEFAUT: Edge[] = ["top", "bottom"];

/**
 * Le rembourrage de zone sûre d'un écran.
 *
 * PUR, et c'est tout l'intérêt : sorti de la JSX, il s'éprouve sans rendre un
 * seul composant. Le garde-fou qui le remplace testait la GRAPHIE de
 * `screen.tsx` et cassait à la moindre réécriture.
 */
export function rembourrageZoneSure(
  edges: Edge[],
  m: MargesSysteme
): {
  paddingTop: number;
  paddingBottom: number;
  paddingLeft: number;
  paddingRight: number;
} {
  return {
    paddingTop: edges.includes("top") ? m.haut : 0,
    paddingBottom: edges.includes("bottom") ? m.bas : 0,
    paddingLeft: edges.includes("left") ? m.gauche : 0,
    paddingRight: edges.includes("right") ? m.droite : 0,
  };
}
