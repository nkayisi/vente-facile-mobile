/**
 * Ce qu'un mouvement de stock ENVOIE, et ce qui l'empêche de partir.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE MODULE EXISTE PARCE QUE LA RÈGLE N'A PAS SA PLACE DANS UN ÉCRAN.      │
 * │                                                                          │
 * │ L'assemblage du corps décide, pour chaque champ, s'il part ou non selon  │
 * │ le mode de vente de l'article, le sens du mouvement et une case à        │
 * │ cocher. Écrit dans la feuille, il serait invisible à la relecture et     │
 * │ intestable sans appareil - et `src/features/stock/` ne portait AUCUN     │
 * │ test, sur le chemin même par lequel une entrée de stock atteint le       │
 * │ serveur.                                                                 │
 * │                                                                          │
 * │ Miroir de `handleSubmit` du back-office. À régénérer par :               │
 * │   sed -n '522,610p' frontend/app/dashboard/stock/movements/page.tsx      │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * **Aucune conversion ici.** Pas de `contenants × facteur + vrac` : le serveur
 * convertit (`PackagingService.to_base`), et une seconde arithmétique du
 * conditionnement finirait par diverger. `toBaseQuantity` ne sert qu'à ÉCRIRE
 * le récapitulatif que le magasinier relit avant de valider.
 */
import {
  blendedUnitCost,
  pluralizeUnit,
  toBaseQuantity,
  type Packaging,
} from "@vente-facile/core";

import { estEntreeValorisee } from "@/data/types-mouvement";

/** L'état du formulaire au moment de valider, déjà LU (`lireNombre` a servi). */
export interface SaisieFormulaireMouvement {
  produit: string;
  entrepot: string;
  type: string;
  /** `null` pour un article vendu au détail seul. */
  conditionnement: Packaging | null;
  aUneDatePeremption: boolean;
  contenants: number | null;
  vrac: number | null;
  coutDetail: number | null;
  coutContenant: number | null;
  prixDetail: number | null;
  prixGros: number | null;
  reporterLesPrix: boolean;
  emplacement: string | null;
  /** « AAAA-MM-JJ ». */
  peremption: string | null;
  notes: string;
}

export interface SaisieMouvement {
  produit: string;
  entrepot: string;
  type: string;
  /** Total en unité de détail. Facultatif dès qu'un contenant est saisi. */
  quantite?: number;
  contenants?: number;
  vrac?: number;
  coutUnitaire?: number;
  coutContenant?: number;
  notes?: string;
  // --- Parité avec le formulaire du back-office ---
  /** `StockLocation` de l'entrepôt. Le serveur ne la lit que sur une entrée. */
  emplacement?: string;
  /**
   * « AAAA-MM-JJ ». Une DATE, pas une décimale : elle ne devient pas une chaîne
   * parce qu'elle est un nombre, elle EST une chaîne.
   */
  peremption?: string;
  /** Reporte les prix saisis sur la FICHE produit. Exige `products.edit`. */
  reporterLesPrix?: boolean;
  prixDetail?: number;
  prixGros?: number;
}

/**
 * Le corps JSON de l'acte, sans son identifiant.
 *
 * Exporté pour être ÉPROUVÉ sans appareil : `enqueue` ouvre la base, cette
 * fonction non. C'est ici que se tient le contrat du transport - les décimales
 * en CHAÎNES, les clés absentes OMISES et jamais `null`.
 */
export function corpsJsonDuMouvement(saisie: SaisieMouvement): Record<string, unknown> {
  return {
    product: saisie.produit,
    warehouse: saisie.entrepot,
    movement_type: saisie.type,
    ...(saisie.quantite != null ? { quantity: String(saisie.quantite) } : {}),
    ...(saisie.contenants != null ? { package_quantity: String(saisie.contenants) } : {}),
    ...(saisie.vrac != null ? { loose_quantity: String(saisie.vrac) } : {}),
    ...(saisie.coutUnitaire != null ? { unit_cost: String(saisie.coutUnitaire) } : {}),
    ...(saisie.coutContenant != null
      ? { package_unit_cost: String(saisie.coutContenant) }
      : {}),
    ...(saisie.emplacement != null ? { location: saisie.emplacement } : {}),
    // Une date voyage TELLE QUELLE : la passer par `String()` marcherait, mais
    // laisserait croire qu'elle est du même genre que les décimales.
    ...(saisie.peremption != null ? { expiry_date: saisie.peremption } : {}),
    // Un BOOLÉEN, pas la chaîne « true » : `BooleanField` de DRF accepte les
    // deux, mais le corps est relu par un humain en quarantaine.
    ...(saisie.reporterLesPrix ? { update_product_prices: true } : {}),
    ...(saisie.prixDetail != null ? { selling_price: String(saisie.prixDetail) } : {}),
    ...(saisie.prixGros != null ? { wholesale_price: String(saisie.prixGros) } : {}),
    notes: saisie.notes ?? "",
  };
}

export interface ErreursMouvement {
  quantite?: string;
  contenants?: string;
  peremption?: string;
}

/** Un nombre qui compte : ni nul, ni négatif, ni absent. */
function positif(v: number | null): number | null {
  return v != null && v > 0 ? v : null;
}

/**
 * Ce qui empêche d'enregistrer, et la phrase à écrire sous le champ fautif.
 *
 * Le bouton reste pressable : un appui doit RÉPONDRE par un message plutôt que
 * de ne rien faire, défaut que ce dépôt a déjà corrigé deux fois.
 */
