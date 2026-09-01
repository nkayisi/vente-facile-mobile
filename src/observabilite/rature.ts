/**
 * Ce qui ne doit jamais sortir du terminal dans un rapport de plantage.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ MODULE PUR, SANS AUCUN IMPORT DU SDK.                                    │
 * │                                                                          │
 * │ C'est délibéré : importer `@sentry/react-native` depuis un test le fait  │
 * │ démarrer, et Jest se plaint alors d'une poignée restée ouverte. Une      │
 * │ fonction d'expression régulière n'a aucune raison de traîner un module   │
 * │ natif derrière elle.                                                     │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ON NE RATURE QUE CE QU'ON SAIT NOMMER.                                   │
 * │                                                                          │
 * │ Une expression régulière large ne distingue pas un numéro de téléphone   │
 * │ d'un montant, d'un horodatage ou d'un numéro de document - ce sont tous  │
 * │ des chiffres séparés par des espaces et des tirets. Une première version │
 * │ ratura `\+?\d[\d\s().-]{7,}\d`, et elle mangeait :                        │
 * │                                                                          │
 * │   « Total 12 500 000.00 CDF »  →  « Total [numéro] CDF »                 │
 * │   « 2026-08-31 00:46:47 »      →  « [numéro]:46:47 »                     │
 * │                                                                          │
 * │ Le second cas est le plus grave : un horodatage n'est pas une donnée     │
 * │ personnelle, et c'est la première chose qu'on lit dans un rapport. Une   │
 * │ rature qui détruit le diagnostic sans rien protéger est pire qu'aucune   │
 * │ rature, parce qu'elle donne le sentiment du devoir accompli.             │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Chaque motif est donc ANCRÉ sur une forme qui ne peut être que ce qu'elle
 * prétend : un `+` de préfixe international ou un `0` national pour un
 * téléphone, une devise accolée pour un montant, un `@` pour un courriel. Ce
 * qui reste - références de document, dates, quantités - est précisément ce qui
 * rend un rapport lisible.
 */

/**
 * Les ratures elles-mêmes, appliquées dans l'ordre.
 *
 * On rature sur la CHAÎNE rendue, pas sur des champs nommés : un message
 * d'erreur porte souvent la donnée en clair (« Client Nelly Kayisi
 * +243997876765 : solde insuffisant »), et aucune liste de champs n'attrape
 * cela.
 *
 * L'ordre compte, et le montant passe en premier : sa devise l'identifie sans
 * ambiguïté, et le retirer tôt évite qu'un solde à sept chiffres ressorte plus
 * loin sous une autre étiquette.
 */
const RATURES: { motif: RegExp; par: string }[] = [
  // Un MONTANT est ancré sur sa devise, et c'est cet ancrage qui rend la
  // rature sûre : l'application interdit déjà `money(x, "")`, donc un montant
  // affiché porte toujours son code ou son symbole. Sans cet ancrage, le motif
  // avalerait « 3 restants », « 2026-08-31 » et « VT-20260830-JJK6-0042 ».
  // Les espaces fine et insécable sont ceux qu'emploie le formateur français.
  {
    motif:
      /[$\u20ac][ \u00a0\u202f]*\d(?:[\d \u00a0\u202f.,]*\d)?|\d(?:[\d \u00a0\u202f.,]*\d)?[ \u00a0\u202f]*(?:(?:CDF|USD|EUR|FC)\b|[$\u20ac])/g,
    par: "[montant]",
  },
  { motif: /[\w.+-]+@[\w-]+\.[\w.]+/g, par: "[courriel]" },
  // Jetons : « Bearer eyJ… », et les UUID, qui désignent un client précis.
  { motif: /Bearer\s+[\w.\-]+/gi, par: "Bearer [jeton]" },
  {
    motif: /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
    par: "[id]",
  },
  // TÉLÉPHONES, et seulement eux : préfixe international `+243 997 876 765`,
  // ou forme nationale `0997876765`. Exiger un `+` ou un `0` SUIVI D'UN
  // CHIFFRE écarte d'un coup les montants, les dates et les références, qui ne
  // commencent ni par l'un ni par l'autre.
  { motif: /\+\d[\d\s().-]{6,17}\d/g, par: "[numéro]" },
  { motif: /\b0\d[\d\s().-]{6,15}\d/g, par: "[numéro]" },
];

/**
 * Profondeur au-delà de laquelle on cesse de descendre.
 *
 * Large à dessein : un événement Sentry porte la pile d'appels à
 * `exception.values[0].stacktrace.frames[i].vars.…`, soit huit niveaux avant
 * la moindre donnée intéressante. Une borne à six coupait DANS les cadres de
 * pile.
 */
const PROFONDEUR_MAX = 24;

/** Ce qui remplace un sous-arbre qu'on a renoncé à parcourir. */
const TRONQUE = "[tronqué]";

/**
 * Rature récursivement les chaînes d'une structure, sans en changer la forme.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN GARDE-FOU DE PARCOURS SE FERME, IL NE S'OUVRE PAS.                    │
 * │                                                                          │
 * │ La borne de profondeur rendait le sous-arbre TEL QUEL. Or `beforeSend`   │
 * │ parcourt l'événement entier : une erreur d'API sérialisée profondément   │
 * │ - c'est leur place habituelle, sous `extra` ou sous les variables d'un   │
 * │ cadre de pile - repartait donc en clair, téléphone du client compris.    │
 * │ Le garde-fou existe contre les CYCLES ; échouer en laissant passer la    │
 * │ donnée est exactement l'inverse de ce qu'il doit faire.                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * La signature est `unknown -> unknown` À DESSEIN : un générique se ferait
 * rétrécir en `T & string` dans la branche des chaînes, et le compilateur
 * refuserait de rendre la version raturée. Les deux appelants savent ce qu'ils
 * ont passé et le redisent, ce qui est plus honnête qu'un générique qui ment.
 */
export function raturer(
  valeur: unknown,
  profondeur = 0,
  ancetres: Set<object> = new Set()
): unknown {
  if (typeof valeur === "string") {
    let sortie = valeur;
    for (const r of RATURES) sortie = sortie.replace(r.motif, r.par);
    return sortie;
  }
  if (valeur === null || typeof valeur !== "object") return valeur;

  // Un cycle, ou une structure absurdement profonde : on ne rend RIEN de son
  // contenu. C'est le seul choix sûr, puisqu'on n'a pas pu l'inspecter.
  //
  // L'ensemble ne porte que les ANCÊTRES de la valeur courante, et se dépile en
  // remontant : un même objet référencé deux fois côte à côte n'est pas un
  // cycle, et le raturer une fois sur deux amputerait des rapports valides.
  if (profondeur >= PROFONDEUR_MAX || ancetres.has(valeur)) return TRONQUE;
  ancetres.add(valeur);
  try {
    if (Array.isArray(valeur)) {
      return valeur.map((v) => raturer(v, profondeur + 1, ancetres));
    }
    const sortie: Record<string, unknown> = {};
    for (const [cle, v] of Object.entries(valeur)) {
      sortie[cle] = raturer(v, profondeur + 1, ancetres);
    }
    return sortie;
  } finally {
    ancetres.delete(valeur);
  }
}
