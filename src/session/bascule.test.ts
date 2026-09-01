/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE MODULE NE PEUT ÉCHOUER QUE DANS LE SILENCE, D'OÙ CES TESTS.           │
 * │                                                                          │
 * │ Il ne rend rien à vérifier à l'œil : quand il se trompe, il annonce      │
 * │ « Rien à reprendre » et un marchand découvre la perte des semaines plus  │
 * │ tard, en cherchant une vente dont il se souvient. Deux défauts s'y sont  │
 * │ tenus tout un lot :                                                      │
 * │                                                                          │
 * │  1. `openDatabaseAsync` recevait un URI là où il attend un NOM. SQLite   │
 * │     créait alors une base VIDE sous `<SQLite>/file:/…/watermelon.db`,    │
 * │     toutes les requêtes échouaient, le compte tombait à zéro.            │
 * │  2. Sur Android, la base de WatermelonDB n'est PAS dans le dossier des   │
 * │     documents mais dans son parent - donc l'avertissement ne se          │
 * │     déclenchait jamais sur la plateforme qu'il vise.                     │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/** Les URI qui « existent » pour le test courant. */
const mockFichiers = new Set<string>();
/** Les tables de la base simulée, et leur compte de lignes non poussées. */
const mockTables = new Map<string, number>();
/** Les arguments reçus par `openDatabaseAsync`, pour les vérifier. */
const mockOuvertures: { nom: string; dossier?: string }[] = [];
/** Le dossier que le module natif expose, réglé par chaque test. */
const mockDossierParDefaut = { valeur: "" };

jest.mock("expo-file-system", () => ({
  File: class {
    uri: string;
    constructor(uri: string) {
      this.uri = uri;
    }
    get exists() {
      return mockFichiers.has(this.uri);
    }
  },
}));

jest.mock("expo-sqlite", () => ({
  get defaultDatabaseDirectory() {
    return mockDossierParDefaut.valeur;
  },
  openDatabaseAsync: jest.fn(async (nom: string, _options?: unknown, dossier?: string) => {
    mockOuvertures.push({ nom, dossier });
    return {
      getFirstAsync: async (sql: string) => {
        const table = /FROM (\w+)/.exec(sql)?.[1] ?? "";
        if (!mockTables.has(table)) throw new Error(`no such table: ${table}`);
        return { n: mockTables.get(table) };
      },
      closeAsync: async () => undefined,
    };
  }),
}));

import { resteDeLAncienneApp } from "./bascule";

const ANDROID = "/data/user/0/com.ventefacile.app/files/SQLite";
const IOS = "/var/mobile/Containers/Data/Application/ABC/Documents/SQLite";

beforeEach(() => {
  mockFichiers.clear();
  mockTables.clear();
  mockOuvertures.length = 0;
  mockDossierParDefaut.valeur = ANDROID;
});

describe("resteDeLAncienneApp", () => {
  it("trouve la base ANDROID, qui est au-dessus du dossier des documents", async () => {
    // `WMDatabase.java` : `getDatabasePath(name).getPath().replace("/databases", "")`
    // La chercher sous `files/` ne la trouve jamais.
    mockFichiers.add("file:///data/user/0/com.ventefacile.app/watermelon.db");
    mockTables.set("sales", 3);
    mockTables.set("payments", 2);

    const reste = await resteDeLAncienneApp();

    expect(reste?.total).toBe(5);
    expect(reste?.chemin).toBe("/data/user/0/com.ventefacile.app/watermelon.db");
  });

  it("ouvre par NOM et DOSSIER, jamais par URI", async () => {
    // `createDatabasePath` recolle `dossier + "/" + nom` : un URI passé en
    // premier argument est traité comme un nom de fichier, et SQLite crée une
    // base vide au lieu de lire l'ancienne.
    mockFichiers.add("file:///data/user/0/com.ventefacile.app/watermelon.db");
    mockTables.set("sales", 1);

    await resteDeLAncienneApp();

    expect(mockOuvertures).toEqual([
      { nom: "watermelon.db", dossier: "/data/user/0/com.ventefacile.app" },
    ]);
  });

  it("trouve la base iOS, qui est dans le dossier des documents", async () => {
    mockDossierParDefaut.valeur = IOS;
    const documents = "/var/mobile/Containers/Data/Application/ABC/Documents";
    mockFichiers.add(`file://${documents}/watermelon.db`);
    mockTables.set("sales", 4);

    const reste = await resteDeLAncienneApp();

    expect(reste?.total).toBe(4);
    expect(reste?.chemin).toBe(`${documents}/watermelon.db`);
    expect(mockOuvertures).toEqual([{ nom: "watermelon.db", dossier: documents }]);
  });

  it("N'OUVRE RIEN quand aucun fichier n'existe", async () => {
    // Ouvrir une base absente la CRÉE : le terminal se retrouverait avec un
    // fichier vide, et la bascule conclurait « rien à reprendre » pour de bon.
    const reste = await resteDeLAncienneApp();

    expect(reste).toBeNull();
    expect(mockOuvertures).toEqual([]);
  });

  it("se tait quand l'ancienne base est là mais vidée", async () => {
    mockFichiers.add("file:///data/user/0/com.ventefacile.app/watermelon.db");
    mockTables.set("sales", 0);
    mockTables.set("payments", 0);

    expect(await resteDeLAncienneApp()).toBeNull();
  });

  it("ignore une table absente du schéma sans condamner les autres", async () => {
    // Les versions de l'ancienne app n'avaient pas toutes les mêmes tables.
    mockFichiers.add("file:///data/user/0/com.ventefacile.app/watermelon.db");
    mockTables.set("sales", 2);
    // ni `payments`, ni `customers`, ni les autres.

    const reste = await resteDeLAncienneApp();

    expect(reste?.total).toBe(2);
    expect(reste?.parTable).toEqual([{ table: "sales", nombre: 2 }]);
  });
});
