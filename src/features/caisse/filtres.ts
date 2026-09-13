/**
 * Les filtres du livre de caisse et de ses dépenses.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE FICHIER COUVRE EXACTEMENT CE QUE LA LISTE MONTRE.                     │
 * │                                                                          │
 * │ C'est l'invariant que tous les exports de ce dépôt ont dû corriger, et   │
 * │ il ne tient que si UN seul objet décrit le périmètre : `conditionsDe` le │
 * │ traduit en SQL local, `parametresDExport` en paramètres de requête. Deux │
 * │ constructions séparées finiraient par décrire deux périmètres.           │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Module PUR : il n'ouvre pas la base.
 */
import {
  parametresPeriodeEnDates,
  PERIODE_TOUT,
  type PeriodeFiltre,
} from "@/data/periode-filtre";
import { libelleTypeCaisse, STATUT_DEPENSE } from "@/data/types-caisse";

// ------------------------------------------------------- mouvements de caisse

export const CLES_FILTRES_CAISSE = [
  "recherche",
  "sens",
  "type",
  "devise",
  "periode",
] as const;
export type CleFiltreCaisse = (typeof CLES_FILTRES_CAISSE)[number];

export interface FiltresCaisse {
  recherche: string;
  /** `in` : entrées seules. `out` : sorties seules. `null` : les deux. */
  sens: "in" | "out" | null;
  type: string | null;
  devise: string | null;
  periode: PeriodeFiltre;
}

export const FILTRES_CAISSE_VIDES: FiltresCaisse = {
  recherche: "",
  sens: null,
  type: null,
  devise: null,
  periode: PERIODE_TOUT,
};

// LE TYPE-CHECK FAIT LE GARDE-FOU : ajouter un filtre sans l'ajouter aux clés
// (ou l'inverse) casse `pnpm type-check`, et le balayage ne peut donc pas
// devenir aveugle.
type Assert<A extends B, B> = A;
/* eslint-disable @typescript-eslint/no-unused-vars -- Ces alias ne sont PAS
   morts : c'est leur seule évaluation qui fait le garde-fou. */
type _CaisseCouvreTout = Assert<keyof FiltresCaisse, CleFiltreCaisse>;
type _CaisseRienEnTrop = Assert<CleFiltreCaisse, keyof FiltresCaisse>;

/**
 * Combien de filtres pèsent sur la liste, pour la pastille du bouton.
 *
 * NI la recherche (elle a son champ, visible), NI le sens (il a ses puces) :
 * compter ce qui est déjà sous les yeux ferait dire « 2 filtres » à un écran
 * qui n'en cache aucun.
 */
export function nombreDeFiltresCaisse(f: FiltresCaisse): number {
  let n = 0;
  if (f.type) n += 1;
  if (f.devise) n += 1;
  if (f.periode.mode !== "tout") n += 1;
  return n;
}

export function aDesFiltresCaisse(f: FiltresCaisse): boolean {
  return (
    nombreDeFiltresCaisse(f) > 0 || f.sens !== null || f.recherche.trim() !== ""
  );
}

export function sansLeFiltreCaisse(
  f: FiltresCaisse,
  cle: CleFiltreCaisse
): FiltresCaisse {
  switch (cle) {
    case "recherche":
      return { ...f, recherche: "" };
    case "sens":
      return { ...f, sens: null };
    case "type":
      return { ...f, type: null };
    case "devise":
      return { ...f, devise: null };
    default:
      return { ...f, periode: PERIODE_TOUT };
  }
}

export function resumeDesFiltresCaisse(
  f: FiltresCaisse,
  libellePeriode: (p: PeriodeFiltre) => string
): { cle: CleFiltreCaisse; label: string }[] {
  const puces: { cle: CleFiltreCaisse; label: string }[] = [];
  if (f.type) puces.push({ cle: "type", label: libelleTypeCaisse(f.type) });
  if (f.devise) puces.push({ cle: "devise", label: f.devise });
  if (f.periode.mode !== "tout") {
    puces.push({ cle: "periode", label: libellePeriode(f.periode) });
  }
  return puces;
}

