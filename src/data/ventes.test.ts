/**
 * « Ventes du jour » doit compter LE JOUR, des deux côtés.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ TROIS JOURS HORS LIGNE ANNONÇAIENT TROIS JOURS DE RECETTE.              │
 * │                                                                          │
 * │ Les ventes tirées sont bornées à la journée ; celles du journal          │
 * │ arrivaient ENTIÈRES. Or le journal se vide quand le réseau revient,      │
 * │ c'est-à-dire précisément dans le mode pour lequel ce terminal existe :   │
 * │ après trois jours sans ligne, les quatre relevés du hub - total,         │
 * │ transactions, panier moyen, à encaisser - additionnaient trois jours.    │
 * │                                                                          │
 * │ Le caissier compare ce chiffre à son tiroir. Il ne pouvait pas tomber    │
 * │ juste, et rien à l'écran ne disait pourquoi.                             │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import type { VenteEnAttente } from "@/features/ventes/attente";

/** Les réponses SQL, dans l'ordre où les requêtes les demandent. */
const mockResultats: unknown[][] = [];
/** Ce que le journal rend, réglé par chaque test. */
const mockAttente: VenteEnAttente[] = [];

/**
 * Constructeur de requête à tout faire : chaque méthode se rend elle-même, et
 * l'attente finale consomme la prochaine réponse de la file.
 */
const mockConstructeur: unknown = new Proxy(
  {},
  {
    get(_cible, nom) {
      if (nom === "then") {
        return (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) =>
          Promise.resolve(mockResultats.shift() ?? []).then(ok, ko);
      }
      return () => mockConstructeur;
    },
  }
);

jest.mock("@/db/client", () => ({ db: { select: () => mockConstructeur } }));
jest.mock("@/db/schema", () => {
  const colonnes: unknown = new Proxy({}, { get: (_c, nom) => String(nom) });
  return new Proxy({}, { get: () => colonnes });
});
jest.mock("drizzle-orm", () => ({
  and: () => ({}), desc: () => ({}), eq: () => ({}), gte: () => ({}),
  inArray: () => ({}), like: () => ({}), lt: () => ({}), or: () => ({}),
  sql: () => ({}),
}));
jest.mock("@/features/ventes/attente", () => ({
  ventesEnAttente: jest.fn(async () => mockAttente),
}));

import { historiqueVentes, joursDeRetard, reglementsEnAttente, relevesVentes } from "./ventes";

const AUJOURDHUI = new Date();
const ce_matin = new Date(
  AUJOURDHUI.getFullYear(), AUJOURDHUI.getMonth(), AUJOURDHUI.getDate(), 8, 30
);
const avantHier = new Date(ce_matin);
avantHier.setDate(avantHier.getDate() - 2);

function enAttente(patch: Partial<VenteEnAttente> = {}): VenteEnAttente {
  return {
    id: `v${mockAttente.length}`,
    reference: `VT-${mockAttente.length}`,
    client: null,
    total: 100,
    resteAPayer: 0,
    devise: "USD",
    date: ce_matin,
    nbArticles: 2,
    session: null,
    envoi: "en_attente",
    ...patch,
  };
}

beforeEach(() => {
  mockResultats.length = 0;
  mockAttente.length = 0;
  // Deux requêtes : les ventes tirées du jour, puis le compte de leurs lignes.
  mockResultats.push([], []);
});

