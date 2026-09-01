/**
 * L'état du panier et ses transitions. Aucune dépendance de plateforme.
 *
 * Séparé de `panier.tsx` pour être ÉPROUVABLE sans appareil : le fournisseur
 * React tire la session, qui tire le trousseau et la base de données, et rien
 * de tout cela n'a sa place dans un test qui vérifie qu'ajouter deux casiers à
 * une ligne qui en porte trois en donne cinq.
 *
 * Ce réducteur porte des règles que l'écran ne montre pas, et dont un défaut se
 * traduit par un panier FAUX plutôt que par un plantage visible.
 */
import {
  maxGlobalDiscount,
  verifierAjout,
  type BasketLine,
  type Saisie,
} from "@vente-facile/core/pos";

import type { ArticlePos } from "./catalogue";
import { motifDuVerrou, motifStockInconnu } from "./motifs";

/** Un client, réduit à ce dont le comptoir a besoin. */
export interface ClientPos {
  id: string;
  name: string;
  allow_credit: boolean | null;
  credit_limit: string | null;
  current_balance: string | null;
}

export interface Reglement {
  /** Identifiant local de la ligne de règlement, jamais envoyé. */
  cle: string;
  /** Identifiant du `PaymentMethod`. */
  method: string;
  currency: string;
  amount: string;
  reference?: string;
}

export interface LignePanier extends BasketLine {
  product: ArticlePos;
}

export interface EtatPanier {
  lignes: LignePanier[];
  remiseGlobale: number;
  client: ClientPos | null;
  deviseFacture: string | null;
  deviseMonnaie: string | null;
  points: number;
  reglements: Reglement[];
  /** Vente portée au compte du client plutôt qu'encaissée intégralement. */
  aCredit: boolean;
  echeance: string | null;
  /**
   * Plafond de remise par ligne, en pourcentage, tel que le MARCHAND l'a réglé.
   *
   * Il vient du snapshot de session (`organization.max_sale_discount_percent`),
   * donc du serveur, qui l'oppose de son côté dans `validate_discount_percentage`.
   * Le comptoir bornait à 100 : un marchand ayant abaissé son plafond à 20
   * voyait la caisse accepter 45 %, imprimer le ticket, puis la vente ENTIÈRE
   * refusée. Le refus arrivait après le client.
   */
  plafondRemise: number;
}

export type ActionPanier =
  | { type: "ajouter"; article: ArticlePos; saisie: Saisie; prix: number }
  | { type: "modifier"; index: number; saisie: Saisie }
  | { type: "remiseLigne"; index: number; pourcentage: number }
  | { type: "prixLigne"; index: number; prix: number }
  | { type: "retirer"; index: number }
  | { type: "remiseGlobale"; montant: number }
  | { type: "client"; client: ClientPos | null }
  | { type: "deviseFacture"; code: string }
  | { type: "deviseMonnaie"; code: string }
  | { type: "points"; points: number }
  | { type: "reglements"; reglements: Reglement[] }
  | { type: "credit"; actif: boolean; echeance?: string | null }
  | { type: "plafondRemise"; pourcentage: number }
  | { type: "restaurer"; etat: EtatPanier }
  | { type: "vider" };

export const PANIER_VIDE: EtatPanier = {
  lignes: [],
  remiseGlobale: 0,
  client: null,
  deviseFacture: null,
  deviseMonnaie: null,
  points: 0,
  reglements: [],
  aCredit: false,
  echeance: null,
  // Défaut SERVEUR (`DEFAULT_MAX_SALE_DISCOUNT_PERCENT`), employé tant que le
  // snapshot n'a rien dit. Ce n'est pas une constante du comptoir.
  plafondRemise: 50,
};

