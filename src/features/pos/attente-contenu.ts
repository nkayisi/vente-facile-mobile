/**
 * Ce qu'un panier mis en attente emporte, et comment il revient.
 *
 * Aucune dépendance de plateforme, et c'est la raison d'être du fichier : la
 * reprise est le moment risqué du dispositif, elle rejoue une intention rangée
 * il y a une heure contre un catalogue qui a bougé. Un défaut n'y plante pas,
 * il vend au mauvais prix ou au-delà du stock. Cela doit s'éprouver sans base
 * de données ni appareil.
 *
 * DEUX RÈGLES GOUVERNENT CE MODULE, et elles disent la même chose : un panier
 * en attente n'est pas une photographie, c'est une intention.
 *
 * 1. On met en attente un PANIER, pas un encaissement. Ni les règlements, ni
 *    les points de fidélité, ni le choix du crédit ne sont conservés : ce sont
 *    des décisions prises face au client, sur des soldes qui bougent
 *    entre-temps. Les restituer ferait payer avec des points dépensés depuis.
 *
 * 2. Le contenu ne porte que des identifiants et les nombres SAISIS, jamais une
 *    copie du produit. Prix, stock et solde du client sont RELUS à la reprise.
 *    Un panier rangé le matin vendrait sinon le soir au prix du matin, et
 *    passerait outre un stock tombé à zéro depuis, deux erreurs qu'aucun écran
 *    ne montrerait.
 *
 * Ce que la reprise ne peut pas honorer, elle le DIT. Elle ne corrige jamais en
 * silence : un panier qui reviendrait amputé de deux lignes sans un mot est
 * pire qu'un panier refusé.
 */
import { looseQuantityOf, verifierAjout } from "@vente-facile/core/pos";

import type { ArticlePos } from "./catalogue";
import type { EtatPanier, LignePanier } from "./etat-panier";

/** Version du contenu sérialisé. Un panier d'une version inconnue est ignoré. */
const VERSION = 1;

/**
 * Une ligne rangée : les deux compteurs tels que le sélecteur les a produits,
 * jamais leur somme.
 *
 * Le total se REFAIT à la reprise, `paquets × facteur du jour + vrac`. Ranger
 * le total obligerait à le redécouper au retour, et le conditionnement a pu
 * changer entre-temps : un casier passé de 24 à 12 bouteilles rendrait alors un
 * partage que personne n'a saisi.
 */
export interface LigneEnAttente {
  productId: string;
  packages: number;
  loose: number;
  /** Prix retenu au comptoir, éventuellement corrigé à la main. */
  unitPrice: number;
  discountPercentage: number;
}

export interface ContenuEnAttente {
  version: number;
  lignes: LigneEnAttente[];
  remiseGlobale: number;
  clientId: string | null;
  deviseFacture: string | null;
  deviseMonnaie: string | null;
}


/** Ce qu'une reprise rend, y compris ce qu'elle n'a PAS pu honorer. */
export interface Reprise {
  etat: EtatPanier;
  /** Lignes écartées, chacune avec son motif, en français. */
  ecartees: string[];
  /** Articles dont le prix a changé depuis la mise en attente. */
  prixChanges: string[];
  /** Le client attaché n'existe plus, ou n'est plus actif. */
  clientPerdu: boolean;
}

/**
 * L'état du panier ramené à ce qui se range.
 *
 * Pur, donc éprouvable sans appareil : c'est ici que se décide ce qu'un panier
 * emporte et ce qu'il abandonne.
 */
export function serialiser(etat: EtatPanier): ContenuEnAttente {
  return {
    version: VERSION,
    lignes: etat.lignes.map((l) => ({
      productId: l.product.id,
      packages: l.packageQuantity,
      loose: looseQuantityOf(l),
      unitPrice: l.unit_price,
      discountPercentage: l.discount_percentage,
    })),
    remiseGlobale: etat.remiseGlobale,
    clientId: etat.client?.id ?? null,
    deviseFacture: etat.deviseFacture,
    deviseMonnaie: etat.deviseMonnaie,
  };
}

