/**
 * Le voile du tiroir.
 *
 * Celui de la bibliothèque restait opaque et capturait les touches après une
 * fermeture suivie d'un rendu (une tablette qu'on tourne) : l'application ne
 * répondait plus à rien. Le nôtre n'existe que tant que le menu est ouvert.
 */
import { Text } from "react-native";
import { act, create } from "react-test-renderer";

const mockDrawer: { props: Record<string, unknown> | null } = { props: null };

jest.mock("react-native-drawer-layout", () => ({
  Drawer: (props: Record<string, unknown> & { children: React.ReactNode }) => {
    mockDrawer.props = props;
    return props.children;
  },
}));
jest.mock("react-native-reanimated", () => {
  const { View } = jest.requireActual("react-native");
  const fondu = { duration: () => ({}) };
  return { __esModule: true, default: { View }, FadeIn: fondu, FadeOut: fondu };
});
jest.mock("expo-router", () => ({ usePathname: () => "/" }));
jest.mock("./menu-lateral", () => ({ MenuLateral: () => null }));
jest.mock("@/ui", () => ({
  useColor: () => "#fff",
  useDisposition: () => ({ navigation: "barre" }),
}));

import { TiroirProvider, useTiroir } from "./tiroir";

let api!: ReturnType<typeof useTiroir>;
const capter = (a: ReturnType<typeof useTiroir>) => {
  api = a;
};
function Sonde() {
  capter(useTiroir());
  return <Text>page</Text>;
}

function rendre() {
  let rendu!: ReturnType<typeof create>;
  act(() => {
    rendu = create(
      <TiroirProvider>
        <Sonde />
      </TiroirProvider>
    );
  });
  return rendu;
}

// Le composant `Pressable` lui-même, pas les vues qu'il rend dessous.
const voiles = (rendu: ReturnType<typeof create>) =>
  rendu.root.findAll(
    (n) => n.props.accessibilityLabel === "Fermer le menu" && typeof n.props.onPress === "function"
  , { deep: false });

describe("le voile du tiroir", () => {
  it("masque celui de la bibliothèque, qui pouvait rester actif", () => {
    rendre();
    expect(mockDrawer.props?.overlayStyle).toEqual({ display: "none" });
  });

  it("n'existe que tant que le menu est ouvert", () => {
    const rendu = rendre();
    expect(voiles(rendu)).toHaveLength(0);

    act(() => api.ouvrir());
    expect(voiles(rendu)).toHaveLength(1);

    act(() => api.fermer());
    expect(voiles(rendu)).toHaveLength(0);
  });

  it("referme le menu quand on le touche", () => {
    const rendu = rendre();
    act(() => api.ouvrir());
    act(() => voiles(rendu)[0].props.onPress());
    expect(api.ouvert).toBe(false);
  });
});
