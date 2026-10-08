/**
 * La garde de mise à jour, jugée sur ce qu'elle MONTE.
 *
 * Deux invariants qu'aucun test pur n'atteint :
 *
 * 1. `children` reste monté SOUS le voile. Ne pas le rendre supprimerait le
 *    `<Stack>` du layout de `(app)`, donc expo-router n'aurait plus de
 *    navigateur pour ce groupe : lever le voile ne ramènerait le marchand
 *    nulle part.
 * 2. **La garde n'ouvre AUCUN abonnement à la base.** Le décompte de ce qui
 *    n'est pas parti vit dans le voile, qui ne monte que porte fermée. Lu ici,
 *    il tournait sur chaque terminal - donc un agrégat rejoué à chaque vente,
 *    sur le chemin chaud du comptoir, pour un écran qu'on ne verra pas.
 */
import { Text as TexteRN } from "react-native";
import TestRenderer, { act } from "react-test-renderer";

import type { SessionAppUpdate } from "@/session/types";

let mockAppUpdate: SessionAppUpdate | null = null;
let mockVersion: string | null = "1.0.0";
const mockUseLecture = jest.fn(() => ({
  donnees: null,
  chargement: false,
  erreur: null,
  recharger: () => {},
}));

jest.mock("@/session/provider", () => ({
  useSession: () => ({ snapshot: { app_update: mockAppUpdate } }),
}));
// ⚠ C'est la SEULE porte d'entrée vers la base locale dans cet arbre : compter
// ses appels est la mesure du second invariant.
jest.mock("@/data/live", () => ({ useLecture: () => mockUseLecture() }));
jest.mock("./version-installee", () => ({ versionInstallee: () => mockVersion }));
jest.mock("./voile", () => {
  const React = jest.requireActual("react");
  const RN = jest.requireActual("react-native");
  return {
    VoileMiseAJour: () => React.createElement(RN.Text, null, "VOILE"),
  };
});

// eslint-disable-next-line import/first
import { GardeMiseAJour } from "./garde";

function rendu(): string {
  let arbre!: TestRenderer.ReactTestRenderer;
  act(() => {
    arbre = TestRenderer.create(
      <GardeMiseAJour>
        <TexteRN>COMPTOIR</TexteRN>
      </GardeMiseAJour>,
    );
  });
  const texte = JSON.stringify(arbre.toJSON());
  act(() => arbre.unmount());
  return texte;
}

function seuil(minimum: string): SessionAppUpdate {
  return {
    minimum_version: minimum,
    current_version: null,
    store_urls: [],
    message: null,
  };
}

beforeEach(() => {
  mockAppUpdate = null;
  mockVersion = "1.0.0";
  mockUseLecture.mockClear();
});

describe("GardeMiseAJour", () => {
  it("laisse passer quand aucun seuil n'est posé", () => {
    const texte = rendu();
    expect(texte).toContain("COMPTOIR");
    expect(texte).not.toContain("VOILE");
  });

  it("laisse passer quand la version installée atteint le seuil", () => {
    mockAppUpdate = seuil("1.0.0");
    expect(rendu()).not.toContain("VOILE");
  });

  it("pose le voile SANS démonter le comptoir", () => {
    // Ne pas rendre `children` supprimerait le `<Stack>` du groupe `(app)` :
    // plus de navigateur, donc plus rien à retrouver en levant le voile.
    mockAppUpdate = seuil("1.3.0");
    mockVersion = "1.2.0";
    const texte = rendu();
    expect(texte).toContain("VOILE");
    expect(texte).toContain("COMPTOIR");
  });

  it("N'OUVRE AUCUN ABONNEMENT À LA BASE, porte ouverte comme fermée", () => {
    // Porte ouverte, c'est l'état ORDINAIRE : un abonnement posé ici vivrait sur
    // chaque terminal du parc, et son agrégat repartirait à chaque vente.
    rendu();
    expect(mockUseLecture).not.toHaveBeenCalled();

    mockAppUpdate = seuil("1.3.0");
    mockVersion = "1.2.0";
    rendu();
    expect(mockUseLecture).not.toHaveBeenCalled();
  });
});
