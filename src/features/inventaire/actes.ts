/**
 * Les actes d'une session d'inventaire, et la création au catalogue.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE COMPTAGE S'ÉCRIT DANS LE JOURNAL, PAS DANS LA TABLE TIRÉE.           │
 * │                                                                          │
 * │ On compte debout dans le rayon, souvent sans réseau. Un comptage écrit   │
 * │ localement puis refusé laisserait une feuille qui se croit finie. La     │
 * │ fusion se fait donc à la lecture : la table tirée porte ce que le        │
 * │ serveur sait, le journal ce que le magasinier vient de saisir.           │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import * as Crypto from "expo-crypto";

import { enAttenteParType, enqueue } from "@/sync";

import { slugifier } from "./slug";

export interface SaisieSession {
  nom: string;
  entrepot: string;
  perimetre: "full" | "category" | "product";
  categories?: string[];
  produits?: string[];
  notes?: string;
}

export async function creerSession(saisie: SaisieSession): Promise<string> {
  const id = Crypto.randomUUID();
  await enqueue(id, "inventory_session.create", {
    id,
    name: saisie.nom,
    warehouse: saisie.entrepot,
    scope_type: saisie.perimetre,
    ...(saisie.categories?.length ? { categories: saisie.categories } : {}),
    ...(saisie.produits?.length ? { products: saisie.produits } : {}),
    notes: saisie.notes ?? "",
  });
  return id;
}

export type TransitionSession = "start" | "submit" | "validate" | "cancel";

export async function transitionSession(
  sessionId: string,
  transition: TransitionSession
): Promise<string> {
  const id = Crypto.randomUUID();
  await enqueue(id, `inventory_session.${transition}` as never, {
    id,
    session: sessionId,
  });
  return id;
}

/** Un comptage, tel que le magasinier le saisit dans le rayon. */
export interface Comptage {
  ligne: string;
  /** Total en unité de détail. Toujours envoyé : le serveur le retient si la
   *  ligne n'a pas de conditionnement. */
  total: number;
  contenants?: number;
  vrac?: number;
  notes?: string;
}

/**
 * Envoie un lot de comptages.
 *
 * Un LOT et non une ligne à la fois : on compte une allée, puis on enregistre.
 * Une ligne inconnue du serveur est ignorée par lui, pas refusée - le travail
 * du magasinier ne doit pas être condamné par une ligne supprimée entre-temps.
 */
export async function enregistrerComptages(
  sessionId: string,
  comptages: Comptage[]
): Promise<string> {
  const id = Crypto.randomUUID();
  await enqueue(id, "inventory_session.count", {
    id,
    session: sessionId,
    counts: comptages.map((c) => ({
      id: c.ligne,
      quantity_counted: String(c.total),
      ...(c.contenants != null
        ? { counted_package_quantity: String(c.contenants) }
        : {}),
      ...(c.vrac != null ? { counted_loose_quantity: String(c.vrac) } : {}),
      ...(c.notes ? { notes: c.notes } : {}),
    })),
  });
  return id;
}

/** Comptages saisis sur ce terminal et pas encore confirmés, par ligne. */
export interface ComptageEnAttente {
  total: number;
  contenants: number | null;
  vrac: number | null;
}

export async function comptagesEnAttente(
  sessionId: string
): Promise<Map<string, ComptageEnAttente>> {
  const ops = await enAttenteParType<{
    session: string;
    counts?: {
      id: string;
      quantity_counted?: string;
      counted_package_quantity?: string;
      counted_loose_quantity?: string;
    }[];
  }>("inventory_session.count");

  // Le DERNIER comptage d'une ligne gagne : le magasinier recompte quand il
  // doute, et c'est sa dernière lecture qui vaut.
  const par = new Map<string, ComptageEnAttente>();
  for (const o of ops) {
    if (o.payload.session !== sessionId) continue;
    for (const c of o.payload.counts ?? []) {
      par.set(c.id, {
        total: Number(c.quantity_counted ?? 0),
        contenants:
          c.counted_package_quantity != null
            ? Number(c.counted_package_quantity)
            : null,
        vrac:
          c.counted_loose_quantity != null ? Number(c.counted_loose_quantity) : null,
      });
    }
  }
  return par;
}

/** Une session créée sur ce terminal et pas encore confirmée. */
export interface SessionEnAttente {
  id: string;
  nom: string;
  entrepot: string;
  perimetre: string;
}

