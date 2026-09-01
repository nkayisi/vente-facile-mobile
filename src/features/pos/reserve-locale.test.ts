/**
 * Ce que le terminal a déjà vendu, et que le serveur ignore encore.
 *
 * Le défaut que ces tests ferment ne se voit pas à l'écran : le comptoir
 * affiche un stock plausible, accepte la vente, imprime, et c'est le serveur
 * qui refuse une fois le client parti. Il ne peut donc être attrapé qu'ici.
 */

/** Ce que le journal rend, réglé par chaque test. */
const mockOperations: { id: string; payload: unknown; occurredAt: Date }[] = [];
/** Les réponses SQL, dans l'ordre où les requêtes les demandent. */
const mockLignes: unknown[][] = [];

jest.mock("@/sync", () => ({
  enAttenteParType: jest.fn(async () => mockOperations),
}));

import { enAttenteParType } from "@/sync";
const lectureDuJournal = enAttenteParType as jest.Mock;

jest.mock("@/db/client", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: async () => mockLignes.shift() ?? [],
      }),
    }),
  },
}));

jest.mock("@/db/schema", () => ({ printJobs: { documentNumber: "d", data: "j" } }));
jest.mock("drizzle-orm", () => ({ inArray: () => ({}) }));

import { detteEnAttente, reservesEnAttente } from "./reserve-locale";

const ENTREPOT = "w1";

function vente(payload: Record<string, unknown>) {
  mockOperations.push({ id: `op${mockOperations.length}`, payload, occurredAt: new Date() });
}

beforeEach(() => {
  mockOperations.length = 0;
  mockLignes.length = 0;
  lectureDuJournal.mockClear();
});

describe("les opérations BLOQUÉES retiennent le stock", () => {
  /**
   * ┌────────────────────────────────────────────────────────────────────────┐
   * │ UN ABONNEMENT EXPIRÉ ROUVRAIT LA VENTE EN DOUBLE, POUR DES JOURS.     │
   * │                                                                        │
   * │ `blocked` n'est pas `quarantined` : l'opération est CONSERVÉE et       │
   * │ repart telle quelle dès que le marchand règle son abonnement. La       │
   * │ marchandise, elle, est déjà partie avec le client. Ne pas la retenir   │
   * │ redonnait au comptoir un stock qu'il n'a plus, non pas le temps d'une  │
   * │ synchronisation, mais tant que dure le blocage - et sur TOUTES les     │
   * │ ventes de cette période, pas seulement la dernière.                    │
   * └────────────────────────────────────────────────────────────────────────┘
   */
  it("demande la lecture CONSERVATRICE du journal, pour la réserve", async () => {
    await reservesEnAttente(ENTREPOT);
    expect(lectureDuJournal).toHaveBeenCalledWith("sale.create", { avecBloquees: true });
  });

  it("la demande AUSSI pour la dette en file", async () => {
    // Une vente à crédit bloquée sera portée au compte du client : son plafond
    // doit en tenir compte, sinon il repart autant de fois que dure le blocage.
    vente({ customer: "c1", sale_type: "credit", reference: "VT-1" });
    await detteEnAttente("c1");
    expect(lectureDuJournal).toHaveBeenCalledWith("sale.create", { avecBloquees: true });
  });
});

