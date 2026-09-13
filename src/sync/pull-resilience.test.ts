/**
 * Ce qu'un tirage fait quand UNE table refuse de descendre.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UNE TABLE EN 500 EMPORTAIT TOUTES LES SUIVANTES, EN SILENCE.             │
 * │                                                                          │
 * │ `pullAll` ne rattrapait aucune exception : la première table fautive     │
 * │ faisait remonter l'erreur, et celles PLACÉES APRÈS elle au manifeste     │
 * │ n'étaient plus jamais tirées. Ce n'est pas théorique : le dépôt a connu  │
 * │ un `FieldError` sur `sale_returns` qui bloquait trois chemins à la fois. │
 * │                                                                          │
 * │ Rien n'était perdu (le point de reprise de chaque table restait juste)   │
 * │ mais la base locale du marchand restait incomplète tant que le défaut    │
 * │ serveur n'était pas corrigé, et RIEN à l'écran ne le disait.             │
 * │                                                                          │
 * │ La frontière que ces tests gardent est celle du `kind` : le serveur a    │
 * │ répondu (on isole et on continue) contre rien n'a atteint le serveur     │
 * │ (on s'arrête). Trente-huit tables à faire expirer une à une font près    │
 * │ de vingt minutes d'attente pour zéro donnée.                             │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/** Ce que le serveur répond, et ce qu'on lui a réellement demandé. */
const mockApi = {
  tables: [] as string[],
  /** Table -> erreur à lever à sa place. */
  echecs: new Map<string, unknown>(),
  /** Tables dont une page a été demandée, dans l'ordre. */
  demandes: [] as string[],
};
/** L'état local simulé, et ce que le tirage y écrit. */
const mockEtats = new Map<string, Record<string, unknown>>();

const specDe = (name: string) => ({
  name,
  has_tombstones: false,
  row_count: 1,
  columns: [{ name: "id", kind: "text", null: false, pk: true }],
  children: [],
});

jest.mock("@/api/client", () => ({
  api: {
    get: jest.fn(async (path: string) => {
      if (path.startsWith("/sync/pull/manifest/")) {
        return {
          schema_version: 1,
          default_page_size: 500,
          tables: mockApi.tables.map(specDe),
        };
      }
      const table = new URLSearchParams(path.split("?")[1]).get("table") as string;
      mockApi.demandes.push(table);
      const echec = mockApi.echecs.get(table);
      if (echec) throw echec;
      // ⚠ La page porte une LIGNE. Sur une table vide, « rien reçu » est une
      // réponse correcte même si le tirage s'est trompé de curseur : un test
      // qui ne crée aucune ligne passe sans rien démontrer.
      return {
        table,
        rows: [{ id: `${table}-1` }],
        deleted_ids: [],
        next_cursor: `c-${table}`,
        next_deleted_cursor: null,
        has_more: false,
        server_time: "",
        schema_version: 1,
      };
    }),
    post: jest.fn(async () => ({ changed: [], tables: 0 })),
  },
}));
jest.mock("@/db/client", () => ({
  connection: {
    withTransactionAsync: async (fn: () => Promise<void>) => fn(),
  },
}));
jest.mock("./ingest", () => ({
  deleteRows: jest.fn(), replaceChildren: jest.fn(), upsertRows: jest.fn(),
}));
jest.mock("./state", () => ({
  // Aucun état : la sonde n'a rien à annoncer, donc on tire TOUT. C'est la
  // situation d'une première synchronisation, et celle où l'isolement compte
  // le plus.
  readAllStates: jest.fn(async () => [...mockEtats.values()]),
  readState: jest.fn(async (t: string) => mockEtats.get(t) ?? null),
  writeState: jest.fn(async (t: string, patch: Record<string, unknown>) => {
    mockEtats.set(t, { ...(mockEtats.get(t) ?? { table: t }), ...patch });
  }),
}));

// `@/api/errors` n'est PAS simulé, et c'est délibéré : le module est pur, et
// c'est son vrai `kind` qui départage « le serveur a répondu » de « rien ne
// l'a atteint ». Le simuler ferait passer ces tests sur une imitation.
import { ApiError } from "@/api/errors";

import { pullAll } from "./pull";

const erreur500 = () =>
  new ApiError("server", "Erreur 500", { status: 500 });
const horsLigne = () => new ApiError("network", "Le serveur est injoignable.");

beforeEach(() => {
  mockEtats.clear();
  mockApi.echecs.clear();
  mockApi.demandes = [];
  mockApi.tables = ["produits", "ventes", "stocks"];
});

