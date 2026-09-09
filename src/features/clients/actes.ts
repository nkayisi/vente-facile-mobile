/**
 * Les actes d'écriture sur un client : créer, encaisser, ajuster son solde.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ « AVANCE » ET « RÈGLEMENT » SONT LE MÊME ACTE. Un seul écran, donc.      │
 * │                                                                          │
 * │ L'API a deux routes, `record-payment` et `record-advance`, mais la        │
 * │ seconde n'est plus qu'un ALIAS de la première. Le serveur l'a rendue      │
 * │ telle après avoir constaté qu'inscrire une avance sans toucher aux        │
 * │ factures d'un client déjà endetté faisait diverger son solde de la somme  │
 * │ de ses `amount_due` : le marchand voyait à la fois une dette et une       │
 * │ avance chez le même client, et aucune des deux n'était fausse.            │
 * │                                                                          │
 * │ Offrir ici deux boutons distincts ferait donc croire à un choix qui       │
 * │ n'existe pas. Le terminal n'en propose qu'un, et il ANNONCE ce qui va se  │
 * │ passer : les factures ouvertes sont soldées de la plus ancienne à la plus │
 * │ récente, et seul le reliquat devient une avance.                         │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * L'ajustement, lui, est un acte distinct et il le reste : ce n'est pas de
 * l'argent qui arrive, c'est une correction d'écriture. Positif, la dette
 * augmente ; négatif, elle diminue et l'argent entre au tiroir.
 *
 * Comme partout, on n'écrit RIEN dans `customers` ni `customer_balances` : le
 * serveur fait autorité sur un solde, et une avance écrite localement puis
 * refusée laisserait un client créditeur pour toujours.
 */
import * as Crypto from "expo-crypto";

import { enAttenteParType, enqueue, type EtatEnvoi } from "@/sync";

import { pireEnvoiOuRien } from "@/features/sync/attente";

import { PREFIXE, prochainNumero } from "@/features/pos/numerotation";
import { deviseOuPrincipale } from "@/data/devise-principale";

export interface SaisieClient {
  nom: string;
  telephone: string;
  entreprise: boolean;
  raisonSociale?: string;
  email?: string;
  adresse?: string;
  numeroImpot?: string;
  creditAutorise: boolean;
  /** 0 signifie « sans plafond », jamais « crédit refusé ». */
  plafondCredit: number;
  notes?: string;
}

/**
 * Crée un client.
 *
 * L'identifiant est tiré ICI : une vente à crédit encaissée dans la foulée doit
 * pouvoir désigner ce client alors que le serveur ne l'a pas encore vu. Le
 * serveur reprend cet identifiant, et l'opération est idempotente.
 *
 * Le CODE, lui, est laissé au serveur (`read_only` sur le serializer) : il est
 * unique par organisation, et deux terminaux hors ligne en fabriqueraient
 * fatalement le même.
 */
export async function creerClient(saisie: SaisieClient): Promise<string> {
  const id = Crypto.randomUUID();

  await enqueue(id, "customer.create", {
    id,
    name: saisie.nom.trim(),
    phone: saisie.telephone.trim(),
    customer_type: saisie.entreprise ? "business" : "individual",
    company_name: saisie.entreprise ? (saisie.raisonSociale ?? "").trim() : "",
    tax_id: saisie.entreprise ? (saisie.numeroImpot ?? "").trim() : "",
    email: (saisie.email ?? "").trim(),
    address: (saisie.adresse ?? "").trim(),
    allow_credit: saisie.creditAutorise,
    credit_limit: String(saisie.plafondCredit),
    notes: (saisie.notes ?? "").trim(),
    is_active: true,
  });

  return id;
}

export interface SaisieEncaissement {
  client: string;
  /** Montant remis, dans `devise`. */
  montant: number;
  /** Devise des BILLETS remis : celle qui entre au tiroir. */
  devise: string;
  /**
   * Devise des FACTURES visées. Distincte de la précédente : un client qui doit
   * en dollars peut payer en francs. Les confondre est le défaut que le
   * back-office a corrigé - le versement partait alors en avance dans la devise
   * remise, et la dette ne bougeait pas.
   */
  deviseImputation: string;
  methode?: string;
  reference?: string;
  notes?: string;
}

export interface EncaissementMisEnFile {
  id: string;
  numeroRecu: string;
  /** Vrai si le terminal a trouvé au moins une facture ouverte à solder. */
  soldeDesFactures: boolean;
}

/**
 * Met un encaissement client en file, et rend le numéro du reçu.
 *
 * Le PRÉFIXE dépend de ce que l'acte est vraiment : `RGL` s'il solde des
 * factures, `AVC` sinon. Le serveur tranche pareil, avec la même question. Ici
 * la réponse se lit dans la base locale ; les deux peuvent diverger si une
 * facture a été soldée ailleurs entre-temps, et c'est acceptable : le papier
 * remis au client est le document de référence, et le serveur reprend son
 * numéro tel quel.
 */
