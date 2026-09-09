/**
 * Les types de mouvement de stock, leur libellé et leur SENS.
 *
 * Module PUR, et c'est le motif de l'extraction : ils vivaient dans
 * `data/mouvements`, qui ouvre la base SQLite au chargement. Tout module qui
 * veut seulement NOMMER un type - le descripteur d'export, le garde-fou de
 * parité - embarquait donc une base de données, et devenait intestable hors
 * appareil. C'est le déplacement déjà fait pour `data/statuts-vente`.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CETTE TABLE EST LA SEULE VÉRITÉ SUR LE SENS.                            │
 * │                                                                          │
 * │ Trois consommateurs en partent, et c'est ce qui les tient d'accord : la  │
 * │ liste et son cadran (par `conditionsDe`, qui la matérialise en `IN`),    │
 * │ et l'export (qui envoie la même liste de codes au serveur). Écrire des   │
 * │ conditions dérivées ferait deux listes à tenir en phase, et le document  │
 * │ ne couvrirait plus le périmètre de la liste qui l'a déclenché.           │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/** Entrées et sorties, avec le libellé du back-office. */
export const TYPE_MOUVEMENT_STOCK: Record<string, { label: string; entree: boolean }> = {
  purchase: { label: "Achat", entree: true },
  sale: { label: "Vente", entree: false },
  return_in: { label: "Retour client", entree: true },
  return_out: { label: "Retour fournisseur", entree: false },
  transfer_in: { label: "Transfert entrant", entree: true },
  transfer_out: { label: "Transfert sortant", entree: false },
  adjustment_in: { label: "Ajustement positif", entree: true },
  adjustment_out: { label: "Ajustement négatif", entree: false },
  damage: { label: "Dommage/Perte", entree: false },
  expired: { label: "Périmé", entree: false },
  initial: { label: "Stock initial", entree: true },
  // ⚠ LA CLÉ EST `unpack`, ET ELLE ÉTAIT ÉCRITE `unpacking`.
  //
  // `StockMovement.MovementType.UNPACK` vaut `unpack` côté serveur, et le
  // back-office l'écrit ainsi. La faute ne levait rien : la lecture retombait
  // sur son repli et le badge d'un déconditionnement portait le CODE NU,
  // « unpack », au milieu de libellés français ; et la puce de filtre
  // « Déconditionnement » visait un type qui n'existe nulle part, donc rendait
  // toujours une liste vide. Un filtre mort ne se distingue pas d'un rayon
  // sans mouvement.
  unpack: { label: "Déconditionnement", entree: true },
};

/**
 * Les codes d'un sens, tels que la LISTE les entend.
 *
 * ⚠ Le serveur, lui, a une troisième catégorie sans le dire : ni
 * `STOCK_IN_MOVEMENT_TYPES` ni `STOCK_OUT_MOVEMENT_TYPES` ne contiennent
 * `unpack`, si bien que `?direction=in` l'EXCLUT. Un déconditionnement déplace
 * des unités entre canaux sans en créer ni en détruire, et cette lecture se
 * défend - mais elle n'est pas celle de l'écran, où le back-office comme le
 * terminal le rangent parmi les entrées.
 *
 * L'export envoie donc la LISTE DES TYPES et non `direction` : le document
 * couvre alors exactement ce que la liste montre, et c'est l'invariant qui
 * compte. `StockMovementFilter.filter_movement_type` accepte des codes séparés
 * par des virgules, précisément pour cela.
 */
export function codesParSens(entree: boolean): string[] {
  return Object.entries(TYPE_MOUVEMENT_STOCK)
    .filter(([, t]) => t.entree === entree)
    .map(([code]) => code);
}


/**
 * Les types qu'un humain SAISIT : les onze, `unpack` excepté.
 *
 * `unpack` est produit par le SERVEUR à l'ouverture d'un conditionnement, et
 * `StockMovementCreateSerializer.validate` le refuse explicitement ("Le
 * déconditionnement ne se saisit pas comme un mouvement"). L'offrir ferait un
 * choix qui rend toujours une erreur.
 *
 * Le terminal n'en proposait que SIX, au motif que les autres viennent d'un
 * acte. Le back-office en propose onze, et un magasinier doit pouvoir saisir un
 * retour fournisseur depuis son terminal comme il le fait au clavier.
 */
export function typesSaisissables(): string[] {
  return Object.keys(TYPE_MOUVEMENT_STOCK).filter((code) => code !== "unpack");
}

