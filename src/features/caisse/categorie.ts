/**
 * Le corps d'une catégorie de caisse, et sa couleur.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE WEB N'A AUCUNE PALETTE : IL OUVRE LE SÉLECTEUR DU SYSTÈME.           │
 * │                                                                          │
 * │ `<input type="color">`, et la seule valeur littérale du dépôt est le     │
 * │ défaut `#6B7280`. Il n'y a donc rien à recopier. Un sélecteur de teinte  │
 * │ au pouce est par ailleurs une mauvaise demande : on choisit une couleur  │
 * │ de rubrique une fois, on la relit tous les jours. Une palette FERMÉE est │
 * │ ce qui rend une liste de catégories lisible d'un coup d'oeil - dix       │
 * │ teintes distinctes, contre un dégradé où deux rubriques se ressemblent.  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ Une couleur de catégorie est une DONNÉE du marchand, pas un jeton de
 * thème. Elle a donc le droit d'être une chaîne hexadécimale, et de se rendre
 * par `style={{ backgroundColor }}` - c'est le précédent de la légende du
 * `DonutChart`. Le garde-fou « aucune couleur en dur » vise les classes
 * Tailwind littérales, qui court-circuiteraient le thème ; celles-ci ne
 * décident de rien à l'écran, elles sont ce que le marchand a choisi.
 *
 * Module PUR : il décide de ce qui part au serveur, et de ce que la liste
 * montre quand le journal n'a pas encore été vidé.
 */
import type { EtatEnvoi } from "@/sync";

/**
 * Les défauts du SERVEUR, repris tels quels.
 *
 * `IncomeCategory.color` vaut `#10B981` et `ExpenseCategory.color` `#6B7280`
 * en base (`apps/cashbook/models.py`). Les recopier ici n'invente rien : c'est
 * ce que le serveur écrirait si le champ était omis, et ce que le back-office
 * propose d'emblée dans sa boîte de dialogue.
 */
export const COULEUR_DEFAUT = {
  recette: "#10B981",
  depense: "#6B7280",
} as const;

/**
 * Dix teintes, la première étant le défaut du genre.
 *
 * Les cinq premières après le défaut sont les couleurs de SÉRIE du thème clair
 * (`ui/tokens.ts`, `chart1`…`chart5`) : ce sont celles que les graphiques de
 * rapport liront ensuite pour ces mêmes catégories, et elles sont déjà
 * éprouvées sur les deux thèmes. Les quatre dernières complètent le cercle
 * chromatique pour qu'un marchand puisse distinguer dix rubriques.
 */
const TEINTES = [
  "#ea580c", // chart1 - orange, la couleur de marque
  "#3b82f6", // chart2 - bleu
  "#22c55e", // chart3 - vert
  "#f59e0b", // chart4 - ambre
  "#8b5cf6", // chart5 - violet
  "#ef4444", // rouge
  "#14b8a6", // sarcelle
  "#ec4899", // rose
  "#6b7280", // gris
] as const;

export type GenreCategorie = "recette" | "depense";

/** La palette d'un genre : son défaut d'abord, puis les teintes, sans doublon. */
export function palette(genre: GenreCategorie): string[] {
  const defaut = COULEUR_DEFAUT[genre];
  return [
    defaut,
    ...TEINTES.filter((t) => t.toLowerCase() !== defaut.toLowerCase()),
  ];
}

/**
 * Une couleur utilisable, ou `null`.
 *
 * ⚠ AUCUNE couleur venue de la base n'atteint un `style` sans passer par ici.
 * `backgroundColor` accepte n'importe quelle chaîne et échoue en silence sur
 * une valeur fautive : une pastille invisible se lit comme une catégorie sans
 * couleur, pas comme une donnée abîmée. Le repli de l'appelant est un JETON
 * (`bg-muted`), jamais une couleur inventée.
 */
export function couleurValide(brut: string | null | undefined): string | null {
  if (!brut) return null;
  const propre = brut.trim();
  return /^#[0-9A-Fa-f]{6}$/.test(propre) ? propre : null;
}

export interface SaisieCategorie {
  genre: GenreCategorie;
  nom: string;
  description?: string;
  couleur?: string | null;
  /**
   * L'état de la rubrique. Absent à la création (une rubrique qu'on vient de
   * créer n'a pas à naître désactivée) ; explicite en modification.
   *
   * ⚠ IL PART TOUJOURS, et ce n'est pas du zèle : le serveur rejoue l'acte
   * avec `partial=True`, où une clé ABSENTE veut dire « ne touche pas ».
   * L'omettre rendrait la désactivation impossible, en silence.
   */
  actif?: boolean;
}

