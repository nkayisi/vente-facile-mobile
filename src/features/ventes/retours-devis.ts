/**
 * Les actes d'un RETOUR et d'un DEVIS.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CONVERTIR UN DEVIS INSCRIT UNE DETTE.                                   │
 * │                                                                          │
 * │ Un devis converti est une facture émise et non payée, au même titre      │
 * │ qu'une vente à crédit. Le serveur s'en charge, et il le faut : quand ce  │
 * │ n'était pas le cas, la facture était retenue comme « ouverte » sans      │
 * │ qu'aucune dette soit inscrite, et son règlement décrémentait un solde    │
 * │ jamais incrémenté - le client devenait artificiellement créditeur.       │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Comme partout : rien n'est écrit dans les tables tirées. Un retour approuvé
 * localement puis refusé laisserait du stock rendu qui ne l'a jamais été.
 */
import * as Crypto from "expo-crypto";

import { enAttenteParType, enqueue } from "@/sync";

export interface LigneRetourSaisie {
  /** La ligne de VENTE d'origine. Sans elle, rien ne dit ce qui est rendu. */
  ligneVente: string;
  produit: string;
  quantite: number;
  prixUnitaire: number;
  /** Faux : l'article ne retourne PAS en rayon (cassé, périmé). */
  remisEnStock?: boolean;
}

export async function creerRetour(saisie: {
  vente: string;
  entrepot: string;
  motif: string;
  lignes: LigneRetourSaisie[];
}): Promise<string> {
  const id = Crypto.randomUUID();
  await enqueue(id, "sale_return.create", {
    id,
    original_sale: saisie.vente,
    warehouse: saisie.entrepot,
    reason: saisie.motif.trim(),
    items: saisie.lignes.map((l) => ({
      original_item: l.ligneVente,
      product: l.produit,
      quantity: String(l.quantite),
      unit_price: String(l.prixUnitaire),
      total: String(l.quantite * l.prixUnitaire),
      // `restock` par défaut : un retour rend la marchandise. Le décocher est
      // le cas particulier (cassé, périmé), pas l'inverse.
      restock: l.remisEnStock !== false,
    })),
  });
  return id;
}

export async function transitionRetour(
  retourId: string,
  transition: "approve" | "reject"
): Promise<string> {
  const id = Crypto.randomUUID();
  await enqueue(id, `sale_return.${transition}` as never, {
    id,
    sale_return: retourId,
  });
  return id;
}

export interface LigneDevisSaisie {
  produit: string;
  quantite: number;
  prixUnitaire: number;
  description?: string;
}

export async function creerDevis(saisie: {
  client?: string | null;
  valideJusquau: string;
  lignes: LigneDevisSaisie[];
  notes?: string;
  conditions?: string;
}): Promise<string> {
  const id = Crypto.randomUUID();
  await enqueue(id, "quotation.create", {
    id,
    ...(saisie.client ? { customer: saisie.client } : {}),
    // `valid_until` est OBLIGATOIRE : un devis sans date de validité n'expire
    // jamais, et le serveur refuse d'en créer.
    valid_until: saisie.valideJusquau,
    notes: saisie.notes ?? "",
    terms: saisie.conditions ?? "",
    items: saisie.lignes.map((l) => ({
      product: l.produit,
      quantity: String(l.quantite),
      unit_price: String(l.prixUnitaire),
      total: String(l.quantite * l.prixUnitaire),
      ...(l.description ? { description: l.description } : {}),
    })),
  });
  return id;
}

/**
 * Convertit un devis en vente.
 *
 * L'entrepôt est facultatif : sans lui, le serveur retient l'entrepôt principal
 * du périmètre du membre. Le nommer évite qu'un magasinier à plusieurs dépôts
 * réserve du stock ailleurs qu'il ne croit.
 */
export async function convertirDevis(
  devisId: string,
  entrepot?: string | null
): Promise<string> {
  const id = Crypto.randomUUID();
  await enqueue(id, "quotation.convert", {
    id,
    quotation: devisId,
    ...(entrepot ? { warehouse: entrepot } : {}),
  });
  return id;
}

export interface RetourEnAttente {
  id: string;
  venteId: string;
  motif: string;
  montant: number;
  nbLignes: number;
  date: Date | null;
}

export interface DevisEnAttente {
  id: string;
  clientId: string | null;
  valideJusquau: string | null;
  montant: number;
  nbLignes: number;
  date: Date | null;
}

/**
 * Les retours et devis créés ICI, encore dans le journal.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ SANS CETTE LECTURE, LA LISTE DIT « AUCUN RETOUR » JUSTE APRÈS EN AVOIR   │
 * │ CRÉÉ UN.                                                                 │
 * │                                                                          │
 * │ Relevé sur l'émulateur : le bandeau vert annonce « Retour enregistré »   │
 * │ pendant que l'écran d'arrivée affiche son état vide. La pièce n'est PAS  │
 * │ dans la table tirée, et elle ne doit pas y être ; c'est la contrepartie  │
 * │ systématique de « les tables tirées ne sont écrites que par le tirage ». │
 * │ Le prix à payer est cette fusion, à faire partout où l'on crée.          │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Les montants sont ceux SAISIS, pas ceux que le serveur arrêtera : les lignes
 * du journal portent déjà `total` par ligne, on les somme sans rien recalculer.
 */