/**
 * Les paramètres de requête du DOCUMENT, pour ce jeu de filtres.
 *
 * ⚠ `is_cancelled=false` part TOUJOURS, comme le back-office l'envoie sur sa
 * liste. Un mouvement annulé n'a pas bougé le tiroir : le compter dans un
 * document de caisse ferait un total qui ne correspond à aucune liasse.
 *
 * ⚠ La PÉRIODE part en deux DATES, jamais en `month` : `CashMovementViewSet`
 * ne lit que `date_from` / `date_to`, et ignorerait un `month` en silence.
 */
export function parametresCaisse(
  f: FiltresCaisse
): Record<string, string | undefined> {
  return {
    search: f.recherche.trim() || undefined,
    direction: f.sens ?? undefined,
    movement_type: f.type ?? undefined,
    currency: f.devise ?? undefined,
    is_cancelled: "false",
    ...parametresPeriodeEnDates(f.periode),
  };
}

// ------------------------------------------------------------------ dépenses

export const CLES_FILTRES_DEPENSE = [
  "recherche",
  "statut",
  "categorie",
  "devise",
  "periode",
] as const;
export type CleFiltreDepense = (typeof CLES_FILTRES_DEPENSE)[number];

export interface FiltresDepense {
  recherche: string;
  statut: string | null;
  categorie: string | null;
  devise: string | null;
  periode: PeriodeFiltre;
}

export const FILTRES_DEPENSE_VIDES: FiltresDepense = {
  recherche: "",
  statut: null,
  categorie: null,
  devise: null,
  periode: PERIODE_TOUT,
};

type _DepenseCouvreTout = Assert<keyof FiltresDepense, CleFiltreDepense>;
type _DepenseRienEnTrop = Assert<CleFiltreDepense, keyof FiltresDepense>;
/* eslint-enable @typescript-eslint/no-unused-vars */

/** Le statut a ses puces à l'écran : le compter ferait doublon avec elles. */
export function nombreDeFiltresDepense(f: FiltresDepense): number {
  let n = 0;
  if (f.categorie) n += 1;
  if (f.devise) n += 1;
  if (f.periode.mode !== "tout") n += 1;
  return n;
}

export function aDesFiltresDepense(f: FiltresDepense): boolean {
  return (
    nombreDeFiltresDepense(f) > 0 || f.statut !== null || f.recherche.trim() !== ""
  );
}

export function sansLeFiltreDepense(
  f: FiltresDepense,
  cle: CleFiltreDepense
): FiltresDepense {
  switch (cle) {
    case "recherche":
      return { ...f, recherche: "" };
    case "statut":
      return { ...f, statut: null };
    case "categorie":
      return { ...f, categorie: null };
    case "devise":
      return { ...f, devise: null };
    default:
      return { ...f, periode: PERIODE_TOUT };
  }
}

export function resumeDesFiltresDepense(
  f: FiltresDepense,
  noms: { categorie?: string | null },
  libellePeriode: (p: PeriodeFiltre) => string
): { cle: CleFiltreDepense; label: string }[] {
  const puces: { cle: CleFiltreDepense; label: string }[] = [];
  // Un nom manquant s'écrit « inconnue » et JAMAIS l'identifiant : un UUID
  // dans une puce n'est pas un nom, c'est du bruit.
  if (f.categorie) {
    puces.push({ cle: "categorie", label: noms.categorie || "Catégorie inconnue" });
  }
  if (f.devise) puces.push({ cle: "devise", label: f.devise });
  if (f.periode.mode !== "tout") {
    puces.push({ cle: "periode", label: libellePeriode(f.periode) });
  }
  return puces;
}

/**
 * Les paramètres de requête du DOCUMENT des dépenses.
 *
 * ⚠ Le champ de date du serveur est `expense_date`, pas `created_at` : une
 * dépense notée samedi soir et enregistrée lundi appartient au samedi, et
 * c'est la borne que `get_queryset` applique.
 */
export function parametresDepense(
  f: FiltresDepense
): Record<string, string | undefined> {
  return {
    search: f.recherche.trim() || undefined,
    status: f.statut ?? undefined,
    category: f.categorie ?? undefined,
    currency: f.devise ?? undefined,
    ...parametresPeriodeEnDates(f.periode),
  };
}

/** Les six statuts, dans l'ordre du cycle de vie du back-office. */
export const ORDRE_STATUTS_DEPENSE = [
  "draft",
  "pending",
  "approved",
  "paid",
  "rejected",
  "cancelled",
] as const;

export function libelleStatutDepense(code: string): string {
  return STATUT_DEPENSE[code]?.label ?? code;
}
