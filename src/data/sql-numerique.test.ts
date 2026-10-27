/**
 * Toute colonne numérique comparée en SQL est CASTÉE.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ EN SQLITE, UN REAL COMPARÉ À UN TEXT EST TOUJOURS INFÉRIEUR.             │
 * │                                                                          │
 * │ Le texte trie après tous les nombres, par ordre de classe de stockage.   │
 * │ Or une décimale du serveur descend au tirage sous forme de TEXTE : c'est │
 * │ la doctrine du dépôt, parce qu'un panier en francs congolais à sept      │
 * │ chiffres perd ses unités en virgule flottante.                          │
 * │                                                                          │
 * │ Le jour où `reorder_point` est passé de `PositiveIntegerField` à          │
 * │ `DecimalField` - pour qu'un commerce qui pèse puisse alerter à 2,5 kg -  │
 * │ sa colonne locale est passée d'`integer()` à `text()`. Sans `cast`,      │
 * │ `seuil > 0` devenait TOUJOURS vrai et `quantite <= seuil` aussi : TOUT   │
 * │ produit suivi se serait affiché « Stock bas », sur l'écran dont le métier │
 * │ est précisément de dire ce qu'il faut réapprovisionner. Aucune erreur,   │
 * │ aucun journal, et un magasinier cesse de lire une liste qui signale tout.│
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ CE GARDE-FOU EST TEXTUEL, et c'est un pis-aller assumé : aucune suite de
 * ce dépôt n'exécute de SQLite, donc on ne peut pas DÉMONTRER le comportement,
 * seulement exiger la discipline qui s'en protège. Il reste plus fort que rien,
 * parce que le défaut qu'il attrape ne se voit sur aucun écran avant le
 * comptoir d'un marchand.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const RACINE = resolve(__dirname, "..");
const DATA = join(RACINE, "data");

/**
 * Ce qui dénote un NOMBRE dans un nom de colonne.
 *
 * Les colonnes de texte véritable (nom, code, référence, note) n'en portent
 * aucun : c'est ce qui rend la règle utilisable sans liste à tenir à jour.
 */
const NOM_NUMERIQUE =
  /^(?:.*(?:[Qq]uantity|[Aa]mount|[Pp]rice|[Tt]otal|[Bb]alance|[Cc]ost|[Rr]ate|[Pp]oints|[Ll]evel|[Pp]oint|[Ff]actor|[Dd]iscount|[Ss]ubtotal|[Tt]ax))$/;

/** Une interpolation de colonne dans un gabarit `sql`. */
const COLONNE = /\$\{([a-zA-Z][\w]*)\.([a-zA-Z][\w]*)\}/g;

function fichiersData(): string[] {
  return readdirSync(DATA)
    .filter((n) => n.endsWith(".ts") && !n.endsWith(".test.ts"))
    .map((n) => join(DATA, n));
}

/** Les interpolations numériques qui ne sont pas castées. */
function sansCast(code: string): { ligne: number; extrait: string }[] {
  const fautifs: { ligne: number; extrait: string }[] = [];
  COLONNE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = COLONNE.exec(code)) !== null) {
    if (!NOM_NUMERIQUE.test(m[2])) continue;
    // `cast(` doit précéder l'interpolation, éventuellement à travers des
    // appels imbriqués : `cast(coalesce(${x}, 0) as real)` est la forme que le
    // dépôt emploie déjà, et elle est juste. Trente caractères suffisent, et
    // chercher plus loin attraperait le `cast` d'une expression voisine.
    const avant = code.slice(Math.max(0, m.index - 30), m.index);
    if (/\bcast\(\s*(?:\w+\(\s*)*$/.test(avant)) continue;
    fautifs.push({
      ligne: code.slice(0, m.index).split("\n").length,
      extrait: code.slice(Math.max(0, m.index - 45), m.index + m[0].length + 20).trim(),
    });
  }
  return fautifs;
}

describe("comparaisons SQL de colonnes numériques", () => {
  it("balaie bien quelque chose", () => {
    // Un balayage qui ne balaie rien passe au vert et ne prouve rien : ce
    // dépôt l'a payé cinq fois.
    const fichiers = fichiersData();
    expect(fichiers.length).toBeGreaterThan(20);
    const total = fichiers.reduce(
      (n, f) => n + (readFileSync(f, "utf8").match(COLONNE)?.length ?? 0),
      0
    );
    expect(total).toBeGreaterThan(15);
  });

  it("aucune colonne numérique n'est interpolée sans `cast`", () => {
    const fautifs: string[] = [];
    for (const f of fichiersData()) {
      for (const { ligne, extrait } of sansCast(readFileSync(f, "utf8"))) {
        fautifs.push(`${relative(RACINE, f)}:${ligne} ${extrait}`);
      }
    }
    expect(fautifs).toEqual([]);
  });

  it("le garde-fou VOIT une interpolation nue, et laisse passer un cast", () => {
    expect(sansCast("sql`coalesce(${products.reorderPoint}, 0) > 0`")).toHaveLength(1);
    expect(sansCast("sql`${stocks.quantity} <= 0`")).toHaveLength(1);
    expect(sansCast("sql`cast(${products.reorderPoint} as real)`")).toHaveLength(0);
    expect(sansCast("sql`sum(cast(${sales.total} as real))`")).toHaveLength(0);
    // La forme imbriquée que le dépôt emploie déjà, et qui est juste.
    expect(
      sansCast("sql`cast(coalesce(${stocks.reservedQuantity}, 0) as real)`")
    ).toHaveLength(0);
    // Une colonne de TEXTE véritable n'est pas concernée.
    expect(sansCast("sql`${products.name} like ${terme}`")).toHaveLength(0);
    expect(sansCast("sql`${stockMovements.notes} like ${terme}`")).toHaveLength(0);
  });
});