describe("relevesVentes", () => {
  it("compte la vente hors ligne DU JOUR", async () => {
    mockAttente.push(enAttente());

    const releves = await relevesVentes();
    expect(releves.transactions).toBe(1);
    expect(releves.totalParDevise).toEqual([{ devise: "USD", montant: 100 }]);
  });

  it("ÉCARTE la vente hors ligne d'un jour précédent", async () => {
    mockAttente.push(enAttente({ date: avantHier, total: 900 }));
    mockAttente.push(enAttente({ date: ce_matin, total: 100 }));

    const releves = await relevesVentes();
    // Une vente d'avant-hier reste en file tant que le réseau n'est pas revenu.
    // Elle n'a pas disparu - le hub la rend dans l'historique - mais elle n'est
    // pas la recette du jour, et le tiroir ne la contient pas non plus.
    expect(releves.transactions).toBe(1);
    expect(releves.totalParDevise).toEqual([{ devise: "USD", montant: 100 }]);
    expect(releves.ventesDuJour.map((v) => v.total)).toEqual([100]);
  });

  it("écarte aussi son RESTANT DÛ des relevés du jour", async () => {
    mockAttente.push(enAttente({ date: avantHier, total: 900, resteAPayer: 900 }));

    const releves = await relevesVentes();
    expect(releves.aEncaisserParDevise).toEqual([]);
    expect(releves.nbAEncaisser).toBe(0);
  });

  it("garde la vente du jour même quand son ticket est INTROUVABLE", async () => {
    // Montant inconnu : elle compte comme transaction, jamais dans une somme.
    // Un zéro inventé fausserait la journée sans rien signaler.
    mockAttente.push(enAttente({ total: null }));

    const releves = await relevesVentes();
    expect(releves.transactions).toBe(1);
    expect(releves.totalParDevise).toEqual([]);
  });
});

describe("historiqueVentes", () => {
  /**
   * ┌────────────────────────────────────────────────────────────────────────┐
   * │ BORNER LE HUB À LA JOURNÉE NE DOIT PAS FAIRE DISPARAÎTRE UNE VENTE.   │
   * │                                                                        │
   * │ Une vente d'avant-hier encore en file n'est pas la recette du jour,    │
   * │ mais elle a bien eu lieu et le client tient son ticket. Sans cette     │
   * │ fusion, elle ne serait plus nulle part : ni au hub, borné au jour, ni  │
   * │ dans l'historique, qui ne lisait que la table.                         │
   * └────────────────────────────────────────────────────────────────────────┘
   */
  beforeEach(() => {
    mockResultats.length = 0;
    // Le compte, puis la page.
    mockResultats.push([{ n: 0 }], []);
  });

  it("retrouve la vente hors ligne d'un jour PRÉCÉDENT", async () => {
    mockAttente.push(enAttente({ date: avantHier, reference: "VT-VIEILLE" }));

    const page = await historiqueVentes({ periode: "semaine" });
    expect(page.elements.map((v) => v.reference)).toEqual(["VT-VIEILLE"]);
    expect(page.elements[0].envoi).toBe("en_attente");
    // Le compteur porte la liste réelle, sinon le sous-titre annonce moins de
    // ventes que l'écran n'en montre.
    expect(page.total).toBe(1);
  });

  it("lui applique les MÊMES filtres qu'au SQL", async () => {
    mockAttente.push(enAttente({ date: avantHier, reference: "VT-VIEILLE" }));

    // Bornée au jour : la vente d'avant-hier sort, comme elle sortirait du SQL.
    const page = await historiqueVentes({ periode: "jour" });
    expect(page.elements).toEqual([]);
    expect(page.total).toBe(0);
  });

  it("la retrouve par sa RÉFÉRENCE, comme le caissier la cherche", async () => {
    mockAttente.push(enAttente({ reference: "VT-20260901-Q5L8-0007" }));

    const page = await historiqueVentes({ recherche: "0007" });
    expect(page.elements).toHaveLength(1);
  });

  it("ne la rend pas DEUX fois une fois poussée", async () => {
    mockResultats.length = 0;
    mockResultats.push([{ n: 1 }], [
      {
        id: "s1", reference: "VT-1", statut: "completed", total: "100",
        amountDue: "0", currency: "USD", saleDate: ce_matin, client: null,
      },
    ]);
    mockAttente.push(enAttente({ reference: "VT-1" }));

    // La fenêtre où l'opération est appliquée et la ligne déjà tirée : la
    // table fait foi, sinon la vente se compte deux fois le temps que le
    // journal se vide.
    const page = await historiqueVentes();
    expect(page.elements).toHaveLength(1);
    expect(page.elements[0].envoi).toBeUndefined();
    expect(page.total).toBe(1);
  });
});

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ « EN RETARD : 1 » NE MENAIT NULLE PART.                                 │
 * │                                                                          │
 * │ Le décompte était affiché en tête, mais aucune ligne ne portait son      │
 * │ échéance et la liste était triée par date de VENTE : la facture qui      │
 * │ traîne depuis trois semaines se trouvait donc tout en bas, sous les      │
 * │ récentes, et rien ne la désignait. Un écran de recouvrement se descend   │
 * │ dans l'ordre où l'on appelle.                                            │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
