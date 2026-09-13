/**
 * Ce que le formulaire d'article accepte, et ce qu'il refuse AVANT d'envoyer.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LES MÊMES REFUS QUE LE SERVEUR, OPPOSÉS AU COMPTOIR.                    │
 * │                                                                          │
 * │ `_validate_packaging` exige l'unité de détail, le contenant et un        │
 * │ facteur d'au moins DEUX dès que le mode n'est pas « au détail », plus le │
 * │ prix de vente du canal concerné. Un refus découvert à la poussée arrive  │
 * │ en quarantaine, c'est-à-dire le lendemain, sur un autre écran, alors que │
 * │ le marchand a la fiche sous les yeux maintenant.                        │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Module PUR : il ne lit rien, il n'écrit rien, il se teste sans appareil.
 */
import { lireNombre, type MotifRefus } from "@/data/nombres";

import type { ModeVente } from "./actes";

/** La saisie d'un champ numérique, réduite à ce dont l'écran a besoin. */
export interface Nombre {
  /** `null` quand le champ est vide OU illisible : jamais zéro par défaut. */
  valeur: number | null;
  /** Renseigné seulement quand la saisie est fautive. */
  refus?: string;
}

const PHRASES: Record<MotifRefus, string> = {
  negatif: "Un prix ne peut pas être négatif.",
  illisible: "Nombre illisible. Exemple : 12 500 ou 12,5.",
};

/**
 * Lit un champ numérique.
 *
 * ⚠ Une saisie illisible rend `null`, JAMAIS zéro. `Number("12 500") || 0`
 * donnait zéro sur un séparateur de milliers - c'est le défaut que
 * `lireNombre` existe pour fermer, et le recopier ici le rouvrirait.
 */
export function lireChamp(saisie: string): Nombre {
  const lu = lireNombre(saisie);
  if (!lu.ok) return { valeur: null, refus: PHRASES[lu.motif] };
  return { valeur: lu.valeur };
}

export interface SaisieBrute {
  nom: string;
  sku: string;
  mode: ModeVente;
  unite: string | null;
  uniteContenant: string | null;
  parContenant: string;
  prixVente: string;
  prixVenteGros: string;
}

export interface RefusArticle {
  unite?: string;
  contenant?: string;
  facteur?: string;
  prixVente?: string;
  prixVenteGros?: string;
}

/** Les refus de structure et de prix, dans l'ordre où le serveur les oppose. */
export function refusDeSaisie(s: SaisieBrute): RefusArticle {
  const conditionne = s.mode !== "retail_only";
  const facteur = lireChamp(s.parContenant);
  const vente = lireChamp(s.prixVente);
  const venteGros = lireChamp(s.prixVenteGros);

  return {
    unite:
      conditionne && !s.unite
        ? "Précisez l'unité de détail pour un article vendu en gros."
        : undefined,
    contenant:
      conditionne && !s.uniteContenant
        ? "Précisez le contenant (paquet, carton, casier…)."
        : undefined,
    facteur: conditionne
      ? (facteur.refus ??
        (facteur.valeur == null || facteur.valeur < 2
          ? "Indiquez combien d'unités contient un contenant (au moins 2)."
          : undefined))
      : undefined,
    // En gros SEUL, aucun prix de détail n'est saisi : c'est celui du
    // contenant qui prend le relais, et le serveur en déduit l'unitaire.
    prixVente:
      s.mode !== "wholesale_only"
        ? (vente.refus ??
          (vente.valeur == null || vente.valeur <= 0
            ? "Le prix de vente au détail est obligatoire."
            : undefined))
        : undefined,
    prixVenteGros: conditionne
      ? (venteGros.refus ??
        (venteGros.valeur == null || venteGros.valeur <= 0
          ? "Le prix de vente du contenant est obligatoire."
          : undefined))
      : undefined,
  };
}

/** Le bouton ne s'ouvre que si tout est là : nom, code, et aucun refus. */
export function saisiePrete(s: SaisieBrute): boolean {
  if (s.nom.trim().length === 0 || s.sku.trim().length === 0) return false;
  return Object.values(refusDeSaisie(s)).every((r) => r === undefined);
}
