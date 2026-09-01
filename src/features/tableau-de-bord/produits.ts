/**
 * Cumul des « produits les plus vendus ». Miroir de `_dashboard_top_product`.
 *
 * Module PUR : il reçoit des lignes déjà lues, il ne sait pas d'où elles
 * viennent. C'est ce qui rend sa règle testable, et elle doit l'être - elle
 * est la seule de cet écran qu'une relecture ne suffit pas à valider.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE PARTAGE VIENT DES CONTENANTS FACTURÉS, PAS D'UNE DIVISION DU TOTAL.  │
 * │                                                                          │
 * │ Cinq casiers plus cent vingt bouteilles font 240 unités si le casier en  │
 * │ porte 24. Redécouper ce total au facteur du jour rendrait « 10 casiers », │
 * │ ce qui est faux et a l'air exact - et le facteur d'un produit a pu       │
 * │ changer depuis la vente. Le vrac est donc le RESTE :                     │
 * │                                                                          │
 * │     vrac = quantité totale − Σ(contenants × facteur FIGÉ SUR LA LIGNE)   │
 * │                                                                          │
 * │ C'est la règle posée dans tout le stock, et celle que le serveur         │
 * │ applique ici.                                                            │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import {
  formatNumberFr,
  formatPackaged,
  formatPackagedSplit,
  pluralizeUnit,
  type Packaging,
} from "@vente-facile/core";

export interface LigneVendue {
  produitId: string;
  nom: string;
  sku: string;
  quantite: number;
  contenants: number;
  /** Facteur figé sur la ligne de vente, jamais celui du produit aujourd'hui. */
  facteurLigne: number | null;
  /** Total de la ligne, dans la devise de sa VENTE. */
  total: number;
  /**
   * Taux figé sur la vente : unités de devise principale pour une unité de la
   * devise de facture. Le tableau de bord est un écran en principale.
   */
  tauxVente: number;
}

export interface CumulProduit {
  id: string;
  nom: string;
  sku: string;
  quantite: number;
  contenants: number;
  /** Unités déjà comptées dans des contenants scellés. */
  unitesEnContenants: number;
  /** Recette du produit, EN DEVISE PRINCIPALE. */
  revenus: number;
}

/**
 * Cumule les lignes par produit, du plus vendu au moins vendu.
 *
 * **La recette est ramenée en devise principale**, au taux FIGÉ sur la vente.
 * Une ligne de vente ne porte pas de devise, sa vente si : additionner des
 * totaux libellés dans deux monnaies donnerait un nombre qui n'existe pas, et
 * c'est ce que le back-office faisait. Le tri, lui, porte sur les QUANTITÉS,
 * qui se comparent sans monnaie.
 */
export function cumulerProduits(lignes: LigneVendue[]): CumulProduit[] {
  const par = new Map<string, CumulProduit>();

  for (const l of lignes) {
    let c = par.get(l.produitId);
    if (!c) {
      c = {
        id: l.produitId,
        nom: l.nom,
        sku: l.sku,
        quantite: 0,
        contenants: 0,
        unitesEnContenants: 0,
        revenus: 0,
      };
      par.set(l.produitId, c);
    }
    c.quantite += l.quantite;
    c.contenants += l.contenants;
    c.unitesEnContenants += l.contenants * (l.facteurLigne ?? 0);
    // Un taux nul ou absent laisserait tomber la recette de la ligne en
    // silence : le taux neutre garde au moins le montant facturé.
    c.revenus += l.total * (l.tauxVente > 0 ? l.tauxVente : 1);
  }

  return [...par.values()].sort(
    (a, b) => b.quantite - a.quantite || a.nom.localeCompare(b.nom)
  );
}

/**
 * Le vrac restant d'un cumul.
 *
 * Borné à zéro : un facteur mal renseigné pourrait rendre les contenants plus
 * gros que le total vendu, et un vrac négatif s'écrirait « 3 casiers + -5
 * bouteilles » sur le tableau de bord d'un marchand.
 */
export function vracDe(c: Pick<CumulProduit, "quantite" | "unitesEnContenants">): number {
  return Math.max(0, c.quantite - c.unitesEnContenants);
}

/** Le partage se rend-il par canal, ou faut-il retomber sur le total ? */
export function seVentile(c: Pick<CumulProduit, "contenants">, aUnConditionnement: boolean): boolean {
  return aUnConditionnement && c.contenants > 0;
}

/**
 * La quantité vendue, telle qu'elle s'écrit. Miroir de `format_quantity`.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN PRODUIT SANS CONDITIONNEMENT GARDE LE NOM DE SON UNITÉ.              │
 * │                                                                          │
 * │ `formatPackaged(null, 8)` du noyau rend « 8 », tout court : le nom de    │
 * │ l'unité est perdu, en silence. Le serveur, lui, écrit « 8 PLAQUETTES »   │
 * │ (`_plural(retail_label, qty)`), et c'est ce que le marchand lit dans son │
 * │ back-office. Un « 8 » nu à côté d'un « 20 BOITES + 14 AMPOULES » laisse  │
 * │ croire que la seconde ligne est plus précise que la première, alors      │
 * │ qu'elles disent la même chose sur des produits différents.               │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Les décimales passent par `formatNumberFr` et non `formatNumber` : le
 * second ARRONDIT (8,5 devient « 9 »), et une quantité vendue en porte trois.
 */
export function libelleQuantite(
  cond: Packaging | null,
  uniteDetail: string | null,
  c: Pick<CumulProduit, "quantite" | "contenants" | "unitesEnContenants">
): string {
  if (cond === null) {
    const q = formatNumberFr(c.quantite, 3);
    return `${q} ${pluralizeUnit(uniteDetail ?? "unité", c.quantite)}`.trim();
  }
  return seVentile(c, true)
    ? formatPackagedSplit(cond, c.contenants, vracDe(c))
    : formatPackaged(cond, c.quantite);
}