/**
 * Les sessions créées ici, encore dans le journal.
 *
 * Sans cette lecture, une session tout juste créée serait déclarée
 * « introuvable » par sa propre fiche : elle n'est PAS dans la table tirée, et
 * elle ne doit pas y être. C'est la contrepartie systématique de la règle
 * « on n'écrit rien dans une table tirée ».
 */
export async function creationsEnAttente(): Promise<SessionEnAttente[]> {
  const ops = await enAttenteParType<{
    id: string;
    name?: string;
    warehouse?: string;
    scope_type?: string;
  }>("inventory_session.create");
  return ops.map((o) => ({
    id: o.payload.id,
    nom: o.payload.name ?? "Session",
    entrepot: o.payload.warehouse ?? "",
    perimetre: o.payload.scope_type ?? "full",
  }));
}

/** Sessions dont une transition attend son envoi. */
export async function sessionsEnAttente(): Promise<Set<string>> {
  const [creations, transitions] = await Promise.all([
    enAttenteParType<{ id: string }>("inventory_session.create"),
    Promise.all(
      (["start", "submit", "validate", "cancel"] as const).map((t) =>
        enAttenteParType<{ session: string }>(`inventory_session.${t}`)
      )
    ),
  ]);
  return new Set([
    ...creations.map((o) => o.payload.id),
    ...transitions.flat().map((o) => o.payload.session),
  ]);
}

// ------------------------------------------------------------------ catalogue

export interface SaisieArticle {
  nom: string;
  sku: string;
  codeBarres?: string;
  categorie?: string | null;
  marque?: string | null;
  unite?: string | null;
  prixVente: number;
  prixAchat: number;
  suitLeStock: boolean;
  seuilReassort?: number;
  /** Conditionnement : nombre d'unités de détail par contenant. */
  unitesParContenant?: number;
  uniteContenant?: string | null;
  notes?: string;
}

export async function creerArticle(saisie: SaisieArticle): Promise<string> {
  const id = Crypto.randomUUID();
  await enqueue(id, "product.create", {
    id,
    name: saisie.nom.trim(),
    slug: slugifier(saisie.nom),
    sku: saisie.sku.trim(),
    ...(saisie.codeBarres?.trim() ? { barcode: saisie.codeBarres.trim() } : {}),
    ...(saisie.categorie ? { category: saisie.categorie } : {}),
    ...(saisie.marque ? { brand: saisie.marque } : {}),
    ...(saisie.unite ? { unit: saisie.unite } : {}),
    selling_price: String(saisie.prixVente),
    cost_price: String(saisie.prixAchat),
    track_inventory: saisie.suitLeStock,
    ...(saisie.seuilReassort != null
      ? { reorder_point: String(saisie.seuilReassort) }
      : {}),
    ...(saisie.unitesParContenant && saisie.unitesParContenant > 1
      ? {
          selling_mode: "both",
          units_per_package: saisie.unitesParContenant,
          ...(saisie.uniteContenant ? { packaging_unit: saisie.uniteContenant } : {}),
        }
      : {}),
    notes: saisie.notes ?? "",
    is_active: true,
  });
  return id;
}

export async function creerReferentiel(
  genre: "category" | "brand" | "unit",
  saisie: { nom: string; symbole?: string; parent?: string | null }
): Promise<string> {
  const id = Crypto.randomUUID();
  await enqueue(id, `${genre}.create` as never, {
    id,
    name: saisie.nom.trim(),
    // Une UNITÉ n'a pas de `slug` : elle porte un symbole.
    ...(genre === "unit"
      ? { symbol: (saisie.symbole ?? saisie.nom).trim() }
      : { slug: slugifier(saisie.nom) }),
    ...(genre === "category" && saisie.parent ? { parent: saisie.parent } : {}),
    is_active: true,
  });
  return id;
}

/** Ce que le catalogue attend d'envoyer, par genre. */
export async function catalogueEnAttente(): Promise<{
  articles: { id: string; nom: string; sku: string }[];
  referentiels: number;
}> {
  const [articles, cats, marques, unites] = await Promise.all([
    enAttenteParType<{ id: string; name: string; sku: string }>("product.create"),
    enAttenteParType<{ id: string }>("category.create"),
    enAttenteParType<{ id: string }>("brand.create"),
    enAttenteParType<{ id: string }>("unit.create"),
  ]);
  return {
    articles: articles.map((o) => ({
      id: o.payload.id,
      nom: o.payload.name,
      sku: o.payload.sku,
    })),
    referentiels: cats.length + marques.length + unites.length,
  };
}

export { slugifier };
