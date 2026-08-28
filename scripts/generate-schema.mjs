/**
 * Engendre le schéma local des tables tirées, depuis le manifeste du serveur.
 *
 * 464 colonnes recopiées à la main, c'est autant d'occasions de se tromper, et
 * un champ ajouté au backend n'aurait jamais atteint le mobile sans que
 * quelqu'un y pense. Le serveur décrit ses colonnes, ce script en tire du
 * Drizzle. Le fichier produit est VERSIONNÉ : c'est du code source, et sa
 * régénération se relit en diff.
 *
 *   VF_API=http://192.168.0.185:8005/api/v1 \
 *   VF_EMAIL=... VF_PASSWORD=... node scripts/generate-schema.mjs
 */
import { writeFileSync } from "node:fs";

const API = process.env.VF_API ?? "http://127.0.0.1:8005/api/v1";
const EMAIL = process.env.VF_EMAIL;
const PASSWORD = process.env.VF_PASSWORD;
const SORTIE = "src/db/schema/pulled.ts";

if (!EMAIL || !PASSWORD) {
  console.error("VF_EMAIL et VF_PASSWORD sont requis.");
  process.exit(1);
}

const json = async (url, options) => {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`${url} -> ${res.status} ${await res.text()}`);
  return res.json();
};

const { access, user } = await json(`${API}/auth/login/`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
});
const org = user.organizations?.[0]?.id;
if (!org) throw new Error("Ce compte n'appartient à aucun établissement.");

const manifest = await json(`${API}/sync/pull/manifest/`, {
  headers: { Authorization: `Bearer ${access}`, "X-Organization-ID": org },
});

/** snake_case -> camelCase, pour la propriété TypeScript. */
const camel = (s) => s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());

/** Nom de la table -> identifiant TypeScript exporté. */
const ident = (name) => camel(name);

/**
 * Un type de colonne, rendu en Drizzle.
 *
 * Une décimale devient du TEXTE : un panier en francs congolais à sept chiffres
 * perd ses unités en virgule flottante. Un horodatage devient un entier de
 * millisecondes, non ambigu à trier, converti à l'ingestion depuis l'ISO du
 * serveur.
 */
function column(col) {
  const n = `"${col.name}"`;
  let expr;
  switch (col.kind) {
    case "boolean":
      expr = `integer(${n}, { mode: "boolean" })`;
      break;
    case "integer":
      expr = `integer(${n})`;
      break;
    case "real":
      expr = `real(${n})`;
      break;
    case "datetime":
    case "date":
      expr = `integer(${n}, { mode: "timestamp_ms" })`;
      break;
    default: // text, decimal, json
      expr = `text(${n})`;
  }
  if (col.pk) expr += ".primaryKey()";
  else if (!col.null) expr += ".notNull()";
  return `  ${camel(col.name)}: ${expr},`;
}

/**
 * Index dont on sait déjà qu'ils serviront.
 *
 * Curés, pas devinés : chacun correspond à une lecture que l'application fait
 * des dizaines de fois par heure. Le scan d'un code-barres au comptoir cherche
 * dans le catalogue entier ; sans index, chaque scan balaie tout.
 */
const INDEXES = {
  products: [
    ["barcode"],       // scan au point de vente
    ["sku"],
    ["name"],          // recherche par nom
    ["category_id"],
    ["is_active"],
  ],
  product_variants: [["product_id"], ["barcode"]],
  stocks: [["product_id", "warehouse_id"], ["warehouse_id"]],
  stock_batches: [["product_id", "warehouse_id"], ["expiry_date"]],
  sale_items: [["sale_id"], ["product_id"]],
  payments: [["sale_id"]],
  sales: [["status"], ["customer_id"], ["sale_date"], ["register_id"]],
  stock_movements: [["product_id"], ["warehouse_id"], ["created_at"]],
  customers: [["phone"], ["name"], ["is_active"]],
  customer_balances: [["customer_id"]],
  customer_transactions: [["customer_id"]],
  customer_loyalty: [["customer_id"]],
  cash_movements: [["movement_date"]],
  expenses: [["expense_date"], ["status"]],
  register_sessions: [["register_id"], ["status"]],
  categories: [["parent_id"]],
  organization_currencies: [["currency_id"]],
};

/**
 * Index d'une table, VALIDÉS contre ses colonnes réelles.
 *
 * Une colonne mal orthographiée dans la liste curée engendrerait du TypeScript
 * qui ne compile pas, et le message pointerait le fichier engendré plutôt que
 * sa cause. On avertit ici, à l'endroit où l'on peut corriger.
 */
function indexesFor(name, columns) {
  const listes = INDEXES[name];
  if (!listes) return { lines: [] };

  const connues = new Set(columns.map((c) => c.name));
  const lines = [];
  for (const cols of listes) {
    const absentes = cols.filter((c) => !connues.has(c));
    if (absentes.length) {
      console.warn(
        `  ignoré : index ${name}(${cols.join(", ")}) — colonne(s) inconnue(s) : ${absentes.join(", ")}`
      );
      continue;
    }
    lines.push(
      `    index("${name}_${cols.join("_")}_idx").on(${cols
        .map((c) => `t.${camel(c)}`)
        .join(", ")}),`
    );
  }
  return { lines };
}

function table(name, columns, extra = []) {
  const lines = columns.map(column);
  const idx = indexesFor(name, columns);
  const fin = idx.lines?.length
    ? [`}, (t) => [`, ...idx.lines, `]);`]
    : [`});`];
  return [
    `export const ${ident(name)} = sqliteTable("${name}", {`,
    ...lines,
    ...extra,
    ...fin,
    ``,
    `export type ${ident(name).replace(/^./, (c) => c.toUpperCase())}Row =`,
    `  typeof ${ident(name)}.$inferSelect;`,
    ``,
  ].join("\n");
}

const blocs = [];
for (const t of manifest.tables) {
  blocs.push(table(t.name, t.columns));
  for (const child of t.children) {
    // Les enfants sont remplacés en bloc avec leur parent : ils portent la clé
    // du parent, indexée, parce que c'est par elle qu'on les efface.
    blocs.push(table(child.table, child.columns));
  }
}

const total = manifest.tables.reduce((n, t) => n + t.columns.length, 0);

const entete = `/**
 * Tables tirées du serveur. FICHIER ENGENDRÉ, ne pas modifier à la main.
 *
 *   pnpm db:pull-schema
 *
 * Ces tables sont en LECTURE SEULE côté client : elles reflètent l'état du
 * serveur, et toute écriture locale passe par le journal d'opérations. Les
 * modifier ici ferait diverger le schéma de ce que le serveur envoie, en
 * silence, jusqu'au premier écran qui affiche une valeur absente.
 *
 * Contrat de tirage : version ${manifest.schema_version}
 * ${manifest.tables.length} tables, ${total} colonnes.
 */
import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

`;

writeFileSync(SORTIE, entete + blocs.join("\n"));
console.log(
  `  ${SORTIE} : ${manifest.tables.length} tables, ${total} colonnes, contrat v${manifest.schema_version}`
);
