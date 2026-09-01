/**
 * Quels ÉTATS du journal une lecture d'écran doit voir.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ `blocked` N'EST PAS `quarantined`, ET LES CONFONDRE FAIT VENDRE DEUX    │
 * │ FOIS LE MÊME ARTICLE.                                                    │
 * │                                                                          │
 * │ Une opération en quarantaine est REFUSÉE : rien n'en adviendra jamais.  │
 * │ Une opération bloquée est CONSERVÉE : elle repart telle quelle dès que   │
 * │ l'abonnement est réglé ou le droit accordé. La lire comme inexistante    │
 * │ pendant tout ce temps - des jours - fait reproposer au comptoir un       │
 * │ article déjà parti avec un client, à chaque nouveau client.              │
 * │                                                                          │
 * │ Rien à l'écran ne le signale : le stock affiché est plausible, la vente  │
 * │ passe, le ticket sort. C'est le serveur qui refuse, après.               │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/** Les états demandés par la dernière requête, capturés depuis `inArray`. */
const mockEtats: string[][] = [];
const mockLignes: unknown[] = [];

jest.mock("@/db/client", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({ orderBy: async () => mockLignes }),
      }),
    }),
  },
}));

jest.mock("@/db/schema", () => ({
  outboxOperations: {
    id: "id", kind: "kind", state: "state", seq: "seq",
    payload: "payload", occurredAt: "occurred_at",
  },
}));

jest.mock("drizzle-orm", () => ({
  and: () => ({}),
  asc: () => ({}),
  eq: () => ({}),
  lte: () => ({}),
  desc: () => ({}),
  sql: () => ({}),
  inArray: (_colonne: unknown, valeurs: string[]) => {
    // La seule requête de ce module qui filtre sur une LISTE d'états.
    if (valeurs.every((v) => typeof v === "string")) mockEtats.push(valeurs);
    return {};
  },
}));

import { enAttenteParType } from "./outbox";

beforeEach(() => {
  mockEtats.length = 0;
  mockLignes.length = 0;
});

describe("enAttenteParType", () => {
  it("ne voit par défaut que ce qui n'a pas encore été jugé", async () => {
    await enAttenteParType("sale.create");

    const etats = mockEtats[mockEtats.length - 1];
    expect(etats).toEqual(["pending", "inflight"]);
    // `done` sort de la liste : la ligne authentique est arrivée par le tirage.
    // `quarantined` aussi : le serveur a refusé, rien n'en adviendra.
    expect(etats).not.toContain("done");
    expect(etats).not.toContain("quarantined");
  });

  it("ajoute les BLOQUÉES quand la lecture doit être conservatrice", async () => {
    await enAttenteParType("sale.create", { avecBloquees: true });

    const etats = mockEtats[mockEtats.length - 1];
    expect(etats).toContain("blocked");
    // Une opération refusée ne rejoint JAMAIS cette lecture : elle retiendrait
    // un stock que personne n'a acheté, indéfiniment.
    expect(etats).not.toContain("quarantined");
  });

  it("rend le corps désérialisé, quel que soit l'état", async () => {
    mockLignes.push({
      id: "op1",
      payload: JSON.stringify({ reference: "VT-1" }),
      occurredAt: new Date(2026, 7, 31),
    });

    const ops = await enAttenteParType<{ reference: string }>("sale.create", {
      avecBloquees: true,
    });
    expect(ops).toHaveLength(1);
    expect(ops[0].payload.reference).toBe("VT-1");
  });
});
