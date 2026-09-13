/**
 * Engendre `src/ui/icons/registre.ts` depuis les paquets lucide.
 *
 * Le registre n'est pas recopie a la main : il est DERIVE, comme le schema tire
 * l'est du manifeste serveur. Motif : lucide renomme ses glyphes d'une version
 * majeure a l'autre, et le web (lucide-react 0.563) n'est pas sur la meme que le
 * mobile (lucide-react-native 1.x). `BarChart3` cote web est `ChartColumn` cote
 * mobile, `AlertTriangle` est `TriangleAlert`, `Filter` est `Funnel`.
 *
 * On ne devine pas ces correspondances : on suit la chaine d'alias que le paquet
 * web publie lui-meme (`export { default } from './chart-column.js'`), ce qui
 * donne le nom canonique, puis on verifie que le mobile porte le meme glyphe.
 * Une table ecrite a la main aurait vieilli en silence.
 *
 *   node scripts/generer-registre-icones.mjs
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const WEB = "../../frontend/node_modules/lucide-react/dist/esm/icons";
const MOB = "node_modules/lucide-react-native/dist/esm/icons";
const SORTIE = "src/ui/icons/registre.ts";

/**
 * Noms tels qu'ils sont ECRITS DANS LE CODE WEB.
 *
 * C'est volontaire : on garde le vocabulaire du back-office pour que le miroir
 * se relise a l'oeil entre `frontend/components/layout/sidebar.tsx` et
 * `src/navigation/menu.ts`. La traduction vers le nom mobile est faite ici.
 */
const DEMANDES = [
  // Les 11 entrees de la barre laterale web, dans son ordre.
  "LayoutDashboard", "ShoppingCart", "Package", "Boxes", "ClipboardList",
  "Wallet", "BarChart3", "Users", "UserCog", "Crown", "Settings",
  // Coquille, navigation, en-tetes.
  "Store", "ChevronRight", "ChevronLeft", "ChevronDown", "ChevronUp", "ArrowRight",
  "ArrowLeft", "X", "Plus", "Menu", "MoreVertical", "MoreHorizontal", "Check",
  "Search", "Filter",
  // Etats, retours, gardes.
  "CheckCircle2", "AlertTriangle", "AlertCircle", "Info", "Lock", "ShieldAlert",
  "Ban", "XCircle", "Inbox",
  // Actions.
  "Trash2", "RefreshCw", "LogOut", "Save", "Download", "Upload", "Eye", "EyeOff",
  "Pencil",
  // Domaine.
  // `Phone` et `Mail` viennent de la fiche client du back-office. Ils
  // manquaient, et la fiche mobile affichait une devanture de boutique en face
  // d'un numéro de téléphone.
  "Phone", "Mail",
  "User", "UserPlus", "Key", "Cpu", "Printer", "CloudDownload", "PauseCircle",
  "Warehouse", "Banknote", "Coins", "Gift", "TrendingDown", "TrendingUp",
  "PackageX", "Activity", "ArrowLeftRight", "SlidersHorizontal", "FolderTree",
  "Tag", "Ruler", "FileText", "FileSpreadsheet", "MapPin", "Truck", "Receipt",
  // ⚠ `Table` était dans le registre SANS être dans cette liste : il y avait été
  // ajouté à la main, contre la consigne en tête du fichier engendré. La
  // régénération suivante l'a donc effacé, et `features/export/feuille-format`
  // a cessé de compiler. Une entrée qui ne vit que dans le fichier ENGENDRÉ ne
  // survit pas à la commande qui l'engendre : elle se déclare ICI.
  "Table",
  "Calculator", "Percent", "CreditCard", "Calendar", "Clock", "ArrowUpRight",
  "ArrowDownRight", "Bell", "Sparkles",
  // Types d'etablissement, grille d'inscription.
  "Building2", "Pill", "UtensilsCrossed",
  // Photo d'un article : `ImagePlus` est l'icone du champ photo du back-office
  // (`components/products/product-image-field.tsx`), `Camera` la prise directe,
  // que le web n'a pas - il n'a pas d'appareil photo sous la main.
  "ImagePlus", "Camera",
  // Bascule de theme, dans le pied du tiroir. Le back-office n'a AUCUN
  // selecteur - sa palette sombre existe, son habillage est code en clair - il
  // n'y a donc rien a mettre en miroir. Meme cas que `Camera`. On reste
  // neanmoins chez lucide et non chez Ionicons : la bascule se pose a quelques
  // points du `LogOut`, et deux familles cote a cote font changer l'epaisseur
  // de trait au milieu d'une rangee.
  "Monitor", "Sun", "Moon",
  // Etat HORS LIGNE de l'indicateur de synchronisation de la barre du haut.
  // `CloudDownload` dit le tirage en cours, `CloudOff` dit qu'il n'y a pas de
  // reseau : un nuage barre se lit sans legende, la ou une icone d'alerte
  // ferait croire a un refus du serveur. Le back-office n'a AUCUN indicateur
  // de ce genre - il ne travaille jamais hors ligne - il n'y a donc rien a
  // mettre en miroir. Meme cas que `Camera` et la bascule de theme.
  "CloudOff",
];

