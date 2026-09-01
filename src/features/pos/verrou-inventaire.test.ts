/**
 * Le verrou d'inventaire, tel que le comptoir l'oppose.
 *
 * Ce module déplace un refus de « après impression, en quarantaine » à « avant
 * impression, avec un motif ». Un défaut ici ne se voit pas : l'écran a l'air
 * normal, et c'est le serveur qui refuse la vente une fois le client parti.
 */

/** Les réponses SQL, dans l'ordre où les requêtes les demandent. */
const mockLignes: unknown[][] = [];
const mockEtat: { valeur: { lastFullSyncAt: Date | null } | null } = { valeur: null };

jest.mock("@/db/client", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: async () => mockLignes.shift() ?? [],
      }),
    }),
  },
}));

jest.mock("@/db/schema", () => ({
  inventorySessions: {
    id: "id", reference: "reference", warehouseId: "warehouse_id",
    isStockLocked: "is_stock_locked", status: "status", isDeleted: "is_deleted",
    scopeType: "scope_type",
  },
  inventoryCounts: { sessionId: "session_id", productId: "product_id" },
  stocks: { productId: "product_id", warehouseId: "warehouse_id" },
}));

jest.mock("drizzle-orm", () => ({
  and: () => ({}), eq: () => ({}), inArray: () => ({}),
}));

jest.mock("@/sync/state", () => ({
  readState: jest.fn(async () => mockEtat.valeur),
}));

import { arreteA, produitsVerrouilles } from "./verrou-inventaire";
import { motifDuVerrou } from "./motifs";

beforeEach(() => {
  mockLignes.length = 0;
  mockEtat.valeur = null;
});

describe("produitsVerrouilles", () => {
  it("rattache chaque produit compté à la session qui le bloque", async () => {
    mockLignes.push([{ id: "s1", reference: "INV-20260831-0001", scopeType: "category" }]);
    mockLignes.push([
      { sessionId: "s1", productId: "p1" },
      { sessionId: "s1", productId: "p2" },
    ]);

    const verrou = await produitsVerrouilles("w1");
    expect(verrou.get("p1")).toBe("INV-20260831-0001");
    expect(verrou.get("p2")).toBe("INV-20260831-0001");
  });

  it("ne verrouille RIEN sans entrepôt", async () => {
    // Un verrou porte sur un dépôt. L'appliquer partout bloquerait une caisse
    // qui vend le stock d'un autre, et sans requête il n'y a rien à filtrer.
    expect((await produitsVerrouilles(null)).size).toBe(0);
    expect(mockLignes.length).toBe(0);
  });

  it("ne verrouille RIEN sans session bloquante", async () => {
    mockLignes.push([]);

    const verrou = await produitsVerrouilles("w1");
    expect(verrou.size).toBe(0);
    // La seconde requête n'est pas émise : sans session, il n'y a pas de
    // feuille à lire, et `inArray` sur une liste vide est une requête inutile.
    expect(mockLignes.length).toBe(0);
  });

  it("ne nomme QU'UNE session par produit", async () => {
    mockLignes.push([
      { id: "s1", reference: "INV-0001", scopeType: "category" },
      { id: "s2", reference: "INV-0002", scopeType: "category" },
    ]);
    mockLignes.push([
      { sessionId: "s1", productId: "p1" },
      { sessionId: "s2", productId: "p1" },
    ]);

    // Le serveur nomme toutes les sessions bloquantes ; au comptoir une seule
    // référence suffit à savoir quoi attendre, et deux rendent le message
    // illisible sur une carte de la largeur d'un demi-écran.
    expect(await produitsVerrouilles("w1")).toEqual(new Map([["p1", "INV-0001"]]));
  });

  it("survit à une ligne dont la session a disparu", async () => {
    mockLignes.push([{ id: "s1", reference: "INV-0001", scopeType: "category" }]);
    mockLignes.push([{ sessionId: "s-inconnue", productId: "p9" }]);

    // Verrouillé sans référence plutôt qu'oublié : le refus reste juste, seul
    // le message perd son numéro.
    expect((await produitsVerrouilles("w1")).get("p9")).toBe("");
  });
});

describe("perimetre TOTAL", () => {
  it("verrouille TOUT produit ayant du stock dans l'entrepôt", () => {
    // Lecture EXACTE, et non la feuille : `get_locked_product_ids` recalcule à
    // chaque appel, et une réception pendant l'inventaire crée une ligne de
    // stock que le serveur verrouille aussitôt. S'en tenir à la feuille, figée
    // au démarrage, ferait accepter au comptoir une vente refusée ensuite.
    mockLignes.push([{ id: "s1", reference: "INV-0001", scopeType: "full" }]);
    mockLignes.push([{ productId: "p1" }, { productId: "p2" }, { productId: "p-neuf" }]);

    return produitsVerrouilles("w1").then((verrou) => {
      expect(verrou.get("p-neuf")).toBe("INV-0001");
      expect(verrou.size).toBe(3);
    });
  });

  it("ne lit PAS la feuille de comptage sur un périmètre total", async () => {
    mockLignes.push([{ id: "s1", reference: "INV-0001", scopeType: "full" }]);
    mockLignes.push([{ productId: "p1" }]);

    await produitsVerrouilles("w1");
    // Une seconde requête serait la feuille : elle n'a rien à apprendre ici,
    // et un produit à stock nul y manquerait alors que le serveur le bloque.
    expect(mockLignes.length).toBe(0);
  });
});

describe("arreteA", () => {
  it("rend la date du dernier tirage COMPLET", async () => {
    const quand = new Date(2026, 7, 31, 14, 7);
    mockEtat.valeur = { lastFullSyncAt: quand };

    expect(await arreteA()).toBe(quand);
  });

  it("rend null quand la table n'a jamais été tirée", async () => {
    // `null` se lit « jamais synchronisé », jamais « à l'instant » : c'est la
    // fraîcheur qui distingue « attendez le comptage » de « votre appareil est
    // en retard ».
    expect(await arreteA()).toBeNull();
  });
});

describe("motifDuVerrou", () => {
  it("NOMME la session, pour que le caissier sache quoi attendre", () => {
    const motif = motifDuVerrou("Primus 65cl", "INV-20260831-0001");

    expect(motif).toContain("Primus 65cl");
    expect(motif).toContain("INV-20260831-0001");
    expect(motif).toContain("inventaire");
  });

  it("reste une PHRASE quand la référence manque", () => {
    // Une parenthèse vide ferait passer un message correct pour un défaut
    // d'affichage, et le caissier douterait du refus lui-même.
    expect(motifDuVerrou("Savon", "")).not.toContain("()");
  });
});