/**
 * Relecture tolérante du contenu rangé.
 *
 * `null` plutôt qu'une exception : un panier illisible ne doit pas empêcher
 * d'ouvrir la liste et de supprimer la ligne fautive.
 */
export function analyser(brut: string): ContenuEnAttente | null {
  try {
    const objet = JSON.parse(brut) as Partial<ContenuEnAttente>;
    if (!objet || objet.version !== VERSION || !Array.isArray(objet.lignes)) return null;
    return {
      version: VERSION,
      lignes: objet.lignes.filter(
        (l): l is LigneEnAttente => typeof l?.productId === "string"
      ),
      remiseGlobale: Number(objet.remiseGlobale) || 0,
      clientId: objet.clientId ?? null,
      deviseFacture: objet.deviseFacture ?? null,
      deviseMonnaie: objet.deviseMonnaie ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Rejoue les lignes rangées contre le catalogue D'AUJOURD'HUI.
 *
 * Pur, et c'est voulu : la règle de reprise se vérifie sur un tableau
 * d'articles fabriqué à la main, sans base ni appareil.
 *
 * Chaque ligne repasse par `verifierAjout`, exactement comme si le caissier la
 * saisissait à l'instant, et elle est vérifiée CONTRE LES LIGNES DÉJÀ
 * RESTAURÉES : deux lignes du même article ne peuvent pas dépasser ensemble un
 * stock qu'aucune ne dépasse seule.
 */
export function restaurerLignes(
  contenu: ContenuEnAttente,
  articles: Map<string, ArticlePos>
): { lignes: LignePanier[]; ecartees: string[]; prixChanges: string[] } {
  const lignes: LignePanier[] = [];
  const ecartees: string[] = [];
  const prixChanges: string[] = [];

  for (const rangee of contenu.lignes) {
    const article = articles.get(rangee.productId);
    if (!article) {
      // On ne connaît même plus son nom : l'article a quitté le catalogue, ou
      // n'est plus vendable. Le dire sans le nommer vaut mieux que l'oublier.
      ecartees.push("Un article ne figure plus au catalogue.");
      continue;
    }

    const verdict = verifierAjout(article, lignes, {
      packages: rangee.packages,
      loose: rangee.loose,
    });
    if (!verdict.ok) {
      ecartees.push(verdict.raison ?? `${article.name} n'a pas pu être repris.`);
      continue;
    }

    const prixCatalogue = Number(article.selling_price) || 0;
    // Le prix RANGÉ est conservé : il a pu être corrigé à la main, et c'est
    // celui qui a été annoncé au client. On signale l'écart, on ne tranche pas
    // à la place du caissier.
    if (Math.abs(prixCatalogue - rangee.unitPrice) > 0.005) {
      prixChanges.push(article.name);
    }

    lignes.push({
      product: article,
      quantity: verdict.quantity,
      packageQuantity: verdict.packageQuantity,
      unit_price: rangee.unitPrice,
      discount_percentage: rangee.discountPercentage,
    });
  }

  return { lignes, ecartees, prixChanges };
}

/**
 * Une remise globale n'a plus de sens si le panier a maigri.
 *
 * Elle a été saisie en montant, sur un total qui n'existe plus. La reporter
 * telle quelle pourrait dépasser le nouveau total, et le plafond de
 * `maxGlobalDiscount` la refuserait à l'encaissement, plus tard, sans que la
 * cause soit lisible.
 */
export function remiseReportable(contenu: ContenuEnAttente, ecartees: number): number {
  return ecartees === 0 ? contenu.remiseGlobale : 0;
}

/**
 * Étiquette par défaut : le nom du client, sinon l'heure.
 *
 * L'heure a un mérite que « Panier 3 » n'a pas : deux paniers rangés à dix
 * minutes d'intervalle se distinguent, et le caissier retrouve le sien sans
 * l'ouvrir.
 */
export function etiquetteParDefaut(etat: EtatPanier, maintenant = new Date()): string {
  if (etat.client?.name) return etat.client.name;
  const hh = String(maintenant.getHours()).padStart(2, "0");
  const mm = String(maintenant.getMinutes()).padStart(2, "0");
  return `Panier de ${hh}:${mm}`;
}