/**
 * Les types qu'une ENTRÉE VALORISÉE porte : un coût, un lot, un report de prix.
 *
 * ⚠ Ce n'est PAS `codesParSens(true)`. `unpack` est une entrée à l'écran et le
 * serveur ne le range dans aucun des deux sens ; `production_in` est une entrée
 * du serveur qu'aucune interface ne propose.
 *
 * Miroir de `STOCK_IN_TYPES_WITH_COST` du back-office, lui-même dérivé de
 * `STOCK_IN_MOVEMENT_TYPES` (apps/inventory/models.py) privé de
 * `production_in`. Hors de cette liste, un mouvement n'a pas de prix d'achat à
 * déclarer : sa valeur vient des lots consommés.
 */
export const TYPES_ENTREE_VALORISEE = [
  "purchase",
  "initial",
  "return_in",
  "transfer_in",
  "adjustment_in",
] as const;

export function estEntreeValorisee(type: string): boolean {
  return (TYPES_ENTREE_VALORISEE as readonly string[]).includes(type);
}

/**
 * Les types que la LISTE montre sous ce couple (type choisi, sens choisi).
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE TYPE ET LE SENS PEUVENT SE CONTREDIRE, ET L'EXPORT L'IGNORAIT.       │
 * │                                                                          │
 * │ L'écran applique les DEUX filtres ; le document n'envoyait que le type   │
 * │ quand il existait. Sens « Entrées » plus type « Vente » : la liste est    │
 * │ vide, le fichier est plein. Deux appuis suffisent, et rien ne le dit.    │
 * │                                                                          │
 * │ `null` : aucune restriction. `[]` : le couple est CONTRADICTOIRE, et les │
 * │ deux surfaces doivent alors ne rien rendre.                              │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function typesFiltres(
  type: string | null,
  entree: boolean | null
): string[] | null {
  if (!type && entree == null) return null;
  if (!type) return codesParSens(entree as boolean);
  if (entree == null) return [type];
  return codesParSens(entree).includes(type) ? [type] : [];
}

/** Une ligne d'agrégat, telle que le SQL la rend : un type, ses cumuls. */
export interface AgregatParType {
  type: string;
  nombre: number;
  /** Somme des quantités EN MAGNITUDE : voir `cumulerParSens`. */
  quantite: number;
}

/** Les quantités entrées et sorties, en magnitude. */
export interface CumulParSens {
  nombre: number;
  entrees: number;
  sorties: number;
}

/**
 * Cumule les agrégats par sens : le TYPE dit ce qu'est le mouvement, la
 * MAGNITUDE combien il a déplacé.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ NI LE SIGNE SEUL, NI LA SOMME BRUTE NE TIENNENT. C'EST MESURÉ.          │
 * │                                                                          │
 * │ `quantity` est signée en base - une sortie y est négative - mais DEUX    │
 * │ mouvements de l'établissement portent la convention INVERSE : un type    │
 * │ `sale` à « +1 » avec « 0 → -1 ». Des lignes anciennes, antérieures au    │
 * │ changement de convention.                                                │
 * │                                                                          │
 * │ Les trois lectures possibles, comparées sur les 44 mouvements contre la  │
 * │ vérité terrain (`quantity_after - quantity_before`) :                    │
 * │                                                                          │
 * │   type + magnitude   1 564 / 905   ← ÉGAL à la vérité                    │
 * │   après - avant      1 564 / 905                                         │
 * │   signe de quantity  1 566 / 903   (les deux anciennes à l'envers)       │
 * │   type + brut        1 564 / -901  (ce que le document écrivait)         │
 * │                                                                          │
 * │ On ne lit donc PAS le signe, et on ne somme pas brut. Le serveur applique │
 * │ la même règle depuis le même constat : les deux surfaces rendent le même │
 * │ chiffre parce qu'elles appliquent la même règle, pas parce qu'on les     │
 * │ surveille.                                                                │
 * │                                                                          │
 * │ Un déconditionnement porte zéro et ne pèse alors sur aucun des deux, sans│
 * │ cas particulier : ouvrir un carton déplace des unités entre canaux, il   │
 * │ n'en crée ni n'en détruit.                                                │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function cumulerParSens(lignes: AgregatParType[]): CumulParSens {
  let nombre = 0;
  let entrees = 0;
  let sorties = 0;

  for (const l of lignes) {
    nombre += l.nombre;
    // Un type inconnu de la table compte comme une ENTRÉE, comme le fait le
    // repli de `listeMouvements` : mieux vaut un sens par défaut qu'une
    // quantité qui disparaît des deux relevés sans que rien ne le signale.
    if (TYPE_MOUVEMENT_STOCK[l.type]?.entree ?? true) entrees += l.quantite;
    else sorties += l.quantite;
  }

  return { nombre, entrees, sorties };
}
