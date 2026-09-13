/**
 * Les actes de caisse : dépense, mouvement, clôture.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA CLÔTURE PASSE PAR LE JOURNAL, et ce n'est pas un luxe.               │
 * │                                                                          │
 * │ Le Z se tire au comptoir, à la fermeture, souvent avant que le réseau ne │
 * │ revienne. Le caissier compte son tiroir, imprime, et rentre chez lui.    │
 * │ L'opération part plus tard, et le papier qu'il a laissé sur la caisse    │
 * │ porte déjà son numéro définitif.                                        │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * **Le comptage est PAR DEVISE.** Un tiroir contient des billets de plusieurs
 * devises, et les additionner donnerait un nombre qui ne correspond à aucune
 * liasse. C'est la règle que le back-office a dû apprendre à ses dépens.
 */
import * as Crypto from "expo-crypto";


import { PREFIXE, prochainNumero } from "@/features/pos/numerotation";
import {
  corpsCategorie,
  corpsModificationCategorie,
  type GenreCategorie,
  type SaisieCategorie,
} from "@/features/caisse/categorie";
import {
  enAttenteParType,
  enqueue,
  type EtatEnvoi,
  type OperationKind,
} from "@/sync";

import {
  attentesPar,
  lotEnAttente,
  type Attentes,
  type LotEnAttente,
} from "@/features/sync/attente";

export interface SaisieDepense {
  categorie: string;
  description: string;
  /** Décimale en CHAÎNE : un montant ne traverse jamais un `number` (§5.3). */
  montant: string;
  devise: string;
  /** « AAAA-MM-JJ ». La date du CONSTAT, pas celle de l'envoi. */
  date: string;
  /** `null` : aucune, ce que seul un propriétaire devrait faire. */
  entrepot?: string | null;
  beneficiaire?: string;
  methode?: string | null;
  notes?: string;
  /** Le code de l'appareil, pour la série dense du numéro de reçu. */
  deviceCode: string | null;
}

/** Ce que la saisie produit : l'identifiant local, et le numéro IMPRIMABLE. */
export interface DepenseCreee {
  id: string;
  reference: string;
}

/**
 * Une dépense, et son numéro DÉFINITIF.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE NUMÉRO EST ALLOUÉ AVANT L'IMPRESSION, ET LE SERVEUR LE REPREND.      │
 * │                                                                          │
 * │ Une dépense se règle au comptoir, souvent sans réseau, et le             │
 * │ bénéficiaire repart avec sa pièce justificative - qui porte une ligne de │
 * │ signature. Un numéro provisoire remplacé plus tard par celui du serveur  │
 * │ rendrait ce papier muet : il ne désignerait plus rien. C'est le défaut   │
 * │ exact corrigé sur `sale.add_payment` au lot 6.                            │
 * │                                                                          │
 * │ L'APPELANT IMPRIME APRÈS : cette fonction ne fait que mettre en file et  │
 * │ rendre le numéro, comme `ajouterReglement`.                              │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export async function creerDepense(saisie: SaisieDepense): Promise<DepenseCreee> {
  const id = Crypto.randomUUID();
  const reference = await prochainNumero(PREFIXE.depense, saisie.deviceCode);
  await enqueue(id, "expense.create", {
    id,
    reference,
    category: saisie.categorie,
    description: saisie.description.trim(),
    amount: saisie.montant,
    currency: saisie.devise,
    beneficiary: (saisie.beneficiaire ?? "").trim(),
    // ┌──────────────────────────────────────────────────────────────────────┐
    // │ `expense_date` EST OBLIGATOIRE, et il manquait.                      │
    // │                                                                      │
    // │ `Expense.expense_date` n'a ni défaut ni valeur nulle possible, et le │
    // │ serializer le rend donc requis : le serveur répondait « Ce champ est │
    // │ obligatoire » et la dépense partait en quarantaine. Établi par       │
    // │ `test_cashbook_operations_parity` : AUCUNE dépense saisie sur un     │
    // │ terminal depuis le lot 9 n'était jamais arrivée.                     │
    // │                                                                      │
    // │ La date est celle de la SAISIE, pas celle de l'envoi : une dépense   │
    // │ notée samedi soir et synchronisée lundi appartient au samedi.        │
    // └──────────────────────────────────────────────────────────────────────┘
    // ┌──────────────────────────────────────────────────────────────────────┐
    // │ LA DATE VIENT DU FORMULAIRE, PLUS DE L'HORLOGE.                      │
    // │                                                                      │
    // │ Elle était codée `jourISO(new Date())` et aucun champ ne l'offrait :  │
    // │ une dépense notée pour samedi et saisie dimanche appartenait au       │
    // │ dimanche, et le rapport de caisse la rangeait au mauvais jour. Le     │
    // │ back-office a un champ `Date *` depuis toujours.                      │
    // └──────────────────────────────────────────────────────────────────────┘
    expense_date: saisie.date,
    // ┌──────────────────────────────────────────────────────────────────────┐
    // │ L'ENTREPÔT DÉCIDE DE QUI REVERRA CETTE DÉPENSE.                      │
    // │                                                                      │
    // │ `ExpenseViewSet.get_queryset` borne les gérants et les magasiniers    │
    // │ par entrepôt, `include_null_warehouse=False` : sans entrepôt, la      │
    // │ dépense devient invisible à son propre auteur. `null` reste licite    │
    // │ pour un propriétaire - c'est même le seul moyen d'enregistrer une     │
    // │ charge d'établissement.                                               │
    // └──────────────────────────────────────────────────────────────────────┘
    ...(saisie.entrepot ? { warehouse: saisie.entrepot } : {}),
    ...(saisie.methode ? { payment_method: saisie.methode } : {}),
    notes: saisie.notes ?? "",
  });
  return { id, reference };
}

export interface SaisieMouvementCaisse {
  /** `in` : de l'argent entre. `out` : il sort. */
  sens: "in" | "out";
  /** Décimale en CHAÎNE : un montant ne traverse jamais un `number` (§5.3). */
  montant: string;
  devise: string;
  description: string;
  notes?: string;
  categorieRecette?: string | null;
  categorieDepense?: string | null;
  /**
   * L'instant du geste, saisi à l'OUVERTURE de l'écran.
   *
   * Le back-office capture le sien à l'ouverture de sa boîte de dialogue. La
   * différence n'est pas cosmétique hors ligne : un caissier qui commence à
   * 23 h 55 et valide à 00 h 02 rangerait son apport au mauvais jour, dans un
   * cadran borné à aujourd'hui.
   */
  instant: string;
}

