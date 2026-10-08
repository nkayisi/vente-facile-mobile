/**
 * Le voile de mise à jour, jugé sur son RENDU.
 *
 * `porte.ts` dit s'il faut bloquer, et ses tests le prouvent.
 * `session/carte-en-souffrance.ts` dit ce que la carte annonce, et ses tests le
 * prouvent sans appareil. Ce qu'aucun des deux n'atteint, c'est le CÂBLAGE : que
 * la carte arrive bien à l'écran, que le bouton d'envoi suive ce qu'elle décide,
 * et qu'une relecture qui n'a pas abouti le dise.
 *
 * ⚠ CE TEST NE PROUVE PAS LE RENDU, il prouve la STRUCTURE : que la pièce est
 * là, et conditionnée sur la bonne chose. Une mise en page se juge à l'œil, sur
 * un terminal.
 */
import TestRenderer, { act } from "react-test-renderer";

import { FILE_VIDE, type EtatFile } from "@/session/deconnexion-regles";
import type { RelectureSession } from "@/session/session";
import type { SessionAppUpdate } from "@/session/types";

let mockEnLigne = true;
let mockVue: { file: EtatFile; inconnu: boolean } = {
  file: FILE_VIDE,
  inconnu: false,
};
const mockLancer = jest.fn();
const mockDemanderDeconnexion = jest.fn();
const mockOuvrirMagasin = jest.fn();
const mockToastErreur = jest.fn();
const mockToastInfo = jest.fn();
const mockRefresh = jest.fn<Promise<RelectureSession>, []>();

jest.mock("@/data/reseau", () => ({ useEnLigne: () => mockEnLigne }));
jest.mock("@/features/sync/provider", () => ({
  useSynchronisation: () => ({ lancer: mockLancer, enCours: false }),
}));
jest.mock("@/session/deconnexion", () => ({
  useDeconnexion: () => ({ demander: mockDemanderDeconnexion }),
}));
jest.mock("@/session/provider", () => ({
  useSession: () => ({ refresh: mockRefresh }),
}));
jest.mock("@/session/use-en-souffrance", () => ({
  useEnSouffrance: () => mockVue,
}));
jest.mock("./magasin", () => ({
  ouvrirMagasin: (urls: string[]) => mockOuvrirMagasin(urls),
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
    Badge: passe("Badge"),
    Button: passe("Button"),
    Card: passe("Card"),
    Icon: ({ name }: { name: string }) =>
      React.createElement(RN.Text, null, `icone:${name}`),
    Text: ({ children }: { children?: unknown }) =>
      React.createElement(RN.Text, null, children as never),
    useMargesSysteme: () => ({ haut: 24, bas: 48, gauche: 0, droite: 0 }),
    useToast: () => ({
      erreur: mockToastErreur,
      succes: jest.fn(),
      info: mockToastInfo,
    }),
  };
});

// eslint-disable-next-line import/first
import { VoileMiseAJour } from "./voile";

function exigence(partiel: Partial<SessionAppUpdate> = {}): SessionAppUpdate {
  return {
    minimum_version: "1.3.0",
    current_version: null,
    store_urls: [],
    message: null,
    ...partiel,
  };
}

function monter(e: SessionAppUpdate | null): TestRenderer.ReactTestRenderer {
  let arbre!: TestRenderer.ReactTestRenderer;
  act(() => {
    arbre = TestRenderer.create(<VoileMiseAJour exigence={e} />);
  });
  return arbre;
}

function rendu(e: SessionAppUpdate | null): string {
  const arbre = monter(e);
  const texte = JSON.stringify(arbre.toJSON());
  act(() => arbre.unmount());
  return texte;
}

/** Les boutons rendus, dans l'ordre. La doublure porte `onPress` sur l'hôte. */
function boutons(arbre: TestRenderer.ReactTestRenderer) {
  return arbre.root.findAll((n) => n.props?.testID === "Button");
}

async function presser(arbre: TestRenderer.ReactTestRenderer, libelle: string) {
  const cible = boutons(arbre).find((n) =>
    JSON.stringify(n.props.children ?? "").includes(libelle),
  );
  if (!cible) throw new Error(`bouton introuvable : ${libelle}`);
  await act(async () => {
    await (cible.props.onPress as () => unknown | Promise<unknown>)();
  });
}

