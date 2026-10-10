/**
 * Les actes d'une réquisition de produits.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UNE RÉQUISITION N'ACHÈTE RIEN, ET NE BOUGE AUCUN STOCK.                 │
 * │                                                                          │
 * │ Elle dit « il nous manque ceci ». C'est pour cela qu'elle n'est PAS une  │
 * │ commande d'achat : `PurchaseOrder.supplier` est obligatoire côté         │
 * │ serveur, alors que le fournisseur est souvent la question qu'on se pose  │
 * │ EN LISANT la demande.                                                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ LE STOCK ET LE SEUIL SONT RELEVÉS PAR LE SERVEUR, jamais envoyés. Le
 * client dit l'article et la quantité voulue ; l'instantané vient de la base.
 * Les laisser saisir permettrait d'écrire une pénurie qui n'existe pas, sur un
 * document qui sert à engager de l'argent - et c'est le défaut qui a été
 * MESURÉ en écrivant le service (`reorder_point_at_request` sortait à zéro
 * sous une proposition qui annonçait douze).
 *
 * ⚠ UN REFUS DE TRANSITION EST DÉTERMINISTE. « Déjà soumise », « déjà
 * décidée » : le serveur rend `rejected`, donc quarantaine, jamais un nouvel
 * essai. Rejouer une approbation ne doublerait rien ici - l'acte est
 * idempotent sur son état cible - mais la file se viderait plus vite en
 * cessant de marteler.
 */
import * as Crypto from "expo-crypto";

import { enAttenteParType, enqueue, type OperationKind } from "@/sync";
import { PREFIXE, prochainNumero } from "@/features/pos/numerotation";
import {
  attentesPar,
  lotEnAttente,
  type Attentes,
  type LotEnAttente,
} from "@/features/sync/attente";

/** Une ligne de réquisition, telle que le magasinier la saisit. */
export interface LigneSaisie {
  produit: string;
  /** Ce qu'il veut acheter. Corrigée depuis la proposition, souvent. */
  quantite: number;
  note?: string;
}

/** Les quatre transitions, mot pour mot celles du serveur. */
export type TransitionRequisition = "submit" | "cancel" | "approve" | "reject";

export const LIBELLE_TRANSITION: Record<TransitionRequisition, string> = {
  submit: "Soumettre",
  cancel: "Annuler",
  approve: "Approuver",
  reject: "Rejeter",
};

/**
 * Met une réquisition en file, et rend sa référence.
 *
 * La référence est allouée ICI : voir `PREFIXE.requisition`. Elle voyage dans
 * le corps et le serveur la reprend.
 */
export async function creerRequisition(saisie: {
  entrepot: string;
  lignes: LigneSaisie[];
  notes?: string;
  codeAppareil: string;
}): Promise<{ id: string; reference: string }> {
  const id = Crypto.randomUUID();
  const reference = await prochainNumero(PREFIXE.requisition, saisie.codeAppareil);

  await enqueue(id, "requisition.create", {
    id,
    reference,
    warehouse: saisie.entrepot,
    notes: saisie.notes ?? "",
    items: saisie.lignes.map((l) => ({
      product: l.produit,
      // Les décimales voyagent en CHAÎNE : un panier à sept chiffres perd ses
      // unités en virgule flottante, et une quantité porte trois décimales.
      quantity_requested: String(l.quantite),
      notes: l.note ?? "",
    })),
  });

  return { id, reference };
}

/** Fait avancer une réquisition. */
export async function transitionRequisition(
  requisitionId: string,
  transition: TransitionRequisition,
  notes?: string
): Promise<string> {
  const id = Crypto.randomUUID();
  await enqueue(id, `requisition.${transition}` as never, {
    id,
    requisition: requisitionId,
    notes: notes ?? "",
  });
  return id;
}

const ACTES_REQUISITION = [
  "requisition.submit",
  "requisition.cancel",
  "requisition.approve",
  "requisition.reject",
] as const satisfies readonly OperationKind[];

/**
 * Ce qui attend son envoi, par réquisition.
 *
 * ⚠ `avecBloquees` : l'écran FERME des boutons avec ce résultat, il n'affirme
 * aucun acquis. Sans les bloquées, une soumission retenue par un droit sortirait
 * de la lecture, le bouton se rouvrirait, et le magasinier mettrait une SECONDE
 * soumission en file - que le déblocage ferait partir avec la première, la
 * seconde partant alors en quarantaine pour un refus qu'il n'a pas provoqué.
 * C'est mot pour mot le défaut de la seconde session de caisse.
 */
export async function attentesRequisitions(): Promise<Attentes> {
  const lots = await Promise.all(
    ACTES_REQUISITION.map((kind) =>
      enAttenteParType<{ requisition?: string }>(kind, { avecBloquees: true })
    )
  );
  return attentesPar(
    lots.flat().map((o) => ({ id: o.payload.requisition, envoi: o.envoi }))
  );
}

/**
 * Ce que les CRÉATIONS attendent d'envoyer, par réquisition.
 *
 * Séparée des transitions, parce que ce qu'elle dit n'est pas la même chose :
 * une création en file veut dire « le serveur ne connaît pas encore cette
 * pièce », donc aucune décision n'est possible dessus - `_objet_de_lorg` la
 * refuserait, et le refus partirait en quarantaine.
 */
export async function creationsRequisitionsEnAttente(): Promise<Attentes> {
  const ops = await enAttenteParType<{ id?: string }>("requisition.create", {
    avecBloquees: true,
  });
  return attentesPar(ops.map((o) => ({ id: o.payload.id, envoi: o.envoi })));
}

export { lotEnAttente, type LotEnAttente };
