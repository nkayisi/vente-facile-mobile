/**
 * Le seul défaut que le balayage de `doctrine.test.ts` ne peut pas voir : il
 * lit le TEXTE de `screen.tsx` et constate que le couple
 * `flexGrow / justifyContent` y est écrit. Il resterait vert si l'objet
 * n'atteignait pas le défilement.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN CENTRAGE QUI N'ARRIVE PAS NE LÈVE RIEN.                              │
 * │                                                                          │
 * │ Le formulaire s'affiche, correctement, simplement collé en haut : c'est  │
 * │ l'état d'AVANT, et rien à l'exécution ne le distingue d'un centrage      │
 * │ appliqué. Il se découvre à l'oeil, sur un terminal, ou pas du tout.      │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import { Dimensions, ScrollView, View } from "react-native";
import { act, create, type ReactTestInstance } from "react-test-renderer";

import { PLANCHER_BARRE_SYSTEME } from "@/features/diagnostic/marge-basse";

/**
 * Les marges que le systeme ANNONCE, pilotables depuis un test.
 *
 * ⚠ Le prefixe `mock` n'est pas decoratif : `jest.mock` refuse toute variable
 * hors de sa portee, et ne fait exception que pour celles qui le portent.
 */
const mockMarges = {
  insets: { top: 24, bottom: 16, left: 0, right: 0 },
  frame: { width: 400, height: 800 },
};
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => mockMarges.insets,
  useSafeAreaFrame: () => mockMarges.frame,
}));
jest.mock("./theme", () => ({ useTheme: () => ({ colors: { primary: "#f60" } }) }));

import { Screen } from "./screen";

/** L'ecran PHYSIQUE. En bord-a-bord il vaut la fenetre ; sinon il la depasse. */
function poserEcran(hauteur: number) {
  jest
    .spyOn(Dimensions, "get")
    .mockImplementation((cle) =>
      cle === "screen"
        ? ({ width: 400, height: hauteur, scale: 3, fontScale: 1 } as never)
        : ({ width: 400, height: hauteur, scale: 3, fontScale: 1 } as never)
    );
}

beforeEach(() => {
  mockMarges.insets = { top: 24, bottom: 16, left: 0, right: 0 };
  mockMarges.frame = { width: 400, height: 800 };
  poserEcran(800);
});

afterEach(() => {
  jest.restoreAllMocks();
});

function styleDuContenu(element: React.ReactElement): unknown {
  let rendu!: ReturnType<typeof create>;
  act(() => {
    rendu = create(element);
  });
  const defilement: ReactTestInstance = rendu.root.findByType(ScrollView);
  return defilement.props.contentContainerStyle;
}

describe("Screen centre", () => {
  it("remet la hauteur au minimum de la fenêtre AVANT de centrer", () => {
    // Les deux ensemble, et dans cette lecture : `flexGrow` garantit qu'il n'y
    // a d'espace libre à répartir que lorsqu'il en reste, donc qu'un contenu
    // plus haut que l'écran n'est jamais décalé hors du défilement.
    expect(
      styleDuContenu(
        <Screen scroll centre>
          <View />
        </Screen>
      )
    ).toEqual({ padding: 16, flexGrow: 1, justifyContent: "center" });
  });

  it("ne centre RIEN par défaut : une liste garde son premier élément en haut", () => {
    expect(
      styleDuContenu(
        <Screen scroll>
          <View />
        </Screen>
      )
    ).toEqual({ padding: 16 });
  });

  it("laisse `padded={false}` sans marge, centrage ou non", () => {
    expect(
      styleDuContenu(
        <Screen scroll centre padded={false}>
          <View />
        </Screen>
      )
    ).toEqual({ flexGrow: 1, justifyContent: "center" });
  });
});

