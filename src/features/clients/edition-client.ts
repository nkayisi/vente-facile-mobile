/**
 * Créer ou modifier un client (lot L12) : les conversions, PURES.
 *
 * Même motif que `features/inventaire/edition-article.ts` : un seul format
 * pivot, le corps du serializer, que la fiche locale, la création en file ou
 * la dernière modification en file produisent tous trois. Et un seul corps
 * pour les deux actes : la création et la modification ne peuvent pas
 * diverger sur la façon d'écrire un plafond ou une raison sociale.
 */
import { lireNombre, type MotifRefus } from "@/data/nombres";

export type TypeClient = "individual" | "business";

/** Ce que le formulaire a lu. */
export interface SaisieClient {
  nom: string;
  telephone: string;
  entreprise: boolean;
  raisonSociale?: string;
  email?: string;
  adresse?: string;
  numeroImpot?: string;
  creditAutorise: boolean;
  /** 0 signifie « sans plafond », jamais « crédit refusé ». */
  plafondCredit: number;
  notes?: string;
}

/** Le corps commun à `customer.create` et `customer.update`. */
export interface CorpsClient {
  name: string;
  phone: string;
  customer_type: TypeClient;
  company_name: string;
  tax_id: string;
  email: string;
  address: string;
  allow_credit: boolean;
  credit_limit: string;
  notes: string;
}

/** Ce que la base locale porte d'un client, colonnes brutes. */
export interface LigneClient {
  customerType: string;
  name: string;
  companyName: string;
  email: string;
  phone: string;
  address: string;
  taxId: string;
  allowCredit: boolean;
  creditLimit: string;
  notes: string;
}

export interface ValeursClient {
  type: TypeClient;
  nom: string;
  telephone: string;
  raisonSociale: string;
  numeroImpot: string;
  email: string;
  adresse: string;
  notes: string;
  creditAutorise: boolean;
  plafond: string;
}

/**
 * Le corps d'un client. Un particulier n'a ni raison sociale ni numéro
 * d'impôt : le serveur les vide de toute façon, le terminal le fait d'abord.
 */
export function corpsClient(s: SaisieClient): CorpsClient {
  return {
    name: s.nom.trim(),
    phone: s.telephone.trim(),
    customer_type: s.entreprise ? "business" : "individual",
    company_name: s.entreprise ? (s.raisonSociale ?? "").trim() : "",
    tax_id: s.entreprise ? (s.numeroImpot ?? "").trim() : "",
    email: (s.email ?? "").trim(),
    address: (s.adresse ?? "").trim(),
    allow_credit: s.creditAutorise,
    credit_limit: String(s.plafondCredit),
    notes: (s.notes ?? "").trim(),
  };
}

export function corpsDepuisLigneClient(l: LigneClient): CorpsClient {
  return {
    name: l.name,
    phone: l.phone,
    customer_type: l.customerType === "business" ? "business" : "individual",
    company_name: l.companyName ?? "",
    tax_id: l.taxId ?? "",
    email: l.email ?? "",
    address: l.address ?? "",
    allow_credit: l.allowCredit,
    credit_limit: l.creditLimit,
    notes: l.notes ?? "",
  };
}

/** « 50000.00 » → « 50000 » ; un plafond nul se lit comme un champ VIDE (sans plafond). */
function plafondLisible(brut: string | undefined): string {
  if (!brut) return "";
  const n = Number(brut);
  if (!Number.isFinite(n) || n === 0) return "";
  return String(brut).includes(".") ? String(brut).replace(/0+$/, "").replace(/\.$/, "") : String(brut);
}

export function valeursDepuisCorpsClient(c: Partial<CorpsClient>): ValeursClient {
  return {
    type: c.customer_type === "business" ? "business" : "individual",
    nom: c.name ?? "",
    telephone: c.phone ?? "",
    raisonSociale: c.company_name ?? "",
    numeroImpot: c.tax_id ?? "",
    email: c.email ?? "",
    adresse: c.address ?? "",
    notes: c.notes ?? "",
    creditAutorise: c.allow_credit ?? true,
    plafond: plafondLisible(c.credit_limit),
  };
}

/**
 * Le plafond de crédit saisi.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ « 50 000 » SE LISAIT ZÉRO, ET ZÉRO VEUT DIRE « SANS PLAFOND ».          │
 * │                                                                          │
 * │ L'écran lisait `Number(x.replace(",", "."))` : un séparateur de milliers │
 * │ donnait `NaN`, ramené à 0 - et un plafond à 0 n'est pas « crédit         │
 * │ refusé », c'est « crédit illimité ». Le marchand qui voulait borner un   │
 * │ client à cinquante mille francs lui ouvrait un crédit sans limite, sans  │
 * │ qu'aucun écran ne le dise.                                               │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Un champ VIDE vaut 0 (sans plafond, c'est le sens affiché) ; une saisie
 * illisible ou négative est un REFUS, jamais un zéro.
 */
export function lirePlafond(
  saisie: string
): { ok: true; valeur: number } | { ok: false; motif: MotifRefus } {
  const lu = lireNombre(saisie);
  if (!lu.ok) return lu;
  return { ok: true, valeur: lu.valeur ?? 0 };
}
