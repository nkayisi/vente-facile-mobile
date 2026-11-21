/**
 * La coquille d'un grand écran.
 *
 * Deux défauts qu'aucune relecture ne voit et qu'aucune erreur ne signale :
 *
 * - une page REMONTÉE quand la navigation change de forme. Une tablette en
 *   écran partagé passe sous 600 points, la barre d'onglets revient, et si la
 *   page changeait de rang dans l'arbre, toute la pile repartirait de zéro
 *   sous les doigts du marchand ;
 * - une page qui se croit plus large qu'elle n'est. Les grilles et les volets
 *   se calculent sur la largeur posée ici : si la barre latérale n'en était pas
 *   retirée, chaque écran déborderait de 256 points.
 */
import { useEffect } from "react";
import { Text } from "react-native";
import { act, create } from "react-test-renderer";

import type { Navigation } from "@/ui/disposition-regles";

const mockDisposition: { navigation: Navigation; largeur: number } = {
  navigation: "barre",
  largeur: 400,
};
const mockMarges = { haut: 0, bas: 0, gauche: 0, droite: 0 };

// Le thème lit ses réglages en base : sans cette doublure, charger `@/ui`
// ouvrirait SQLite.
jest.mock("@/ui/theme", () => ({
  useTheme: () => ({ colors: {} }),
  useColor: () => "#000",
}));
jest.mock("@/ui", () => {
  const reel = jest.requireActual("@/ui");
  return {
    ...reel,
    useDisposition: () => ({
      navigation: mockDisposition.navigation,
      fenetre: { largeur: mockDisposition.largeur, hauteur: 800 },
      largeur: mockDisposition.largeur,
      classe: "large",
      tablette: true,
      paysage: true,
    }),
    useMargesSysteme: () => mockMarges,
    useRepliNavigation: () => ({ replie: false, basculer: () => {} }),
  };
});
jest.mock("./menu-lateral", () => ({ MenuLateral: () => null }));
jest.mock("./tiroir", () => ({ useTiroir: () => ({ ouvrir: () => {} }) }));
jest.mock("@/session/provider", () => ({ useSession: () => ({ can: () => true }) }));
jest.mock("@/data/live", () => ({ useLecture: () => ({ donnees: null }) }));
jest.mock("@/sync", () => ({ countByState: () => null }));
jest.mock("expo-router", () => ({ usePathname: () => "/" }));

import { Volet } from "@/ui";
import { CoquilleAdaptative } from "./barre-laterale";

let montages = 0;
function Page() {
  useEffect(() => {
    montages += 1;
  }, []);
  return <Text>page</Text>;
}

function rendre() {
  let rendu!: ReturnType<typeof create>;
  act(() => {
    rendu = create(
      <CoquilleAdaptative>
        <Page />
      </CoquilleAdaptative>
    );
  });
  return rendu;
}

beforeEach(() => {
  montages = 0;
  mockDisposition.navigation = "barre";
  mockDisposition.largeur = 400;
  Object.assign(mockMarges, { haut: 0, bas: 0, gauche: 0, droite: 0 });
});

describe("la coquille adaptative", () => {
  it("ne remonte pas la page quand la navigation change de forme", () => {
    const rendu = rendre();
    expect(montages).toBe(1);

    for (const [navigation, largeur] of [
      ["laterale", 1920],
      ["rail", 800],
      ["barre", 400],
      ["laterale", 1280],
    ] as const) {
      mockDisposition.navigation = navigation;
      mockDisposition.largeur = largeur;
      act(() => {
        rendu.update(
          <CoquilleAdaptative>
            <Page />
          </CoquilleAdaptative>
        );
      });
    }
    expect(montages).toBe(1);
  });

  it("retire la navigation et les marges du système de la largeur de la page", () => {
    mockDisposition.navigation = "laterale";
    mockDisposition.largeur = 1920;
    Object.assign(mockMarges, { gauche: 24, droite: 48 });
    expect(rendre().root.findByType(Volet).props.largeur).toBe(1920 - 256 - 24 - 48);
  });

  it("donne au rail ses quatre-vingts points", () => {
    mockDisposition.navigation = "rail";
    mockDisposition.largeur = 800;
    expect(rendre().root.findByType(Volet).props.largeur).toBe(800 - 80);
  });

  it("laisse toute la largeur au téléphone, sans marge latérale", () => {
    // Sur un téléphone rien ne change : pas de colonne, et la marge droite
    // reste aux écrans comme avant (un téléphone est tenu en portrait).
    Object.assign(mockMarges, { gauche: 24, droite: 48 });
    expect(rendre().root.findByType(Volet).props.largeur).toBe(400);
  });
});
