/**
 * Les actes d'écriture sur une vente déjà émise : régler, annuler.
 *
 * Trois règles de ce dépôt se croisent ici, et aucune n'est négociable.
 *
 * **On n'écrit RIEN dans les tables tirées.** Ni le règlement, ni le nouveau
 * statut. Ce qui n'est pas encore confirmé par le serveur se lit dans le
 * journal (`enAttenteParType`), jamais dans `payments` ou `sales`. Une écriture
 * optimiste laisserait, après un refus, un règlement fantôme sur une facture
 * que le marchand croirait soldée.
 *
 * **Le numéro du reçu est DÉFINITIF dès l'impression.** Le caissier encaisse
 * hors ligne, imprime, et le client repart avec le papier. Le numéro est donc
 * tiré ici, dans la série dense de l'appareil, et voyage dans le `payload` : le
 * serveur le reprend au lieu d'en allouer un second. Sans cela le client
 * détiendrait un papier ne désignant aucun reçu retrouvable.
 *
 * **Le montant n'est pas recalculé.** On envoie ce que le caissier a saisi et
 * la devise dans laquelle il l'a saisi ; `apply_payment_to_sale` fait le reste,
 * conversion et monnaie comprises. C'est le point d'entrée unique d'un
 * règlement, et le contourner est ce qui avait fait diverger le solde des
 * clients de la somme de leurs factures.
 */
import * as Crypto from "expo-crypto";

import { enAttenteParType, enqueue, type EtatEnvoi } from "@/sync";

import { pireEnvoiOuRien } from "@/features/sync/attente";

import { PREFIXE, prochainNumero } from "@/features/pos/numerotation";
import { deviseOuPrincipale } from "@/data/devise-principale";

/** Ce qu'un règlement ajouté à une facture transporte. */
export interface SaisieReglement {
  vente: string;
  /**
   * IDENTIFIANT de la méthode de paiement, pas son type.
   *
   * L'asymétrie mérite d'être nommée : `sale.add_payment` attend un
   * `payment_method_id`, tandis que `customer.record_payment` attend un TYPE
   * (`cash`, `mobile_money`). Les deux champs s'appellent `payment_method` dans
   * le corps envoyé, et les intervertir passe la validation en silence pour
   * échouer côté serveur, une fois hors ligne, donc en quarantaine.
   */
  methode: string;
  /** Montant remis, dans `devise`. */
  montant: number;
  devise: string;
  /** Devise dans laquelle rendre la monnaie, si elle diffère. */
  deviseMonnaie?: string;
  reference?: string;
  notes?: string;
}

export interface ReglementMisEnFile {
  /** Identifiant de l'opération, qui porte l'idempotence. */
  id: string;
  numeroRecu: string;
}

/**
 * Met un règlement en file, et rend le numéro du reçu à imprimer.
 *
 * L'appelant imprime APRÈS : un ticket sorti avant la mise en file décrirait un
 * versement que rien ne rejouerait si l'application était tuée entre les deux.
 */
export async function ajouterReglement(
  saisie: SaisieReglement,
  deviceCode: string | null
): Promise<ReglementMisEnFile> {
  const id = Crypto.randomUUID();
  const numeroRecu = await prochainNumero(PREFIXE.reglement, deviceCode);

  await enqueue(id, "sale.add_payment", {
    id,
    sale: saisie.vente,
    payment_method: saisie.methode,
    tendered_amount: String(saisie.montant),
    currency: saisie.devise,
    change_currency: saisie.deviseMonnaie ?? saisie.devise,
    reference: saisie.reference ?? "",
    notes: saisie.notes ?? "",
    receipt_number: numeroRecu,
  });

  return { id, numeroRecu };
}

/**
 * Met une annulation en file.
 *
 * Le serveur relâche la réservation, rend le stock, retire les points et efface
 * la dette. Rien de tout cela n'est fait ici : reproduire cet enchaînement
 * localement, c'est le tenir en double et le laisser diverger.
 */
export async function annulerVente(venteId: string, motif: string): Promise<string> {
  const id = Crypto.randomUUID();
  await enqueue(id, "sale.cancel", {
    id,
    sale: venteId,
    reason: motif,
    notes: motif,
  });
  return id;
}

/** Ce que le journal retient d'une facture, tant que le serveur n'a pas parlé. */
export interface EnAttenteSurVente {
  /** Règlements mis en file et pas encore confirmés. */
  reglements: { id: string; montant: number; devise: string; numeroRecu: string }[];
  /** Somme des règlements en attente, par devise. */
  totalParDevise: { devise: string; montant: number }[];
  /**
   * Où en est l'annulation qui attend, s'il y en a une.
   *
   * Un booléen ne disait pas si elle partira seule : une annulation BLOQUÉE
   * attend une décision, et annoncer « attend son envoi » enverrait le
   * caissier chercher un réseau déjà là.
   */
  annulationEnAttente: EtatEnvoi | undefined;
}

/**
 * Ce qui attend dans le journal pour CETTE facture.
 *
 * C'est la contrepartie de « on n'écrit rien dans les tables tirées » : sans
 * cette lecture, un caissier qui encaisse hors ligne verrait sa facture
 * inchangée et encaisserait une seconde fois.
 */
export async function enAttenteSurVente(venteId: string): Promise<EnAttenteSurVente> {
  const [reglements, annulations] = await Promise.all([
    enAttenteParType<{
      sale: string;
      tendered_amount?: string;
      currency?: string;
      receipt_number?: string;
    }>("sale.add_payment"),
    // `avecBloquees` : une annulation bloquée doit continuer de fermer le
    // bouton, sinon le caissier en met une seconde en file.
    enAttenteParType<{ sale: string }>("sale.cancel", { avecBloquees: true }),
  ]);

  const miens = reglements.filter((o) => o.payload.sale === venteId);
  const parDevise = new Map<string, number>();
  for (const o of miens) {
    const d = deviseOuPrincipale(o.payload.currency);
    parDevise.set(d, (parDevise.get(d) ?? 0) + Number(o.payload.tendered_amount ?? 0));
  }

  return {
    reglements: miens.map((o) => ({
      id: o.id,
      montant: Number(o.payload.tendered_amount ?? 0),
      devise: deviseOuPrincipale(o.payload.currency),
      numeroRecu: o.payload.receipt_number ?? "",
    })),
    totalParDevise: [...parDevise.entries()].map(([devise, montant]) => ({ devise, montant })),
    annulationEnAttente: pireEnvoiOuRien(
      annulations.filter((o) => o.payload.sale === venteId).map((o) => o.envoi)
    ),
  };
}

/**
 * Les factures qui portent un règlement en attente, tous clients confondus.
 *
 * L'écran des règlements en attente s'en sert pour ne pas proposer d'encaisser
 * deux fois la même facture pendant une coupure réseau.
 */
export async function ventesAvecReglementEnAttente(): Promise<Set<string>> {
  const ops = await enAttenteParType<{ sale: string }>("sale.add_payment");
  return new Set(ops.map((o) => o.payload.sale));
}
