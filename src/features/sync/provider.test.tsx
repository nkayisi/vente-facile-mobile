/**
 * Le fournisseur de synchronisation, jugé sur ce qu'aucun module pur ne peut
 * juger : le verrou, les écouteurs, et le nettoyage au démontage.
 *
 * La CADENCE, elle, est éprouvée dans `planificateur.test.ts` - ici on ne
 * vérifie que le câblage. Un test qui rejouerait la table de décision à
 * travers le rendu serait plus lent et moins précis.
 */
import { useEffect } from "react";
import TestRenderer, { act } from "react-test-renderer";

// Module PUR, sans effet de bord : il peut rester en tête.
import { reinitialiserPourTest } from "@/sync/verrou";

const mockPushAll = jest.fn<Promise<unknown>, unknown[]>();
const mockSonder = jest.fn<Promise<string | null>, unknown[]>();
const mockPullAll = jest.fn<Promise<unknown>, unknown[]>();
const mockUnblockAll = jest.fn<Promise<void>, unknown[]>();
const mockEtatJournal = jest.fn<Promise<{ nbPret: number; prochaineTentativeAt: Date | null }>, []>();
const mockRefresh = jest.fn<Promise<{ snapshot: unknown; frais: boolean }>, []>();
const mockToast = { succes: jest.fn(), erreur: jest.fn(), info: jest.fn() };
const mockPrecharger = jest.fn();

let mockEnLigne = true;
let mockStatus = "ready";
let mockSnapshot: unknown = null;
let mockRetourReseau: (() => void) | null = null;
let mockChangement: ((ev: { tableName: string }) => void) | null = null;

/**
 * ⚠ LE VERROU N'EST PAS DOUBLÉ, ET C'EST TOUT L'INTÉRÊT.
 *
 * Ce fichier juge « le verrou, les écouteurs et le nettoyage » : le doubler
 * reviendrait à éprouver la doublure. Il est PUR (une variable de module, aucune
 * base, aucun rendu), donc le vrai tourne ici sans rien ouvrir. `requireActual`
 * est la seule référence hors portée qu'une fabrique de `jest.mock` accepte.
 */
// La tâche d'arrière-plan n'existe que sur un appareil : ici, ses deux
// fonctions d'inscription ne font rien.
jest.mock("@/sync/arriere-plan", () => ({
  inscrireTachePoussee: jest.fn(async () => undefined),
  retirerTachePoussee: jest.fn(async () => undefined),
}));

jest.mock("@/sync", () => ({
  ...jest.requireActual("@/sync/verrou"),
  pushAll: (...a: unknown[]) => mockPushAll(...a),
  pullAll: (...a: unknown[]) => mockPullAll(...a),
  sonderPerimetre: (...a: unknown[]) => mockSonder(...a),
  unblockAll: () => mockUnblockAll(),
  etatJournal: () => mockEtatJournal(),
}));

jest.mock("@/data/reseau", () => ({
  useEnLigne: () => mockEnLigne,
  surRetourReseau: (quand: () => void) => {
    mockRetourReseau = quand;
    return () => {
      mockRetourReseau = null;
    };
  },
}));

jest.mock("@/data/reglages", () => ({
  lireReglage: () => Promise.resolve(null),
  ecrireReglage: () => Promise.resolve(),
}));

jest.mock("@/session/provider", () => ({
  useSession: () => ({ snapshot: mockSnapshot, status: mockStatus, refresh: mockRefresh }),
}));

jest.mock("@/features/inventaire/photos", () => ({
  envoyerPhotosEnAttente: () => Promise.resolve(),
}));

jest.mock("@/ui", () => ({ useToast: () => mockToast }));

jest.mock("./barre-progression", () => ({ BarreProgressionSync: () => null }));

// Le préchargement des photos lit la base : on ne compte que ses appels.
jest.mock("./photos-prechargees", () => ({ prechargerPhotos: () => mockPrecharger() }));

jest.mock("expo-sqlite", () => ({
  addDatabaseChangeListener: (quand: (ev: { tableName: string }) => void) => {
    mockChangement = quand;
    return {
      remove: () => {
        mockChangement = null;
      },
    };
  },
}));

// eslint-disable-next-line import/first
import { DEBOUNCE_JOURNAL_MS, DELAI_ENTREE_MS, GIGUE_RESEAU_MS } from "./planificateur";
// eslint-disable-next-line import/first
import { SynchronisationProvider, useSynchronisation } from "./provider";
// eslint-disable-next-line import/first
import { DROITS_NON_RELUS } from "./origines";
// eslint-disable-next-line import/first
import { AppState } from "react-native";