describe("Screen fond", () => {
  /**
   * ┌──────────────────────────────────────────────────────────────────────────┐
   * │ UNE COUTURE NE LÈVE RIEN NON PLUS.                                      │
   * │                                                                          │
   * │ Un pied blanc sur un corps gris s'affiche parfaitement : c'est une       │
   * │ bande d'une autre couleur en travers de l'écran, et rien à l'exécution   │
   * │ ne la distingue d'une disposition voulue. Elle se relève à l'oeil, sur   │
   * │ une capture - c'est exactement comme ça qu'elle a été trouvée.           │
   * └──────────────────────────────────────────────────────────────────────────┘
   */
  function classes(element: React.ReactElement): string[] {
    let rendu!: ReturnType<typeof create>;
    act(() => {
      rendu = create(element);
    });
    return rendu.root
      .findAllByType(View)
      .map((v) => String(v.props.className ?? ""));
  }

  /** Le pied est la seule vue à porter le rembourrage de la barre d'actions. */
  const pied = (liste: string[]): string =>
    liste.find((c) => c.includes("px-4 py-3")) ?? "";

  it("par défaut, le pied se DÉTACHE du corps : filet et plaque", () => {
    const c = classes(
      <Screen pied={<View />}>
        <View />
      </Screen>
    );
    expect(c[0]).toContain("bg-background");
    expect(pied(c)).toContain("border-t");
    expect(pied(c)).toContain("bg-card");
  });

  it("`fond=\"card\"` rend l'écran d'un seul tenant, sans couture", () => {
    const c = classes(
      <Screen fond="card" pied={<View />}>
        <View />
      </Screen>
    );
    expect(c[0]).toContain("bg-card");
    expect(c[0]).not.toContain("bg-background");
    // Le filet ET la plaque partent ensemble : garder l'un des deux laisserait
    // la couture qu'on vient de supprimer.
    expect(pied(c)).not.toContain("border-t");
    expect(pied(c)).not.toContain("bg-card");
  });

  it("le pied garde son rembourrage dans les deux fonds", () => {
    // Sans lui, la barre d'actions colle aux bords : le prop ne doit changer
    // que la COULEUR, jamais la géométrie.
    for (const f of ["background", "card"] as const) {
      expect(
        pied(
          classes(
            <Screen fond={f} pied={<View />}>
              <View />
            </Screen>
          )
        )
      ).toContain("px-4 py-3");
    }
  });
});

/**
 * La zone sûre, éprouvée sur l'OBJET et non sur le texte de `screen.tsx`.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE QUE LE BALAYAGE DE DOCTRINE NE PEUT PAS VOIR.                        │
 * │                                                                          │
 * │ Il constate que `Screen` APPELLE `rembourrageZoneSure`. Il resterait     │
 * │ vert si le résultat n'atteignait pas la vue - et un écran sans sa marge  │
 * │ basse s'affiche parfaitement, simplement avec son dernier bouton sous la │
 * │ barre du système. Il se découvre à l'oeil, ou pas du tout.               │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
function rembourrageRendu(element: React.ReactElement): Record<string, number> {
  let rendu!: ReturnType<typeof create>;
  act(() => {
    rendu = create(element);
  });
  const racine = rendu.root
    .findAllByType(View)
    .find((v) => {
      const st = v.props.style as Record<string, unknown> | undefined;
      return st !== undefined && st !== null && "paddingTop" in st;
    });
  if (!racine) throw new Error("aucune vue ne porte le rembourrage de zone sûre");
  return racine.props.style as Record<string, number>;
}

describe("Screen et la zone sûre", () => {
  it("réserve le haut ET le bas par défaut", () => {
    // Les 95 écrans qui ne passent pas `edges` en dépendent : c'est là que le
    // bouton « Enregistrer » se posait sur la barre gestuelle.
    expect(rembourrageRendu(<Screen><View /></Screen>)).toMatchObject({
      paddingTop: 24,
      paddingBottom: 16,
    });
  });

  it("`edges={[]}` renonce aux deux : la barre d'onglets les porte déjà", () => {
    expect(rembourrageRendu(<Screen edges={[]}><View /></Screen>)).toMatchObject({
      paddingTop: 0,
      paddingBottom: 0,
    });
  });

  it("POSE LE PLANCHER quand la fenêtre est bord-à-bord et la marge à zéro", () => {
    // Le défaut rapporté : le système dessine sa barre et n'annonce rien.
    mockMarges.insets = { top: 24, bottom: 0, left: 0, right: 0 };
    expect(rembourrageRendu(<Screen><View /></Screen>).paddingBottom).toBe(
      PLANCHER_BARRE_SYSTEME
    );
  });

  it("n'ajoute RIEN quand le système insère lui-même la fenêtre", () => {
    // 848 d'écran pour 800 de fenêtre : les 48 manquants SONT la barre, déjà
    // retirés. Y poser un plancher ajouterait une bande morte.
    mockMarges.insets = { top: 24, bottom: 0, left: 0, right: 0 };
    poserEcran(848);
    expect(rembourrageRendu(<Screen><View /></Screen>).paddingBottom).toBe(0);
  });
});
