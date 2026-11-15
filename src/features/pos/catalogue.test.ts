/**
 * Ce que le comptoir OPPOSE au caissier, une fois tout retranché.
 *
 * Trois soustractions se superposent ici, et aucune n'est visible à l'écran :
 * les réservations du serveur, les ventes que ce terminal n'a pas encore
 * poussées, et le verrou d'un inventaire en cours. Un défaut sur l'une d'elles
 * ne plante pas : il fait accepter une vente que le serveur refusera ensuite,
 * après impression du ticket.
 */
/** Les réponses SQL, dans l'ordre où les requêtes les demandent. */
const mockResultats: unknown[][] = [];
/** Le dernier écouteur de changement posé, pour le déclencher à la main. */
const mockEcouteurs: ((ev: { tableName: string }) => void)[] = [];

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

jest.mock("expo-sqlite", () => ({
  addDatabaseChangeListener: jest.fn((rappel: (ev: { tableName: string }) => void) => {
    mockEcouteurs.push(rappel);
    return { remove: () => {} };
  }),
}));

jest.mock("@/db/client", () => ({ db: { select: () => mockConstructeur } }));
// Le module ne construit ses colonnes qu'au chargement : un schéma vide ferait
// échouer l'IMPORT, avant la première assertion. Un mandataire rend n'importe
// quelle table et n'importe quelle colonne, ce qui suffit : aucune requête
// n'est émise dans ces tests.
jest.mock("@/db/schema", () => {
  const colonnes: unknown = new Proxy({}, { get: (_c, nom) => String(nom) });
  return new Proxy({}, { get: () => colonnes });
});
jest.mock("drizzle-orm", () => ({
  and: () => ({}), asc: () => ({}), eq: () => ({}), inArray: () => ({}),
  isNull: () => ({}), like: () => ({}), ne: () => ({}), or: () => ({}), sql: () => ({}),
}));
jest.mock("drizzle-orm/sqlite-core", () => ({ alias: () => ({}) }));
jest.mock("@/sync", () => ({ enAttenteParType: jest.fn(async () => []) }));
jest.mock("@/sync/state", () => ({ readState: jest.fn(async () => null) }));

// Les deux lectures dont le contexte est tiré : on compte les appels, pas leur
// contenu, qui est éprouvé par leurs propres suites.
jest.mock("./verrou-inventaire", () => ({
  produitsVerrouilles: jest.fn(async () => new Map<string, string>()),
  arreteA: jest.fn(async () => null),
}));
jest.mock("./reserve-locale", () => ({
  reservesEnAttente: jest.fn(async () => new Map()),
  detteEnAttente: jest.fn(async () => new Map()),
}));

import {
  chercherArticles, oublierLeContexte, versArticle, type Contexte,
} from "./catalogue";
import { produitsVerrouilles } from "./verrou-inventaire";
import { reservesEnAttente } from "./reserve-locale";

/** Casier de 12, rayon à 4 casiers scellés plus 12 bouteilles isolées. */
const LIGNE = {
  id: "p1",
  name: "Primus 65cl",
  sku: null, barcode: null, image: null, categoryId: null, categoryName: null,
  selling_price: "5000",
  wholesale_price: "50000",
  is_taxable: false,
  tax_rate: "0",
  selling_mode: "wholesale_and_retail",
  units_per_package: 12,
  unit_name: "bouteille",
  packaging_unit_name: "casier",
  allow_auto_unpacking: true,
  track_inventory: true,
  _quantity: "60.000",
  _reserved: "0.000",
  _packages: "4",
  _loose: "12.000",
};

const ctx = (patch: Partial<Contexte> = {}): Contexte => ({
  verrou: new Map(),
  reserve: new Map(),
  ...patch,
});

describe("le stock négatif n'existe plus", () => {
  it("l'article ne porte plus aucun réglage de découvert", () => {
    // Il portait `allow_negative_stock`, vrai dès que la caisse n'avait pas
    // d'entrepôt : le comptoir encaissait alors sans aucune borne.
    expect(versArticle(LIGNE, ctx())).not.toHaveProperty("allow_negative_stock");
  });

  it("sans ligne de stock ici, le stock reste INCONNU, jamais ouvert", () => {
    // C'est le noyau qui fermera l'encaissement, en le disant.
    const article = versArticle({ ...LIGNE, _quantity: null }, ctx());
    expect(article.stock_quantity).toBeNull();
    expect(article.track_inventory).toBe(true);
  });
});

