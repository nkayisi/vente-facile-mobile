/**
 * Grilles et colonnes qui suivent la largeur du volet.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE NOMBRE DE COLONNES SE CALCULE, IL NE S'ÉCRIT PAS EN POURCENTAGE.     │
 * │                                                                          │
 * │ `basis-[45%]` donnait deux colonnes PARTOUT : juste sur un téléphone de  │
 * │ 390 points, absurde sur un terminal de 1 920, où deux relevés de six     │
 * │ cents points chacun se lisent comme deux bandeaux. La règle est désormais│
 * │ « autant de cellules que la largeur le permet, chacune assez large pour  │
 * │ un montant CDF à sept chiffres écrit EN ENTIER » (un montant ne s'abrège │
 * │ jamais). Les pourcentages en dur sont proscrits (`ui/doctrine.test.ts`). │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ LA LARGEUR DE CELLULE PASSE PAR `style`, JAMAIS PAR UNE CLASSE. NativeWind
 * départage deux classes qui touchent la même propriété par ordre ALPHABÉTIQUE
 * de la feuille compilée : `flex-1` l'emporte sur `basis-[…]`, quel que soit
 * l'ordre du `className`, et la largeur voulue disparaît sans un mot.
 *
 * ⚠ ON NE COMPTE QUE LES ENFANTS RÉELS (`Children.toArray`) : un `{cond && …}`
 * faux n'est pas une cellule, et le compter laisserait un trou dans la grille.
 */
import { Children, isValidElement, type ReactNode } from "react";
import { View } from "react-native";

import { useDisposition, useRetraitDesRangees, Volet } from "./disposition";
import {
  LARGEUR_MIN_FLUX,
  colonnesEquilibrees,
  colonnesPour,
  repartirEnColonnes,
} from "./disposition-regles";

/**
 * La base d'une cellule. Le `- 4` laisse la place des écarts : avec la
 * croissance (`flexGrow: 1`), les cellules d'une rangée se partagent le reste
 * à parts égales, donc la base n'a pas à être exacte, seulement à ne jamais
 * faire passer une cellule de trop à la ligne.
 */
function baseDeCellule(colonnes: number): `${number}%` {
  return `${Math.max(1, 100 / colonnes - 4)}%`;
}

export function Grille({
  children,
  largeurMin,
  max = 6,
  min = 1,
  ecart = 12,
  filets = false,
  className = "",
}: {
  children: ReactNode;
  /**
   * La plus petite cellule qui reste lisible. Pour un relevé, celle qui écrit
   * un total CDF à sept chiffres en entier ; pour une tuile, son libellé.
   */
  largeurMin: number;
  max?: number;
  min?: number;
  /** L'écart entre deux cellules, en points. Ignoré avec `filets`. */
  ecart?: number;
  /**
   * Des filets d'un point entre les cellules, sur le fond de bordure : la
   * forme du cadran de relevés (`StatStrip`). Les filets sont le fond qui
   * transparaît dans l'écart, jamais un `divide-x`, qui n'existe pas ici.
   */
  filets?: boolean;
  className?: string;
}) {
  const { largeur } = useDisposition();
  const cellules = Children.toArray(children);
  const gap = filets ? 1 : ecart;
  const possibles = colonnesPour(largeur, { min, max, largeurMin, ecart: gap });
  const colonnes = colonnesEquilibrees(cellules.length, possibles);
  // Chaque cellule reçoit SA largeur : une grille dans une cellule, un
  // graphique dans une tuile, se dessinent sur la bonne largeur.
  const largeurCellule = Math.max(0, (largeur - gap * (colonnes - 1)) / colonnes);

  return (
    <View
      className={`flex-row flex-wrap ${
        filets ? "overflow-hidden rounded-xl border border-border bg-border" : ""
      } ${className}`}
      style={{ gap }}
    >
      {cellules.map((enfant, i) => (
        <View
          key={i}
          style={{ flexBasis: baseDeCellule(colonnes), flexGrow: 1, minWidth: 0 }}
        >
          <Volet largeur={largeurCellule}>{enfant}</Volet>
        </View>
      ))}
    </View>
  );
}

/**
 * Deux blocs côte à côte quand le volet le permet, l'un sous l'autre sinon.
 *
 * L'ORDRE NE CHANGE JAMAIS : le premier enfant est à gauche sur un grand écran
 * et au-dessus sur un téléphone. On réarrange, on ne réécrit pas.
 */
