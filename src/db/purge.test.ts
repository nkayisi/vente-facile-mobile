/**
 * La purge, jugée sur le SQL qu'elle ÉMET.
 *
 * On double `@/db/client`, `@/data/reglages` et le module de photos, sur le
 * motif de `features/inventaire/photos.test.ts`. Ce qui compte ici n'est pas que
 * la base soit vide à la fin - aucun test ne peut l'établir sans appareil - mais
 * que les bons ordres partent, dans le bon ordre, et qu'aucun nom de table ne
 * soit écrit à la main.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

// `jest.mock` est HISSÉ par Babel au-dessus des imports : ceux-ci peuvent donc
// rester en tête, et `purge.ts` recevra bien les doublures.
import { CLE_PURGE_EN_COURS, localesParTraitement } from "./purge-regles";
import { purgeInachevee, purgerBaseLocale } from "./purge";
import { tablesTirees } from "./tables";

const mockOrdres: string[] = [];
const mockJournal: string[] = [];
let mockReglages: Record<string, unknown> = {};

const mockRunAsync = jest.fn(async (sql: string, _args?: unknown[]) => {
  mockOrdres.push(sql);
  mockJournal.push(`sql:${sql}`);
  return { changes: 3, lastInsertRowId: 0 };
});

jest.mock("@/db/client", () => ({
  connection: {
    runAsync: (sql: string, args?: unknown[]) => mockRunAsync(sql, args),
    execAsync: async (sql: string) => {
      mockOrdres.push(sql);
      mockJournal.push(`sql:${sql}`);
    },
    getFirstAsync: async () => null,
    withTransactionAsync: async (fn: () => Promise<void>) => {
      mockJournal.push("transaction:debut");
      await fn();
      mockJournal.push("transaction:fin");
    },
  },
  db: {},
}));

jest.mock("@/data/reglages", () => ({
  lireReglage: async (cle: string, defaut: unknown) =>
    cle in mockReglages ? mockReglages[cle] : defaut,
  ecrireReglage: async (cle: string, valeur: unknown) => {
    mockReglages[cle] = valeur;
    mockJournal.push(`reglage:${cle}=${String(valeur)}`);
  },
  CLE_THEME: "theme.preference",
}));

jest.mock("@/features/inventaire/photos", () => ({
  viderDossierPhotos: async () => {
    mockJournal.push("fichiers");
    return 2;
  },
}));

const RACINE = resolve(__dirname, "..");

/** Les tirées, les locales à vider, plus `local_settings` et son NOT IN. */
function attendues(): number {
  return (
    tablesTirees().length +
    localesParTraitement("vider").length +
    localesParTraitement("vider_avec_fichiers").length +
    1
  );
}

beforeEach(() => {
  mockOrdres.length = 0;
  mockJournal.length = 0;
  mockReglages = {};
  mockRunAsync.mockClear();
});

describe("le drapeau de purge en cours", () => {
  it("est faux quand rien n'a commencé", async () => {
    await expect(purgeInachevee()).resolves.toBe(false);
  });

  /**
   * ⚠ Il couvre la SEULE étape qui ne tienne pas dans la transaction : la
   * suppression des fichiers. Sans lui, une purge tuée là laisserait des lignes
   * pointant vers des fichiers absents, sans que rien ne fasse rejouer la purge.
   */
  it("est posé AVANT de toucher au moindre fichier", async () => {
    await purgerBaseLocale();
    expect(mockJournal.indexOf(`reglage:${CLE_PURGE_EN_COURS}=true`)).toBeLessThan(
      mockJournal.indexOf("fichiers")
    );
  });
});

