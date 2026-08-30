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
    ...(saisie.methode ? { payment_method: saisie.methode } : {}),
    notes: saisie.notes ?? "",
  });
  return id;
}

export interface SaisieMouvementCaisse {
  /** `in` : de l'argent entre. `out` : il sort. */
  sens: "in" | "out";
  montant: number;
  devise: string;
  description: string;
  categorieRecette?: string | null;
  categorieDepense?: string | null;
  session?: string | null;
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
    movement_type: saisie.sens === "in" ? "income" : "expense",
    amount: String(saisie.montant),
    currency: saisie.devise,
    description: saisie.description.trim(),
    ...(saisie.categorieRecette ? { income_category: saisie.categorieRecette } : {}),
    ...(saisie.categorieDepense ? { expense_category: saisie.categorieDepense } : {}),
    ...(saisie.session ? { session: saisie.session } : {}),
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