/**
 * Le corps exact que le serializer attend.
 *
 * ⚠ NI `code`, NI `slug`. Le `code` est facultatif côté serveur et jamais
 * dérivé, et le back-office le laisse vide. Les catégories de PRODUITS, elles,
 * exigent un `slug` fabriqué à la saisie - ne pas transposer : ces deux
 * modèles-ci n'en portent aucun.
 */
export function corpsCategorie(saisie: SaisieCategorie): {
  name: string;
  description: string;
  color: string;
  is_active: boolean;
} {
  return {
    name: saisie.nom.trim(),
    description: (saisie.description ?? "").trim(),
    color: couleurValide(saisie.couleur) ?? COULEUR_DEFAUT[saisie.genre],
    is_active: saisie.actif ?? true,
  };
}

/**
 * Le corps d'une MODIFICATION : le même, plus la cible.
 *
 * ⚠ `id` DÉSIGNE la fiche, il ne l'attribue pas. C'est toute la différence
 * avec la création, où la clé posée au comptoir devient celle du serveur.
 */
export function corpsModificationCategorie(
  id: string,
  saisie: SaisieCategorie
): { id: string; name: string; description: string; color: string; is_active: boolean } {
  return { id, ...corpsCategorie(saisie) };
}


/**
 * Une rubrique telle qu'un écran doit la montrer, journal compris.
 *
 * `envoi` à `null` veut dire « le serveur la connaît » ; sinon il porte l'état
 * de ce qui attend, et l'écran le DIT - « bloqué » n'est pas « en attente »,
 * et les confondre enverrait le marchand chercher du réseau pendant des jours.
 */
export interface CategorieFusionnee {
  id: string;
  nom: string;
  couleur: string | null;
  description: string;
  actif: boolean;
  envoi: EtatEnvoi | null;
}

/** Ce que le journal porte pour une rubrique, création comme modification. */
export interface CategorieEnFile {
  id: string;
  nom: string;
  couleur: string | null;
  description: string;
  actif: boolean;
  envoi: EtatEnvoi;
}

/**
 * Superpose le journal aux lignes tirées.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LES MODIFICATIONS SE SUPERPOSENT, PAS SEULEMENT LES CRÉATIONS.          │
 * │                                                                          │
 * │ Sans elles, le marchand corrige « Carburan » en « Carburant », la liste  │
 * │ continue d'écrire « Carburan », et il corrige une seconde fois. Une      │
 * │ DÉSACTIVATION en file doit de même retirer la rubrique des formulaires : │
 * │ la montrer encore la ferait choisir sur une vente, et le serveur         │
 * │ l'accepterait - la rubrique n'étant désactivée qu'ensuite.               │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ Une modification portant sur une rubrique ELLE-MÊME encore en file
 * s'applique aussi : c'est le cas ordinaire hors ligne, où l'on crée puis
 * corrige avant que le réseau ne revienne. La création garde alors son état
 * d'envoi le plus grave des deux.
 */
export function fusionnerCategories(
  tirees: Omit<CategorieFusionnee, "envoi">[],
  creations: CategorieEnFile[],
  modifications: Map<string, CategorieEnFile>
): CategorieFusionnee[] {
  const connues = new Set(tirees.map((t) => t.id));
  const base: CategorieFusionnee[] = [
    ...tirees.map((t) => ({ ...t, envoi: null as EtatEnvoi | null })),
    // Une création dont la ligne est DÉJÀ descendue n'est pas reprise : la
    // table fait foi, sinon la rubrique se compterait deux fois le temps que
    // le journal se vide.
    ...creations.filter((c) => !connues.has(c.id)),
  ];

  return base
    .map((c) => {
      const m = modifications.get(c.id);
      if (!m) return c;
      return {
        id: c.id,
        nom: m.nom,
        couleur: m.couleur,
        description: m.description,
        actif: m.actif,
        // Le pire l'emporte : une création en attente sous une modification
        // bloquée reste bloquée, et l'écran doit nommer ce qui débloque.
        envoi: c.envoi === "bloque" ? c.envoi : m.envoi,
      };
    })
    .sort((a, b) => a.nom.localeCompare(b.nom));
}
