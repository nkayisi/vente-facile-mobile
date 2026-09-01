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

import { enAttenteParType, enqueue } from "@/sync";

export interface SaisieDepense {
  categorie: string;
  description: string;
  montant: number;
  devise: string;
  beneficiaire?: string;
  methode?: string | null;
  notes?: string;
}

export async function creerDepense(saisie: SaisieDepense): Promise<string> {
  const id = Crypto.randomUUID();
  await enqueue(id, "expense.create", {
    id,
    category: saisie.categorie,
    description: saisie.description.trim(),
    amount: String(saisie.montant),
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
    expense_date: jourISO(new Date()),
    ...(saisie.methode ? { payment_method: saisie.methode } : {}),
    notes: saisie.notes ?? "",
  });
  return id;
}

/** « 2026-08-31 » sans passer par `Intl`, qui est proscrit (voir `data/dates`). */
function jourISO(d: Date): string {
  const deux = (n: number) => (n < 10 ? `0${n}` : String(n));
  return `${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}`;
}

export interface SaisieMouvementCaisse {
  /** `in` : de l'argent entre. `out` : il sort. */
  sens: "in" | "out";
  montant: number;
  devise: string;
  description: string;
  categorieRecette?: string | null;
  categorieDepense?: string | null;
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
    amount: String(saisie.montant),
    currency: saisie.devise,
    description: saisie.description.trim(),
    // Requis par le modèle, et absent lui aussi. C'est l'instant de la SAISIE.
    movement_date: new Date().toISOString(),
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

/** Ce que le journal retient pour la caisse. */
export async function enAttenteCaisse(): Promise<{
  depenses: number;
  mouvements: number;
  clotures: Set<string>;
}> {
  const [depenses, mouvements, clotures] = await Promise.all([
    enAttenteParType<{ id: string }>("expense.create"),
    enAttenteParType<{ id: string }>("cash_movement.create"),
    enAttenteParType<{ session: string }>("register_session.close"),
  ]);
  return {
    depenses: depenses.length,
    mouvements: mouvements.length,
    clotures: new Set(clotures.map((o) => o.payload.session)),
  };
}