describe("le stock est la SOMME des lignes de l'article", () => {
  it("une somme flottante est quantisée avant d'être montrée", () => {
    // Deux lignes de 0,1 et 0,2 (deux variantes, deux emplacements) sortent de
    // `sum()` à 0.30000000000000004 : ce nombre s'afficherait sur la carte.
    const article = versArticle(
      {
        ...LIGNE, units_per_package: null, packaging_unit_name: null,
        selling_mode: "retail_only",
        _quantity: 0.30000000000000004, _reserved: 0, _packages: 0, _loose: 0.30000000000000004,
      },
      ctx()
    );
    expect(article.stock_quantity).toBe(0.3);
    expect(article.stock_loose).toBe(0.3);
  });
});

describe("les ventes en file sont retranchées du disponible", () => {
  it("retire les contenants vendus du scellé ET du total", () => {
    const article = versArticle(
      LIGNE,
      ctx({ reserve: new Map([["p1", { packages: 2, loose: 0 }]]) })
    );

    expect(article.stock_packages).toBe(2);
    expect(article.stock_loose).toBe(12);
    expect(article.stock_quantity).toBe(60 - 24);
  });

  it("puise le détail dans le vrac avant d'ouvrir un contenant", () => {
    const article = versArticle(
      LIGNE,
      ctx({ reserve: new Map([["p1", { packages: 0, loose: 5 }]]) })
    );

    expect(article.stock_packages).toBe(4);
    expect(article.stock_loose).toBe(7);
    expect(article.stock_quantity).toBe(55);
  });

  it("OUVRE un contenant quand le vrac ne suffit pas", () => {
    // Le point qu'une soustraction brute des deux compteurs manquerait : elle
    // laisserait quatre casiers apparemment scellés alors qu'un vient d'être
    // ouvert pour servir du détail, et le comptoir accepterait une vente en
    // gros que le serveur refuse.
    const article = versArticle(
      LIGNE,
      ctx({ reserve: new Map([["p1", { packages: 0, loose: 20 }]]) })
    );

    expect(article.stock_packages).toBe(3);
    expect(article.stock_loose).toBe(4);
    expect(article.stock_quantity).toBe(40);
  });

  it("retranche le vrac d'un produit SANS conditionnement", () => {
    const savon = {
      ...LIGNE, id: "p2", units_per_package: null, packaging_unit_name: null,
      selling_mode: "retail_only", _quantity: "10.000", _packages: "0", _loose: "10.000",
    };
    const article = versArticle(
      savon,
      ctx({ reserve: new Map([["p2", { packages: 0, loose: 4 }]]) })
    );

    expect(article.stock_quantity).toBe(6);
    expect(article.stock_loose).toBe(6);
    expect(article.stock_packages).toBeNull();
  });

  it("laisse intact un produit qu'aucune vente en file ne touche", () => {
    const article = versArticle(LIGNE, ctx({ reserve: new Map([["autre", { packages: 9, loose: 9 }]]) }));

    expect(article.stock_quantity).toBe(60);
    expect(article.stock_packages).toBe(4);
  });

  it("ne retranche RIEN d'un stock inconnu", () => {
    // `null` se lit « aucune ligne de stock », jamais zéro : en retrancher
    // quelque chose fabriquerait un négatif à partir d'une ignorance.
    const article = versArticle(
      { ...LIGNE, _quantity: null },
      ctx({ reserve: new Map([["p1", { packages: 2, loose: 0 }]]) })
    );

    expect(article.stock_quantity).toBeNull();
    expect(article.stock_packages).toBeNull();
  });

  it("se cumule aux réservations du serveur, sans les remplacer", () => {
    const article = versArticle(
      { ...LIGNE, _reserved: "12.000" },
      ctx({ reserve: new Map([["p1", { packages: 1, loose: 0 }]]) })
    );

    // 60 en rayon, 12 réservés par le serveur, 12 vendus par ce terminal.
    expect(article.stock_quantity).toBe(36);
  });
});

describe("verrou d'inventaire", () => {
  it("porte la RÉFÉRENCE de la session, pas un simple booléen", () => {
    const article = versArticle(LIGNE, ctx({ verrou: new Map([["p1", "INV-20260831-0001"]]) }));
    expect(article.verrou_inventaire).toBe("INV-20260831-0001");
  });

  it("laisse `null` sur un article libre", () => {
    expect(versArticle(LIGNE, ctx()).verrou_inventaire).toBeNull();
  });
});