/** Le variant du bouton « Mettre à jour », qui dit s'il cède la vedette. */
function variantMiseAJour(arbre: TestRenderer.ReactTestRenderer): unknown {
  const cible = boutons(arbre).find((n) =>
    JSON.stringify(n.props.children ?? "").includes("Mettre à jour"),
  );
  return cible?.props.variant;
}

beforeEach(() => {
  mockEnLigne = true;
  mockVue = { file: FILE_VIDE, inconnu: false };
  mockLancer.mockReset();
  mockDemanderDeconnexion.mockReset();
  mockOuvrirMagasin.mockReset();
  mockToastErreur.mockReset();
  mockToastInfo.mockReset();
  mockRefresh.mockReset();
  mockRefresh.mockResolvedValue({ snapshot: null, frais: true });
});

describe("le bouton de mise à jour", () => {
  it("N'EXISTE PAS quand aucune adresse n'est configurée", () => {
    // Le défaut qui enfermerait un terminal de comptoir sans magasin : un
    // bouton qui ne mène nulle part est pire que pas de bouton. C'est le
    // message réglable qui tient alors lieu d'issue.
    expect(rendu(exigence({ store_urls: [] }))).not.toContain("Mettre à jour");
  });

  it("apparaît dès qu'une adresse est configurée", () => {
    expect(rendu(exigence({ store_urls: ["market://x"] }))).toContain(
      "Mettre à jour",
    );
  });
});

describe("le câblage de la carte", () => {
  it("rend le titre et la phrase que le module pur a décidés", () => {
    mockVue = { file: { ...FILE_VIDE, photos: 1 }, inconnu: false };
    const texte = rendu(exigence());
    expect(texte).toContain("Il reste des données sur ce terminal");
    expect(texte).toContain("photo d'article");
  });

  it("propose l'envoi AVANT la mise à jour, et lui fait CÉDER la vedette", () => {
    // Une mise à jour par le magasin garde le bac à sable, mais un APK posé à
    // la main dont la signature diffère force une désinstallation, qui détruit
    // la base. Vider la file d'abord est la seule mitigation de ce cas.
    mockVue = { file: { ...FILE_VIDE, pending: 3 }, inconnu: false };
    const arbre = monter(exigence({ store_urls: ["market://x"] }));
    expect(JSON.stringify(arbre.toJSON())).toContain("Envoyer mes 3 opérations");
    expect(variantMiseAJour(arbre)).toBe("outline");
    act(() => arbre.unmount());
  });

  it("n'offre RIEN à envoyer quand la file est vide", () => {
    const arbre = monter(exigence({ store_urls: ["market://x"] }));
    expect(JSON.stringify(arbre.toJSON())).not.toContain("Envoyer");
    expect(variantMiseAJour(arbre)).toBe("primary");
    act(() => arbre.unmount());
  });

  it("n'offre AUCUN envoi pour une opération bloquée, et garde la vedette à la mise à jour", () => {
    // Le défaut central : un envoi ne la fera pas partir, donc le proposer
    // posait une condition impossible et laissait « Mettre à jour » secondaire
    // indéfiniment - on disait au marchand de ne pas mettre à jour, et il ne
    // pouvait jamais s'exécuter.
    mockVue = { file: { ...FILE_VIDE, blocked: 2 }, inconnu: false };
    const arbre = monter(exigence({ store_urls: ["market://x"] }));
    const texte = JSON.stringify(arbre.toJSON());
    expect(texte).not.toContain("Envoyer");
    expect(texte).toContain("attendent un droit");
    expect(variantMiseAJour(arbre)).toBe("primary");
    act(() => arbre.unmount());
  });

  it("n'affirme pas que tout est parti tant que la base n'a pas répondu", () => {
    mockVue = { file: FILE_VIDE, inconnu: true };
    expect(rendu(exigence())).not.toContain("déjà parti");
  });
});

describe("ce que le voile dit", () => {
  it("rend le message du serveur quand il existe", () => {
    // C'est la SEULE issue d'un terminal sans magasin : « appelez le 0XX ».
    const texte = rendu(
      exigence({ message: "Appelez le 0990000000 pour recevoir la mise à jour." }),
    );
    expect(texte).toContain("Appelez le 0990000000");
  });

  it("se replie sur un texte par défaut quand le serveur n'en donne pas", () => {
    expect(rendu(exigence({ message: null }))).toContain(
      "n'est plus prise en charge",
    );
  });

  it("NOMME la version à installer quand le serveur la donne", () => {
    // Un marchand qui doit réclamer sa mise à jour à un revendeur a besoin du
    // numéro.
    expect(rendu(exigence({ current_version: "1.3.0" }))).toContain(
      "Version 1.3.0 disponible",
    );
  });

  it("n'invente pas de version quand le serveur n'en donne pas", () => {
    expect(rendu(exigence({ current_version: null }))).not.toContain("disponible");
  });
});

