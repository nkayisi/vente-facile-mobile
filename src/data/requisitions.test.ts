/**
 * La fiche d'une réquisition se lit PAR SON IDENTIFIANT.
 *
 * ┌──────────────────────────────────────────────────────────────────────────────┐
 * │ ELLE ÉTAIT « INTROUVABLE » AU-DELÀ DE LA FENÊTRE DE SA PROPRE LISTE.        │
 * │                                                                              │
 * │ `detailRequisition` chargeait `listeRequisitions()` SANS AUCUN FILTRE - deux │
 * │ cents lignes, un `count(*)` corrélé par ligne, plus la fusion de tout le     │
 * │ journal - puis filtrait en JavaScript. Trois chemins y menaient : un         │
 * │ `action_url` de notification, un lien profond, et toute organisation qui     │
 * │ dépasse la fenêtre. L'écran déclarait alors la pièce inconnue pendant que le │
 * │ magasinier tenait son bordereau imprimé.                                     │
 * └──────────────────────────────────────────────────────────────────────────────┘
 */
let mockLignes: unknown[][] = [];
let mockAttente: { id: string; payload: Record<string, unknown>; envoi: string; occurredAt: Date | null }[] = [];
const mockOu: unknown[] = [];

jest.mock("@/db/client", () => ({
  db: {
    select: () => {
      const chaine: Record<string, unknown> = {};
      const suite = () => chaine;
      chaine.from = suite;
      chaine.leftJoin = suite;
      chaine.where = (c: unknown) => {
        mockOu.push(c);
        return chaine;
      };
      chaine.orderBy = suite;
      chaine.limit = suite;
      chaine.then = (resoudre: (v: unknown) => void) =>
        resoudre(mockLignes.shift() ?? []);
      return chaine;
    },
  },
}));

jest.mock("@/db/schema", () => ({
  requisitions: {
    id: "id", reference: "reference", status: "status",
    warehouseId: "warehouse_id", notes: "notes", requestedAt: "requested_at",
    decidedAt: "decided_at", decisionNotes: "decision_notes",
    isDeleted: "is_deleted",
  },
  requisitionItems: {
    id: "id", requisitionId: "requisition_id", productId: "product_id",
    quantityRequested: "quantity_requested", stockAtRequest: "stock_at_request",
    reorderPointAtRequest: "reorder_point_at_request", notes: "notes",
  },
  products: { id: "id", name: "name", sku: "sku", unitId: "unit_id" },
  units: { id: "id", name: "name" },
  warehouses: { id: "id", name: "name" },
  stocks: {
    productId: "product_id", warehouseId: "warehouse_id", quantity: "quantity",
  },
}));

jest.mock("drizzle-orm", () => {
  const marque = (nom: string) => (...a: unknown[]) => ({ nom, a });
  return {
    and: marque("and"), eq: marque("eq"), or: marque("or"),
    desc: marque("desc"), asc: marque("asc"), like: marque("like"),
    isNull: marque("isNull"), inArray: marque("inArray"),
    sql: Object.assign(marque("sql"), { raw: marque("raw") }),
  };
});

jest.mock("@/sync/outbox", () => ({
  enAttenteParType: jest.fn(async () => mockAttente),
}));

jest.mock("./stock-niveaux", () => ({
  niveauxDeStock: jest.fn(async () => ({ elements: [], total: 0 })),
}));

import { detailRequisition, listeRequisitions } from "./requisitions";

function ligneTable(id: string, reference: string) {
  return {
    id, reference, statut: "submitted", entrepotId: "w1", entrepot: "Dépôt Nord",
    notes: null, demandeLe: new Date("2026-10-01"), decideLe: null,
    notesDecision: null, nbLignes: 2,
  };
}

function opEnFile(id: string, reference: string) {
  return {
    id: "op-1",
    payload: { id, reference, warehouse: "w1", notes: "", items: [{}, {}, {}] },
    envoi: "en_attente",
    occurredAt: new Date("2026-10-02"),
  };
}

