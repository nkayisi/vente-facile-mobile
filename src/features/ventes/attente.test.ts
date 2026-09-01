/**
 * Ce que le hub des ventes doit encore retrouver dans le journal.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UNE VENTE BLOQUÉE A ÉTÉ ENCAISSÉE ET IMPRIMÉE COMME LES AUTRES.        │
 * │                                                                          │
 * │ `blocked` n'est pas `quarantined` : l'opération est CONSERVÉE et repart  │
 * │ dès que l'abonnement est réglé. Un abonnement expiré n'empêche pas de    │
 * │ vendre, il fait répondre 402 à la POUSSÉE - c'est la doctrine du dépôt.  │
 * │ Taire ces ventes faisait relire « Ventes du jour (0) » après une journée │
 * │ de comptoir, c'est-à-dire le défaut exact que ce module referme, et      │
 * │ précisément sur la période où il fait le plus mal.                       │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const mockOperations: {
  id: string; payload: unknown; occurredAt: Date; envoi: string;
}[] = [];
const mockLignes: unknown[][] = [];

jest.mock("@/sync", () => ({
  enAttenteParType: jest.fn(async (_kind: string, options?: { avecBloquees?: boolean }) =>
    mockOperations.filter((o) => options?.avecBloquees || o.envoi !== "bloque")
  ),
}));

jest.mock("@/db/client", () => ({
  db: {
    select: () => ({
      from: () => ({ where: async () => mockLignes.shift() ?? [] }),
    }),
  },
}));
jest.mock("@/db/schema", () => ({ printJobs: { documentNumber: "d", data: "j" } }));
jest.mock("drizzle-orm", () => ({ inArray: () => ({}) }));

import { enAttenteParType } from "@/sync";
import { ventesEnAttente } from "./attente";

const lectureDuJournal = enAttenteParType as jest.Mock;

beforeEach(() => {
  mockOperations.length = 0;
  mockLignes.length = 0;
  lectureDuJournal.mockClear();
});

describe("ventesEnAttente", () => {
  it("demande AUSSI les ventes bloquées", async () => {
    mockOperations.push({
      id: "op1", payload: { id: "v1", reference: "VT-1" }, occurredAt: new Date(),
      envoi: "en_attente",
    });

    await ventesEnAttente();
    expect(lectureDuJournal).toHaveBeenCalledWith("sale.create", { avecBloquees: true });
  });

  it("rend le montant du TICKET, jamais un montant recalculé", async () => {
    mockOperations.push({
      id: "op1", payload: { id: "v1", reference: "VT-1" }, occurredAt: new Date(),
      envoi: "en_attente",
    });
    mockLignes.push([
      {
        numero: "VT-1",
        data: JSON.stringify({ total: 250, currency: "USD", amountDue: 50, items: [1, 2] }),
      },
    ]);

    const [vente] = await ventesEnAttente();
    expect(vente.total).toBe(250);
    expect(vente.resteAPayer).toBe(50);
    expect(vente.nbArticles).toBe(2);
  });

  it("rend un montant INCONNU quand le ticket manque, jamais zéro", async () => {
    mockOperations.push({
      id: "op1", payload: { id: "v1", reference: "VT-1" }, occurredAt: new Date(),
      envoi: "en_attente",
    });

    const [vente] = await ventesEnAttente();
    // `null` se lit « inconnu » : un zéro fabriqué fausserait la journée sans
    // rien signaler, alors que la vente, elle, a bien eu lieu.
    expect(vente.total).toBeNull();
  });

  it("porte l'état d'envoi de chaque vente, bloquées comprises", async () => {
    mockOperations.push({
      id: "op1", payload: { id: "v1", reference: "VT-1" }, occurredAt: new Date(),
      envoi: "bloque",
    });

    const [vente] = await ventesEnAttente();
    // Le hub doit pouvoir écrire « attend un droit » plutôt qu'« attend son
    // envoi » : la seconde phrase envoie chercher un réseau qui est déjà là.
    expect(vente.envoi).toBe("bloque");
  });
});
