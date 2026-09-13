/**
 * Le témoin de synchronisation, jugé sur son RENDU.
 *
 * `indicateur-etat.ts` dit quoi montrer, et ses tests le prouvent. Ce qu'aucun
 * test pur n'atteint, c'est la traduction en pixels : une pastille dont le
 * décompte est calculé mais jamais rendu est exactement le genre de défaut
 * qu'on ne découvre qu'en zoomant sur la capture d'un vrai terminal.
 */
import TestRenderer, { act } from "react-test-renderer";

const mockCompteurs = { pending: 0, inflight: 0, done: 0, quarantined: 0, blocked: 0 };
let mockEnCours = false;
let mockEnLigne = true;

jest.mock("@/sync", () => ({ countByState: jest.fn() }));
jest.mock("@/data/live", () => ({
  useLecture: () => ({ donnees: mockCompteurs, chargement: false, erreur: null, recharger: () => {} }),
}));
jest.mock("@/data/reseau", () => ({ useEnLigne: () => mockEnLigne }));
jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
jest.mock("./provider", () => ({
  useSynchronisation: () => ({
    enCours: mockEnCours,
    origine: null,
    portee: null,
    progression: null,
    erreur: null,
    derniereSync: null,
    lancer: jest.fn(),
    annuler: jest.fn(),
  }),
}));

jest.mock("@/ui", () => {
  const React = jest.requireActual("react");
  const RN = jest.requireActual("react-native");
  const passe = (nom: string) => {
    const Doublure = ({
      children,
      ...reste
    }: Record<string, unknown> & { children?: unknown }) =>
      React.createElement(RN.View, { testID: nom, ...reste }, children as never);
    Doublure.displayName = `Doublure(${nom})`;
    return Doublure;
  };
  return {
    Button: passe("Button"),
    Divider: passe("Divider"),
    Sheet: passe("Sheet"),
    Pressable: passe("Pressable"),
    Icon: ({ name }: { name: string }) => React.createElement(RN.Text, null, `icone:${name}`),
    Text: ({ children }: { children?: unknown }) => React.createElement(RN.Text, null, children as never),
    useMouvementReduit: () => true,
    useTheme: () => ({
      colors: {
        primary: "#f00", mutedForeground: "#888", warning: "#fa0", destructive: "#f00",
        card: "#fff", primaryForeground: "#fff", warningForeground: "#fff",
        destructiveForeground: "#fff",
      },
    }),
  };
});
jest.mock("@/ui/tokens", () => ({ HIT: { min: 44 } }));

// eslint-disable-next-line import/first
import { IndicateurSync } from "./indicateur";

function rendu(): string {
  let arbre!: TestRenderer.ReactTestRenderer;
  act(() => {
    arbre = TestRenderer.create(<IndicateurSync />);
  });
  const texte = JSON.stringify(arbre.toJSON());
  act(() => arbre.unmount());
  return texte;
}

function poser(p: Partial<typeof mockCompteurs>) {
  Object.assign(mockCompteurs, { pending: 0, inflight: 0, done: 0, quarantined: 0, blocked: 0 }, p);
}

describe("le rendu du témoin", () => {
  beforeEach(() => {
    poser({});
    mockEnCours = false;
    mockEnLigne = true;
  });

  it("RETRANSCRIT la pastille quand des opérations attendent", () => {
    // Le décompte était calculé et n'atteignait pas l'écran : relevé sur un
    // vrai terminal, une horloge sans pastille alors que le module pur en
    // annonçait une.
    poser({ pending: 3 });
    expect(rendu()).toContain("3");
  });

  it("montre l'horloge quand quelque chose attend", () => {
    poser({ pending: 2 });
    expect(rendu()).toContain("icone:Clock");
  });

  it("ne montre AUCUNE pastille quand tout est arrivé", () => {
    poser({ done: 40 });
    const t = rendu();
    expect(t).toContain("icone:CheckCircle2");
    expect(t).not.toMatch(/">40"|"40"/);
  });

  it("compte les refus dans la pastille", () => {
    poser({ quarantined: 2, pending: 1 });
    const t = rendu();
    expect(t).toContain("icone:AlertTriangle");
    expect(t).toContain("3");
  });

  it("montre le nuage barré hors ligne", () => {
    mockEnLigne = false;
    expect(rendu()).toContain("icone:CloudOff");
  });

  it("montre la rotation pendant un cycle", () => {
    mockEnCours = true;
    expect(rendu()).toContain("icone:RefreshCw");
  });
});