beforeEach(() => {
  mockLignes = [];
  mockAttente = [];
  mockOu.length = 0;
  jest.clearAllMocks();
});

describe("la lecture ciblée d'une réquisition", () => {
  it("trouve la pièce par son identifiant, et NON par la liste", async () => {
    // Une seule ligne en table, puis ses lignes de détail : c'est la forme
    // d'une lecture ciblée. Une lecture par la liste aurait demandé un
    // `count(*)` et la fusion du journal avant d'arriver là.
    mockLignes = [[ligneTable("r-500", "REQ-2026-00500")], []];

    const fiche = await detailRequisition("r-500");

    expect(fiche?.requisition.reference).toBe("REQ-2026-00500");
    //: Le journal n'est PAS consulté quand la table répond : c'est ce qui
    //: distingue la lecture ciblée du filtre sur la liste.
    const { enAttenteParType } = jest.requireMock("@/sync/outbox");
    expect(enAttenteParType).not.toHaveBeenCalled();
  });

  it("une pièce au-DELÀ de la fenêtre reste trouvable", async () => {
    // Le cas qui échouait : la 500e réquisition d'un établissement. La lecture
    // ciblée ne connaît pas de fenêtre, donc le rang n'a plus d'importance.
    mockLignes = [[ligneTable("r-500", "REQ-2026-00500")], []];
    expect((await detailRequisition("r-500"))?.requisition.id).toBe("r-500");
  });

  it("une pièce encore EN FILE est retrouvée par son `payload.id`", async () => {
    // La table ne répond rien : la pièce vit dans le journal, et son bordereau
    // porte déjà son numéro d'appareil.
    mockLignes = [[]];
    mockAttente = [opEnFile("r-neuve", "REQ-20261010-TST1-0001")];

    const fiche = await detailRequisition("r-neuve");
    expect(fiche?.requisition.reference).toBe("REQ-20261010-TST1-0001");
    expect(fiche?.requisition.envoi).toBe("en_attente");
    //: ⚠ AUCUNE LIGNE, et l'écran le dit : elles vivent dans le corps de
    //: l'opération, pas dans une table lisible. Afficher une section vide se
    //: lirait comme une réquisition sans article.
    expect(fiche?.lignes).toEqual([]);
    expect(fiche?.requisition.nbLignes).toBe(3);
  });

  it("un identifiant que personne ne connaît rend `null`", async () => {
    mockLignes = [[]];
    mockAttente = [];
    expect(await detailRequisition("inconnu")).toBeNull();
  });

  it("le journal est lu AVEC les opérations bloquées", async () => {
    //: Une opération bloquée est CONSERVÉE et repartira dès qu'un droit sera
    //: accordé. La masquer ferait déclarer introuvable une pièce que le
    //: magasinier vient de créer.
    mockLignes = [[]];
    mockAttente = [opEnFile("r-x", "REQ-X")];
    await detailRequisition("r-x");

    const { enAttenteParType } = jest.requireMock("@/sync/outbox");
    expect(enAttenteParType).toHaveBeenCalledWith("requisition.create", {
      avecBloquees: true,
    });
  });
});

