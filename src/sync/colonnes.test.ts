import { colonnesTirees } from "@/db/tables";

import { colonnesEcrites } from "./colonnes";
import type { ColumnSpec } from "./types";

const col = (name: string): ColumnSpec => ({ name, kind: "text", null: true, pk: false });

describe("colonnesEcrites", () => {
  const connues = new Map([["warehouses", new Set(["id", "name"])]]);

  it("ignore une colonne que le manifeste nomme encore et que le schéma local a retirée", () => {
    const ecrites = colonnesEcrites(
      "warehouses",
      [col("id"), col("name"), col("allow_negative_stock")],
      connues
    );
    expect(ecrites.map((c) => c.name)).toEqual(["id", "name"]);
  });

  it("une table inconnue garde toutes ses colonnes, pour échouer bruyamment", () => {
    const ecrites = colonnesEcrites("inconnue", [col("id"), col("x")], connues);
    expect(ecrites.map((c) => c.name)).toEqual(["id", "x"]);
  });
});

describe("le schéma local", () => {
  it("connaît bien les tables tirées, et leurs colonnes par leur nom SQL", () => {
    // Un balayage qui ne balaie rien passerait au vert : on compte d'abord.
    const carte = colonnesTirees();
    expect(carte.size).toBeGreaterThan(30);
    expect(carte.get("warehouses")?.has("is_active")).toBe(true);
    expect(carte.get("products")?.has("selling_price")).toBe(true);
  });

  it("ne porte plus `allow_negative_stock` (lot E10)", () => {
    // Le serveur la nomme encore dans son manifeste, pour les terminaux
    // anciens : ce terminal l'ignore, et c'est ce qui permettra au serveur de
    // la retirer une fois le parc à jour.
    const carte = colonnesTirees();
    expect(carte.get("warehouses")?.has("allow_negative_stock")).toBe(false);
    expect(carte.get("products")?.has("allow_negative_stock")).toBe(false);
  });
});
