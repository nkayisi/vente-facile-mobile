/**
 * Le bordereau d'une réquisition : la proposition, plus les articles ajoutés
 * à la main. Module PUR, éprouvé sans appareil.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA RECHERCHE FILTRE L'AFFICHAGE, JAMAIS CE QUI PART.                     │
 * │                                                                          │
 * │ Le bordereau était bâti sur la liste FILTRÉE : une ligne cochée et       │
 * │ corrigée, puis masquée par une recherche, n'était pas envoyée. Le        │
 * │ magasinier croyait demander dix articles et en demandait trois, sans un  │
 * │ mot. La proposition se lit désormais entière, et seul l'affichage est    │
 * │ filtré.                                                                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Un article ajouté à la main reste au bordereau quoi que fasse le filtre
 * « Ruptures seulement » : il n'a jamais été proposé, il n'a donc aucune
 * raison de disparaître avec la proposition. Le serveur accepte tout article
 * de l'organisation (`create_requisition`), même jamais reçu dans ce dépôt.
 */
import { lireNombre, type MotifRefus } from "@/data/nombres";

import type { LigneSaisie } from "./actes-requisition";
import type { LigneProposee } from "./proposition-requisition";

/** Une ligne du bordereau, telle qu'elle se relit sur le formulaire. */
export interface LigneRequise extends LigneSaisie {
  nom: string;
  sku: string | null;
  unite: string | null;
  stockAffiche: string;
  /** `null` : article ajouté à la main, sans seuil connu ici. */
  seuil: number | null;
  /** La saisie BRUTE : le champ garde ce qui est tapé, pas ce qu'on en déduit. */
  saisie: string;
  retenue: boolean;
  /** Ajouté à la main, hors de la proposition. */
  ajoutee: boolean;
}

export function ligneProposee(p: LigneProposee): LigneRequise {
  return {
    produit: p.produitId,
    nom: p.produit,
    sku: p.sku,
    unite: p.unite,
    stockAffiche: p.stockAffiche,
    seuil: p.seuil,
    quantite: p.suggere,
    saisie: String(p.suggere),
    retenue: true,
    ajoutee: false,
  };
}

/** Un article hors proposition : coché, et sa quantité ATTEND d'être tapée. */
export function ligneAjoutee(a: {
  produit: string;
  nom: string;
  sku: string | null;
  unite: string | null;
  stockAffiche: string;
}): LigneRequise {
  return { ...a, seuil: null, quantite: 0, saisie: "", retenue: true, ajoutee: true };
}

/**
 * La proposition ENTIÈRE, chaque ligne remplacée par sa saisie quand il y en
 * a une, puis les lignes ajoutées que la proposition ne porte pas.
 *
 * Ce qui est saisi prime sur ce qui est proposé : la proposition se relit dès
 * qu'une vente bouge le stock, et la relecture ne doit jamais écraser une
 * quantité corrigée ni recocher une ligne retirée.
 */
export function composerBordereau(
  proposition: LigneProposee[],
  saisies: LigneRequise[]
): LigneRequise[] {
  const parProduit = new Map(saisies.map((l) => [l.produit, l]));
  const proposees = proposition.map((p) => parProduit.get(p.produitId) ?? ligneProposee(p));
  const dansLaProposition = new Set(proposition.map((p) => p.produitId));
  const ajoutees = saisies.filter((l) => l.ajoutee && !dansLaProposition.has(l.produit));
  return [...proposees, ...ajoutees];
}

/** Ce que la recherche AFFICHE : nom ou SKU, sans égard à la casse. */
export function filtrerAffichage(bordereau: LigneRequise[], recherche: string): LigneRequise[] {
  const t = recherche.trim().toLowerCase();
  if (!t) return bordereau;
  return bordereau.filter(
    (l) => l.nom.toLowerCase().includes(t) || (l.sku ?? "").toLowerCase().includes(t)
  );
}

/** Le refus d'une ligne COCHÉE dont la saisie ne se lit pas. */
export function refusDeLigne(l: LigneRequise): MotifRefus | null {
  if (!l.retenue) return null;
  const lu = lireNombre(l.saisie);
  return lu.ok ? null : lu.motif;
}

/** Les lignes qui partiront : cochées, et d'une quantité lisible et positive. */
export function lignesRetenues(bordereau: LigneRequise[]): LigneRequise[] {
  return bordereau.filter((l) => {
    if (!l.retenue) return false;
    const lu = lireNombre(l.saisie);
    return lu.ok && lu.valeur != null && lu.valeur > 0;
  });
}

/**
 * Combien de lignes cochées RETIENNENT l'envoi. Une saisie « 12,5,0 » sortait
 * du bordereau sans un mot : on ferme le bouton et on le dit.
 */
export function nombreDeRefus(bordereau: LigneRequise[]): number {
  return bordereau.filter((l) => refusDeLigne(l) !== null).length;
}