describe("la fenêtre de la liste, et son total", () => {
  it("le total porte le PÉRIMÈTRE, jamais la fenêtre", async () => {
    // Deux lignes rendues par une fenêtre, mais 347 dans le périmètre : c'est
    // le second chiffre que le sous-titre doit annoncer.
    mockLignes = [
      [ligneTable("r-1", "REQ-1"), ligneTable("r-2", "REQ-2")],
      [{ n: 347 }],
    ];

    const { elements, total } = await listeRequisitions({ limite: 2 });
    expect(elements).toHaveLength(2);
    expect(total).toBe(347);
  });

  it("le total compte AUSSI ce qui attend son envoi", async () => {
    // Elles sont à l'écran, et le serveur ne les connaît pas : les omettre
    // ferait un total plus petit que la liste qu'il coiffe.
    mockLignes = [[ligneTable("r-1", "REQ-1")], [], [{ n: 10 }]];
    mockAttente = [opEnFile("r-neuve", "REQ-NEUVE")];

    const { elements, total } = await listeRequisitions();
    expect(elements).toHaveLength(2);
    expect(total).toBe(11);
  });

  it("une pièce POUSSÉE n'est pas comptée deux fois", async () => {
    //: Le serveur reprend la référence : une pièce redescendue pendant qu'elle
    //: est encore au journal se compterait deux fois sans ce dédoublonnage.
    mockLignes = [
      [ligneTable("r-1", "REQ-NEUVE")],
      [{ reference: "REQ-NEUVE" }],
      [{ n: 1 }],
    ];
    mockAttente = [opEnFile("r-1", "REQ-NEUVE")];

    const { elements, total } = await listeRequisitions();
    expect(elements).toHaveLength(1);
    expect(total).toBe(1);
  });

  it("une pièce poussée AU-DELÀ de la fenêtre n'est pas comptée deux fois", async () => {
    /*
     * ┌──────────────────────────────────────────────────────────────────────┐
     * │ LE DÉDOUBLONNAGE SE FAIT CONTRE LA TABLE, JAMAIS CONTRE LA FENÊTRE. │
     * │                                                                      │
     * │ C'est le cas que le test voisin ne couvrait PAS : là, la pièce tirée  │
     * │ est DANS la fenêtre, donc l'ancien `Set(tirees)` la voyait. Ici la    │
     * │ fenêtre rend une autre ligne et la pièce poussée est au-delà : elle   │
     * │ était rendue deux fois - même `id`, donc deux clés identiques dans la │
     * │ liste virtualisée - et le total annonçait un de trop.                 │
     * └──────────────────────────────────────────────────────────────────────┘
     */
    mockLignes = [
      // La fenêtre : une autre pièce. `REQ-LOIN` est en table, mais plus loin.
      [ligneTable("r-autre", "REQ-AUTRE")],
      // Le croisement contre la TABLE : elle y est bien.
      [{ reference: "REQ-LOIN" }],
      [{ n: 60 }],
    ];
    mockAttente = [opEnFile("r-loin", "REQ-LOIN")];

    const { elements, total } = await listeRequisitions({ limite: 1 });

    expect(elements.map((r) => r.reference)).toEqual(["REQ-AUTRE"]);
    expect(total).toBe(60);
  });

  it("aucune référence en file ne coûte AUCUNE requête de croisement", async () => {
    //: On n'interroge que les références EN FILE, peu nombreuses par
    //: construction. Sans file, le croisement ne doit pas exister - sinon la
    //: lecture paierait un `inArray` vide à chaque ouverture de l'écran.
    mockLignes = [[ligneTable("r-1", "REQ-1")], [{ n: 1 }]];

    const { elements, total } = await listeRequisitions();
    expect(elements).toHaveLength(1);
    expect(total).toBe(1);
  });
});

describe("la fiche d'une pièce SUPPRIMÉE", () => {
  it("une réquisition supprimée en douceur n'est PAS ouvrable", async () => {
    /*
     * La lecture ciblée avait perdu le filtre que la liste applique : une pièce
     * dont le tirage a ramené la pierre tombale restait pleinement ouvrable par
     * un `action_url` de notification ou un lien profond, avec ses boutons de
     * transition - pendant que la liste, elle, la cachait.
     *
     * Le filtre étant en SQL, la table ne rend plus rien et la lecture tombe
     * sur le journal, qui ne la connaît pas non plus : `null`.
     */
    mockLignes = [[]];
    mockAttente = [];

    expect(await detailRequisition("r-supprimee")).toBeNull();
  });

  it("le filtre de suppression est bien POSÉ sur la lecture ciblée", async () => {
    //: Le test ci-dessus passerait aussi sur une table simplement vide. Celui-ci
    //: regarde la condition RÉELLEMENT émise.
    mockLignes = [[]];
    mockAttente = [];
    await detailRequisition("r-x");

    expect(JSON.stringify(mockOu)).toContain("is_deleted");
  });
});