describe("joursDeRetard", () => {
  const jours = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d;
  };

  it("compte en JOURS CIVILS, pas en heures", () => {
    // Une facture due hier est en retard d'un jour dès minuit : c'est la
    // lecture du marchand, et celle du serveur, qui compare des dates.
    expect(joursDeRetard(jours(-1))).toBe(1);
    expect(joursDeRetard(jours(-21))).toBe(21);
  });

  it("le jour de l'échéance n'est PAS un retard", () => {
    // La journée court encore : relancer un client le matin de son échéance
    // est le meilleur moyen de le fâcher pour rien.
    expect(joursDeRetard(new Date())).toBe(0);
    expect(joursDeRetard(jours(3))).toBe(0);
  });

  it("sans échéance, jamais de retard", () => {
    // Rien à dépasser. En inventer un ferait relancer un client qui ne doit
    // encore rien.
    expect(joursDeRetard(null)).toBe(0);
  });
});

describe("reglementsEnAttente", () => {
  const jours = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d;
  };

  function facture(patch: Record<string, unknown>) {
    return {
      id: "s", reference: "VT", statut: "pending", total: "100",
      amountDue: "100", currency: "USD", saleDate: ce_matin, dueDate: null,
      client: null,
      ...patch,
    };
  }

  beforeEach(() => {
    mockResultats.length = 0;
  });

  it("met le RETARD devant, le plus ancien en tête", async () => {
    mockResultats.push([
      facture({ id: "recente", reference: "VT-RECENTE", saleDate: ce_matin }),
      facture({ id: "retard5", reference: "VT-5J", dueDate: jours(-5) }),
      facture({ id: "retard20", reference: "VT-20J", dueDate: jours(-20) }),
    ]);

    const r = await reglementsEnAttente();
    expect(r.ventes.map((v) => v.reference)).toEqual(["VT-20J", "VT-5J", "VT-RECENTE"]);
    expect(r.enRetard).toBe(2);
  });

  it("porte l'échéance et le retard SUR CHAQUE LIGNE", async () => {
    // Sans eux, le décompte en tête désigne des factures que la liste ne
    // montre pas, et le marchand doit ouvrir chaque vente pour trouver
    // laquelle relancer.
    mockResultats.push([facture({ id: "s1", dueDate: jours(-3) })]);

    const v = (await reglementsEnAttente()).ventes[0];
    expect(v.joursDeRetard).toBe(3);
    expect(v.echeance).not.toBeNull();
  });

  it("une facture SANS échéance n'est pas comptée en retard", async () => {
    mockResultats.push([
      facture({ id: "s1", dueDate: null, saleDate: jours(-90) }),
    ]);

    const r = await reglementsEnAttente();
    expect(r.enRetard).toBe(0);
    expect(r.ventes[0].joursDeRetard).toBe(0);
  });

  it("ne somme jamais entre devises", async () => {
    mockResultats.push([
      facture({ id: "s1", currency: "USD", amountDue: "10" }),
      facture({ id: "s2", currency: "CDF", amountDue: "2800" }),
    ]);

    expect((await reglementsEnAttente()).duParDevise).toEqual([
      { devise: "CDF", montant: 2800 },
      { devise: "USD", montant: 10 },
    ]);
  });
});
