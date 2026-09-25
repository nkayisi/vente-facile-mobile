/**
 * Le démarrage à froid, jugé sur ce qu'aucun module pur ne peut juger : l'état
 * dans lequel il laisse la garde.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN DÉFAUT DE DÉMARRAGE NE LÈVE RIEN, IL FIGE.                           │
 * │                                                                          │
 * │ `bootstrap` est appelé en `void` depuis un effet : un rejet part en      │
 * │ l'air, sans trace. Le statut reste `loading`, et `ROUTE_FOR` n'a aucune  │
 * │ route pour cet état - la garde sort dessus sans rien déplacer. L'écran   │
 * │ de démarrage ne s'en va donc plus jamais, et la cause étant persistante, │
 * │ le lancement suivant refait exactement la même chose.                    │
 * │                                                                          │
 * │ Rien n'apparaît dans les journaux, rien ne plante : le terminal ne       │
 * │ démarre simplement plus. C'est ce fichier qui l'interdit.                │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import { useEffect } from "react";

import TestRenderer, { act } from "react-test-renderer";

// `jest.mock` est HISSÉ par Babel au-dessus des imports : celui-ci peut donc
// rester en tête, et le module recevra bien ses doublures.
import { MOTIF_DEMARRAGE, SessionProvider, useSession } from "./provider";
import type { Estampille } from "./proprietaire";

const INSTANTANE = {
  user: { id: "u-1", email: "a@b.cd", full_name: "Alice" },
  organization: { id: "o-1", name: "Boutique" },
  // `snapshot.membership` n'est pas optionnel : le fournisseur lit ses
  // permissions au rendu, et un instantané amputé lèverait pour une raison qui
  // n'a rien à voir avec ce que ce fichier éprouve.
  membership: { role: "owner", permissions: [], assigned_warehouses: [] },
};

let mockEstampille: Estampille | null = null;
let mockPurgeLeve = false;
let mockInstantane: unknown = INSTANTANE;
const mockAppels: string[] = [];

jest.mock("@/api/client", () => ({
  setOrganizationId: jest.fn(),
  setSessionLostHandler: jest.fn(),
}));

jest.mock("@/data/reglages", () => ({
  accueilDejaVu: async () => true,
  marquerAccueilVu: async () => {},
}));

jest.mock("@/db/purge", () => ({
  purgeInachevee: async () => false,
  // ⚠ C'est le SEUL endroit où la cinquantaine de `SELECT` se compte : la
  // fonction est asynchrone et son coût ne se voit nulle part ailleurs.
  baseHabitee: async () => {
    mockAppels.push("baseHabitee");
    return true;
  },
  purgerBaseLocale: async () => {
    mockAppels.push("purge");
    if (mockPurgeLeve) throw new Error("Purge refusée : tables non classées");
    return { tablesVidees: 0, lignesSupprimees: 0, fichiersSupprimes: 0 };
  },
}));

jest.mock("./storage", () => ({
  readSnapshot: async () => mockInstantane,
  readTokens: async () => ({ access: "a", refresh: "r" }),
  writeSnapshot: async () => {},
  purgerClesHeritees: async () => {},
}));

// Un appareil VERROUILLÉ par défaut : c'est ce qui fait atterrir le démarrage
// sur `locked`, l'état que ces tests éprouvent.
let mockVerrouAppareil = true;
jest.mock("./lock", () => ({
  appareilVerrouille: async () => mockVerrouAppareil,
}));

jest.mock("./estampille", () => ({
  lireEstampille: async () => mockEstampille,
  ecrireEstampille: async (e: Estampille) => {
    mockAppels.push("estampille");
    mockEstampille = e;
  },
}));

jest.mock("./en-souffrance", () => ({
  // File VIDE : le verdict « étrangère » mène alors à `purger`, sans arbitrage.
  // C'est la branche qui appelle `purgerBaseLocale`, donc celle qui peut lever.
  lireEnSouffrance: async () => ({
    pending: 0,
    inflight: 0,
    quarantined: 0,
    blocked: 0,
    photos: 0,
  }),
  lirePerissablesLocaux: async () => ({ paniers: 0, documents: 0 }),
}));

jest.mock("./session", () => ({
  enrollDevice: jest.fn(),
  loginWithPassword: jest.fn(),
  registerAndEnroll: jest.fn(),
  logout: jest.fn(),
  refreshSnapshot: jest.fn(),
}));

/** Ce que la garde lirait. */
let vu: { status: string; lostReason: string | null } = {
  status: "?",
  lostReason: null,
};

function Sonde() {
  const { status, lostReason } = useSession();
  // ⚠ Dans un EFFET, jamais au rendu : écrire dans une variable extérieure
  // pendant le rendu est un effet de bord, et le rendu peut se rejouer.
  useEffect(() => {
    vu = { status, lostReason };
  }, [status, lostReason]);
  return null;
}

