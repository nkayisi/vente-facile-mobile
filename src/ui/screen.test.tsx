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