/** `CheckCircle2` -> `check-circle-2`. Les chiffres se detachent aussi. */
function kebab(nom) {
  return nom
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1-$2")
    .replace(/([a-zA-Z])(\d)/g, "$1-$2")
    .toLowerCase();
}

/** Suit `export { default } from './x.js'` jusqu'au fichier qui porte le trace. */
function canonique(dir, nom, ext, vus = new Set()) {
  const f = `${dir}/${nom}${ext}`;
  if (!existsSync(f) || vus.has(nom)) return null;
  vus.add(nom);
  const src = readFileSync(f, "utf8");
  const alias = src.match(/export \{ default \} from '\.\/([a-z0-9-]+)\.m?js'/);
  return alias ? canonique(dir, alias[1], ext, vus) : nom;
}

/**
 * Signature du dessin : couples type/attributs, sans les `key`, TRIES.
 *
 * Le tri n'est pas cosmetique. lucide reordonne les parties d'un glyphe sans le
 * redessiner (`clock` passe de [path, circle] a [circle, path] entre 0.563 et
 * 1.x) : comparer dans l'ordre du fichier signalerait une divergence la ou il
 * n'y a qu'un remaniement de source.
 */
function trace(dir, nom, ext) {
  const src = readFileSync(`${dir}/${nom}${ext}`, "utf8");
  return [...src.matchAll(/\["([a-z]+)", \{ ([^}]*) \}\]/g)]
    .map(([, t, a]) => `${t}|${a.replace(/,?\s*key: "[^"]*"/, "").trim()}`)
    .sort()
    .join(" ; ");
}

/**
 * Glyphes que lucide a REELLEMENT redessines entre la version du web (0.563) et
 * celle du mobile (1.x), et que l'on accepte tels quels.
 *
 * Le concept est le meme et l'ecart ne se voit pas a 20 points ; le corriger
 * demanderait soit d'aligner le web sur lucide v1 (une soixantaine de pages a
 * revoir, hors de ce lot), soit de recopier les traces a la main, ce qui
 * reintroduirait la table figee que ce generateur existe pour eviter.
 *
 * Cette liste est une ALLOWLIST : toute divergence NON listee fait echouer la
 * generation. C'est elle qui empeche une derive future de passer inapercue.
 */
const DIVERGENCES_ACCEPTEES = new Map([
  ["Calendar", "reproportionne : encoches 2v4 -> 2v3, filet a y=9 au lieu de 10"],
  ["Coins", "redessine et MIROITE : la grande piece passe de gauche a droite"],
  ["Ban", "redessine"],
  ["Gift", "redessine"],
  ["PackageX", "redessine"],
  ["Receipt", "redessine"],
]);

const webDispo = existsSync(WEB);
if (!webDispo) {
  console.error(
    `AVERTISSEMENT : ${WEB} est absent (node_modules du web non installes).\n` +
    `La resolution d'alias et la comparaison de traces sont sautees : le registre\n` +
    `est engendre depuis les seuls noms mobiles. Relancer avec le web installe\n` +
    `avant de committer.`
  );
}