async function demarrer() {
  await act(async () => {
    TestRenderer.create(
      <SessionProvider>
        <Sonde />
      </SessionProvider>
    );
  });
  // Le `bootstrap` enchaîne plusieurs `await` : on laisse la file de
  // microtâches se vider avant de juger.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

const ETRANGERE: Estampille = {
  userId: "u-autre",
  organizationId: "o-autre",
  userLibelle: "Bob",
  userEmail: "bob@b.cd",
  organizationLibelle: "Autre boutique",
  estampilleeAt: "2026-09-01T00:00:00.000Z",
};

beforeEach(() => {
  mockVerrouAppareil = true;
  mockAppels.length = 0;
  mockEstampille = null;
  mockPurgeLeve = false;
  mockInstantane = INSTANTANE;
  vu = { status: "?", lostReason: null };
});

describe("le démarrage à froid", () => {
  /**
   * ⚠ LE CONTRÔLE QUI REND LES AUTRES CRÉDIBLES.
   *
   * Un harnais mal branché rendrait `loading` en permanence, et le premier test
   * passerait pour la mauvaise raison - il constaterait un statut différent de
   * `loading` là où il n'y a jamais eu de démarrage du tout.
   */
  it("aboutit vraiment quand rien ne lève", async () => {
    mockEstampille = { ...ETRANGERE, userId: "u-1", organizationId: "o-1" };
    await demarrer();
    expect(vu.status).toBe("locked");
  });

  it("ne laisse JAMAIS la garde sur `loading` quand la purge lève", async () => {
    // Base étrangère, file vide : le filet conclut « purger », et la purge
    // lève - c'est son garde-fou « tables non classées », qui existe bel et
    // bien et qui part sur un binaire livré.
    mockEstampille = ETRANGERE;
    mockPurgeLeve = true;

    await demarrer();

    expect(mockAppels).toContain("purge");
    expect(vu.status).not.toBe("loading");
    // `anonymous` : le seul repli sûr ET réparable de lui-même. Le trousseau
    // n'est pas touché, donc le lancement suivant réessaie, et une reconnexion
    // repasse par `chooseOrganization`, dont les appelants AFFICHENT l'erreur.
    expect(vu.status).toBe("anonymous");
  });

  it("NOMME le motif, sinon le caissier croit sa journée perdue", async () => {
    mockEstampille = ETRANGERE;
    mockPurgeLeve = true;
    await demarrer();
    expect(vu.lostReason).toBe(MOTIF_DEMARRAGE);
  });

  it("survit à un instantané illisible", async () => {
    // `readSnapshot` peut lever : le trousseau n'est pas toujours disponible au
    // démarrage, et l'exception remontait jusqu'à l'effet.
    mockInstantane = null;
    await demarrer();
    expect(vu.status).toBe("anonymous");
  });
});

describe("le coût d'un démarrage ordinaire", () => {
  /**
   * `baseHabitee` balaie une cinquantaine de tables. `doitRattraper` rend faux
   * dès qu'une estampille existe, c'est-à-dire à TOUS les démarrages sauf le
   * tout premier après la mise à jour : le balayage était payé pour une réponse
   * connue d'avance, à chaque lancement.
   */
  it("ne balaie pas les cinquante tables quand l'estampille répond déjà", async () => {
    mockEstampille = { ...ETRANGERE, userId: "u-1", organizationId: "o-1" };
    await demarrer();
    expect(vu.status).toBe("locked");
    expect(mockAppels).not.toContain("baseHabitee");
  });

  it("la balaie encore au PREMIER lancement, sans quoi le parc part en reprise", async () => {
    // Pas d'estampille et base habitée : c'est le rattrapage du parc déjà en
    // service. Le retirer enverrait chaque terminal sur l'écran d'arbitrage.
    mockEstampille = null;
    await demarrer();
    expect(mockAppels).toContain("baseHabitee");
    expect(mockAppels).toContain("estampille");
    expect(vu.status).toBe("locked");
  });

  /**
   * ⚠ LE CHOIX EXPLICITE DU PRODUIT, ET IL DOIT ÊTRE TENU PAR UN TEST.
   *
   * Un terminal de caisse partagé n'a souvent aucun verrouillage d'écran :
   * `getEnrolledLevelAsync()` rend `NONE`, et il n'y a littéralement rien à
   * quoi s'authentifier. Atterrir sur `locked` y donnerait un écran dont
   * l'invitation ne peut pas aboutir - une caisse fermée pour de bon. On
   * entre, et `profil.tsx` le DIT sans rien bloquer.
   */
  it("entre directement quand l'appareil n'a aucun verrou", async () => {
    mockEstampille = { ...ETRANGERE, userId: "u-1", organizationId: "o-1" };
    mockVerrouAppareil = false;
    await demarrer();
    expect(vu.status).toBe("ready");
  });
});
