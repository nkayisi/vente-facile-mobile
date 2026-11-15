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
  lignesEnRupture,
  maxGlobalDiscount,
  verifierAjout,
  type BasketLine,
  type Rupture,
  type Saisie,
} from "@vente-facile/core/pos";
import { MIN_QUANTITY } from "@vente-facile/core";

import type { ArticlePos } from "./catalogue";
import { motifDuVerrou, motifStockInconnu } from "./motifs";
import { bornerRemiseLigne } from "./remise-ligne";

/** Un client, réduit à ce dont le comptoir a besoin. */
export interface ClientPos {
  id: string;
  name: string;
  /**
   * Imprimé sur le ticket, sous « Tél. ».
   *
   * La réimpression le rendait déjà depuis la vente tirée ; l'original ne
   * l'avait pas, faute d'être sélectionné. Même asymétrie que le dépôt.
   */
  phone: string | null;
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
  /** Part de cagnotte de fidélité que le caissier veut employer, en principale. */
  cagnotte: number;
  reglements: Reglement[];
  /** Vente portée au compte du client plutôt qu'encaissée intégralement. */
  aCredit: boolean;
  echeance: string | null;
}

export type ActionPanier =
  | {
      type: "ajouter";
      article: ArticlePos;
      saisie: Saisie;
      prix: number;
      /** Devise d'annonce de la ligne. Absente : celle de la facture. */
      devise?: string;
    }
  | {
      type: "modifier";
      index: number;
      saisie: Saisie;
      /** Devise d'annonce. `undefined` : la ligne suit la facture. */
      devise?: string;
    }
  | { type: "retirer"; index: number }
  /**
   * Remise en POURCENTAGE sur une ligne. Le plafond voyage avec l'action : il
   * est du jour (réglé par le marchand), pas du panier, et un panier repris
   * le lendemain ne doit pas emporter celui d'hier.
   */
  | { type: "remiseLigne"; index: number; pourcentage: number; plafond: number }
  | { type: "remiseGlobale"; montant: number }
  | { type: "client"; client: ClientPos | null }
  | { type: "deviseFacture"; code: string }
  | { type: "deviseMonnaie"; code: string }
  | { type: "cagnotte"; montant: number }
  | { type: "reglements"; reglements: Reglement[] }
  | { type: "credit"; actif: boolean; echeance?: string | null }
  | { type: "restaurer"; etat: EtatPanier }
  | { type: "vider" };

export const PANIER_VIDE: EtatPanier = {
  lignes: [],
  remiseGlobale: 0,
  client: null,
  deviseFacture: null,
  deviseMonnaie: null,
  cagnotte: 0,
  reglements: [],
  aCredit: false,
  echeance: null,
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
      // ON GARDE L'ARITHMÉTIQUE DU VERDICT, ON N'EN GARDE PLUS LE REFUS.
      // `quantity` et `packageQuantity` sont le miroir de `to_base` du serveur
      // et restent indispensables. Le manque de stock, lui, ne ferme plus
      // l'ajout : il fermera l'ENCAISSEMENT, et la proforma restera ouverte.
      // Seule une saisie vide est encore écartée - ce n'est pas un manque de
      // stock, c'est une absence de saisie.
      //
      // ⚠ LE SEUIL EST CELUI DU SERVEUR, PAS 1. À 1, « 0,5 » - une saisie
      // parfaitement valide pour un produit vendu au poids - était refusé, et
      // le refus était MUET : le sélecteur ouvrait son bouton « Ajouter » et
      // rien n'entrait au panier. Les quatre sites de ce fichier partagent ce
      // seuil, et c'est `MinValueValidator(Decimal('0.001'))` côté serveur.
      if (verdict.quantity < MIN_QUANTITY) return etat;

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
              // La devise d'ANNONCE de la ligne. Absente : elle suit la
              // facture, ce que toute vente a fait jusqu'ici.
              ...(action.devise ? { priceCurrency: action.devise } : {}),
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
      // Même règle qu'à l'ajout : le manque de stock ne referme pas la saisie.
      if (verdict.quantity < MIN_QUANTITY) return etat;

      const lignes = [...etat.lignes];
      lignes[action.index] = {
        ...courante,
        quantity: verdict.quantity,
        priceCurrency: action.devise,
        packageQuantity: verdict.packageQuantity,
      };
      return { ...etat, lignes };
    }

    case "retirer":
      return { ...etat, lignes: etat.lignes.filter((_, i) => i !== action.index) };

    case "remiseLigne": {
      const courante = etat.lignes[action.index];
      if (!courante) return etat;
      const lignes = [...etat.lignes];
      lignes[action.index] = {
        ...courante,
        discount_percentage: bornerRemiseLigne(action.pourcentage, action.plafond),
      };
      return { ...etat, lignes };
    }

    case "remiseGlobale":
      return { ...etat, remiseGlobale: Math.max(0, action.montant) };

    case "client":
      // Retirer le client retire aussi ce qui n'a de sens qu'avec lui.
      return action.client
        ? { ...etat, client: action.client }
        : { ...etat, client: null, cagnotte: 0, aCredit: false, echeance: null };

    case "deviseFacture":
      return { ...etat, deviseFacture: action.code };

    case "deviseMonnaie":
      return { ...etat, deviseMonnaie: action.code };

    case "cagnotte":
      return { ...etat, cagnotte: Math.max(0, action.montant) };

    case "reglements":
      return { ...etat, reglements: action.reglements };

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
      return action.etat;

    case "vider":
      return PANIER_VIDE;
  }
}