export function verifierLaSaisie(s: SaisieFormulaireMouvement): ErreursMouvement {
  const erreurs: ErreursMouvement = {};
  const contenants = s.contenants ?? 0;
  const vrac = s.vrac ?? 0;

  if (s.conditionnement) {
    const mot = (n: number, m: string) => pluralizeUnit(m, n === 1 ? 1 : 2);
    if (contenants <= 0 && (s.conditionnement.packageOnly || vrac <= 0)) {
      const paquets = mot(2, s.conditionnement.packageWord);
      // « En », et non « de » : le nom de l'unité vient du marchand, et « de »
      // s'élide devant une voyelle (« un nombre de AMPOULES »).
      erreurs.contenants = s.conditionnement.packageOnly
        ? `Indiquez une quantité en ${paquets}.`
        : `Indiquez une quantité en ${paquets} ou en ${mot(2, s.conditionnement.retailWord)}.`;
    }
  } else if (vrac <= 0) {
    erreurs.quantite = "Indiquez une quantité.";
  }

  // Le serveur pose la date sur le LOT créé à l'entrée : sans elle, un produit
  // périssable entre en stock sans péremption et n'alerte plus jamais.
  if (estEntreeValorisee(s.type) && s.aUneDatePeremption && !s.peremption) {
    erreurs.peremption = "Ce produit est périssable : la date d'expiration est obligatoire.";
  }

  return erreurs;
}

/**
 * Le corps de l'acte, champ par champ.
 *
 * | condition | effet |
 * | --- | --- |
 * | conditionné | `contenants` et `vrac` partent, `quantite` JAMAIS |
 * | `packageOnly` | `vrac` vaut 0, et `coutUnitaire` ne part pas |
 * | non conditionné | `quantite` seule ; ni contenants, ni vrac, ni coût de contenant |
 * | pas une entrée valorisée | aucun coût, aucun emplacement, aucune péremption |
 * | coût à zéro | non envoyé : le serveur lit 0 comme « non saisi » |
 * | case décochée | aucun prix de vente ne part |
 */
export function corpsDuMouvement(s: SaisieFormulaireMouvement): SaisieMouvement {
  const entree = estEntreeValorisee(s.type);
  const cond = s.conditionnement;

  const corps: SaisieMouvement = {
    produit: s.produit,
    entrepot: s.entrepot,
    type: s.type,
    notes: s.notes,
  };

  if (cond) {
    corps.contenants = s.contenants ?? 0;
    // Une valeur restée d'un article précédent ne doit pas partir : sur un
    // article vendu en gros seul, le champ vrac n'existe même pas à l'écran.
    corps.vrac = cond.packageOnly ? 0 : (s.vrac ?? 0);
  } else {
    corps.quantite = s.vrac ?? 0;
  }

  if (entree) {
    if (cond && !cond.packageOnly) {
      const c = positif(s.coutDetail);
      if (c != null) corps.coutUnitaire = c;
    } else if (!cond) {
      const c = positif(s.coutDetail);
      if (c != null) corps.coutUnitaire = c;
    }
    if (cond) {
      const c = positif(s.coutContenant);
      if (c != null) corps.coutContenant = c;
    }
    if (s.emplacement) corps.emplacement = s.emplacement;
    if (s.peremption) corps.peremption = s.peremption;
  }

  // Les prix de vente n'ont servi qu'à afficher la marge tant que la case
  // n'est pas cochée : un achat à prix exceptionnel ne retarife pas le
  // catalogue à l'insu du marchand.
  if (entree && s.reporterLesPrix) {
    corps.reporterLesPrix = true;
    if (!cond?.packageOnly) {
      const p = positif(s.prixDetail);
      if (p != null) corps.prixDetail = p;
    }
    if (cond) {
      const p = positif(s.prixGros);
      if (p != null) corps.prixGros = p;
    }
  }

  return corps;
}

/** « Vous ajoutez 2 cartons + 5 bouteilles = 29 bouteilles. » */
export function resumeDeConversion(s: SaisieFormulaireMouvement): string | null {
  const cond = s.conditionnement;
  if (!cond) return null;

  const contenants = s.contenants ?? 0;
  const vrac = s.vrac ?? 0;
  if (contenants <= 0 && vrac <= 0) return null;

  const morceaux: string[] = [];
  if (contenants > 0) {
    morceaux.push(`${contenants} ${pluralizeUnit(cond.packageWord, contenants)}`);
  }
  if (vrac > 0) morceaux.push(`${vrac} ${pluralizeUnit(cond.retailWord, vrac)}`);

  const total = toBaseQuantity(cond, contenants, vrac);
  const verbe = estEntreeValorisee(s.type) ? "ajoutez" : "retirez";
  return `Vous ${verbe} ${morceaux.join(" + ")} = ${total} ${pluralizeUnit(cond.retailWord, total)}.`;
}

/**
 * Le coût unitaire RÉELLEMENT enregistré quand les deux canaux sont servis.
 *
 * C'est la seule valeur que le magasinier ne peut pas recalculer de tête avant
 * de valider. Le serveur refait le calcul ; ceci n'est qu'une prévision.
 */
export function apercuDuCoutMelange(s: SaisieFormulaireMouvement): number | null {
  const cond = s.conditionnement;
  if (!estEntreeValorisee(s.type) || !cond) return null;
  const contenants = s.contenants ?? 0;
  const vrac = s.vrac ?? 0;
  if (contenants <= 0 || vrac <= 0) return null;
  if (!positif(s.coutContenant) || !positif(s.coutDetail)) return null;

  return blendedUnitCost({
    packageQuantity: contenants,
    packageCost: s.coutContenant,
    looseQuantity: vrac,
    looseCost: s.coutDetail,
    factor: cond.factor,
  });
}
