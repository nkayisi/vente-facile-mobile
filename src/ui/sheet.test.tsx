/**
 * La barre d'actions d'une feuille, et pourquoi elle disparaissait.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE BOUTON QUI VALIDE SORTAIT DE L'ECRAN QUAND LE CONTENU GRANDISSAIT.    │
 * │                                                                          │
 * │ Releve au comptoir : « defois le bouton Encaisser et Annuler ne sont pas │
 * │ visibles quand on a beaucoup d'infos sur la modale ». Et c'etait dans    │
 * │ mes propres captures de verification - feuille courte, pied visible ;    │
 * │ une ligne de plus au recapitulatif, pied disparu. Je l'avais manque en   │
 * │ regardant le contenu.                                                    │
 * │                                                                          │
 * │ EN REACT NATIVE, `flexShrink` VAUT ZERO PAR DEFAUT - le contraire du CSS │
 * │ du navigateur. La carte, plafonnee a 90 % de la hauteur, ne pouvait donc │
 * │ pas se comprimer : le defilement gardait la taille de son contenu, et    │
 * │ tout ce qui venait apres - le pied - etait pose SOUS le bord de l'ecran. │
 * │                                                                          │
 * │ Rien ne le signale : pas d'erreur, pas d'avertissement. La feuille       │
 * │ s'affiche, simplement sans ses boutons, et seulement au-dela d'une       │
 * │ hauteur de contenu que rien dans le code ne nomme.                       │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ CE TEST NE PROUVE PAS LE RENDU, il prouve la STRUCTURE : que la contrainte
 * est posee, et sur la bonne piece. Le reste se juge a l'oeil, sur un
 * terminal. C'est la meme reserve que `screen.test.tsx`.
 */
import { Dimensions, ScrollView, Text as TexteNatif, View } from "react-native";
import { act, create, type ReactTestInstance } from "react-test-renderer";

import { PLANCHER_BARRE_SYSTEME } from "@/features/diagnostic/marge-basse";

/** ⚠ Le prefixe `mock` est exige par `jest.mock`, qui refuse toute autre
 *  variable hors de sa portee. */
const mockMarges = {
  insets: { top: 24, bottom: 16, left: 0, right: 0 },
  frame: { width: 400, height: 800 },
};
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => mockMarges.insets,
  useSafeAreaFrame: () => mockMarges.frame,
}));
jest.mock("./theme", () => ({
  useTheme: () => ({ colors: { primary: "#f60", foreground: "#000" }, scheme: "light" }),
}));

import { Sheet } from "./sheet";

beforeEach(() => {
  mockMarges.insets = { top: 24, bottom: 16, left: 0, right: 0 };
  mockMarges.frame = { width: 400, height: 800 };
  jest
    .spyOn(Dimensions, "get")
    .mockReturnValue({ width: 400, height: 800, scale: 3, fontScale: 1 } as never);
});

afterEach(() => {
  jest.restoreAllMocks();
});

function rendre(element: React.ReactElement) {
  let rendu!: ReturnType<typeof create>;
  act(() => {
    rendu = create(element);
  });
  return rendu;
}

/** Les styles d'un noeud, aplatis : RN accepte un tableau comme un objet. */
function styles(n: ReactTestInstance): Record<string, unknown> {
  const s = n.props.style;
  const liste = Array.isArray(s) ? s : [s];
  return Object.assign({}, ...liste.filter(Boolean));
}

describe("le pied d'une feuille", () => {
  it("laisse le DEFILEMENT ceder la place, et lui seul", () => {
    const rendu = rendre(
      <Sheet ouvert onFermer={() => {}} pied={<TexteNatif>Encaisser</TexteNatif>}>
        <View />
      </Sheet>
    );
    // Sans `flexShrink`, un contenu plus haut que les 90 % autorises pousse le
    // pied sous le bord de l'ecran.
    expect(styles(rendu.root.findByType(ScrollView)).flexShrink).toBe(1);
  });

  it("comprime la CARTE elle-meme, sinon elle deborde de son plafond", () => {
    const rendu = rendre(
      <Sheet ouvert onFermer={() => {}} pied={<TexteNatif>Encaisser</TexteNatif>}>
        <View />
      </Sheet>
    );
    // La carte animee est le seul noeud qui porte une transformation.
    const carte = rendu.root
      .findAll((n) => Boolean(n.props?.style))
      .map(styles)
      .find((s) => Array.isArray(s.transform));
    expect(carte?.flexShrink).toBe(1);
  });

  it("REND la zone sure au pied, au lieu de la compter deux fois", () => {
    // Deux proprietaires pour un meme bord laisseraient une bande vide
    // au-dessus de la barre - le defaut nomme dans la docstring d'`AppBar`.
    const avec = rendre(
      <Sheet ouvert onFermer={() => {}} pied={<TexteNatif>x</TexteNatif>}>
        <View />
      </Sheet>
    );
    const sans = rendre(
      <Sheet ouvert onFermer={() => {}}>
        <View />
      </Sheet>
    );
    const bas = (r: ReturnType<typeof create>) =>
      (r.root.findByType(ScrollView).props.contentContainerStyle as { paddingBottom: number })
        .paddingBottom;
    expect(bas(avec)).toBe(16);
    // 16 d'inset + 16 de respiration quand personne d'autre ne la porte.
    expect(bas(sans)).toBe(32);
  });

  it("ne rend AUCUNE barre quand l'appelant n'en passe pas", () => {
    const rendu = rendre(
      <Sheet ouvert onFermer={() => {}}>
        <View />
      </Sheet>
    );
    // Une feuille de simple lecture ne doit pas gagner un filet et un blanc
    // pour une barre qui n'existe pas.
    expect(
      rendu.root.findAll((n) => String(n.props?.className ?? "").includes("border-t border-border px-4"))
    ).toHaveLength(0);
  });

  it("POSE LE PLANCHER sous le pied quand le systeme n'annonce rien", () => {
    // `Math.max(marges.bas, 16)` valait 16 - soit moins qu'une barre a trois
    // boutons. Le bouton qui valide un encaissement y etait a moitie dessous.
    mockMarges.insets = { top: 24, bottom: 0, left: 0, right: 0 };
    const rendu = rendre(
      <Sheet ouvert onFermer={() => {}} pied={<TexteNatif>x</TexteNatif>}>
        <View />
      </Sheet>
    );
    const barre = rendu.root.find((n) =>
      String(n.props?.className ?? "").includes("border-t border-border px-4")
    );
    expect((barre.props.style as { paddingBottom: number }).paddingBottom).toBe(
      PLANCHER_BARRE_SYSTEME
    );
  });
});