/**
 * Le refus d'une saisie, en français.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ RIEN NE FERME PLUS L'AJOUT, PAS MÊME LE VERROU D'INVENTAIRE.            │
 * │                                                                          │
 * │ Un article sous inventaire était refusé ici, et sa carte rendue inerte : │
 * │ le caissier ne pouvait même pas le chiffrer sur une proforma. Le verrou  │
 * │ ferme désormais l'ENCAISSEMENT, avec le stock (`lignesEnRupture` du      │
 * │ noyau, le verrou avant la rupture, comme le serveur). Ce qui reste un    │
 * │ refus d'ajout n'est pas un manque : c'est une saisie vide.               │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Ici plutôt que dans le fournisseur React : c'est une règle, elle s'éprouve
 * sans appareil.
 */
export function motifDeRefus(
  article: ArticlePos,
  lignes: LignePanier[],
  saisie: Saisie
): string | null {
  const verdict = verifierAjout(article, lignes, saisie);
  if (verdict.quantity < MIN_QUANTITY) return verdict.raison;
  return null;
}

/**
 * Ce qui fermera l'encaissement, dit SANS rien fermer, au moment d'ajouter.
 *
 * Le caissier doit savoir qu'il compose un panier qu'il ne pourra pas
 * encaisser - le découvrir au moment de rendre la monnaie serait pire que le
 * refus qu'on vient de retirer. Mais c'est un AVERTISSEMENT : le bouton
 * « Ajouter » reste ouvert, parce que ce panier a vocation à sortir en
 * proforma.
 *
 * ⚠ LES PHRASES SONT CELLES DU NOYAU, et dans SON ordre : verrou, puis stock
 * inconnu, puis rupture. L'avertissement et le motif d'encaissement doivent se
 * ressembler mot pour mot, sinon le caissier croit à deux problèmes là où il
 * n'y en a qu'un.
 */
export function avertissementDeStock(
  article: ArticlePos,
  lignes: LignePanier[],
  saisie: Saisie
): string | null {
  const verdict = verifierAjout(article, lignes, saisie);
  if (verdict.quantity < MIN_QUANTITY) return null;
  if (article.verrou_inventaire !== null) {
    return motifDuVerrou(article.name, article.verrou_inventaire);
  }
  if (verdict.ok) return null;

  // Seul le cas « aucune ligne de stock » est réétiqueté. Un zéro RÉELLEMENT
  // enregistré doit continuer de se lire « 0 en stock » : c'est une
  // information certaine, et la noyer dans « inconnu » ferait chercher une
  // entrée de stock là où il faut réapprovisionner.
  const inconnu = article.stock_quantity === null && article.track_inventory;
  return inconnu ? motifStockInconnu(article.name) : verdict.raison;
}

/**
 * Les verrous d'inventaire qui pèsent sur le panier : article → session.
 *
 * Tirés des ARTICLES du panier, tels que le catalogue les a lus, sauf si le
 * fournisseur passe une carte relue de la base (`verrousVivants`) : celle-ci
 * fait foi, elle suit un inventaire démarré ou clos APRÈS la mise au panier.
 */
export function verrousDuPanier(
  lignes: LignePanier[],
  verrousVivants?: ReadonlyMap<string, string> | null
): Map<string, string> {
  if (verrousVivants) {
    const ici = new Set(lignes.map((l) => l.product.id));
    return new Map([...verrousVivants].filter(([id]) => ici.has(id)));
  }
  const carte = new Map<string, string>();
  for (const l of lignes) {
    if (l.product.verrou_inventaire !== null) {
      carte.set(l.product.id, l.product.verrou_inventaire);
    }
  }
  return carte;
}

/**
 * Ce qui ferme l'encaissement, ligne par ligne, dans l'ORDRE DU SERVEUR.
 *
 * Vide, le panier s'encaisse. Non vide, il ne s'encaisse pas et l'écran DIT
 * lesquelles, parce qu'un bouton grisé sans motif est un cul-de-sac. C'est la
 * règle du noyau (`lignesEnRupture`), partagée avec le comptoir web : deux
 * comptoirs du même établissement ne ferment pas sur deux règles.
 */
export function rupturesDuPanier(
  lignes: LignePanier[],
  verrousVivants?: ReadonlyMap<string, string> | null
): Rupture[] {
  return lignesEnRupture(lignes, { verrous: verrousDuPanier(lignes, verrousVivants) });
}

/** Les phrases qui ferment « Encaisser », une par ligne en cause. */
export function motifsEncaissement(
  lignes: LignePanier[],
  verrousVivants?: ReadonlyMap<string, string> | null
): string[] {
  return rupturesDuPanier(lignes, verrousVivants).map((r) => r.raison);
}