describe("reservesEnAttente", () => {
  it("retient ce qu'une vente en file a déjà sorti", async () => {
    vente({
      warehouse: ENTREPOT,
      items: [{ product: "p1", package_quantity: 2, loose_quantity: 3 }],
    });

    const reserve = await reservesEnAttente(ENTREPOT);
    expect(reserve.get("p1")).toEqual({ packages: 2, loose: 3 });
  });

  it("cumule PLUSIEURS ventes du même produit", async () => {
    vente({ warehouse: ENTREPOT, items: [{ product: "p1", package_quantity: 1, loose_quantity: 2 }] });
    vente({ warehouse: ENTREPOT, items: [{ product: "p1", package_quantity: 3, loose_quantity: 0 }] });

    // Le cas exact du défaut : trois clients d'affilée, hors ligne, sur le
    // même dernier casier. Sans cumul, chacun repart avec, et le serveur en
    // refuse deux.
    expect((await reservesEnAttente(ENTREPOT)).get("p1")).toEqual({ packages: 4, loose: 2 });
  });

  it("garde les DEUX compteurs séparés, jamais leur somme", async () => {
    vente({ warehouse: ENTREPOT, items: [{ product: "p1", package_quantity: 2, loose_quantity: 5 }] });

    const ligne = (await reservesEnAttente(ENTREPOT)).get("p1")!;
    // Deux casiers plus cinq bouteilles ne sont pas « 29 » : c'est l'appelant,
    // qui tient le conditionnement, qui convertit. Refaire la somme ici
    // figerait le facteur du jour dans une retenue.
    expect(ligne.packages).toBe(2);
    expect(ligne.loose).toBe(5);
  });

  it("lit `quantity` comme du DÉTAIL, pas comme des contenants", async () => {
    // Un produit sans conditionnement envoie `quantity`. Le prendre pour des
    // contenants multiplierait la retenue par le facteur.
    vente({ warehouse: ENTREPOT, items: [{ product: "p2", quantity: 7 }] });

    expect((await reservesEnAttente(ENTREPOT)).get("p2")).toEqual({ packages: 0, loose: 7 });
  });

  it("ignore les ventes d'un AUTRE entrepôt", async () => {
    vente({ warehouse: "w2", items: [{ product: "p1", quantity: 5 }] });

    // Retirer du stock à un dépôt qui n'a rien vendu ferait refuser des ventes
    // parfaitement possibles, et le magasinier chercherait longtemps.
    expect((await reservesEnAttente(ENTREPOT)).size).toBe(0);
  });

  it("n'impute une vente SANS entrepôt qu'à une caisse sans entrepôt", async () => {
    vente({ items: [{ product: "p1", quantity: 5 }] });

    expect((await reservesEnAttente(ENTREPOT)).size).toBe(0);
    expect((await reservesEnAttente(null)).get("p1")).toEqual({ packages: 0, loose: 5 });
  });

  it("survit à un corps illisible sans rien retenir", async () => {
    vente({ warehouse: ENTREPOT });
    vente({ warehouse: ENTREPOT, items: "pas un tableau" });
    vente({ warehouse: ENTREPOT, items: [{ product: "p1", quantity: 2 }] });

    // Un journal abîmé ne doit pas empêcher de vendre : il rend le comptoir
    // moins strict, ce que le serveur rattrape.
    expect((await reservesEnAttente(ENTREPOT)).get("p1")).toEqual({ packages: 0, loose: 2 });
  });

  it("ignore les valeurs négatives ou absurdes", async () => {
    vente({
      warehouse: ENTREPOT,
      items: [{ product: "p1", package_quantity: -3, loose_quantity: "deux" }],
    });

    expect((await reservesEnAttente(ENTREPOT)).get("p1")).toEqual({ packages: 0, loose: 0 });
  });
});

describe("detteEnAttente", () => {
  it("additionne le restant dû des ventes à crédit du client, PAR DEVISE", async () => {
    vente({ customer: "c1", sale_type: "credit", reference: "VT-1", items: [] });
    vente({ customer: "c1", sale_type: "credit", reference: "VT-2", items: [] });
    mockLignes.push([
      { numero: "VT-1", data: JSON.stringify({ amountDue: 30, currency: "USD" }) },
      { numero: "VT-2", data: JSON.stringify({ amountDue: 5000, currency: "CDF" }) },
    ]);

    const dette = await detteEnAttente("c1");
    // Jamais sommées avant conversion : c'est l'appelant, qui tient la table
    // des devises, qui ramène en devise principale.
    expect(dette.get("USD")).toBe(30);
    expect(dette.get("CDF")).toBe(5000);
  });

  it("cumule deux ventes de la MÊME devise", async () => {
    vente({ customer: "c1", sale_type: "credit", reference: "VT-1", items: [] });
    vente({ customer: "c1", sale_type: "credit", reference: "VT-2", items: [] });
    mockLignes.push([
      { numero: "VT-1", data: JSON.stringify({ amountDue: 30, currency: "USD" }) },
      { numero: "VT-2", data: JSON.stringify({ amountDue: 12, currency: "USD" }) },
    ]);

    expect((await detteEnAttente("c1")).get("USD")).toBe(42);
  });

  it("ignore les ventes d'un AUTRE client", async () => {
    vente({ customer: "c2", sale_type: "credit", reference: "VT-9", items: [] });

    expect((await detteEnAttente("c1")).size).toBe(0);
  });

  it("ignore les ventes COMPTANT", async () => {
    vente({ customer: "c1", sale_type: "retail", reference: "VT-3", items: [] });

    // Une vente réglée n'engage aucune dette : la compter fermerait le crédit
    // d'un client qui vient justement de payer.
    expect((await detteEnAttente("c1")).size).toBe(0);
  });

  it("ignore un ticket introuvable plutôt que d'inventer un montant", async () => {
    vente({ customer: "c1", sale_type: "credit", reference: "VT-4", items: [] });
    mockLignes.push([]);

    expect((await detteEnAttente("c1")).size).toBe(0);
  });

  it("ignore un ticket illisible", async () => {
    vente({ customer: "c1", sale_type: "credit", reference: "VT-5", items: [] });
    mockLignes.push([{ numero: "VT-5", data: "{ pas du json" }]);

    expect((await detteEnAttente("c1")).size).toBe(0);
  });

  it("ignore un restant dû sans devise", async () => {
    vente({ customer: "c1", sale_type: "credit", reference: "VT-6", items: [] });
    mockLignes.push([{ numero: "VT-6", data: JSON.stringify({ amountDue: 30 }) }]);

    // Un montant sans devise ne se rattache à rien : dans une application
    // multi-devise, l'imputer à la principale est un choix au hasard.
    expect((await detteEnAttente("c1")).size).toBe(0);
  });

  it("rend une carte vide sans client", async () => {
    expect((await detteEnAttente(null)).size).toBe(0);
  });
});
