/**
 * Les quatre rapports de caisse. Miroir de
 * `app/dashboard/cashbook/reports/page.tsx`.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ILS EXIGENT LE RÉSEAU, ET C'EST DÉLIBÉRÉ.                               │
 * │                                                                          │
 * │ Le solde d'OUVERTURE d'une période se relève sur tout l'historique des   │
 * │ mouvements, que le terminal ne détient pas : il tire une fenêtre         │
 * │ récente. Le recalculer localement donnerait deux chiffres pour le même   │
 * │ tiroir, et le marchand n'aurait aucun moyen de savoir lequel a raison -  │
 * │ le lot 5bis a montré ce que ça coûte. Ce qui doit marcher hors ligne,    │
 * │ c'est VENDRE, ENCAISSER et CLÔTURER ; un rapport de caisse est un outil  │
 * │ d'analyse. L'écran le DIT quand il n'y a pas de réseau, plutôt que       │
 * │ d'afficher un tableau vide, qui se lirait comme « rien à signaler ».     │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ Ce module ne fait que RÉÉTIQUETER. Aucune somme n'y est refaite : une
 * addition écrite ici serait exactement la divergence qu'il existe pour
 * empêcher. C'est la règle déjà posée sur `data/rapports.ts`.
 */
import { api } from "@/api/client";

export type PorteeRapportCaisse = "daily" | "monthly" | "annual" | "custom";

/** Les quatre portées, dans les mots du back-office. */
export const PORTEES_CAISSE: { valeur: PorteeRapportCaisse; label: string }[] = [
  { valeur: "daily", label: "Jour" },
  { valeur: "monthly", label: "Mois" },
  { valeur: "annual", label: "Année" },
  { valeur: "custom", label: "Période" },
];

export const TITRES_CAISSE: Record<PorteeRapportCaisse, string> = {
  daily: "Rapport journalier de caisse",
  monthly: "Rapport mensuel de caisse",
  annual: "Rapport annuel de caisse",
  custom: "Rapport de caisse personnalisé",
};

/** Une ligne du tableau par devise : c'est la SEULE lecture de solde qui vaille. */
export interface LigneDevise {
  devise: string;
  ouverture: number;
  entrees: number;
  sorties: number;
  net: number;
  cloture: number;
}

export interface LigneType {
  devise: string;
  type: string;
  entree: boolean;
  total: number;
  nombre: number;
}

/** Un seau temporel : une journée pour le mois, un mois pour l'année. */
export interface Seau {
  cle: string;
  devise: string;
  entrees: number;
  sorties: number;
  nombre: number;
}

export interface LigneCategorieDepense {
  devise: string;
  categorie: string;
  couleur: string | null;
  total: number;
  nombre: number;
}

export interface MouvementRapport {
  id: string;
  reference: string;
  type: string;
  entree: boolean;
  description: string;
  montant: number;
  devise: string;
  soldeApres: number;
  date: string;
}

export interface RapportCaisse {
  /** Ce que la fenêtre recouvre, en toutes lettres. */
  libelle: string;
  parDevise: LigneDevise[];
  parType: LigneType[];
  /** Vide sur le journalier : il n'a pas de découpage temporel. */
  seaux: Seau[];
  /** L'intitulé de la colonne des seaux : « Date » ou « Mois ». */
  libelleSeau: string;
  depensesParCategorie: LigneCategorieDepense[];
  /** Les mouvements de la journée. Vide hors journalier. */
  mouvements: MouvementRapport[];
  /** Le total des mouvements de la journée, jamais la page chargée. */
  nombreMouvements: number;
  nombre: number;
}

const nb = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

interface BrutDevise {
  currency: string;
  opening_balance: string;
  total_in: string;
  total_out: string;
  net: string;
  closing_balance: string;
}
interface BrutType {
  currency: string;
  movement_type: string;
  direction: string;
  total: string;
  count: number;
}
interface BrutSeau {
  day?: string;
  month?: string;
  currency: string;
  total_in: string;
  total_out: string;
  count: number;
}
interface BrutCategorie {
  currency: string;
  expense__category__name: string | null;
  expense__category__color: string | null;
  total: string;
  count: number;
}
interface BrutMouvement {
  id: string;
  reference: string;
  movement_type: string;
  direction: string;
  description: string;
  amount: string;
  currency: string;
  balance_after: string;
  movement_date: string;
}
interface BrutRapport {
  by_currency?: BrutDevise[];
  by_type?: BrutType[];
  by_day?: BrutSeau[];
  by_month?: BrutSeau[];
  expense_by_category?: BrutCategorie[];
  count?: number;
  movements?: { results: BrutMouvement[]; count: number };
}