describe("le contexte est MÉMORISÉ entre deux lectures", () => {
  /**
   * ┌────────────────────────────────────────────────────────────────────────┐
   * │ IL ÉTAIT REFAIT À CHAQUE FRAPPE, SUR LA GRILLE DU COMPTOIR.           │
   * │                                                                        │
   * │ Le verrou et la réserve ne dépendent pas du terme cherché, mais ils    │
   * │ étaient relus à chaque recherche différée, à chaque scan, à chaque     │
   * │ reprise de panier. Sous un inventaire de périmètre TOTAL, cela relit   │
   * │ TOUTES les lignes de stock de l'entrepôt et redésérialise le corps de  │
   * │ chaque vente en file, pour un résultat identique - sur le seul écran   │
   * │ qui doit rester instantané, un client devant le comptoir.              │
   * └────────────────────────────────────────────────────────────────────────┘
   */
  const lireLeVerrou = produitsVerrouilles as jest.Mock;
  const lireLaReserve = reservesEnAttente as jest.Mock;

  beforeEach(() => {
    mockResultats.length = 0;
    lireLeVerrou.mockClear();
    lireLaReserve.mockClear();
    oublierLeContexte();
  });

  it("ne relit qu'UNE fois pour plusieurs recherches", async () => {
    await chercherArticles({ warehouseId: "w1", terme: "c" });
    await chercherArticles({ warehouseId: "w1", terme: "co" });
    await chercherArticles({ warehouseId: "w1", terme: "coc" });

    expect(lireLeVerrou).toHaveBeenCalledTimes(1);
    expect(lireLaReserve).toHaveBeenCalledTimes(1);
  });

  it("relit dès que la base bouge, JAMAIS après un simple délai", async () => {
    await chercherArticles({ warehouseId: "w1", terme: "c" });
    expect(lireLaReserve).toHaveBeenCalledTimes(1);

    // Une vente vient d'être mise en file : le stock qu'elle a sorti doit être
    // retenu à la frappe SUIVANTE, pas à l'expiration d'une échéance. Une
    // seconde de retard suffit à reproposer un article déjà parti.
    for (const rappel of mockEcouteurs) rappel({ tableName: "outbox_operations" });
    await chercherArticles({ warehouseId: "w1", terme: "c" });

    expect(lireLaReserve).toHaveBeenCalledTimes(2);
  });

  it("relit aussi quand l'INVENTAIRE bouge", async () => {
    await chercherArticles({ warehouseId: "w1" });
    for (const rappel of mockEcouteurs) rappel({ tableName: "inventory_sessions" });
    await chercherArticles({ warehouseId: "w1" });

    expect(lireLeVerrou).toHaveBeenCalledTimes(2);
  });

  it("ignore les tables dont le contexte ne dépend pas", async () => {
    await chercherArticles({ warehouseId: "w1" });
    // Le catalogue lui-même : un prix qui change se relit par la requête, pas
    // par le contexte. Tout invalider ferait de la mémoire une décoration.
    for (const rappel of mockEcouteurs) rappel({ tableName: "products" });
    await chercherArticles({ warehouseId: "w1" });

    expect(lireLeVerrou).toHaveBeenCalledTimes(1);
  });

  it("ne sert JAMAIS le contexte d'un autre entrepôt", async () => {
    await chercherArticles({ warehouseId: "w1" });
    await chercherArticles({ warehouseId: "w2" });

    // Le verrou comme la réserve portent sur un dépôt : servir celui d'en face
    // retiendrait du stock que personne n'y a vendu, et en libérerait ici.
    expect(lireLeVerrou).toHaveBeenCalledTimes(2);
    expect(lireLeVerrou).toHaveBeenNthCalledWith(1, "w1");
    expect(lireLeVerrou).toHaveBeenNthCalledWith(2, "w2");
  });
});

describe("la disponibilité des autres entrepôts", () => {
  beforeEach(() => {
    mockResultats.length = 0;
    oublierLeContexte();
  });

  it("n'est lue que si on la demande", async () => {
    mockResultats.push([LIGNE]);
    const [article] = await chercherArticles({ warehouseId: "w1" });
    // `null` : non demandée, et rien n'a été lu de plus.
    expect(article.ailleurs).toBeNull();
    expect(mockResultats).toHaveLength(0);
  });

  it("rend, article par article, les seuls entrepôts qui portent encore quelque chose", async () => {
    mockResultats.push(
      [LIGNE, { ...LIGNE, id: "p9" }],
      [
        { produit: "p1", entrepotId: "w2", entrepot: "Réserve", quantite: 30, reserve: 6 },
        // Tout est réservé ici : il n'y a rien à proposer au client.
        { produit: "p1", entrepotId: "w3", entrepot: "Boutique Nord", quantite: 5, reserve: 5 },
      ]
    );
    const [p1, p9] = await chercherArticles({ warehouseId: "w1", avecAilleurs: true });
    expect(p1.ailleurs).toEqual([{ entrepotId: "w2", entrepot: "Réserve", disponible: 24 }]);
    // Demandée, et rien ailleurs : une liste VIDE, pas `null`.
    expect(p9.ailleurs).toEqual([]);
  });
});