describe("une table que le serveur ne sait pas rendre", () => {
  it("n'empêche pas les SUIVANTES d'être tirées", async () => {
    mockApi.echecs.set("ventes", erreur500());

    const bilan = await pullAll();

    // La table d'après a bien été demandée, et elle a rapporté sa ligne.
    expect(mockApi.demandes).toEqual(["produits", "ventes", "stocks"]);
    expect(bilan.tables).toBe(2);
    expect(bilan.rows).toBe(2);
    expect(bilan.interrupted).toBe(false);
  });

  it("laisse son motif sur sa ligne d'état", async () => {
    mockApi.echecs.set("ventes", erreur500());

    await pullAll();

    // C'est ce que l'écran Synchronisation rend en rouge, table par table.
    // Sans lui, l'échec ne se lirait nulle part.
    expect(mockEtats.get("ventes")?.lastError).toBe("Erreur 500");
    // Et la table saine ne porte aucune erreur.
    expect(mockEtats.get("stocks")?.lastError).toBeNull();
  });

  it("est NOMMÉE dans le bilan", async () => {
    mockApi.echecs.set("ventes", erreur500());

    const bilan = await pullAll();

    expect(bilan.echecs).toEqual([{ table: "ventes", message: "Erreur 500" }]);
  });

  it("ne rend jamais une PAGE de balises comme motif", async () => {
    // Un 500 de Django, un proxy inverse ou un portail captif d'hôtel
    // répondent une page entière. Rendue telle quelle, elle s'affichait sur
    // deux écrans de balises dans le bandeau d'erreur.
    mockApi.echecs.set("ventes", new Error(`<!DOCTYPE html><html>${"x".repeat(900)}`));

    const bilan = await pullAll();

    expect(bilan.echecs[0].message).toBe("Le tirage de cette table a échoué.");
    expect(mockEtats.get("ventes")?.lastError).not.toContain("<html");
  });
});

describe("une panne de réseau", () => {
  it("ARRÊTE le tirage : les tables suivantes ne sont pas demandées", async () => {
    mockApi.echecs.set("ventes", horsLigne());

    await expect(pullAll()).rejects.toThrow("Le serveur est injoignable.");

    // Les faire expirer une à une coûterait près de vingt minutes pour rien.
    expect(mockApi.demandes).toEqual(["produits", "ventes"]);
    expect(mockApi.demandes).not.toContain("stocks");
  });
});

describe("quand AUCUNE table n'a pu être tirée", () => {
  it("relève la PREMIÈRE erreur plutôt que de rendre un succès", async () => {
    const premiere = erreur500();
    mockApi.echecs.set("produits", premiere);
    mockApi.echecs.set("ventes", erreur500());
    mockApi.echecs.set("stocks", erreur500());

    // « 0 table tirée, 3 échecs » annoncé comme « Synchronisation terminée »
    // serait un mensonge : le terminal n'a rien reçu du tout.
    await expect(pullAll()).rejects.toBe(premiere);

    // Les trois ont bien été TENTÉES : on n'abandonne qu'au bout.
    expect(mockApi.demandes).toEqual(["produits", "ventes", "stocks"]);
  });
});

describe("une table dont l'INGESTION échoue", () => {
  const { upsertRows } = jest.requireMock("./ingest") as { upsertRows: jest.Mock };
  afterEach(() => upsertRows.mockReset());

  it("laisse son motif sur SA ligne d'état, comme un échec de requête", async () => {
    // Le bloc gardé ne couvrait que l'appel réseau. Une réponse malformée -
    // une colonne que la base locale ne connaît pas - échoue à l'INGESTION, et
    // ne laissait alors aucun motif sur la ligne d'état. Depuis que le tirage
    // passe à la table suivante, c'est la seule trace que l'écran
    // Synchronisation puisse montrer pour cette table.
    upsertRows.mockImplementation(async (table: string) => {
      if (table === "ventes") throw new Error("table ventes has no column named devise");
    });

    const bilan = await pullAll();

    expect(mockApi.demandes).toEqual(["produits", "ventes", "stocks"]);
    expect(bilan.echecs.map((e) => e.table)).toEqual(["ventes"]);
    expect(String(mockEtats.get("ventes")?.lastError)).toContain("no column named devise");
  });

  it("ne fait PAS avancer le point de reprise de la table fautive", async () => {
    // Une erreur ne doit jamais faire sauter une fenêtre de données : la table
    // reprendra exactement où elle en était.
    upsertRows.mockImplementation(async (table: string) => {
      if (table === "ventes") throw new Error("ingestion refusée");
    });

    await pullAll();

    expect(mockEtats.get("ventes")?.cursor).toBeUndefined();
    expect(mockEtats.get("stocks")?.cursor).toBe("c-stocks");
  });
});
