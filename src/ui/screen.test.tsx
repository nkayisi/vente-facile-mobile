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
import { ScrollView, View } from "react-native";
import { act, create, type ReactTestInstance } from "react-test-renderer";

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 24, bottom: 16, left: 0, right: 0 }),
}));
jest.mock("./theme", () => ({ useTheme: () => ({ colors: { primary: "#f60" } }) }));

import { Screen } from "./screen";

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
