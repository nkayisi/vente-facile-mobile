/**
 * Ce qu'une session d'inventaire ENVOIE, et ce qui l'empêche de partir.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LES CLÉS DU PÉRIMÈTRE NE SONT PAS CELLES QU'ON DEVINE.                  │
 * │                                                                          │
 * │ Le serveur déclare `category_ids` et `product_ids`                       │
 * │ (`InventorySessionCreateSerializer.Meta.fields`). Le terminal envoyait   │
 * │ `categories` et `products`, et DRF IGNORE SILENCIEUSEMENT une clé qui    │
 * │ n'est pas dans `fields` : les identifiants tombaient dans le vide, puis  │
 * │ `validate` refusait pour « Au moins une catégorie est requise » - un     │
 * │ message qui ne désigne pas la cause, sur une session qui en portait une. │
 * │                                                                          │
 * │ Inoffensif tant que l'écran verrouillait le périmètre sur `full`, ce     │
 * │ qu'il faisait derrière une puce décorative ; vivant à la seconde où le   │
 * │ sélecteur existe. Le corps vit donc ICI, avec ses tests, et non dans un  │
 * │ écran où personne ne le relit.                                           │
 * │                                                                          │
 * │ Le piège est aussi épinglé côté serveur :                                │
 * │ `backend/apps/sync/tests/test_inventory_scope_parity.py`.                │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Module PUR, comme `payload-mouvement.ts` et `lignes-conditionnees.ts` : il
 * décide de ce qui part au serveur, il doit s'éprouver sans appareil.
 */
import { dateLongueFr } from "@/data/dates";

export type Perimetre = "full" | "category" | "product";

/** L'état du formulaire au moment de valider. */
export interface SaisieSession {
  entrepot: string | null;
  perimetre: Perimetre;
  categories: string[];
  produits: string[];
  notes: string;
}

export interface ErreursSession {
  entrepot?: string;
  perimetre?: string;
}

/**
 * Le nom d'une session, dérivé de la date du jour.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ IL SE COMPOSE À LA VALIDATION, JAMAIS AU MONTAGE.                       │
 * │                                                                          │
 * │ Le back-office fige `name` dans son état à l'ouverture du dialogue, et   │
 * │ recalcule la date affichée à CHAQUE rendu : un formulaire laissé ouvert  │
 * │ passé minuit montre une date et en enregistre une autre. Composer au     │
 * │ moment de l'envoi supprime la fenêtre.                                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Il n'y a pas de champ de nom, ici comme sur le web : le serveur en fabrique
 * un s'il n'en reçoit pas, mais avec `timezone.now()`, donc la date UTC - un
 * inventaire créé après 23 h à Kinshasa porterait la veille. On l'envoie.
 */
export function nomParDefaut(d: Date): string {
  return `Inventaire du ${dateLongueFr(d)}`;
}

/**
 * Ce qui empêche d'enregistrer, et la phrase à écrire sous le champ fautif.
 *
 * Le back-office rend ces refus en TOASTS, qui disparaissent avant qu'on ait
 * relu le formulaire et ne désignent aucun champ. Ils vont ici sous le champ
 * concerné, comme partout ailleurs dans ce terminal.
 */
export function verifierSaisie(s: SaisieSession): ErreursSession {
  const erreurs: ErreursSession = {};

  if (!s.entrepot) {
    erreurs.entrepot = "Choisissez l'entrepôt à inventorier.";
    return erreurs;
  }

  if (s.perimetre === "category" && s.categories.length === 0) {
    erreurs.perimetre = "Choisissez au moins une catégorie à compter.";
  }
  if (s.perimetre === "product" && s.produits.length === 0) {
    erreurs.perimetre = "Choisissez au moins un article à compter.";
  }

  return erreurs;
}

/**
 * Le corps de l'acte, sans son identifiant.
 *
 * Les clés du périmètre ne partent QUE pour le périmètre qui les concerne :
 * une liste de catégories restée d'un choix précédent ferait compter un rayon
 * que le magasinier venait d'écarter. Comme partout, les clés absentes sont
 * OMISES et jamais posées à `null`.
 */
export function corpsDeLaSession(
  s: SaisieSession,
  maintenant: Date
): Record<string, unknown> {
  return {
    name: nomParDefaut(maintenant),
    warehouse: s.entrepot,
    scope_type: s.perimetre,
    ...(s.perimetre === "category" && s.categories.length > 0
      ? { category_ids: s.categories }
      : {}),
    ...(s.perimetre === "product" && s.produits.length > 0
      ? { product_ids: s.produits }
      : {}),
    notes: s.notes.trim(),
  };
}