const lignes = [];
const echecs = [];
const renommes = [];
const divergences = [];

for (const nomWeb of DEMANDES) {
  const kWeb = kebab(nomWeb);
  let kFinal = kWeb;

  if (webDispo) {
    const c = canonique(WEB, kWeb, ".js");
    if (!c) { echecs.push(`${nomWeb} : absent du paquet web`); continue; }
    kFinal = c;
    if (c !== kWeb) renommes.push(`${nomWeb} (${kWeb}) -> ${c}`);
  }

  if (!existsSync(`${MOB}/${kFinal}.mjs`)) {
    echecs.push(`${nomWeb} : « ${kFinal} » absent du paquet mobile`);
    continue;
  }

  if (webDispo) {
    const a = trace(WEB, kFinal, ".js");
    const b = trace(MOB, kFinal, ".mjs");
    if (a && b && a !== b) {
      const raison = DIVERGENCES_ACCEPTEES.get(nomWeb);
      if (!raison) {
        echecs.push(
          `${nomWeb} : le TRACE diverge entre web et mobile, et la divergence ` +
          `n'est pas declaree. Comparer les deux glyphes, puis l'ajouter a ` +
          `DIVERGENCES_ACCEPTEES avec sa raison, ou corriger le nom demande.`
        );
        continue;
      }
      divergences.push(`${nomWeb} : ${raison}`);
    }
  }

  lignes.push({ nomWeb, fichier: kFinal });
}

if (echecs.length) {
  console.error("Echecs :");
  echecs.forEach((e) => console.error("  " + e));
  process.exit(1);
}

const entete = `/**
 * Registre d'icones. FICHIER ENGENDRE - ne pas modifier a la main.
 *
 *   node scripts/generer-registre-icones.mjs
 *
 * Les noms sont ceux du CODE WEB (\`frontend/components/layout/sidebar.tsx\` et
 * les pages du back-office), pour que le miroir se relise a l'oeil. Le fichier
 * importe derriere peut porter un autre nom : lucide renomme d'une version
 * majeure a l'autre et le web n'est pas sur la meme que le mobile. La chaine
 * d'alias du paquet web donne le nom canonique, le generateur verifie ensuite
 * que le glyphe mobile a EXACTEMENT le meme trace.
 *
 * Pourquoi un registre et pas \`import { X } from "lucide-react-native"\` : le
 * barrel reexporte plus de 3 500 icones et Metro ne sait pas les elaguer de
 * facon fiable. Ici, ce qui n'est pas liste n'entre pas dans le paquet.
 *
 * ${lignes.length} glyphes.${renommes.length ? `\n *\n * Renommes entre les deux versions de lucide :\n${renommes.map((r) => ` *   ${r}`).join("\n")}` : ""}${divergences.length ? `\n *\n * Redessines par lucide entre 0.563 (web) et 1.x (mobile), ecart assume :\n${divergences.map((d) => ` *   ${d}`).join("\n")}` : ""}
 */
`;

const imports = lignes
  .map(({ nomWeb, fichier }) => `import ${nomWeb} from "lucide-react-native/icons/${fichier}";`)
  .join("\n");

const table = lignes.map(({ nomWeb }) => `  ${nomWeb},`).join("\n");

mkdirSync(dirname(SORTIE), { recursive: true });
writeFileSync(
  SORTIE,
  `${entete}\n${imports}\n\nexport const LUCIDE = {\n${table}\n} as const;\n\nexport type NomLucide = keyof typeof LUCIDE;\n`
);

console.log(`${SORTIE} : ${lignes.length} glyphes.`);
if (divergences.length) {
  console.log(`${divergences.length} redessines par lucide, ecart assume :`);
  divergences.forEach((d) => console.log("  " + d));
}
if (renommes.length) {
  console.log(`${renommes.length} renommes entre lucide-react et lucide-react-native :`);
  renommes.forEach((r) => console.log("  " + r));
}