/**
 * Ramène la remise globale sous son plafond, sans jamais la remonter.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE CHAMP MONTRAIT 999 999 PENDANT QUE LE TOTAL APPLIQUAIT LE PLAFOND.   │
 * │                                                                          │
 * │ `basketTotals` borne déjà l'EFFET, et c'est la seule borne que le serveur │
 * │ oppose : le corps envoyé était juste, et le total affiché aussi. Ce qui   │
 * │ était faux, c'est le CHAMP, qui gardait le nombre tapé. Le caissier       │
 * │ annonçait une remise à son client, lisait un total qui ne la reflétait    │
 * │ pas, et ne pouvait pas savoir lequel des deux croire.                     │
 * │                                                                          │
 * │ Appliqué à chaque changement de LIGNES, pas seulement à la saisie : une   │
 * │ remise devient impossible quand on retire un article, et borner au seul   │
 * │ moment de la frappe laisserait le champ en arrière.                       │
 * │                                                                          │
 * │ Jamais vers le HAUT : ajouter un article n'accorde pas une remise que     │
 * │ personne n'a saisie.                                                      │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
function avecRemiseBornee(etat: EtatPanier): EtatPanier {
  const plafond = maxGlobalDiscount(etat.lignes);
  return etat.remiseGlobale <= plafond
    ? etat
    : { ...etat, remiseGlobale: plafond };
}

/**
 * Exporté pour être éprouvé sans appareil : ce réducteur porte des règles que
 * l'écran ne montre pas (fusion des deux compteurs, exclusion de la ligne en
 * cours d'édition de son propre contrôle de stock), et un défaut s'y traduit
 * par un panier faux plutôt que par un plantage visible.
 *
 * La borne de remise globale est posée SUR LA SORTIE, une fois pour toutes :
 * six actions peuvent abaisser le plafond (retirer une ligne, en réduire la
 * quantité, en baisser le prix, y poser une remise…), et les traiter une à une
 * laisserait la septième à écrire.
 */
export function reducteurPanier(etat: EtatPanier, action: ActionPanier): EtatPanier {
  return avecRemiseBornee(_reduire(etat, action));
}

function _reduire(etat: EtatPanier, action: ActionPanier): EtatPanier {
  switch (action.type) {
    case "ajouter": {
      const verdict = verifierAjout(action.article, etat.lignes, action.saisie);
      if (!verdict.ok) return etat;

      const index = etat.lignes.findIndex((l) => l.product.id === action.article.id);
      if (index < 0) {
        return {
          ...etat,
          lignes: [
            ...etat.lignes,
            {
              product: action.article,
              quantity: verdict.quantity,
              packageQuantity: verdict.packageQuantity,
              unit_price: action.prix,
              discount_percentage: 0,
            },
          ],
        };
      }
      // Fusion avec la ligne existante. Les deux compteurs s'additionnent
      // SÉPARÉMENT : deux casiers plus trois bouteilles restent deux casiers et
      // trois bouteilles, on ne les refond pas en un total qu'il faudrait
      // ensuite redécouper.
      const lignes = [...etat.lignes];
      const courante = lignes[index];
      lignes[index] = {
        ...courante,
        quantity: courante.quantity + verdict.quantity,
        packageQuantity: courante.packageQuantity + verdict.packageQuantity,
      };
      return { ...etat, lignes };
    }

    case "modifier": {
      const courante = etat.lignes[action.index];
      if (!courante) return etat;
      // Le contrôle se fait sur le panier PRIVÉ de cette ligne, sinon la ligne
      // qu'on modifie se compterait contre elle-même.
      const autres = etat.lignes.filter((_, i) => i !== action.index);
      const verdict = verifierAjout(courante.product, autres, action.saisie);
      if (!verdict.ok) return etat;
      if (verdict.quantity < 1) return etat;

      const lignes = [...etat.lignes];
      lignes[action.index] = {
        ...courante,
        quantity: verdict.quantity,
        packageQuantity: verdict.packageQuantity,
      };
      return { ...etat, lignes };
    }

    case "remiseLigne": {
      const lignes = [...etat.lignes];
      const courante = lignes[action.index];
      if (!courante) return etat;
      lignes[action.index] = {
        ...courante,
        discount_percentage: Math.min(etat.plafondRemise, Math.max(0, action.pourcentage)),
      };
      return { ...etat, lignes };
    }

    case "prixLigne": {
      const lignes = [...etat.lignes];
      const courante = lignes[action.index];
      if (!courante) return etat;
      lignes[action.index] = { ...courante, unit_price: Math.max(0, action.prix) };
      return { ...etat, lignes };
    }

    case "retirer":
      return { ...etat, lignes: etat.lignes.filter((_, i) => i !== action.index) };

    case "remiseGlobale":
      return { ...etat, remiseGlobale: Math.max(0, action.montant) };

    case "client":
      // Retirer le client retire aussi ce qui n'a de sens qu'avec lui.
      return action.client
        ? { ...etat, client: action.client }
        : { ...etat, client: null, points: 0, aCredit: false, echeance: null };

    case "deviseFacture":
      return { ...etat, deviseFacture: action.code };

    case "deviseMonnaie":
      return { ...etat, deviseMonnaie: action.code };

    case "points":
      return { ...etat, points: Math.max(0, action.points) };

    case "reglements":
      return { ...etat, reglements: action.reglements };

    case "plafondRemise": {
      // Borné comme le serveur le borne : un réglage aberrant retombe sur son
      // défaut plutôt que d'ouvrir la remise à 100 % ou de la fermer à zéro.
      const brut = Number(action.pourcentage);
      const plafond =
        Number.isFinite(brut) && brut >= 0 ? Math.min(100, brut) : PANIER_VIDE.plafondRemise;
      return { ...etat, plafondRemise: plafond };
    }

    case "credit":
      return {
        ...etat,
        aCredit: action.actif,
        echeance: action.actif ? (action.echeance ?? etat.echeance) : null,
      };

    // Reprise d'un panier mis en attente. L'état arrive ENTIER, déjà rejoué
    // contre le catalogue du jour par `attente.ts` : le réducteur ne le
    // recompose pas, il le pose. Reconstituer ligne par ligne ici rejouerait
    // les contrôles de stock une seconde fois, sur des lignes qui viennent
    // justement de les passer.
    case "restaurer":
      // Le plafond COURANT prime sur celui rangé avec le panier : c'est la même
      // règle que pour les prix et le stock, relus à la reprise. Un panier
      // rangé hier ne doit pas rouvrir une remise fermée depuis.
      return { ...action.etat, plafondRemise: etat.plafondRemise };

    case "vider":
      // Vider un panier ne rend pas au comptoir le réglage par défaut.
      return { ...PANIER_VIDE, plafondRemise: etat.plafondRemise };
  }
}