export async function encaisserClient(
  saisie: SaisieEncaissement,
  deviceCode: string | null,
  aDesFacturesOuvertes: boolean
): Promise<EncaissementMisEnFile> {
  const id = Crypto.randomUUID();
  const numeroRecu = await prochainNumero(
    aDesFacturesOuvertes ? PREFIXE.reglement : PREFIXE.avance,
    deviceCode
  );

  await enqueue(id, "customer.record_payment", {
    id,
    customer: saisie.client,
    amount: String(saisie.montant),
    currency: saisie.devise,
    settle_currency: saisie.deviseImputation,
    payment_method: saisie.methode ?? "cash",
    reference: saisie.reference ?? "",
    notes: saisie.notes ?? "",
    receipt_number: numeroRecu,
  });

  return { id, numeroRecu, soldeDesFactures: aDesFacturesOuvertes };
}

export interface SaisieAjustement {
  client: string;
  /** SIGNÉ : positif, la dette augmente ; négatif, elle diminue. */
  montant: number;
  devise: string;
  /** Obligatoire à l'écran : un ajustement sans motif est intraçable. */
  notes: string;
}

export async function ajusterSolde(
  saisie: SaisieAjustement,
  deviceCode: string | null
): Promise<{ id: string; numeroRecu: string }> {
  const id = Crypto.randomUUID();
  const numeroRecu = await prochainNumero(PREFIXE.ajustement, deviceCode);

  await enqueue(id, "customer.adjust_balance", {
    id,
    customer: saisie.client,
    amount: String(saisie.montant),
    currency: saisie.devise,
    notes: saisie.notes,
    receipt_number: numeroRecu,
  });

  return { id, numeroRecu };
}

/** Ce que le journal retient pour CE client, tant que le serveur n'a pas parlé. */
export interface EnAttenteSurClient {
  encaissements: { id: string; montant: number; devise: string; numeroRecu: string }[];
  ajustements: { id: string; montant: number; devise: string }[];
  /**
   * Où en est la création du client, si elle attend encore.
   *
   * Un booléen ne disait pas si elle partira seule. Voir `data/envoi.ts`.
   */
  creationEnAttente: EtatEnvoi | undefined;
}

export async function enAttenteSurClient(clientId: string): Promise<EnAttenteSurClient> {
  const [encaissements, ajustements, creations] = await Promise.all([
    enAttenteParType<{
      customer: string;
      amount?: string;
      currency?: string;
      receipt_number?: string;
    }>("customer.record_payment"),
    enAttenteParType<{ customer: string; amount?: string; currency?: string }>(
      "customer.adjust_balance"
    ),
    enAttenteParType<{ id: string }>("customer.create", { avecBloquees: true }),
  ]);

  return {
    encaissements: encaissements
      .filter((o) => o.payload.customer === clientId)
      .map((o) => ({
        id: o.id,
        montant: Number(o.payload.amount ?? 0),
        devise: deviseOuPrincipale(o.payload.currency),
        numeroRecu: o.payload.receipt_number ?? "",
      })),
    ajustements: ajustements
      .filter((o) => o.payload.customer === clientId)
      .map((o) => ({
        id: o.id,
        montant: Number(o.payload.amount ?? 0),
        devise: deviseOuPrincipale(o.payload.currency),
      })),
    creationEnAttente: pireEnvoiOuRien(
      creations.filter((o) => o.payload.id === clientId).map((o) => o.envoi)
    ),
  };
}

/**
 * Les clients créés hors ligne, pas encore confirmés.
 *
 * La liste des clients LIT la table tirée ; ceux qui n'y sont pas encore
 * viennent d'ici. Sans cela, un caissier qui vient d'inscrire un client ne le
 * retrouverait nulle part et le saisirait une seconde fois.
 */
export interface ClientEnAttente {
  id: string;
  nom: string;
  telephone: string | null;
  entreprise: boolean;
  creditAutorise: boolean;
}

export async function clientsEnAttente(): Promise<ClientEnAttente[]> {
  const ops = await enAttenteParType<{
    id: string;
    name?: string;
    phone?: string;
    customer_type?: string;
    allow_credit?: boolean;
  }>("customer.create");

  return ops.map((o) => ({
    id: o.payload.id,
    nom: o.payload.name ?? "Client",
    telephone: o.payload.phone?.trim() || null,
    entreprise: o.payload.customer_type === "business",
    creditAutorise: o.payload.allow_credit !== false,
  }));
}
