/**
 * Ce qui a déjà été rendu sur une vente.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE QUE CES TESTS DÉFENDENT : LA MÊME MARCHANDISE RENDUE DEUX FOIS.      │
 * │                                                                          │
 * │ Le comptoir proposait la quantité VENDUE sans regarder les retours déjà  │
 * │ enregistrés, et le serveur faisait la même comparaison. Deux fois trois  │
 * │ flacons sur cinq vendus : six unités revenaient en stock, six mille      │
 * │ francs sortaient de la caisse, et l'écart n'apparaissait qu'à            │
 * │ l'inventaire suivant - où il passait pour un vol.                        │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const mockLignes: unknown[][] = [];
let mockJournal: unknown[] = [];

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
  saleReturns: {
    id: "id", reference: "reference", status: "status", totalAmount: "total_amount",
    returnDate: "return_date", isDeleted: "is_deleted", originalSaleId: "original_sale_id",
  },
  saleReturnItems: {
    saleReturnId: "sale_return_id", originalItemId: "original_item_id", quantity: "quantity",
  },
}));
jest.mock("drizzle-orm", () => ({
  and: () => ({}), eq: () => ({}), inArray: () => ({}),
}));
jest.mock("@/sync", () => ({
  enAttenteParType: jest.fn(async () => mockJournal),
}));

import { renduDeLaVente, resteARendre } from "./rendu";

const VENTE = "v1";

function retourTire(p: Partial<{ id: string; statut: string; montant: string }> = {}) {
  return {
    id: "r1", reference: "RET-1", statut: "approved", montant: "3000",
    date: new Date(2026, 7, 30), supprime: false, ...p,
  };
}

function opJournal(
  items: { original_item: string; quantity: string; total?: string }[],
  p: Partial<{ id: string; envoi: string; vente: string }> = {}
) {
  return {
    id: p.id ?? "op1",
    payload: {
      id: p.id ?? "op1",
      original_sale: p.vente ?? VENTE,
      items,
    },
    occurredAt: new Date(),
    envoi: p.envoi ?? "en_attente",
  };
}

beforeEach(() => {
  mockLignes.length = 0;
  mockJournal = [];
});

describe("renduDeLaVente", () => {
  it("compte ce qu'un retour APPROUVÉ a consommé", async () => {
    mockLignes.push([retourTire()]);
    mockLignes.push([{ retour: "r1", ligneVente: "l1", quantite: "3" }]);

    const r = await renduDeLaVente(VENTE);
    expect(r.parLigne.get("l1")).toBe(3);
    expect(resteARendre(r, "l1", 5)).toBe(2);
  });

  it("compte aussi un BROUILLON, qui est approuvable", async () => {
    // Deux brouillons sur les mêmes unités seraient tous deux approuvables :
    // c'est le même défaut, pris une décision plus tard.
    mockLignes.push([retourTire({ statut: "draft" })]);
    mockLignes.push([{ retour: "r1", ligneVente: "l1", quantite: "5" }]);

    expect(resteARendre(await renduDeLaVente(VENTE), "l1", 5)).toBe(0);
  });

  it("ne compte RIEN d'un retour rejeté", async () => {
    // Un rejet n'a rien remis en stock ni remboursé : la marchandise est encore
    // là, et le client peut la rendre pour de bon.
    mockLignes.push([retourTire({ statut: "rejected" })]);
    // Aucune seconde requête n'est émise : il n'y a aucun retour consommateur.
    const r = await renduDeLaVente(VENTE);
    expect(r.parLigne.size).toBe(0);
    expect(resteARendre(r, "l1", 5)).toBe(5);
    // Il reste néanmoins dans l'HISTORIQUE : la fiche doit pouvoir le montrer.
    expect(r.retours.map((x) => x.statut)).toEqual(["rejected"]);
  });

  it("compte les retours ENCORE DANS LE JOURNAL", async () => {
    // Sans cela, deux retours identiques partent hors ligne : le serveur en
    // applique un et refuse l'autre, après que le commerçant a rendu l'argent.
    mockLignes.push([]);
    mockJournal = [opJournal([{ original_item: "l1", quantity: "2", total: "2000" }])];

    const r = await renduDeLaVente(VENTE);
    expect(r.parLigne.get("l1")).toBe(2);
    expect(r.enAttente).toBe(true);
  });

  it("ne compte pas DEUX FOIS un retour poussé mais pas encore purgé", async () => {
    // La table fait foi : le journal peut le porter encore le temps qu'il se
    // vide, et l'addition doublerait la quantité rendue.
    mockLignes.push([retourTire({ id: "r1" })]);
    mockLignes.push([{ retour: "r1", ligneVente: "l1", quantite: "3" }]);
    mockJournal = [opJournal([{ original_item: "l1", quantity: "3" }], { id: "r1" })];

    const r = await renduDeLaVente(VENTE);
    expect(r.parLigne.get("l1")).toBe(3);
    expect(r.retours).toHaveLength(1);
  });

  it("écarte les retours d'une AUTRE vente restés au journal", async () => {
    mockLignes.push([]);
    mockJournal = [
      opJournal([{ original_item: "l1", quantity: "2" }], { id: "a", vente: "autre" }),
    ];
    expect((await renduDeLaVente(VENTE)).parLigne.size).toBe(0);
  });

  it("additionne plusieurs retours partiels sur la même ligne", async () => {
    mockLignes.push([retourTire({ id: "r1" }), retourTire({ id: "r2" })]);
    mockLignes.push([
      { retour: "r1", ligneVente: "l1", quantite: "2" },
      { retour: "r2", ligneVente: "l1", quantite: "1" },
    ]);
    expect(resteARendre(await renduDeLaVente(VENTE), "l1", 5)).toBe(2);
  });

  it("ne rend JAMAIS un reste négatif", async () => {
    // Une donnée serveur incohérente ne doit pas faire écrire « il reste -1 »
    // dans un formulaire.
    mockLignes.push([retourTire()]);
    mockLignes.push([{ retour: "r1", ligneVente: "l1", quantite: "9" }]);
    expect(resteARendre(await renduDeLaVente(VENTE), "l1", 5)).toBe(0);
  });

  it("ne demande rien à la base sans identifiant de vente", async () => {
    expect((await renduDeLaVente("")).retours).toEqual([]);
    expect(mockLignes.length).toBe(0);
  });
});