/**
 * Ce que le fournisseur expose, relevé après chaque rendu.
 *
 * ⚠ Dans un effet, pas pendant le rendu : écrire une variable du module en
 * plein rendu est l'effet de bord que `react-hooks/globals` refuse, à raison.
 */
let mockEtat: ReturnType<typeof useSynchronisation> | null = null;
function Temoin() {
  const etat = useSynchronisation();
  useEffect(() => {
    mockEtat = etat;
  });
  return null;
}

const BILAN = { tables: 3, rows: 10, interrupted: false, skipped: 0, echecs: [] };

/** Laisse les promesses en attente se résoudre, sans avancer l'horloge. */
async function souffler() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function avancer(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

function monter() {
  let arbre!: TestRenderer.ReactTestRenderer;
  act(() => {
    arbre = TestRenderer.create(
      <SynchronisationProvider>
        <Temoin />
      </SynchronisationProvider>
    );
  });
  return arbre;
}

describe("le fournisseur de synchronisation", () => {
  beforeEach(() => {
    // Le verrou est une variable de MODULE : elle survit d'un cas à l'autre. Un
    // test qui la laisse prise ferait échouer le suivant pour une raison qui ne
    // lui appartient pas.
    reinitialiserPourTest();
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockEnLigne = true;
    mockStatus = "ready";
    mockSnapshot = null;
    mockRetourReseau = null;
    mockChangement = null;
    mockPushAll.mockResolvedValue(undefined);
    mockSonder.mockResolvedValue(null);
    mockEtat = null;
    mockPullAll.mockResolvedValue(BILAN);
    mockUnblockAll.mockResolvedValue(undefined);
    mockRefresh.mockResolvedValue({ snapshot: null, frais: true });
    mockEtatJournal.mockResolvedValue({ nbPret: 0, prochaineTentativeAt: null });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("ne fait AUCUN travail au montage", async () => {
    // C'est la condition du démarrage à froid sans réseau, affirmée dans
    // `(app)/_layout.tsx` : le premier écran doit peindre avant que le réseau
    // ne soit sollicité.
    const arbre = monter();
    await souffler();
    expect(mockPushAll).not.toHaveBeenCalled();
    expect(mockPullAll).not.toHaveBeenCalled();
    act(() => arbre.unmount());
  });

  it("tire tout après le délai d'entrée", async () => {
    const arbre = monter();
    await souffler();
    await avancer(DELAI_ENTREE_MS);
    expect(mockPushAll).toHaveBeenCalledTimes(1);
    expect(mockPullAll).toHaveBeenCalledTimes(1);
    // Les photos d'articles se téléchargent d'avance après un tirage complet :
    // c'est ce qui les rend lisibles hors ligne au comptoir.
    expect(mockPrecharger).toHaveBeenCalledTimes(1);
    act(() => arbre.unmount());
  });

  it("un établissement SUSPENDU ne fait que pousser, puis relire la session", async () => {
    // Le serveur ne tolère que la poussée : le tirage répondrait 403 à chaque
    // cycle. Le réveil, lui, rapporte la réactivation.
    mockSnapshot = { organization: { id: "o", name: "Boutique", is_active: false }, device: { id: "d" } };
    const arbre = monter();
    await souffler();
    await avancer(DELAI_ENTREE_MS);
    expect(mockPushAll).toHaveBeenCalledTimes(1);
    expect(mockPullAll).not.toHaveBeenCalled();
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    // Sans tirage, rien de neuf à télécharger.
    expect(mockPrecharger).not.toHaveBeenCalled();
    act(() => arbre.unmount());
  });

  it("ne lance rien hors ligne", async () => {
    mockEnLigne = false;
    const arbre = monter();
    await souffler();
    await avancer(DELAI_ENTREE_MS * 4);
    expect(mockPushAll).not.toHaveBeenCalled();
    act(() => arbre.unmount());
  });

  it("ne lance rien tant que la session n'est pas prête", async () => {
    // Pendant un verrouillage, les jetons sont là mais l'utilisateur ne l'est
    // pas.
    mockStatus = "locked";
    const arbre = monter();
    await souffler();
    await avancer(DELAI_ENTREE_MS);
    expect(mockPushAll).not.toHaveBeenCalled();
    act(() => arbre.unmount());
  });

  describe("l'écriture locale", () => {
    it("ne déclenche RIEN quand le journal n'a rien de prêt", async () => {
      // Sans cette garde, les écritures de `pushOnce` relanceraient un cycle à
      // vide et feraient clignoter les boutons d'une vingtaine d'écrans.
      const arbre = monter();
      await souffler();
      await avancer(DELAI_ENTREE_MS);
      mockPushAll.mockClear();

      act(() => mockChangement?.({ tableName: "outbox_operations" }));
      await souffler();
      await avancer(DEBOUNCE_JOURNAL_MS * 2);
      expect(mockPushAll).not.toHaveBeenCalled();
      act(() => arbre.unmount());
    });

    it("envoie, sans tirer, quand quelque chose attend", async () => {
      const arbre = monter();
      await souffler();
      await avancer(DELAI_ENTREE_MS);
      mockPushAll.mockClear();
      mockPullAll.mockClear();
      mockEtatJournal.mockResolvedValue({ nbPret: 2, prochaineTentativeAt: null });

      act(() => mockChangement?.({ tableName: "outbox_operations" }));
      await souffler();
      await avancer(DEBOUNCE_JOURNAL_MS);
      expect(mockPushAll).toHaveBeenCalledTimes(1);
      expect(mockPullAll).not.toHaveBeenCalled();
      act(() => arbre.unmount());
    });

    it("réunit une rafale en UN seul envoi", async () => {
      // Une vente encaissée écrit son acte, son règlement et son ticket : trois
      // réveils en quelques centaines de millisecondes.
      const arbre = monter();
      await souffler();
      await avancer(DELAI_ENTREE_MS);
      mockPushAll.mockClear();
      mockEtatJournal.mockResolvedValue({ nbPret: 3, prochaineTentativeAt: null });

      for (let i = 0; i < 3; i += 1) {
        act(() => mockChangement?.({ tableName: "outbox_operations" }));
        await souffler();
      }
      await avancer(DEBOUNCE_JOURNAL_MS);
      expect(mockPushAll).toHaveBeenCalledTimes(1);
      act(() => arbre.unmount());
    });

    it("renonce si le journal s'est vidé entre la décision et le départ", async () => {
      // Le planificateur tranche à l'instant du changement ; le départ, lui,
      // est différé de deux secondes. Un autre cycle a pu vider le journal
      // entre-temps, et partir à vide ferait clignoter les boutons d'une
      // vingtaine d'écrans pour rien.
      const arbre = monter();
      await souffler();
      await avancer(DELAI_ENTREE_MS);
      mockPushAll.mockClear();

      mockEtatJournal.mockResolvedValue({ nbPret: 2, prochaineTentativeAt: null });
      act(() => mockChangement?.({ tableName: "outbox_operations" }));
      await souffler();

      // Le journal se vide avant l'échéance.
      mockEtatJournal.mockResolvedValue({ nbPret: 0, prochaineTentativeAt: null });
      await avancer(DEBOUNCE_JOURNAL_MS);

      expect(mockPushAll).not.toHaveBeenCalled();
      act(() => arbre.unmount());
    });

    it("ignore les changements d'une AUTRE table", async () => {
      const arbre = monter();
      await souffler();
      await avancer(DELAI_ENTREE_MS);
      mockPushAll.mockClear();
      mockEtatJournal.mockResolvedValue({ nbPret: 5, prochaineTentativeAt: null });

      act(() => mockChangement?.({ tableName: "sales" }));
      await souffler();
      await avancer(DEBOUNCE_JOURNAL_MS * 2);
      expect(mockPushAll).not.toHaveBeenCalled();
      act(() => arbre.unmount());
    });
  });

  it("repart au retour du réseau", async () => {
    // Le marchand encaisse en zone morte, ressort, et ses ventes partent sans
    // qu'il ait à y penser.
    mockEnLigne = false;
    const arbre = monter();
    await souffler();
    await avancer(DELAI_ENTREE_MS);
    expect(mockPushAll).not.toHaveBeenCalled();

    mockEnLigne = true;
    act(() => mockRetourReseau?.());
    await souffler();
    await avancer(GIGUE_RESEAU_MS);
    expect(mockPushAll).toHaveBeenCalledTimes(1);
    expect(mockPullAll).toHaveBeenCalledTimes(1);
    act(() => arbre.unmount());
  });

  describe("un périmètre qui bouge sur le serveur", () => {
    const SNAP = { membership: { perimetre_version: "v1" }, device: { id: "d" } };

    it("une poussée qui annonce une empreinte neuve devient un cycle COMPLET", async () => {
      // Un refus `consultation_seule` vient presque toujours d'un périmètre qui
      // a bougé : attendre le prochain tirage laisserait le marchand sur des
      // droits que le serveur vient de démentir.
      mockSnapshot = SNAP;
      const arbre = monter();
      await souffler();
      await avancer(DELAI_ENTREE_MS);
      mockPullAll.mockClear();

      mockPushAll.mockResolvedValue({ perimetreVersion: "v2" });
      mockEtatJournal.mockResolvedValue({ nbPret: 1, prochaineTentativeAt: null });
      act(() => mockChangement?.({ tableName: "outbox_operations" }));
      await souffler();
      await avancer(DEBOUNCE_JOURNAL_MS);
      await souffler();
      expect(mockPullAll).toHaveBeenCalledTimes(1);
      expect(mockRefresh).toHaveBeenCalled();
      act(() => arbre.unmount());
    });

    it("une même empreinte ne relance pas un second tirage, même si la relecture échoue", async () => {
      // La relecture rend ici toujours l'ancien instantané (v1) : sans la
      // mémoire de ce qui a été traité, chaque vente retirerait tout.
      mockSnapshot = SNAP;
      const arbre = monter();
      await souffler();
      await avancer(DELAI_ENTREE_MS);
      mockPushAll.mockResolvedValue({ perimetreVersion: "v2" });
      mockEtatJournal.mockResolvedValue({ nbPret: 1, prochaineTentativeAt: null });

      act(() => mockChangement?.({ tableName: "outbox_operations" }));
      await souffler();
      await avancer(DEBOUNCE_JOURNAL_MS);
      await souffler();
      mockPullAll.mockClear();

      act(() => mockChangement?.({ tableName: "outbox_operations" }));
      await souffler();
      await avancer(DEBOUNCE_JOURNAL_MS);
      await souffler();
      expect(mockPullAll).not.toHaveBeenCalled();
      act(() => arbre.unmount());
    });

    it("la même empreinte qu'au dernier réveil ne tire rien de plus", async () => {
      mockSnapshot = SNAP;
      const arbre = monter();
      await souffler();
      await avancer(DELAI_ENTREE_MS);
      mockPullAll.mockClear();

      mockPushAll.mockResolvedValue({ perimetreVersion: "v1" });
      mockEtatJournal.mockResolvedValue({ nbPret: 1, prochaineTentativeAt: null });
      act(() => mockChangement?.({ tableName: "outbox_operations" }));
      await souffler();
      await avancer(DEBOUNCE_JOURNAL_MS);
      await souffler();
      expect(mockPullAll).not.toHaveBeenCalled();
      act(() => arbre.unmount());
    });

    it("le retour au premier plan SONDE sous le plancher, et tire si le périmètre a bougé", async () => {
      // ⚠ PAS de `jest.spyOn(...).mockRestore()` : sous jest-expo,
      // `addEventListener` est DÉJÀ une doublure, et la « restaurer » lui retire
      // son implémentation - les tests suivants recevraient `undefined`.
      let auPremierPlan: ((etat: string) => void) | null = null;
      const original = AppState.addEventListener;
      AppState.addEventListener = ((_type: string, quand: (etat: string) => void) => {
        auPremierPlan = quand;
        return { remove: () => undefined };
      }) as unknown as typeof AppState.addEventListener;
      mockSnapshot = SNAP;
      const arbre = monter();
      await souffler();
      await avancer(DELAI_ENTREE_MS);
      await souffler();
      mockPullAll.mockClear();

      mockSonder.mockResolvedValue("v2");
      act(() => auPremierPlan?.("active"));
      await souffler();
      await avancer(0);
      await souffler();
      expect(mockSonder).toHaveBeenCalledTimes(1);
      // La sonde a rendu le verrou et demandé le cycle complet : il part au
      // départ différé suivant, sans attendre le plancher de cinq minutes.
      await avancer(0);
      await souffler();
      expect(mockPullAll).toHaveBeenCalledTimes(1);
      act(() => arbre.unmount());
      AppState.addEventListener = original;
    });
  });

  it("une relecture des droits qui ÉCHOUE se dit, au lieu de « terminée »", async () => {
    mockRefresh.mockResolvedValue({ snapshot: null, frais: false });
    const arbre = monter();
    await souffler();
    await avancer(DELAI_ENTREE_MS);
    await souffler();
    expect(mockPullAll).toHaveBeenCalledTimes(1);
    expect(mockEtat?.erreur).toBe(DROITS_NON_RELUS);
    act(() => arbre.unmount());
  });

  it("ne laisse AUCUN minuteur derrière lui au démontage", async () => {
    // Le fournisseur est démonté à chaque verrouillage, pas seulement à la
    // déconnexion : un réveil orphelin solliciterait un contexte disparu.
    mockEtatJournal.mockResolvedValue({ nbPret: 4, prochaineTentativeAt: null });
    const arbre = monter();
    await souffler();

    act(() => arbre.unmount());
    mockPushAll.mockClear();
    mockPullAll.mockClear();

    await avancer(DELAI_ENTREE_MS * 10);
    expect(mockPushAll).not.toHaveBeenCalled();
    expect(mockPullAll).not.toHaveBeenCalled();
  });
});
