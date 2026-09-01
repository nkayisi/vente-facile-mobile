/**
 * Fusion de classes utilitaires.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ EN NATIVEWIND, CE N'EST PAS LA DERNIÈRE CLASSE ÉCRITE QUI GAGNE.        │
 * │                                                                          │
 * │ C'est celle qui sort le plus tard dans la FEUILLE COMPILÉE, laquelle est │
 * │ rangée par nom de classe. Deux classes qui touchent la même propriété se │
 * │ départagent donc par ORDRE ALPHABÉTIQUE, quel que soit l'ordre du        │
 * │ `className`. Rien ne le signale : la classe perdante est simplement sans │
 * │ effet, sans avertissement, sans erreur.                                  │
 * │                                                                          │
 * │ MESURÉ sur l'émulateur, deux sondes côte à côte :                        │
 * │                                                                          │
 * │   <Text className="text-destructive">   → NOIR  (`.text-destructive`     │
 * │                                            perd contre `.text-foreground`│
 * │                                            de la variante : d < f)       │
 * │   <Text variant="error">                → ROUGE (la variante n'a pas de  │
 * │                                            couleur concurrente)          │
 * │   <Text className="text-2xl">           → 16 pt (`.text-2xl` perd contre │
 * │                                            `.text-base` : « 2xl » < « b »)│
 * │   <Text variant="h2">                   → 24 pt                          │
 * │                                                                          │
 * │ Ce que ça coûtait, en clair :                                            │
 * │                                                                          │
 * │   - AUCUN texte destructif passé en `className` n'était rouge, nulle     │
 * │     part - vingt écrans : le « reste à payer » d'une vente, l'écart      │
 * │     négatif d'un ajustement, l'astérisque des champs obligatoires, le    │
 * │     solde d'un fournisseur. Le rouge est la seule chose que le marchand  │
 * │     doit voir sans lire.                                                 │
 * │   - `StatValue` perdait le HAUT de son échelle : sa doctrine est « quand │
 * │     la place manque, c'est la TAILLE qui cède, jamais les chiffres », et │
 * │     son plus grand palier (`text-2xl`, tout montant court) sortait à la  │
 * │     taille du corps de texte. Tous les cadrans de l'application avaient  │
 * │     donc perdu leur hiérarchie, et le montant d'un relevé pesait autant  │
 * │     que son libellé.                                                     │
 * │   - `<Card className="p-0">` gardait ses seize points de rembourrage :   │
 * │     les listes en carte étaient indentées et leurs filets ne touchaient  │
 * │     pas les bords.                                                       │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * `fusionner` retire donc de la base ce que l'ajout redéfinit, AVANT de laisser
 * NativeWind travailler : il ne reste qu'une classe par propriété, et l'ordre
 * alphabétique n'a plus rien à départager.
 *
 * **On ne groupe que ce dont la sémantique est certaine.** Une classe inconnue
 * est CONSERVÉE : ce module n'est pas un `tailwind-merge`, et se tromper de
 * groupe retirerait une classe que l'appelant voulait. Le pire qu'il puisse
 * faire, c'est laisser passer un conflit que l'ordre alphabétique tranchera
 * comme avant.
 */

/** Les tailles de police. `text-2xl` est la piégeuse : « 2 » précède tout. */
const TAILLES = new Set([
  "text-xs", "text-sm", "text-base", "text-lg",
  "text-xl", "text-2xl", "text-3xl", "text-4xl",
]);

/** L'alignement s'écrit `text-…` sans être une couleur : ne pas les confondre. */
const ALIGNEMENTS = new Set(["text-left", "text-center", "text-right", "text-justify"]);

/**
 * Les familles, une par graisse.
 *
 * Sur Android une famille custom NE SYNTHÉTISE PAS les graisses : c'est
 * pourquoi le dépôt pose une famille et jamais un `font-weight`.
 */
const FAMILLES = new Set([
  "font-sans", "font-sans-medium", "font-sans-semibold", "font-sans-bold",
]);

/** Préfixes dont le premier segment suffit à nommer la propriété. */
const PREFIXES = [
  "p", "px", "py", "pt", "pr", "pb", "pl",
  "m", "mx", "my", "mt", "mr", "mb", "ml",
  "bg", "gap",
];

/**
 * À quelle propriété une classe touche, ou `null` si on ne sait pas.
 *
 * `null` veut dire « on n'y touche pas » : voir l'en-tête, une classe mal
 * groupée serait retirée à tort.
 */
export function groupe(classe: string): string | null {
  // `text-warning/70`, `bg-primary/10` : l'opacité ne change pas la propriété.
  const nu = classe.split("/")[0];
  if (TAILLES.has(nu)) return "taille";
  if (ALIGNEMENTS.has(nu)) return "alignement";
  if (FAMILLES.has(nu)) return "famille";
  if (nu.startsWith("text-")) return "couleur";
  if (nu === "rounded" || nu.startsWith("rounded-")) return "rayon";
  const premier = nu.split("-")[0];
  if (PREFIXES.includes(premier) && nu.includes("-")) return premier;
  return null;
}

/**
 * `base` moins ce que `ajout` redéfinit, puis `ajout`.
 *
 * L'ordre est conservé pour que la chaîne reste lisible en débogage ; c'est le
 * RETRAIT qui fait le travail, pas la position.
 */
export function fusionner(base: string, ajout?: string | null): string {
  if (!ajout) return base.trim();
  const redefinis = new Set<string>();
  for (const c of ajout.split(/\s+/)) {
    const g = groupe(c);
    if (g) redefinis.add(g);
  }
  const gardees = base
    .split(/\s+/)
    .filter((c) => c && !redefinis.has(groupe(c) ?? "__inconnu"));
  return [...gardees, ajout.trim()].join(" ").trim();
}