/**
 * Une entrée ou une sortie de caisse hors vente.
 *
 * Le SENS est choisi, jamais déduit d'un signe : un écran qui demanderait un
 * nombre signé ferait saisir des « -5000 » qui augmentent le tiroir une fois
 * sur deux.
 */
export async function creerMouvementCaisse(
  saisie: SaisieMouvementCaisse
): Promise<string> {
  const id = Crypto.randomUUID();
  await enqueue(id, "cash_movement.create", {
    id,
    direction: saisie.sens,
    // ┌──────────────────────────────────────────────────────────────────────┐
    // │ « income » ET « expense » N'EXISTENT PAS.                            │
    // │                                                                      │
    // │ Les valeurs de `CashMovement.MovementType` sont `fund_in`,           │
    // │ `other_in`, `fund_out`, `other_out`, `sale`, `adjustment`… Le        │
    // │ serveur répondait « income n'est pas un choix valide » et le         │
    // │ mouvement partait en quarantaine. On reprend le défaut du            │
    // │ back-office, `other_in` (`cashbook/page.tsx:175`) : une saisie       │
    // │ manuelle n'est un apport de fonds que si le marchand le dit, et      │
    // │ l'écran ne le lui demande pas.                                       │
    // └──────────────────────────────────────────────────────────────────────┘
    movement_type: saisie.sens === "in" ? "other_in" : "other_out",
    amount: saisie.montant,
    currency: saisie.devise,
    description: saisie.description.trim(),
    notes: saisie.notes ?? "",
    // Requis par le modèle, et absent lui aussi. C'est l'instant de la SAISIE.
    movement_date: saisie.instant,
    ...(saisie.categorieRecette ? { income_category: saisie.categorieRecette } : {}),
    ...(saisie.categorieDepense ? { expense_category: saisie.categorieDepense } : {}),
  });
  return id;
}

/** Un comptage de tiroir, une entrée par devise. */
export interface ComptageDevise {
  devise: string;
  montant: number;
}

export async function cloturerSession(
  sessionId: string,
  comptages: ComptageDevise[],
  notes: string
): Promise<string> {
  const id = Crypto.randomUUID();
  await enqueue(id, "register_session.close", {
    id,
    session: sessionId,
    // UNE ENTRÉE PAR DEVISE. Le scalaire `counted_balance` existe encore côté
    // serveur pour compatibilité ; l'employer ici écraserait le comptage des
    // autres devises par celui de la principale.
    counted_balances: comptages.map((c) => ({
      currency: c.devise,
      amount: String(c.montant),
    })),
    notes,
  });
  return id;
}