export function Colonnes({
  children,
  seuil = 720,
  ecart = 16,
}: {
  children: ReactNode;
  /** La largeur de volet à partir de laquelle les blocs passent côte à côte. */
  seuil?: number;
  ecart?: number;
}) {
  const { largeur } = useDisposition();
  const blocs = Children.toArray(children);
  if (largeur < seuil || blocs.length < 2) {
    return <View style={{ gap: ecart }}>{children}</View>;
  }
  const largeurBloc = (largeur - ecart * (blocs.length - 1)) / blocs.length;
  return (
    <View className="flex-row" style={{ gap: ecart }}>
      {blocs.map((b, i) => (
        <View key={i} className="min-w-0 flex-1" style={{ gap: ecart }}>
          <Volet largeur={largeurBloc}>{b}</Volet>
        </View>
      ))}
    </View>
  );
}

/** Le poids d'un bloc : ses éléments, pour estimer sa hauteur sans le mesurer. */
function poidsDeBloc(noeud: ReactNode): number {
  if (Array.isArray(noeud)) return noeud.reduce<number>((t, n) => t + poidsDeBloc(n), 0);
  if (!isValidElement(noeud)) return 0;
  return 1 + poidsDeBloc((noeud.props as { children?: ReactNode }).children);
}

/**
 * Une suite de cartes qui occupe toute la largeur.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN GRAND ÉCRAN AJOUTE DES COLONNES, IL N'ÉTIRE PAS LES CARTES.          │
 * │                                                                          │
 * │ Une fiche ou un réglage se lit « libellé à gauche, valeur à droite » :   │
 * │ étirée sur 1 600 points, la rangée oblige l'oeil à traverser l'écran ;   │
 * │ bornée à 760 au centre, elle laisse la moitié de l'écran en blanc. Les   │
 * │ cartes se rangent donc sur une, deux ou trois colonnes selon la place,   │
 * │ chacune dans la plus courte. Sur un téléphone, rien ne change.           │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ `className` PORTE L'ÉCART (`gap-3`, `gap-4`…), celui que l'écran posait
 * déjà : le téléphone garde ainsi sa géométrie au point près.
 */
export function Flux({
  children,
  className = "gap-3",
  max = 3,
}: {
  children: ReactNode;
  className?: string;
  max?: number;
}) {
  const { largeur } = useDisposition();
  const blocs = Children.toArray(children);
  const possibles = colonnesPour(largeur, { largeurMin: LARGEUR_MIN_FLUX, max, ecart: 16 });
  const colonnes = Math.min(possibles, blocs.length);
  if (colonnes <= 1) return <View className={className}>{children}</View>;

  const groupes = repartirEnColonnes(blocs.map(poidsDeBloc), colonnes);
  const largeurColonne = Math.max(0, (largeur - 16 * (colonnes - 1)) / colonnes);
  return (
    <View className={`flex-row items-start ${className}`}>
      {groupes.map((groupe, c) => (
        <View key={c} className={`min-w-0 flex-1 ${className}`}>
          <Volet largeur={largeurColonne}>{groupe.map((i) => blocs[i])}</Volet>
        </View>
      ))}
    </View>
  );
}

/**
 * Un bloc pleine largeur posé directement sous un `Screen padded={false}` :
 * bord à bord sur un téléphone, aligné sur les cartes de la page ailleurs.
 */
export function AligneSurLaPage({ children }: { children: ReactNode }) {
  return useRetraitDesRangees() ? <View className="mx-4">{children}</View> : <>{children}</>;
}

/** La largeur de volet à partir de laquelle deux champs tiennent côte à côte. */
export const SEUIL_RANGEE_CHAMPS = 560;

/**
 * Deux champs de formulaire côte à côte, sur un volet assez large pour que
 * chacun garde la largeur d'un champ de téléphone.
 *
 * ⚠ EMPILÉS, LES CHAMPS SONT RENDUS TELS QUELS. `FormField` porte déjà sa
 * propre marge du bas : l'écart d'une `Colonnes` s'y ajouterait, et un
 * formulaire de téléphone verrait ses champs s'espacer de douze points de plus
 * à chaque paire.
 */
export function RangeeChamps({ children }: { children: ReactNode }) {
  const { largeur } = useDisposition();
  const blocs = Children.toArray(children);
  if (largeur < SEUIL_RANGEE_CHAMPS || blocs.length < 2) return <>{children}</>;
  const ecart = 12;
  const largeurBloc = (largeur - ecart * (blocs.length - 1)) / blocs.length;
  return (
    <View className="flex-row" style={{ gap: ecart }}>
      {blocs.map((b, i) => (
        <View key={i} className="min-w-0 flex-1">
          <Volet largeur={largeurBloc}>{b}</Volet>
        </View>
      ))}
    </View>
  );
}