export async function creationsEnAttente(): Promise<{
  retours: RetourEnAttente[];
  devis: DevisEnAttente[];
}> {
  type LigneJournal = { total?: string; quantity?: string; unit_price?: string };
  const somme = (items: LigneJournal[] | undefined): number =>
    (items ?? []).reduce((t, l) => {
      const n = Number(l.total ?? 0);
      return t + (Number.isFinite(n) ? n : 0);
    }, 0);

  const [retours, devis] = await Promise.all([
    enAttenteParType<{
      id: string;
      original_sale: string;
      reason?: string;
      items?: LigneJournal[];
    }>("sale_return.create"),
    enAttenteParType<{
      id: string;
      customer?: string;
      valid_until?: string;
      items?: LigneJournal[];
    }>("quotation.create"),
  ]);

  return {
    retours: retours.map((o) => ({
      id: o.payload.id,
      venteId: o.payload.original_sale,
      motif: o.payload.reason ?? "",
      montant: somme(o.payload.items),
      nbLignes: (o.payload.items ?? []).length,
      date: o.occurredAt,
    })),
    devis: devis.map((o) => ({
      id: o.payload.id,
      clientId: o.payload.customer ?? null,
      valideJusquau: o.payload.valid_until ?? null,
      montant: somme(o.payload.items),
      nbLignes: (o.payload.items ?? []).length,
      date: o.occurredAt,
    })),
  };
}

/**
 * La fiche d'une pièce ENCORE DANS LE JOURNAL.
 *
 * Corollaire direct de la fusion des listes : sans elle, toucher le retour
 * qu'on vient de créer ouvre une fiche « Retour introuvable ». C'est le défaut
 * exact déjà rencontré sur les sessions de caisse, et il se répare de la même
 * façon - en lisant le journal, jamais en écrivant dans la table tirée.
 *
 * Les noms de produits sont RELUS dans le catalogue local : le journal ne
 * porte que des identifiants, parce que c'est ce que le serveur attend.
 */
export async function detailEnAttente(id: string): Promise<{
  kind: "sale_return" | "quotation";
  motif: string;
  venteId: string | null;
  valideJusquau: string | null;
  date: Date | null;
  montant: number;
  lignes: {
    produitId: string;
    quantite: number;
    prixUnitaire: number;
    total: number;
    remisEnStock: boolean;
  }[];
} | null> {
  type LigneJournal = {
    product?: string;
    quantity?: string;
    unit_price?: string;
    total?: string;
    restock?: boolean;
  };
  const nb = (v: unknown): number => {
    const n = Number(v ?? 0);
    return Number.isFinite(n) ? n : 0;
  };
  const lignesDe = (items: LigneJournal[] | undefined) =>
    (items ?? []).map((l) => ({
      produitId: String(l.product ?? ""),
      quantite: nb(l.quantity),
      prixUnitaire: nb(l.unit_price),
      total: nb(l.total),
      // Le journal écrit `restock` explicitement ; son absence vaut « oui »,
      // comme à la saisie.
      remisEnStock: l.restock !== false,
    }));

  const [retours, devis] = await Promise.all([
    enAttenteParType<{
      id: string;
      original_sale?: string;
      reason?: string;
      items?: LigneJournal[];
    }>("sale_return.create"),
    enAttenteParType<{
      id: string;
      valid_until?: string;
      items?: LigneJournal[];
    }>("quotation.create"),
  ]);

  const r = retours.find((o) => o.payload.id === id);
  if (r) {
    const lignes = lignesDe(r.payload.items);
    return {
      kind: "sale_return",
      motif: r.payload.reason ?? "",
      venteId: r.payload.original_sale ?? null,
      valideJusquau: null,
      date: r.occurredAt,
      montant: lignes.reduce((t, l) => t + l.total, 0),
      lignes,
    };
  }

  const d = devis.find((o) => o.payload.id === id);
  if (d) {
    const lignes = lignesDe(d.payload.items);
    return {
      kind: "quotation",
      motif: "",
      venteId: null,
      valideJusquau: d.payload.valid_until ?? null,
      date: d.occurredAt,
      montant: lignes.reduce((t, l) => t + l.total, 0),
      lignes,
    };
  }
  return null;
}

/**
 * Ce que le journal retient pour les retours et les devis.
 *
 * `creations` est SÉPARÉ des transitions, et la distinction se voit à l'écran :
 * une pièce qui attend sa création n'a pas encore d'existence côté serveur,
 * tandis qu'une décision en attente porte sur une pièce qui existe. Écrire
 * « Une décision attend son envoi » sur un retour tout juste créé annoncerait
 * une approbation que personne n'a demandée.
 */
export async function enAttenteRetoursDevis(): Promise<{
  retours: Set<string>;
  devis: Set<string>;
  creations: Set<string>;
}> {
  const [creationsR, transitionsR, creationsD, conversions] = await Promise.all([
    enAttenteParType<{ id: string }>("sale_return.create"),
    Promise.all(
      (["approve", "reject"] as const).map((t) =>
        enAttenteParType<{ sale_return: string }>(`sale_return.${t}`)
      )
    ),
    enAttenteParType<{ id: string }>("quotation.create"),
    enAttenteParType<{ quotation: string }>("quotation.convert"),
  ]);

  return {
    retours: new Set([
      ...creationsR.map((o) => o.payload.id),
      ...transitionsR.flat().map((o) => o.payload.sale_return),
    ]),
    devis: new Set([
      ...creationsD.map((o) => o.payload.id),
      ...conversions.map((o) => o.payload.quotation),
    ]),
    creations: new Set([
      ...creationsR.map((o) => o.payload.id),
      ...creationsD.map((o) => o.payload.id),
    ]),
  };
}