const devises = (l: BrutDevise[] = []): LigneDevise[] =>
  l.map((r) => ({
    devise: r.currency,
    ouverture: nb(r.opening_balance),
    entrees: nb(r.total_in),
    sorties: nb(r.total_out),
    net: nb(r.net),
    cloture: nb(r.closing_balance),
  }));

const types = (l: BrutType[] = []): LigneType[] =>
  l.map((r) => ({
    devise: r.currency,
    type: r.movement_type,
    entree: r.direction === "in",
    total: nb(r.total),
    nombre: nb(r.count),
  }));

const seaux = (l: BrutSeau[] = []): Seau[] =>
  l.map((r) => ({
    // La clé du serveur est déjà une chaîne de date ; on ne la reformate pas
    // ici, l'écran s'en charge - ce module ne fait que réétiqueter.
    cle: String(r.day ?? r.month ?? ""),
    devise: r.currency,
    entrees: nb(r.total_in),
    sorties: nb(r.total_out),
    nombre: nb(r.count),
  }));

const categories = (l: BrutCategorie[] = []): LigneCategorieDepense[] =>
  l.map((r) => ({
    devise: r.currency,
    // Une dépense sans catégorie se DIT : « Sans catégorie » est une
    // information, une ligne vide se lit comme un défaut d'affichage.
    categorie: r.expense__category__name || "Sans catégorie",
    couleur: r.expense__category__color || null,
    total: nb(r.total),
    nombre: nb(r.count),
  }));

/** Les paramètres de requête d'une portée. Ils servent AUSSI au document. */
export interface FenetreCaisse {
  portee: PorteeRapportCaisse;
  /** « AAAA-MM-JJ », portée `daily`. */
  jour?: string;
  annee?: number;
  mois?: number;
  debut?: string;
  fin?: string;
}

/**
 * Ce que la fenêtre envoie au serveur.
 *
 * ⚠ Une seule construction pour la LECTURE et pour le DOCUMENT : deux
 * constructions séparées finiraient par décrire deux périmètres, et le fichier
 * ne couvrirait plus l'écran qui l'a déclenché.
 */
export function parametresFenetre(f: FenetreCaisse): Record<string, string | undefined> {
  switch (f.portee) {
    case "daily":
      return { date: f.jour };
    case "monthly":
      return {
        year: f.annee ? String(f.annee) : undefined,
        month: f.mois ? String(f.mois) : undefined,
      };
    case "annual":
      return { year: f.annee ? String(f.annee) : undefined };
    default:
      return { date_from: f.debut, date_to: f.fin };
  }
}

const CHEMINS: Record<PorteeRapportCaisse, string> = {
  daily: "daily-report",
  monthly: "monthly-report",
  annual: "annual-report",
  custom: "custom-report",
};

export async function chargerRapportCaisse(
  f: FenetreCaisse,
  libelle: string
): Promise<RapportCaisse> {
  const params = parametresFenetre(f);
  const requete = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`)
    .join("&");

  const brut = await api.get<BrutRapport>(
    `/cash-movements/${CHEMINS[f.portee]}/${requete ? `?${requete}` : ""}`
  );

  const parMois = f.portee === "annual";
  return {
    libelle,
    parDevise: devises(brut.by_currency),
    parType: types(brut.by_type),
    seaux: seaux(parMois ? brut.by_month : brut.by_day),
    libelleSeau: parMois ? "Mois" : "Date",
    depensesParCategorie: categories(brut.expense_by_category),
    mouvements: (brut.movements?.results ?? []).map((m) => ({
      id: m.id,
      reference: m.reference,
      type: m.movement_type,
      entree: m.direction === "in",
      description: m.description,
      montant: nb(m.amount),
      devise: m.currency,
      soldeApres: nb(m.balance_after),
      date: m.movement_date,
    })),
    nombreMouvements: nb(brut.movements?.count),
    nombre: nb(brut.count ?? brut.movements?.count),
  };
}