describe("l'ordre de la purge", () => {
  /**
   * ⚠ LES FICHIERS AVANT LES LIGNES.
   *
   * Dans l'autre sens, un arrêt entre les deux perd les `uri` pour toujours :
   * le dossier garde des fichiers que plus rien ne référence, sur un terminal
   * qui manque déjà de place.
   */
  it("supprime les FICHIERS avant les lignes", async () => {
    await purgerBaseLocale();
    expect(mockJournal.indexOf("fichiers")).toBeLessThan(mockJournal.indexOf("transaction:debut"));
  });

  it("efface toutes les lignes dans UNE transaction", async () => {
    await purgerBaseLocale();
    const debut = mockJournal.indexOf("transaction:debut");
    const fin = mockJournal.indexOf("transaction:fin");
    const dedans = mockJournal.slice(debut, fin).filter((e) => e.startsWith("sql:DELETE"));
    // Le compte est DÉRIVÉ, jamais écrit : une table ajoutée au schéma demain ne
    // doit pas faire échouer ce test pour la mauvaise raison.
    expect(dedans).toHaveLength(attendues());
  });

  it("pose `defer_foreign_keys` avant le premier DELETE", async () => {
    await purgerBaseLocale();
    const pragma = mockOrdres.findIndex((o) => o.includes("defer_foreign_keys"));
    const premierDelete = mockOrdres.findIndex((o) => o.startsWith("DELETE"));
    expect(pragma).toBeGreaterThanOrEqual(0);
    expect(pragma).toBeLessThan(premierDelete);
  });

  /**
   * Le drapeau doit survivre au COMMIT : l'effacer dedans ferait perdre la trace
   * d'une purge tuée juste après, avant son propre nettoyage.
   */
  it("efface le drapeau et l'estampille APRÈS la transaction", async () => {
    await purgerBaseLocale();
    const nettoyage = mockJournal.findIndex(
      (e) => e.startsWith("sql:") && e.includes('"key" IN (?, ?)')
    );
    expect(nettoyage).toBeGreaterThan(mockJournal.indexOf("transaction:fin"));
  });

  it("rend la place en dernier, et un échec n'emporte rien", async () => {
    await purgerBaseLocale();
    expect(mockOrdres[mockOrdres.length - 1]).toContain("VACUUM");
  });
});

describe("ce que la purge épargne", () => {
  /**
   * ⚠ JAMAIS un `DELETE FROM local_settings` sec : il emporterait le thème et
   * l'imprimante, qui décrivent le matériel posé sur le comptoir et non le
   * compte. Le marchand suivant devrait réappairer avant d'imprimer un ticket.
   */
  it("ne vide `local_settings` qu'avec un NOT IN portant l'allowlist", async () => {
    await purgerBaseLocale();
    const secs = mockOrdres.filter((o) => /^DELETE FROM "local_settings"\s*$/.test(o.trim()));
    expect(secs).toEqual([]);

    const appel = mockRunAsync.mock.calls.find(
      ([sql]) => sql.includes("local_settings") && sql.includes("NOT IN")
    );
    expect(appel).toBeDefined();
    expect(appel![1]).toEqual(
      expect.arrayContaining(["theme.preference", "imprimante", CLE_PURGE_EN_COURS])
    );
  });

  it("vide les 45 tables tirées, nommées par le schéma", async () => {
    await purgerBaseLocale();
    for (const nom of tablesTirees()) {
      expect(mockOrdres).toContain(`DELETE FROM "${nom}"`);
    }
  });

  it("rend un bilan chiffré", async () => {
    const bilan = await purgerBaseLocale();
    expect(bilan.tablesVidees).toBe(attendues());
    expect(bilan.lignesSupprimees).toBe(attendues() * 3);
    expect(bilan.fichiersSupprimes).toBe(2);
  });
});

describe("la liste des tables n'est pas écrite à la main", () => {
  /**
   * Le garde-fou qui empêche la dérive : `pulled.ts` est ENGENDRÉ, et une liste
   * recopiée s'en écarterait au prochain `pnpm db:pull-schema`, en silence.
   */
  it("aucun nom de table tirée ne figure en littéral dans `purge.ts`", () => {
    const source = readFileSync(join(RACINE, "db/purge.ts"), "utf8");
    const fautifs = tablesTirees().filter((n) =>
      new RegExp(`["'\`]${n}["'\`]`).test(source)
    );
    expect(fautifs).toEqual([]);
  });
});