describe("relire le seuil", () => {
  it("DIT que le serveur n'a pas répondu, plutôt que de se taire", async () => {
    // ⚠ `refresh` ne lève jamais : elle rend l'instantané PRÉCÉDENT. Sans son
    // `frais`, un portail captif était indiscernable de « le seuil est toujours
    // posé » - et le marchand qu'un administrateur venait de libérer pressait un
    // bouton qui ne rapportait rien.
    mockRefresh.mockResolvedValue({ snapshot: null, frais: false });
    const arbre = monter(exigence());
    await presser(arbre, "Vérifier à nouveau");
    expect(mockToastErreur).toHaveBeenCalledWith(
      expect.stringContaining("serveur n'a pas répondu"),
    );
    // Rien à pousser : l'aller-retour a échoué, un cycle échouerait pareil.
    expect(mockLancer).not.toHaveBeenCalled();
    act(() => arbre.unmount());
  });

  it("DIT que le seuil n'a pas bougé quand la relecture a bien abouti", async () => {
    // Sans ce mot, le bouton paraît inerte alors qu'il a parfaitement fonctionné.
    mockRefresh.mockResolvedValue({
      snapshot: { app_update: exigence() } as never,
      frais: true,
    });
    const arbre = monter(exigence());
    await presser(arbre, "Vérifier à nouveau");
    expect(mockToastInfo).toHaveBeenCalledWith(
      expect.stringContaining("toujours requise"),
    );
    expect(mockLancer).toHaveBeenCalled();
    act(() => arbre.unmount());
  });

  it("SE TAIT quand le seuil a été levé : le voile s'en va de lui-même", async () => {
    mockRefresh.mockResolvedValue({
      snapshot: { app_update: { ...exigence(), minimum_version: null } } as never,
      frais: true,
    });
    const arbre = monter(exigence());
    await presser(arbre, "Vérifier à nouveau");
    expect(mockToastInfo).not.toHaveBeenCalled();
    expect(mockToastErreur).not.toHaveBeenCalled();
    expect(mockLancer).toHaveBeenCalled();
    act(() => arbre.unmount());
  });

  it("ne tente rien hors ligne, et ne parle ni de réessai ni de synchronisation", async () => {
    mockEnLigne = false;
    const arbre = monter(exigence());
    await presser(arbre, "Vérifier à nouveau");
    expect(mockRefresh).not.toHaveBeenCalled();
    const dit = String(mockToastErreur.mock.calls[0]?.[0] ?? "").toLowerCase();
    expect(dit).toContain("sans réseau");
    expect(dit).not.toContain("réessay");
    act(() => arbre.unmount());
  });
});

describe("la sortie", () => {
  it("est TOUJOURS là, dans les quatre combinaisons", () => {
    // Un mur sans issue est le seul défaut irréparable depuis le terminal.
    for (const urls of [[], ["market://x"]]) {
      for (const file of [FILE_VIDE, { ...FILE_VIDE, pending: 2 }]) {
        mockVue = { file, inconnu: false };
        expect(rendu(exigence({ store_urls: urls }))).toContain("Se déconnecter");
      }
    }
  });

  it("offre TOUJOURS de relire le seuil, même sans magasin ni file", () => {
    // Un seuil posé trop haut se répare en administration ; sans ce bouton, le
    // marchand reste enfermé devant une porte que quelqu'un vient de rouvrir.
    expect(rendu(exigence({ store_urls: [] }))).toContain("Vérifier à nouveau");
  });

  it("passe par la séquence de déconnexion, jamais par `logout`", () => {
    // Elle tente D'ABORD de vider la file et NOMME ce qui ne peut pas partir :
    // c'est ce que le marchand doit lire avant de quitter.
    expect(mockDemanderDeconnexion).not.toHaveBeenCalled();
    expect(rendu(exigence())).toContain("Se déconnecter");
  });
});
