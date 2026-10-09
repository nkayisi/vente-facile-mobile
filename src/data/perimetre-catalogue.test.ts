/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE TEST LIT LE SQL ENGENDRÉ, PAS SEULEMENT LA DÉCISION.                 │
 * │                                                                          │
 * │ Une condition mal formée ne lève pas à la compilation : elle lève à      │
 * │ l'exécution, et `useLecture` avale ses erreurs - l'écran se vide         │
 * │ simplement, ce qui se lit comme un catalogue absent. C'est très          │
 * │ exactement le défaut que T1 vient de refermer, et on ne le rouvre pas    │
 * │ par la porte d'à côté.                                                   │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { QueryBuilder } from "drizzle-orm/sqlite-core";

import { products } from "@/db/schema";

import {
  conditionCatalogue,
  entrepotsDuCatalogue,
} from "./perimetre-catalogue";

/** Le SQL que la condition produit, tel que SQLite le recevra. */
function sqlDe(entrepots: string[] | null) {
  const q = new QueryBuilder()
    .select({ id: products.id })
    .from(products)
    .where(conditionCatalogue(entrepots));
  return q.toSQL();
}

describe("les entrepôts qui bornent le catalogue", () => {
  it("le propriétaire n'a AUCUNE restriction", () => {
    // `null`, jamais `[]` : son accès vient de son rôle, pas d'une affectation.
    expect(entrepotsDuCatalogue("owner", [])).toBeNull();
    expect(entrepotsDuCatalogue("owner", [{ id: "wh-1" }])).toBeNull();
  });

  it("un rôle borné rend SES dépôts", () => {
    expect(entrepotsDuCatalogue("cashier", [{ id: "wh-1" }])).toEqual(["wh-1"]);
    expect(entrepotsDuCatalogue("manager", [{ id: "a" }, { id: "b" }])).toEqual(["a", "b"]);
  });

  it("un rôle borné SANS affectation rend une liste vide, et non `null`", () => {
    // ┌──────────────────────────────────────────────────────────────────┐
    // │ LES DEUX SONT OPPOSÉS : `null` ouvre tout, `[]` ne laisse passer │
    // │ que les articles non suivis. Les confondre ouvrirait le catalogue│
    // │ entier au membre qui n'a droit à rien.                           │
    // └──────────────────────────────────────────────────────────────────┘
    expect(entrepotsDuCatalogue("manager", [])).toEqual([]);
    expect(entrepotsDuCatalogue(null, [])).toEqual([]);
  });
});

describe("la condition SQL du catalogue", () => {
  it("ne borne RIEN pour le propriétaire", () => {
    expect(conditionCatalogue(null)).toBeUndefined();
    expect(sqlDe(null).sql).not.toMatch(/where/i);
  });

  it("sans dépôt accessible, seuls les articles non suivis passent", () => {
    const { sql, params } = sqlDe([]);
    expect(sql).toMatch(/"track_inventory" = \?/);
    expect(params).toEqual([0]);
    // Aucune sous-requête : il n'y a aucun dépôt où chercher.
    expect(sql).not.toMatch(/exists/i);
  });

  it("borne par une SOUS-REQUÊTE, jamais par une jointure", () => {
    // ┌──────────────────────────────────────────────────────────────────┐
    // │ La relation est INVERSE : un article porte une ligne de stock    │
    // │ PAR entrepôt. Une jointure le rendrait une fois par dépôt        │
    // │ accessible, ce qui fausserait aussi les `count(*)`. Le serveur    │
    // │ s'en sort par `distinct()` ; une sous-requête l'évite à la source.│
    // └──────────────────────────────────────────────────────────────────┘
    const { sql, params } = sqlDe(["wh-1", "wh-2"]);
    expect(sql).toMatch(/exists/i);
    expect(sql).not.toMatch(/join/i);
    expect(sql).not.toMatch(/distinct/i);
    expect(params).toEqual([0, "wh-1", "wh-2"]);
  });

  it("l'article non suivi reste visible, et c'est la moitié de la règle", () => {
    // Un service, une prestation, un emballage interne n'a de ligne de stock
    // dans AUCUN entrepôt : l'écarter le rendrait invendable partout.
    expect(sqlDe(["wh-1"]).sql).toMatch(/"track_inventory" = \? or exists/i);
  });

  it("la sous-requête lie bien l'article à SES lignes de stock", () => {
    // Sans la corrélation, `exists` serait vrai dès qu'un stock existe
    // quelque part : la condition laisserait passer tout le catalogue.
    const { sql } = sqlDe(["wh-1"]);
    expect(sql).toMatch(/"product_id" = "products"\."id"/);
    expect(sql).toMatch(/"warehouse_id" in/);
  });
});

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE TEST LIT LA SOURCE DU SERVEUR, IL NE RECOPIE PAS SA RÈGLE.           │
 * │                                                                          │
 * │ Une règle de périmètre écrite à deux endroits finit par donner deux      │
 * │ périmètres, et ce dépôt l'a déjà payé : `CashMovementViewSet` et         │
 * │ `reports/_scope_cash_movements` en portaient deux, si bien que le même   │
 * │ gérant lisait un solde au Livre de caisse et un AUTRE au tableau de      │
 * │ bord. Ici la divergence se verrait encore moins : les deux surfaces      │
 * │ rendraient simplement des catalogues différents.                         │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
describe("parité avec la règle du serveur", () => {
  const SOURCE = join(
    __dirname,
    "../../../../backend/apps/core/warehouse_scope.py"
  );

  it("le balayage MORD : la fonction serveur est bien là", () => {
    // Un fichier introuvable doit faire ÉCHOUER ce test en nommant le chemin,
    // jamais le faire passer - un garde-fou muet est pire qu'aucun garde-fou.
    const code = readFileSync(SOURCE, "utf8");
    expect(code).toContain("def filter_products_by_warehouse_ids");
  });

  it("le serveur borne sur les deux mêmes membres que nous", () => {
    const code = readFileSync(SOURCE, "utf8");
    const corps = code.slice(code.indexOf("def filter_products_by_warehouse_ids"));

    // Les deux moitiés de la règle : l'article non suivi, et la ligne de stock
    // dans un entrepôt accessible.
    expect(corps).toMatch(/track_inventory=False/);
    expect(corps).toMatch(/stocks__warehouse_id__in=ids/);

    // Et le OU qui les réunit : un ET rendrait invendable partout tout article
    // suivi, ce qui est l'inverse de la règle.
    const regle = corps.slice(0, corps.indexOf(".distinct()"));
    expect(regle).toMatch(/\|/);
  });

  it("`None` ouvre tout côté serveur aussi", () => {
    const code = readFileSync(SOURCE, "utf8");
    const corps = code.slice(code.indexOf("def filter_products_by_warehouse_ids"));
    expect(corps).toMatch(/if ids is None:\s*\n\s*return queryset/);
  });
});
