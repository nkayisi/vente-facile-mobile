/**
 * La traduction SQL du périmètre d'entrepôt, et son jumeau du journal.
 *
 * ⚠ Aucune suite de ce dépôt n'exécute SQLite : on lit la requête que Drizzle
 * RENDRAIT (`SQLiteSyncDialect.sqlToQuery`). C'est ce qui reste éprouvable sans
 * appareil, et c'est exactement là que vit le défaut redouté - un ensemble de
 * défaut oublié montre tous les entrepôts à qui n'en a rien demandé.
 */
import { SQLiteSyncDialect, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { retientEntrepot } from "@/features/perimetre/filtre-perimetre";

import { conditionEntrepot } from "./perimetre-sql";

const t = sqliteTable("t", {
  id: text("id").primaryKey(),
  warehouseId: text("warehouse_id"),
  autre: text("autre"),
});

const dialecte = new SQLiteSyncDialect();
function rendre(f: Parameters<typeof conditionEntrepot>[1], options = {}) {
  const c = conditionEntrepot(t.warehouseId, f, options);
  return c ? dialecte.sqlToQuery(c) : null;
}

describe("conditionEntrepot", () => {
  it("aucune borne : aucune condition", () => {
    expect(rendre({ entrepot: null })).toBeNull();
  });

  it("un CHOIX précis est exact, même quand le défaut tolère le nul", () => {
    const q = rendre({ entrepot: "a", entrepots: ["a", "b"] }, { inclureSansEntrepot: true });
    expect(q?.sql).toContain('"warehouse_id" = ?');
    expect(q?.sql).not.toMatch(/is null/i);
    expect(q?.params).toEqual(["a"]);
  });

  it("le DÉFAUT « mes entrepôts » borne à l'ensemble", () => {
    const q = rendre({ entrepot: null, entrepots: ["a", "b"] });
    expect(q?.sql).toMatch(/"warehouse_id" in \(\?, \?\)/i);
    expect(q?.params).toEqual(["a", "b"]);
  });

  it("le défaut garde les lignes sans entrepôt là où le serveur le fait", () => {
    const q = rendre({ entrepot: null, entrepots: ["a"] }, { inclureSansEntrepot: true });
    expect(q?.sql).toMatch(/is null/i);
  });

  it("un ensemble VIDE ne rend rien, il n'ouvre pas tout", () => {
    expect(rendre({ entrepot: null, entrepots: [] })?.sql).toBe("1 = 0");
  });

  it("plusieurs colonnes : la ligne passe par l'une OU l'autre", () => {
    const c = conditionEntrepot([t.warehouseId, t.autre], { entrepot: "a" });
    const q = c ? dialecte.sqlToQuery(c) : null;
    expect(q?.sql).toMatch(/"warehouse_id" = \? or "t"\."autre" = \?|"warehouse_id" = \? or "autre" = \?/i);
  });
});

describe("retientEntrepot (le jumeau du journal)", () => {
  it("un choix précis est exact, l'inconnu ne passe que s'il est admis", () => {
    expect(retientEntrepot("a", { entrepot: "a" }, false)).toBe(true);
    expect(retientEntrepot("b", { entrepot: "a" }, true)).toBe(false);
    expect(retientEntrepot(null, { entrepot: "a" }, false)).toBe(false);
    expect(retientEntrepot(null, { entrepot: "a" }, true)).toBe(true);
  });

  it("le défaut « mes entrepôts » garde les siens et l'inconnu", () => {
    const f = { entrepot: null, entrepots: ["a"] };
    expect(retientEntrepot("a", f, false)).toBe(true);
    expect(retientEntrepot("b", f, false)).toBe(false);
    // Une ligne en file vient de ce terminal, donc de ce membre.
    expect(retientEntrepot(null, f, false)).toBe(true);
  });

  it("sans borne, tout passe", () => {
    expect(retientEntrepot("z", { entrepot: null }, false)).toBe(true);
  });
});
