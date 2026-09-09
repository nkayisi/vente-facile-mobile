/**
 * Ce que chaque session d'inventaire attend d'envoyer.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CES LECTURES DOIVENT VOIR LES OPÉRATIONS BLOQUÉES.                      │
 * │                                                                          │
 * │ Elles ne présentent aucun acquis : elles FERMENT une porte et écrivent   │
 * │ une phrase. Sans les bloquées, un `start` bloqué sort de la carte, le    │
 * │ bouton « Démarrer » redevient actif, et le magasinier met en file un     │
 * │ SECOND démarrage. `unblockAll` les libère tous deux : le premier         │
 * │ s'applique, le second part en quarantaine, et il découvre un refus qu'il │
 * │ n'a jamais provoqué.                                                     │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Le journal est simulé : `@/sync` ouvre SQLite au chargement, et ce contrat
 * doit s'éprouver sans appareil. Motif de `features/pos/caisse.test.ts`.
 */
type OpSimulee = { id: string; payload: unknown; occurredAt: Date; envoi: string };

const mockJournal = new Map<string, OpSimulee[]>();
const mockLireJournal = jest.fn(
  async (kind: string, options?: { avecBloquees?: boolean }) =>
    (mockJournal.get(kind) ?? []).filter(
      (o) => options?.avecBloquees || o.envoi !== "bloque"
    )
);

jest.mock("expo-crypto", () => ({ randomUUID: () => "uuid-neuf" }));
// ⚠ Le préfixe `mock` n'est pas cosmétique : `jest.mock` refuse toute variable
// hors de sa portée, et ne fait exception que pour ce préfixe.
jest.mock("@/sync", () => ({
  enqueue: jest.fn(),
  enAttenteParType: (kind: string, options?: { avecBloquees?: boolean }) =>
    mockLireJournal(kind, options),
}));

import {
  comptagesEnAttente,
  creationsEnAttente,
  sessionsEnAttente,
} from "./actes";

function journal(
  kind: string,
  payloads: Record<string, unknown>[],
  envoi: "en_attente" | "bloque" = "en_attente",
  minute = 0
) {
  mockJournal.set(
    kind,
    payloads.map((payload, i) => ({
      id: `op-${kind}-${i}`,
      payload,
      occurredAt: new Date(2026, 8, 6, 10, minute + i),
      envoi,
    }))
  );
}

beforeEach(() => {
  mockJournal.clear();
  mockLireJournal.mockClear();
});

describe("sessionsEnAttente", () => {
  it("demande les opérations BLOQUÉES, sur les cinq actes", async () => {
    await sessionsEnAttente();
    for (const acte of ["create", "start", "submit", "validate", "cancel"]) {
      expect(mockLireJournal).toHaveBeenCalledWith(`inventory_session.${acte}`, {
        avecBloquees: true,
      });
    }
  });

  it("dit QUELLE transition attend, pas seulement qu'une attend", async () => {
    journal("inventory_session.submit", [{ session: "s1" }]);
    const par = await sessionsEnAttente();
    expect(par.get("s1")?.acte).toBe("submit");
  });

  it("retient le geste le plus RÉCENT quand plusieurs attendent", async () => {
    journal("inventory_session.start", [{ session: "s1" }], "en_attente", 0);
    journal("inventory_session.cancel", [{ session: "s1" }], "en_attente", 30);
    const par = await sessionsEnAttente();
    expect(par.get("s1")?.acte).toBe("cancel");
  });

  it("annonce le PIRE état de plusieurs actes", async () => {
    // Une soumission bloquée sous un démarrage en file : dire « attend son
    // envoi » ferait attendre un réseau qui ne débloquera rien.
    journal("inventory_session.start", [{ session: "s1" }], "en_attente", 0);
    journal("inventory_session.submit", [{ session: "s1" }], "bloque", 30);
    const par = await sessionsEnAttente();
    expect(par.get("s1")?.envoi).toBe("bloque");
  });

  it("garde une création bloquée dans la carte", async () => {
    journal("inventory_session.create", [{ id: "s2" }], "bloque");
    const par = await sessionsEnAttente();
    expect(par.get("s2")?.acte).toBe("create");
    expect(par.get("s2")?.envoi).toBe("bloque");
  });

  it("un COMPTAGE n'est pas une transition d'état", async () => {
    // L'y mêler ferait dire « une opération attend son envoi » à chaque ligne
    // saisie, sur toute la feuille, en permanence.
    journal("inventory_session.count", [{ session: "s1", counts: [] }]);
    expect((await sessionsEnAttente()).size).toBe(0);
  });
});

describe("creationsEnAttente", () => {
  it("ne perd pas une création bloquée", async () => {
    // Sinon sa propre fiche la déclare « Session introuvable » alors que
    // l'opération est vivante et s'appliquera au déblocage.
    journal("inventory_session.create", [{ id: "s3", name: "Inventaire du 6" }], "bloque");
    const liste = await creationsEnAttente();
    expect(liste).toHaveLength(1);
    expect(liste[0]).toMatchObject({ id: "s3", nom: "Inventaire du 6", envoi: "bloque" });
    expect(liste[0].le).toBeInstanceOf(Date);
  });
});

describe("comptagesEnAttente", () => {
  it("porte l'état d'envoi, et le DERNIER comptage d'une ligne gagne", async () => {
    // Le magasinier recompte quand il doute, et c'est sa dernière lecture qui
    // vaut - avec l'état de CETTE opération, pas le pire des deux.
    mockJournal.set("inventory_session.count", [
      {
        id: "op-a",
        payload: { session: "s1", counts: [{ id: "l1", quantity_counted: "3" }] },
        occurredAt: new Date(2026, 8, 6, 10, 0),
        envoi: "bloque",
      },
      {
        id: "op-b",
        payload: { session: "s1", counts: [{ id: "l1", quantity_counted: "7" }] },
        occurredAt: new Date(2026, 8, 6, 10, 5),
        envoi: "en_attente",
      },
    ]);
    const par = await comptagesEnAttente("s1");
    expect(par.get("l1")).toMatchObject({ total: 7, envoi: "en_attente" });
  });

  it("ne masque pas un comptage bloqué : c'est du travail fait dans le rayon", async () => {
    journal("inventory_session.count", [
      { session: "s1", counts: [{ id: "l1", quantity_counted: "12" }] },
    ], "bloque");
    const par = await comptagesEnAttente("s1");
    expect(par.get("l1")).toMatchObject({ total: 12, envoi: "bloque" });
  });

  it("ignore les comptages d'une autre session", async () => {
    journal("inventory_session.count", [
      { session: "autre", counts: [{ id: "l1", quantity_counted: "12" }] },
    ]);
    expect((await comptagesEnAttente("s1")).size).toBe(0);
  });
});