/**
 * Le refus d'une saisie, en français, dans l'ORDRE DU SERVEUR.
 *
 * Deux motifs précèdent le noyau, et il faut qu'ils le précèdent :
 *
 * 1. **Le verrou d'inventaire**, parce que `SaleCreateSerializer.validate`
 *    refuse les produits bloqués AVANT de regarder les quantités. Dire « stock
 *    insuffisant » sur un article sous inventaire enverrait le caissier
 *    chercher au dépôt une marchandise qui est là, mais interdite à la vente.
 * 2. **Le stock INCONNU**, parce que le noyau lit `null` comme zéro pour
 *    composer sa phrase, et écrivait « 0 en stock » sous une carte annonçant
 *    « Stock inconnu ». Le VERDICT reste celui du noyau, et il reste juste :
 *    sans ligne de stock pour cet entrepôt, le serveur refuse aussi.
 *
 * Ici plutôt que dans le fournisseur React : c'est une règle, elle s'éprouve
 * sans appareil.
 */
export function motifDeRefus(
  article: ArticlePos,
  lignes: LignePanier[],
  saisie: Saisie
): string | null {
  if (article.verrou_inventaire !== null) {
    return motifDuVerrou(article.name, article.verrou_inventaire);
  }

  const verdict = verifierAjout(article, lignes, saisie);
  if (verdict.ok) return null;

  // Seul le cas « aucune ligne de stock » est réétiqueté. Un zéro RÉELLEMENT
  // enregistré doit continuer de se lire « 0 en stock » : c'est une
  // information certaine, et la noyer dans « inconnu » ferait chercher une
  // synchronisation là où il faut réapprovisionner.
  const inconnu =
    article.stock_quantity === null &&
    article.track_inventory &&
    !article.allow_negative_stock;

  return inconnu ? motifStockInconnu(article.name) : verdict.raison;
}
