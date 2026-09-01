/**
 * Les compteurs d'une session de caisse, table et journal réunis.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE QUE CES TESTS DÉFENDENT : « 0 VENTE » APRÈS UNE JOURNÉE DE COMPTOIR. │
 * │                                                                          │
 * │ Une session ouverte hors ligne vit dans le journal, et ses ventes aussi. │
 * │ Les compteurs ne lisaient que `sales` : le bandeau du hub et la carte du │
 * │ parc de caisses annonçaient « 0 vente · 0 $ » pendant que la liste, deux │
 * │ centimètres plus bas, en montrait douze. C'est le chiffre le plus bas    │
 * │ qu'on croit, et un caissier qui lit « 0 encaissé » avant de compter son  │
 * │ tiroir conclut qu'il a perdu sa journée.                                 │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const mockLignes: unknown[][] = [];
let mockAttente: unknown[] = [];

jest.mock("@/db/client", () => ({
  db: {
    select: () => {
      const chaine: Record<string, unknown> = {};
      const suite = () => chaine;
      chaine.from = suite;
      chaine.where = suite;
      chaine.then = (resoudre: (v: unknown) => void) => resoudre(mockLignes.shift() ?? []);
      return chaine;
    },
  },
}));
jest.mock("@/db/schema", () => ({
  sales: { sessionId: "session_id", reference: "reference", currency: "currency", total: "total" },
}));
jest.mock("drizzle-orm", () => ({ inArray: () => ({}) }));
jest.mock("@/features/ventes/attente", () => ({
  ventesEnAttente: jest.fn(async () => mockAttente),
}));

import { compteursDeSessions } from "./sessions";

function enAttente(p: Partial<{ reference: string; total: number | null; devise: string | null; session: string | null }>) {
  return {
    id: "v", reference: "VT-1", client: null, total: 10, resteAPayer: 0,
    devise: "USD", date: new Date(), nbArticles: 1, session: "s1",
    envoi: "en_attente" as const,
    ...p,
  };
}

beforeEach(() => {
  mockLignes.length = 0;
  mockAttente = [];
});

describe("compteursDeSessions", () => {
  it("ne demande rien à la base quand il n'y a aucune session", async () => {
    // La liste vide fait un `IN ()` que SQLite refuse, et surtout : il n'y a
    // rien à compter.
    const m = await compteursDeSessions([]);
    expect(m.size).toBe(0);
    expect(mockLignes.length).toBe(0);
  });

  it("compte les ventes TIRÉES de la session", async () => {
    mockLignes.push([
      { sessionId: "s1", reference: "VT-1", currency: "USD", total: "12.5" },
      { sessionId: "s1", reference: "VT-2", currency: "USD", total: "7.5" },
    ]);

    const c = (await compteursDeSessions(["s1"])).get("s1");
    expect(c?.nbVentes).toBe(2);
    expect(c?.encaisseParDevise).toEqual([{ devise: "USD", montant: 20 }]);
  });

  it("compte AUSSI les ventes du journal rattachées à la session", async () => {
    // Le défaut d'origine, dans son état pur : la table est vide parce que le
    // serveur n'a rien vu, et le comptoir a pourtant encaissé deux fois.
    mockLignes.push([]);
    mockAttente = [
      enAttente({ reference: "VT-1", total: 30 }),
      enAttente({ reference: "VT-2", total: 12 }),
    ];

    const c = (await compteursDeSessions(["s1"])).get("s1");
    expect(c?.nbVentes).toBe(2);
    expect(c?.encaisseParDevise).toEqual([{ devise: "USD", montant: 42 }]);
  });

  it("ne compte pas DEUX FOIS une vente poussée mais pas encore purgée", async () => {
    mockLignes.push([{ sessionId: "s1", reference: "VT-1", currency: "USD", total: "30" }]);
    mockAttente = [enAttente({ reference: "VT-1", total: 30 })];

    const c = (await compteursDeSessions(["s1"])).get("s1");
    expect(c?.nbVentes).toBe(1);
    expect(c?.encaisseParDevise).toEqual([{ devise: "USD", montant: 30 }]);
  });

  it("une vente sans ticket compte comme transaction, jamais dans la somme", async () => {
    // `null` ne se lit pas zéro : un montant inventé fausserait le tiroir sans
    // rien signaler. L'écran, lui, dit combien de tickets manquent.
    mockLignes.push([]);
    mockAttente = [
      enAttente({ reference: "VT-1", total: 20 }),
      enAttente({ reference: "VT-2", total: null, devise: null }),
    ];

    const c = (await compteursDeSessions(["s1"])).get("s1");
    expect(c?.nbVentes).toBe(2);
    expect(c?.sansMontant).toBe(1);
    expect(c?.encaisseParDevise).toEqual([{ devise: "USD", montant: 20 }]);
  });

  it("ne somme JAMAIS entre devises", async () => {
    mockLignes.push([{ sessionId: "s1", reference: "VT-1", currency: "CDF", total: "2800" }]);
    mockAttente = [enAttente({ reference: "VT-2", total: 1, devise: "USD" })];

    const c = (await compteursDeSessions(["s1"])).get("s1");
    expect(c?.encaisseParDevise).toEqual([
      { devise: "CDF", montant: 2800 },
      { devise: "USD", montant: 1 },
    ]);
  });

  it("ignore une vente du journal rattachée à une AUTRE session", async () => {
    mockLignes.push([]);
    mockAttente = [
      enAttente({ reference: "VT-1", session: "s2" }),
      enAttente({ reference: "VT-2", session: null }),
    ];

    const c = (await compteursDeSessions(["s1"])).get("s1");
    expect(c?.nbVentes).toBe(0);
  });
});
