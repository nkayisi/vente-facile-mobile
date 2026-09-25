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
    entrepot: null,
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

  /**
   * Les réponses SQL dans l'ORDRE où `historiqueVentes` les demande.
   *
   * Deux de ces requêtes sont CONDITIONNELLES, et s'y tromper décale toute la
   * file sans rien casser de visible : la lecture consomme alors la réponse
   * d'une autre requête et le test passe en mesurant autre chose. D'où ce
   * constructeur unique, qui ne pousse que ce qui sera réellement consommé.
   */
  function reponses(opts: {
    /** Références déjà tirées, pour le dédoublonnage. Interrogé si le journal a des ventes. */
    dejaTirees?: string[];
    /** Agrégat par devise : compteur et deux sommes, en une passe. */
    agregats?: { devise: string; n: number; total: number; du: number }[];
    /** Décompte par statut, calculé SANS le filtre de statut. */
    parStatut?: { statut: string; n: number }[];
    /** Les lignes de la page. */
    page?: Record<string, unknown>[];
    /** Nombre de lignes par vente, pour la page. */
    nbLignes?: { saleId: string; n: number }[];
  }) {
    mockResultats.length = 0;
    if (mockAttente.length > 0) {
      mockResultats.push((opts.dejaTirees ?? []).map((reference) => ({ reference })));
    }
    mockResultats.push(opts.agregats ?? []);
    mockResultats.push(opts.parStatut ?? []);
    const page = opts.page ?? [];
    mockResultats.push(page);
    if (page.length > 0) mockResultats.push(opts.nbLignes ?? []);
  }

  const ligneTiree = (patch: Record<string, unknown> = {}) => ({
    id: "s1",
    reference: "VT-1",
    statut: "completed",
    total: "100",
    amountDue: "0",
    currency: "USD",
    saleDate: ce_matin,
    dueDate: null,
    client: null,
    ...patch,
  });

  it("retrouve la vente hors ligne d'un jour PRÉCÉDENT", async () => {
    mockAttente.push(enAttente({ date: avantHier, reference: "VT-VIEILLE" }));
    reponses({});

    const page = await historiqueVentes({ periode: "semaine" });
    expect(page.elements.map((v) => v.reference)).toEqual(["VT-VIEILLE"]);
    expect(page.elements[0].envoi).toBe("en_attente");
    // Le compteur porte la liste réelle, sinon le sous-titre annonce moins de
    // ventes que l'écran n'en montre.
    expect(page.total).toBe(1);
  });

  it("lui applique les MÊMES filtres qu'au SQL", async () => {
    mockAttente.push(enAttente({ date: avantHier, reference: "VT-VIEILLE" }));
    reponses({});

    // Bornée au jour : la vente d'avant-hier sort, comme elle sortirait du SQL.
    const page = await historiqueVentes({ periode: "jour" });
    expect(page.elements).toEqual([]);
    expect(page.total).toBe(0);
  });

  it("la retrouve par sa RÉFÉRENCE, comme le caissier la cherche", async () => {
    mockAttente.push(enAttente({ reference: "VT-20260901-Q5L8-0007" }));
    reponses({});

    const page = await historiqueVentes({ recherche: "0007" });
    expect(page.elements).toHaveLength(1);
  });

  /**
   * ┌────────────────────────────────────────────────────────────────────────┐
   * │ LE DÉDOUBLONNAGE SE FAIT CONTRE LA TABLE, PAS CONTRE LA PAGE.         │
   * │                                                                        │
   * │ Il se faisait contre les références de la page rendue. Avec une seule  │
   * │ page cela suffisait ; avec le défilement infini, une vente poussée      │
   * │ dont la ligne tirée tombe en page trois reviendrait en tête de la page │
   * │ une, comme si elle n'était jamais partie - et son montant compterait   │
   * │ DEUX FOIS dans des relevés qui, eux, portent sur toute la table.       │
   * └────────────────────────────────────────────────────────────────────────┘
   */
  it("ne la rend pas DEUX fois une fois poussée", async () => {
    mockAttente.push(enAttente({ reference: "VT-1" }));
    reponses({
      dejaTirees: ["VT-1"],
      agregats: [{ devise: "USD", n: 1, total: 100, du: 0 }],
      page: [ligneTiree()],
    });

    // La fenêtre où l'opération est appliquée et la ligne déjà tirée : la
    // table fait foi, sinon la vente se compte deux fois le temps que le
    // journal se vide.
    const page = await historiqueVentes();
    expect(page.elements).toHaveLength(1);
    expect(page.elements[0].envoi).toBeUndefined();
    expect(page.total).toBe(1);
    expect(page.releves.totalParDevise).toEqual([{ devise: "USD", montant: 100 }]);
  });

  it("dédoublonne même quand la ligne tirée n'est PAS sur la page demandée", async () => {
    mockAttente.push(enAttente({ reference: "VT-1" }));
    // Le serveur a la vente (l'agrégat en compte trois), mais la page rendue
    // ne porte que les deux autres : c'est le cas de la deuxième page.
    reponses({
      dejaTirees: ["VT-1"],
      agregats: [{ devise: "USD", n: 3, total: 300, du: 0 }],
      page: [ligneTiree({ id: "s2", reference: "VT-2" })],
    });

    const page = await historiqueVentes();
    expect(page.elements.map((v) => v.reference)).toEqual(["VT-2"]);
    expect(page.total).toBe(3);
  });

  /**
   * ┌────────────────────────────────────────────────────────────────────────┐
   * │ LES RELEVÉS PORTENT LA PÉRIODE, PAS LA PAGE.                          │
   * │                                                                        │
   * │ Les sommer sur `elements` donnerait le poids des cinquante premières   │
   * │ ventes sous un compteur qui en annonce trois cent quarante. Un total   │
   * │ faux qui a l'air juste est pire que pas de total.                      │
   * └────────────────────────────────────────────────────────────────────────┘
   */
  it("somme TOUT le périmètre, même hors de la page rendue", async () => {
    reponses({
      agregats: [{ devise: "USD", n: 340, total: 51000, du: 1200 }],
      page: [ligneTiree()],
    });

    const page = await historiqueVentes({ limite: 1 });
    expect(page.elements).toHaveLength(1);
    expect(page.total).toBe(340);
    expect(page.releves.totalParDevise).toEqual([{ devise: "USD", montant: 51000 }]);
    expect(page.releves.resteParDevise).toEqual([{ devise: "USD", montant: 1200 }]);
    // Il reste des ventes derrière : sans ce drapeau, la liste s'arrête en
    // silence et le caissier conclut que sa vente a disparu.
    expect(page.aPlus).toBe(true);
  });

  it("ne somme JAMAIS entre devises", async () => {
    reponses({
      agregats: [
        { devise: "USD", n: 2, total: 150, du: 50 },
        { devise: "CDF", n: 1, total: 280000, du: 0 },
      ],
      page: [ligneTiree()],
    });

    const page = await historiqueVentes();
    expect(page.releves.totalParDevise).toEqual([
      { devise: "CDF", montant: 280000 },
      { devise: "USD", montant: 150 },
    ]);
    expect(page.releves.transactions).toBe(3);
  });

  /**
   * Un ticket introuvable rend un montant INCONNU. Le compter zéro ferait
   * baisser la recette du jour sans que rien ne le dise ; la vente reste
   * comptée comme transaction, et l'écran annonce le manque.
   */
  it("compte la vente sans ticket, sans l'ajouter à aucune somme", async () => {
    mockAttente.push(enAttente({ total: null, devise: null, resteAPayer: 0 }));
    reponses({ agregats: [{ devise: "USD", n: 1, total: 100, du: 0 }], page: [ligneTiree()] });

    const page = await historiqueVentes();
    expect(page.total).toBe(2);
    expect(page.releves.transactions).toBe(2);
    expect(page.releves.sansMontant).toBe(1);
    expect(page.releves.totalParDevise).toEqual([{ devise: "USD", montant: 100 }]);
  });

  /**
   * Une puce à zéro se lit « il n'y en a pas ». Calculer les décomptes SOUS le
   * filtre de statut les mettrait tous à zéro sauf l'actif, et le marchand
   * conclurait que son terminal n'a jamais rien annulé.
   */
  it("compte les statuts SANS le filtre de statut", async () => {
    reponses({
      agregats: [{ devise: "USD", n: 1, total: 100, du: 0 }],
      parStatut: [
        { statut: "completed", n: 12 },
        { statut: "cancelled", n: 1 },
      ],
      page: [ligneTiree()],
    });

    const page = await historiqueVentes({ statut: "cancelled" });
    expect(page.parStatut).toEqual({ completed: 12, cancelled: 1 });
    // La puce « Tous » ouvre les treize, pas la seule annulée : `total` porte
    // la LISTE affichée, `totalTousStatuts` porte ce que la puce ouvrirait.
    expect(page.total).toBe(1);
    expect(page.totalTousStatuts).toBe(13);
  });

  it("porte le nombre d'articles et l'échéance sur les lignes tirées", async () => {
    const hier = new Date(ce_matin);
    hier.setDate(hier.getDate() - 1);
    reponses({
      agregats: [{ devise: "USD", n: 1, total: 100, du: 40 }],
      page: [ligneTiree({ amountDue: "40", dueDate: hier })],
      nbLignes: [{ saleId: "s1", n: 3 }],
    });

    const page = await historiqueVentes();
    expect(page.elements[0].nbArticles).toBe(3);
    expect(page.elements[0].joursDeRetard).toBe(1);
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