// ---------------------------------------------- transitions et annulations
//
// ┌──────────────────────────────────────────────────────────────────────────┐
// │ UNE TRANSITION EST DÉTERMINISTE, DONC ELLE NE SE RÉESSAIE PAS.          │
// │                                                                          │
// │ Le serveur rejoue ces six actes par les MÊMES fonctions que le           │
// │ back-office (`cashbook.services`) et traduit son refus en verdict        │
// │ `rejected`. Réessayer une approbation déjà faite créerait un SECOND      │
// │ mouvement de caisse, et le tiroir sortirait deux fois la même dépense.   │
// │                                                                          │
// │ L'ÉCRAN ferme donc ses boutons dès qu'une transition attend dans le      │
// │ journal : un caissier impatient sur un réseau lent remplirait sinon sa   │
// │ quarantaine de refus qu'il n'a pas provoqués.                            │
// └──────────────────────────────────────────────────────────────────────────┘

export type ActeDepense =
  | "expense.submit"
  | "expense.approve"
  | "expense.reject"
  | "expense.pay"
  | "expense.cancel";

/**
 * Une transition de dépense.
 *
 * `motif` rejoint les notes de la dépense côté serveur, il ne les écrase pas.
 */
export async function transitionDepense(
  acte: ActeDepense,
  depenseId: string,
  motif = ""
): Promise<string> {
  const id = Crypto.randomUUID();
  await enqueue(id, acte, {
    id,
    expense: depenseId,
    ...(motif.trim() ? { reason: motif.trim() } : {}),
  });
  return id;
}

/**
 * Annule un mouvement de tiroir.
 *
 * On MARQUE, on ne supprime pas : une écriture de caisse se contrepasse et ne
 * se rature pas. Elle sort des soldes et des listes, et reste dans les
 * rapports de caisse, où l'on vient chercher ce qui a été rectifié.
 */
export async function annulerMouvementCaisse(
  mouvementId: string,
  motif = ""
): Promise<string> {
  const id = Crypto.randomUUID();
  await enqueue(id, "cash_movement.cancel", {
    id,
    movement: mouvementId,
    ...(motif.trim() ? { reason: motif.trim() } : {}),
  });
  return id;
}

/**
 * Une catégorie de recette ou de dépense, créée au comptoir.
 *
 * ⚠ Aucun `slug` n'est fabriqué : `IncomeCategory` et `ExpenseCategory` n'en
 * portent pas, contrairement aux catégories de PRODUITS. Le `code` est
 * facultatif côté serveur, et le back-office le laisse vide.
 */
export async function creerCategorieCaisse(
  saisie: SaisieCategorie
): Promise<string> {
  const id = Crypto.randomUUID();
  await enqueue(
    id,
    saisie.genre === "recette" ? "income_category.create" : "expense_category.create",
    { id, ...corpsCategorie(saisie) }
  );
  return id;
}

/**
 * Renommer, recolorer ou désactiver une rubrique de caisse.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ON DÉSACTIVE, ON NE SUPPRIME PAS.                                       │
 * │                                                                          │
 * │ `ExpenseCategory` est `PROTECT`-référencée par `Expense` : supprimer une │
 * │ rubrique employée lève `ProtectedError`, et toute rubrique qui vaut la   │
 * │ peine d'être gérée est employée. `IncomeCategory` est `SET_NULL` : la    │
 * │ suppression réussit et orpheline l'historique EN SILENCE. Et surtout,    │
 * │ aucune des deux tables n'émet de pierre tombale au tirage : une          │
 * │ suppression côté serveur n'atteindrait JAMAIS ce terminal, où la         │
 * │ rubrique resterait listée et proposée à la saisie, pour toujours.        │
 * │                                                                          │
 * │ `is_active` fait ce qu'on attend d'une suppression sans en avoir les     │
 * │ dégâts : la rubrique quitte les formulaires, l'historique la garde.      │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export async function modifierCategorieCaisse(
  cible: string,
  saisie: SaisieCategorie
): Promise<string> {
  await enqueue(
    Crypto.randomUUID(),
    saisie.genre === "recette" ? "income_category.update" : "expense_category.update",
    corpsModificationCategorie(cible, saisie)
  );
  return cible;
}

/** Une modification de rubrique encore en file, telle qu'elle a été saisie. */
export interface CategorieModifiee {
  id: string;
  nom: string;
  couleur: string | null;
  description: string;
  actif: boolean;
  envoi: EtatEnvoi;
}

