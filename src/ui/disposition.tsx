/**
 * La disposition : la seule main qui lit la taille de la fenêtre.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UNE SEULE MAIN, POUR LA MÊME RAISON QUE LA ZONE SÛRE.                   │
 * │                                                                          │
 * │ Un écran qui lit `useWindowDimensions` lui-même décide sur la largeur de │
 * │ la FENÊTRE, donc se trompe dès qu'une barre latérale ou un volet de      │
 * │ liste prend de la place. Ici, la largeur rendue est celle du VOLET où    │
 * │ l'écran est posé : la coquille et les volets la reposent pour leurs      │
 * │ enfants. `ui/doctrine.test.ts` interdit la lecture directe ailleurs      │
 * │ qu'ici et dans `zone-sure.ts`.                                           │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ LA LARGEUR DU VOLET EST CALCULÉE, JAMAIS MESURÉE. Un `onLayout` donne zéro
 * au premier rendu, puis la vraie valeur une image plus tard : chaque écran
 * serait d'abord dessiné sur une colonne, puis sur deux, et le saut se verrait
 * à chaque ouverture. La coquille connaît la largeur de sa navigation, les
 * volets connaissent la leur : on soustrait.
 *
 * Les règles vivent dans `disposition-regles.ts`, PUR et testé.
 */
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useWindowDimensions } from "react-native";

import {
  classeDeFenetre,
  estPaysage,
  estTablette,
  navigationPour,
  type ClasseFenetre,
  type Navigation,
} from "./disposition-regles";

export interface Disposition {
  /** La fenêtre entière. Pour décider de la coquille, jamais d'une grille. */
  fenetre: { largeur: number; hauteur: number };
  classe: ClasseFenetre;
  tablette: boolean;
  paysage: boolean;
  navigation: Navigation;
  /**
   * La largeur dont dispose l'écran qui lit : la fenêtre moins la navigation,
   * moins le volet voisin. C'est CETTE valeur qu'une grille consulte.
   */
  largeur: number;
}

interface Fenetre {
  largeur: number;
  hauteur: number;
  classe: ClasseFenetre;
  tablette: boolean;
  paysage: boolean;
  navigation: Navigation;
  replie: boolean;
  basculerRepli: () => void;
}

const FenetreContexte = createContext<Fenetre | null>(null);
const VoletContexte = createContext<number | null>(null);
const RetraitContexte = createContext(false);

/**
 * Monté à la RACINE, à côté du thème : l'authentification, les toasts et la
 * coquille lisent la même source.
 *
 * ⚠ LE CHEMIN ET LE REPLI SONT PASSÉS PAR LA RACINE, et ce module n'importe
 * ni `expo-router` ni la base locale : `src/ui/` est chargé par des tests qui
 * ne montent ni navigateur ni SQLite, et ces imports les feraient tous échouer
 * au chargement. Le repli mémorisé vit dans `navigation/repli.ts`.
 */
export function DispositionProvider({
  chemin,
  replie,
  basculerRepli,
  children,
}: {
  /** `usePathname()` d'expo-router : `/vendre` replie la barre au comptoir. */
  chemin: string | null;
  /** La barre latérale repliée en rail par le marchand (grand écran). */
  replie: boolean;
  basculerRepli: () => void;
  children: ReactNode;
}) {
  const { width, height } = useWindowDimensions();

  const classe = classeDeFenetre(width);
  const navigation = navigationPour(classe, replie, chemin);

  const valeur = useMemo<Fenetre>(
    () => ({
      largeur: width,
      hauteur: height,
      classe,
      tablette: estTablette(width, height),
      paysage: estPaysage(width, height),
      navigation,
      replie,
      basculerRepli,
    }),
    [width, height, classe, navigation, replie, basculerRepli]
  );

  return <FenetreContexte.Provider value={valeur}>{children}</FenetreContexte.Provider>;
}

/**
 * La largeur dont disposent les enfants. Posée par la coquille (fenêtre moins
 * navigation) puis par chaque volet (liste, fiche, panier).
 */
export function Volet({ largeur, children }: { largeur: number; children: ReactNode }) {
  return <VoletContexte.Provider value={largeur}>{children}</VoletContexte.Provider>;
}

/**
 * Les rangées d'une liste s'alignent-elles sur les cartes de la page ?
 *
 * Sur un téléphone une rangée va d'un bord à l'autre. Sur un grand écran, la
 * page porte une gouttière et son en-tête un `px-4` : une rangée sans retrait
 * dépassait les cartes au-dessus d'elle de quatorze points de chaque côté. La
 * colonne liste d'une vue liste/fiche suit la même règle, bien qu'elle ait la
 * largeur d'un téléphone. `Screen` le sait, `DataList` le lit.
 */
export function RetraitDesRangees({ actif, children }: { actif: boolean; children: ReactNode }) {
  return <RetraitContexte.Provider value={actif}>{children}</RetraitContexte.Provider>;
}

export function useRetraitDesRangees(): boolean {
  return useContext(RetraitContexte);
}

/**
 * ⚠ SANS FOURNISSEUR, ON RETOMBE SUR LA FENÊTRE, ET C'EST VOULU : un test qui
 * rend un composant seul, ou un écran monté hors de la coquille (connexion),
 * doit se dessiner comme sur un téléphone de cette largeur, pas lever.
 */
function useFenetre(): Fenetre {
  const ctx = useContext(FenetreContexte);
  const { width, height } = useWindowDimensions();
  if (ctx) return ctx;
  const classe = classeDeFenetre(width);
  return {
    largeur: width,
    hauteur: height,
    classe,
    tablette: estTablette(width, height),
    paysage: estPaysage(width, height),
    navigation: navigationPour(classe, false, null),
    replie: false,
    basculerRepli: () => {},
  };
}

export function useDisposition(): Disposition {
  const f = useFenetre();
  const volet = useContext(VoletContexte);
  return {
    fenetre: { largeur: f.largeur, hauteur: f.hauteur },
    classe: f.classe,
    tablette: f.tablette,
    paysage: f.paysage,
    navigation: f.navigation,
    largeur: volet ?? f.largeur,
  };
}

/** Le repli de la barre latérale, pour son seul bouton. */
export function useRepliNavigation(): { replie: boolean; basculer: () => void } {
  const f = useFenetre();
  return { replie: f.replie, basculer: f.basculerRepli };
}
