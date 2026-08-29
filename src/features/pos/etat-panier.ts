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
import { verifierAjout, type BasketLine, type Saisie } from "@vente-facile/core/pos";

import type { ArticlePos } from "./catalogue";

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
};

/**
 * Exporté pour être éprouvé sans appareil : ce réducteur porte des règles que
 * l'écran ne montre pas (fusion des deux compteurs, exclusion de la ligne en
 * cours d'édition de son propre contrôle de stock), et un défaut s'y traduit
 * par un panier faux plutôt que par un plantage visible.
 */
export function reducteurPanier(etat: EtatPanier, action: ActionPanier): EtatPanier {
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
        discount_percentage: Math.min(100, Math.max(0, action.pourcentage)),
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