/**
 * Les rubriques en file : celles qu'on vient de créer, et celles qu'on vient
 * de modifier.
 *
 * ⚠ `avecBloquees` DES DEUX CÔTÉS, et c'est le contraire de la règle des
 * créations de dépense. Ces lectures ne prétendent rien : chaque ligne porte
 * sa pastille d'envoi. Une rubrique bloquée qui disparaîtrait de la liste
 * serait recréée par le marchand, et `unblockAll` ferait alors partir les deux.
 */
export async function categoriesEnAttente(genre: GenreCategorie): Promise<{
  creations: CategorieModifiee[];
  modifications: Map<string, CategorieModifiee>;
}> {
  const suffixe = genre === "recette" ? "income_category" : "expense_category";
  type Corps = {
    id: string;
    name: string;
    color?: string | null;
    description?: string;
    is_active?: boolean;
  };
  const lire = (quoi: "create" | "update") =>
    enAttenteParType<Corps>(`${suffixe}.${quoi}` as OperationKind, {
      avecBloquees: true,
    });

  const [creations, modifications] = await Promise.all([lire("create"), lire("update")]);
  const vers = (o: {
    payload: Corps;
    envoi: EtatEnvoi;
  }): CategorieModifiee => ({
    id: o.payload.id,
    nom: o.payload.name,
    couleur: o.payload.color ?? null,
    description: o.payload.description ?? "",
    actif: o.payload.is_active ?? true,
    envoi: o.envoi,
  });

  // La DERNIÈRE modification d'une même rubrique l'emporte : deux corrections
  // successives hors ligne partiront dans l'ordre, et c'est la seconde que le
  // serveur retiendra. L'écran doit dire la même chose.
  const parId = new Map<string, CategorieModifiee>();
  for (const o of modifications) parId.set(o.payload.id, vers(o));

  return { creations: creations.map(vers), modifications: parId };
}

/**
 * Ce que le journal retient pour la caisse.
 *
 * ⚠ Les clôtures sont lues `avecBloquees` : une clôture bloquée ferme le
 * tiroir tout autant. Le caissier a compté, imprimé son Z et rangé ; que le
 * serveur ne l'ait pas encore acceptée ne rouvre pas la caisse.
 */
export async function enAttenteCaisse(): Promise<{
  depenses: LotEnAttente;
  mouvements: LotEnAttente;
  clotures: Attentes;
  /** Par dépense, la transition qui attend : l'écran ferme alors ses boutons. */
  transitions: Attentes;
  /** Par mouvement, l'annulation qui attend. */
  annulations: Attentes;
}> {
  const [depenses, mouvements, clotures, annulations, ...transitions] =
    await Promise.all([
      enAttenteParType<{ id: string }>("expense.create"),
      enAttenteParType<{ id: string }>("cash_movement.create"),
      enAttenteParType<{ session: string }>("register_session.close", {
        avecBloquees: true,
      }),
      // ⚠ `avecBloquees` sur les transitions et les annulations, jamais sur les
      // créations : un acte bloqué CONSERVE sa place et repartira seul dès que
      // le droit sera accordé. Le taire rouvrirait le bouton, et le marchand
      // mettrait un SECOND acte en file - que le serveur refuserait après le
      // premier, avec un message qu'il n'a pas provoqué.
      enAttenteParType<{ movement: string }>("cash_movement.cancel", {
        avecBloquees: true,
      }),
      ...(
        [
          "expense.submit",
          "expense.approve",
          "expense.reject",
          "expense.pay",
          "expense.cancel",
        ] as const
      ).map((k) =>
        enAttenteParType<{ expense: string }>(k, { avecBloquees: true })
      ),
    ]);
  return {
    depenses: lotEnAttente(depenses),
    mouvements: lotEnAttente(mouvements),
    clotures: attentesPar(
      clotures.map((o) => ({ id: o.payload.session, envoi: o.envoi }))
    ),
    transitions: attentesPar(
      transitions.flat().map((o) => ({ id: o.payload.expense, envoi: o.envoi }))
    ),
    annulations: attentesPar(
      annulations.map((o) => ({ id: o.payload.movement, envoi: o.envoi }))
    ),
  };
}
