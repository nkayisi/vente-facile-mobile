/**
 * Les filtres du journal des mouvements, et ce qu'ils envoient au document.
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
import { parametresPeriode, PERIODE_TOUT, type PeriodeFiltre } from "@/data/periode-filtre";
import {
  parametresDePerimetre,
  type AssertPerimetre,
} from "@/features/perimetre/filtre-perimetre";
import { TYPE_MOUVEMENT_STOCK, typesFiltres } from "@/data/types-mouvement";

export const CLES_FILTRES = [
  "recherche",
  "sens",
  "type",
  "entrepot",
  "utilisateur",
  "categorie",
  "periode",
] as const;
export type CleFiltre = (typeof CLES_FILTRES)[number];

export interface FiltresEcran {
  recherche: string;
  /** `true` : entrées seules. `false` : sorties seules. `null` : les deux. */
  sens: boolean | null;
  type: string | null;
  entrepot: string | null;
  /** Qui a SAISI le mouvement (`created_by` côté serveur). */
  utilisateur: string | null;
  categorie: string | null;
  periode: PeriodeFiltre;
}

export const FILTRES_VIDES: FiltresEcran = {
  recherche: "",
  sens: null,
  type: null,
  entrepot: null,
  utilisateur: null,
  categorie: null,
  periode: PERIODE_TOUT,
};

// LE TYPE-CHECK FAIT LE GARDE-FOU : ajouter un filtre à `FiltresEcran` sans
// l'ajouter à `CLES_FILTRES` (ou l'inverse) casse `pnpm type-check`, et le
// balayage de `parametresDExport` ne peut donc pas devenir aveugle.
type Assert<A extends B, B> = A;
// Et celui-ci NOMME le module si le périmètre venait à en disparaître : un
// écran qui perd son filtre « Utilisateur » ne lève rien, il cesse simplement
// de le proposer, et personne ne cherche un bug là où il n'y a pas d'erreur.
/* eslint-disable @typescript-eslint/no-unused-vars -- Ces trois alias ne sont
   PAS morts : c'est leur seule évaluation qui fait le garde-fou. Les employer
   quelque part ne prouverait rien de plus. */
type _PorteLePerimetre = AssertPerimetre<FiltresEcran>;
type _CouvreTout = Assert<keyof FiltresEcran, CleFiltre>;
type _RienEnTrop = Assert<CleFiltre, keyof FiltresEcran>;
/* eslint-enable @typescript-eslint/no-unused-vars */

/**
 * Combien de filtres pèsent sur la liste, pour la pastille du bouton.
 *
 * NI la recherche (elle a son champ, visible), NI le sens (il a ses puces) :
 * compter ce qui est déjà sous les yeux ferait dire « 2 filtres » à un écran
 * qui n'en cache aucun.
 */
export function nombreDeFiltresActifs(f: FiltresEcran): number {
  let n = 0;
  if (f.type) n += 1;
  if (f.entrepot) n += 1;
  if (f.utilisateur) n += 1;
  if (f.categorie) n += 1;
  if (f.periode.mode !== "tout") n += 1;
  return n;
}

export function aDesFiltres(f: FiltresEcran): boolean {
  return (
    nombreDeFiltresActifs(f) > 0 || f.sens !== null || f.recherche.trim() !== ""
  );
}

/**
 * Une puce retirable par filtre posé, dans l'ordre de la feuille.
 *
 * Un nom manquant s'écrit « inconnu » et JAMAIS l'identifiant : un UUID dans
 * une puce n'est pas un nom, c'est du bruit. Même famille que « `null` ne se
 * lit jamais comme zéro ».
 */
export function resumeDesFiltres(
  f: FiltresEcran,
  noms: {
    entrepot?: string | null;
    utilisateur?: string | null;
    categorie?: string | null;
  },
  libellePeriode: (p: PeriodeFiltre) => string
): { cle: CleFiltre; label: string }[] {
  const puces: { cle: CleFiltre; label: string }[] = [];
  if (f.entrepot) puces.push({ cle: "entrepot", label: noms.entrepot || "Entrepôt inconnu" });
  if (f.utilisateur) {
    puces.push({ cle: "utilisateur", label: noms.utilisateur || "Utilisateur inconnu" });
  }
  if (f.categorie) {
    puces.push({ cle: "categorie", label: noms.categorie || "Catégorie inconnue" });
  }
  if (f.type) {
    puces.push({ cle: "type", label: TYPE_MOUVEMENT_STOCK[f.type]?.label ?? f.type });
  }
  if (f.periode.mode !== "tout") {
    puces.push({ cle: "periode", label: libellePeriode(f.periode) });
  }
  return puces;
}

/** Le filtre `cle` retiré, les autres intacts. */
export function sansLeFiltre(f: FiltresEcran, cle: CleFiltre): FiltresEcran {
  switch (cle) {
    case "recherche":
      return { ...f, recherche: "" };
    case "sens":
      return { ...f, sens: null };
    case "type":
      return { ...f, type: null };
    case "entrepot":
      return { ...f, entrepot: null };
    case "utilisateur":
      return { ...f, utilisateur: null };
    case "categorie":
      return { ...f, categorie: null };
    default:
      return { ...f, periode: PERIODE_TOUT };
  }
}

/**
 * Les paramètres de requête du DOCUMENT, pour ce jeu de filtres.
 *
 * ⚠ LE SENS PART EN LISTE DE TYPES, JAMAIS EN `direction`. Le serveur ne range
 * `unpack` ni dans les entrées ni dans les sorties, quand l'écran le montre
 * parmi les entrées : `?direction=in` l'exclurait du fichier seul.
 *
 * ⚠ Et c'est `typesFiltres` qui décide, donc l'INTERSECTION du type et du
 * sens. L'export n'envoyait que le type quand il existait : sens « Entrées »
 * plus type « Vente » rendait une liste vide et un document plein.
 *
 * La CATÉGORIE part en identifiant nu : le serveur refait le sous-arbre
 * lui-même, et lui envoyer la liste déployée ferait deux calculs à tenir en
 * phase. La FENÊTRE de la liste ne part pas non plus : ce que l'écran a chargé
 * au doigt n'est pas le périmètre du rapport.
 */
export function parametresDExport(f: FiltresEcran): Record<string, string | undefined> {
  const types = typesFiltres(f.type, f.sens);
  return {
    search: f.recherche.trim() || undefined,
    // Une intersection VIDE ne s'envoie pas : sans type, le serveur ne
    // filtrerait rien du tout, donc rendrait tout. L'écran ferme d'ailleurs
    // son bouton, son cadran comptant déjà zéro.
    movement_type: types && types.length > 0 ? types.join(",") : undefined,
    ...parametresDePerimetre(f),
    category: f.categorie ?? undefined,
    ...parametresPeriode(f.periode),
  };
}

/**
 * Le périmètre HÉRITÉ par le rapport d'approvisionnement.
 *
 * NI le type de mouvement, NI la recherche - comme le back-office. Le rapport
 * porte sur les ENTRÉES de stock : y superposer le filtre de type le viderait
 * dès qu'une sortie est sélectionnée, et la recherche le réduirait à un
 * produit alors qu'on vient y lire une valeur d'achat.
 */
export function parametresApprovisionnement(
  f: FiltresEcran
): Record<string, string | undefined> {
  return {
    ...parametresDePerimetre(f),
    category: f.categorie ?? undefined,
    ...parametresPeriode(f.periode),
  };
}
