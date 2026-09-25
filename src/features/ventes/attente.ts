/**
 * Les ventes qui attendent encore leur envoi.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UNE VENTE FAITE HORS LIGNE ÉTAIT INTROUVABLE DANS SA PROPRE LISTE.      │
 * │                                                                          │
 * │ Corollaire systématique de « les tables tirées ne sont écrites que par   │
 * │ le tirage » : la vente vit dans le JOURNAL, pas dans `sales`, et le hub  │
 * │ ne lisait que `sales`. Relevé sur l'émulateur : ticket imprimé sous      │
 * │ `VT-20260831-Q5L8-0001`, et l'écran d'arrivée annonçait « Ventes du jour │
 * │ (0) », « 0 $ ». Sur le premier écran que le caissier ouvre après avoir   │
 * │ encaissé, et dans le mode de fonctionnement pour lequel ce terminal      │
 * │ existe. Le lot 11 avait posé cette fusion sur les retours et les devis ; │
 * │ elle manquait là où elle compte le plus.                                 │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LES MONTANTS VIENNENT DU TICKET RANGÉ, ILS NE SONT PAS RECALCULÉS.      │
 * │                                                                          │
 * │ Le journal porte le corps que le SERIALIZER attend : des prix unitaires  │
 * │ et des quantités, sans total de ligne - c'est le serveur qui les arrête. │
 * │ Les refaire ici serait de l'arithmétique de vente dans un écran, ce que  │
 * │ la doctrine interdit, et deux arithmétiques ne restent pas d'accord.     │
 * │                                                                          │
 * │ Or le comptoir range DÉJÀ le document, juste avant de vider le panier :  │
 * │ `print_jobs` porte le total, la devise, le restant dû et le nombre de    │
 * │ lignes, dans les valeurs exactes que le client a sur son papier. C'est   │
 * │ la seule source honnête tant que le serveur n'a pas répondu, et c'est    │
 * │ la même règle que pour les retours : « les montants sont ceux SAISIS ».  │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import { inArray } from "drizzle-orm";

import { db } from "@/db/client";
import { printJobs } from "@/db/schema";
import { enAttenteParType, type EtatEnvoi } from "@/sync";

export interface VenteEnAttente {
  id: string;
  reference: string;
  client: string | null;
  /** `null` : le ticket n'a pas été retrouvé, le montant est INCONNU. */
  total: number | null;
  resteAPayer: number;
  devise: string | null;
  date: Date;
  nbArticles: number | null;
  /**
   * La session de caisse à laquelle la vente se rattache, telle qu'elle part
   * au serveur. `null` quand le corps n'en porte pas.
   *
   * Elle est ici parce que les compteurs d'une session ouverte hors ligne
   * n'ont aucune autre source : ni la vente ni la session n'existent dans une
   * table tirée, et un comptoir qui annonce « 0 vente » après une journée de
   * travail se lit comme une perte.
   */
  session: string | null;
  /**
   * L'entrepôt porté par le corps. `null` : inconnu, jamais « tous ».
   *
   * Remonté ici pour que les écrans n'aient pas à replonger dans `corps` :
   * c'est la même raison qui a fait remonter `session`.
   */
  entrepot: string | null;
  /**
   * En file, ou BLOQUÉE faute d'abonnement ou de droit.
   *
   * « Attend son envoi » est faux pour la seconde : elle n'attend pas le
   * réseau, et le marchand qui le croit synchronise en vain, parfois des jours.
   */
  envoi: EtatEnvoi;
}

interface TicketRange {
  customerName?: string;
  total?: number;
  currency?: string;
  amountDue?: number;
  items?: { total?: number }[];
  /**
   * Version des données rangées. Absente = 1, où les montants du ticket sont
   * en devise PRINCIPALE malgré l'étiquette de facture. Voir
   * `printing/jobs.ts::VERSION_DONNEES`.
   */
  schemaVersion?: number;
}

/**
 * Le corps d'une vente, tel qu'il part au serveur.
 *
 * On ne déclare que ce que les écrans lisent. Le corps est le seul endroit où
 * vivent les TAUX - celui de la facture et celui de chaque règlement - et le
 * seul à nommer les produits : le ticket, lui, porte des libellés.
 */
export interface CorpsVente {
  id: string;
  reference?: string;
  session?: string;
  /**
   * L'entrepôt de la vente, quand la caisse en a un.
   *
   * `buildSalePayload` l'écrit (`...(warehouse ? { warehouse } : {})`) depuis
   * l'entrepôt de la session ouverte. La ligne de TYPE manquait seulement : la
   * donnée était dans le journal depuis le lot 4, sans que rien ne sache la
   * lire. ⚠ `undefined` n'est pas « tous les entrepôts », c'est un entrepôt
   * INCONNU - une caisse peut n'en avoir aucun.
   */
  warehouse?: string;
  currency?: string;
  /** Devise principale pour une unité de la devise de facture. */
  exchange_rate?: number;
  items?: {
    product?: string;
    /** Absent pour un produit CONDITIONNÉ : voir `quantiteVendue`. */
    quantity?: number | string;
    package_quantity?: number | string;
    loose_quantity?: number | string;
  }[];
  payments?: {
    payment_method?: string;
    /** Le billet REÇU, dans `currency`. */
    tendered_amount?: number | string;
    currency?: string;
    /** Devise de facture pour une unité de la devise du règlement. */
    exchange_rate?: number;
  }[];
}

/**
 * Une vente du journal, avec ce qu'il faut pour l'AGRÉGER et non seulement
 * l'afficher : son corps, et la version des montants de son ticket.
 *
 * Le hub et l'historique n'en ont pas besoin - ils montrent un total et une
 * devise. Le tableau de bord, lui, ventile par produit et par moyen de
 * paiement, et convertit : il lui faut les taux figés et les identifiants.
 */
export interface VenteEnAttenteDetaillee extends VenteEnAttente {
  corps: CorpsVente;
  /** 1 = montants du ticket en devise PRINCIPALE. */
  versionDonnees: number;
  /** Brut de chaque ligne du ticket, dans l'ordre du corps. */
  brutsTicket: (number | null)[];
}

/**
 * Les ventes du journal, enrichies de leur ticket.
 *
 * L'ordre suit celui du journal (`seq`), donc celui de l'encaissement.
 */
export async function ventesEnAttente(): Promise<VenteEnAttente[]> {
  return (await lireVentesDuJournal()).map(({ vue }) => vue);
}

/**
 * Les mêmes, avec leur corps et la version de leur ticket.
 *
 * Même lecture, même requête : deux lecteurs du journal des ventes finiraient
 * par diverger sur ce qu'ils retiennent - le lot précédent en avait trois, et
 * c'est celui du tableau de bord qui avait le plus de règles en moins.
 */
export async function ventesEnAttenteDetaillees(): Promise<VenteEnAttenteDetaillee[]> {
  return (await lireVentesDuJournal()).map(({ vue, corps, ticket }) => ({
    ...vue,
    corps,
    // L'absence du champ vaut 1 : les documents rangés avant la correction de
    // la devise du ticket n'en portent aucun, et leurs montants sont en devise
    // PRINCIPALE. Les convertir une seconde fois multiplierait le chiffre
    // d'affaires du jour par le taux.
    versionDonnees: typeof ticket?.schemaVersion === "number" ? ticket.schemaVersion : 1,
    brutsTicket: (ticket?.items ?? []).map((i) =>
      typeof i?.total === "number" ? i.total : null
    ),
  }));
}

async function lireVentesDuJournal(): Promise<
  { vue: VenteEnAttente; corps: CorpsVente; ticket: TicketRange | undefined }[]
> {
  // Les ventes BLOQUÉES en sont, et elles y comptent doublement : elles ont
  // été encaissées et imprimées comme les autres, et leur blocage dure - le
  // temps qu'un abonnement soit réglé. Les taire ferait relire au caissier
  // « Ventes du jour (0) » après une journée de comptoir, c'est-à-dire le
  // défaut exact que ce module referme, sur la période où il fait le plus mal.
  const ops = await enAttenteParType<CorpsVente>("sale.create", { avecBloquees: true });
  if (ops.length === 0) return [];

  const references = ops.map((o) => o.payload.reference).filter(Boolean) as string[];
  const tickets = new Map<string, TicketRange>();
  if (references.length > 0) {
    const lignes = await db
      .select({ numero: printJobs.documentNumber, data: printJobs.data })
      .from(printJobs)
      .where(inArray(printJobs.documentNumber, references));
    for (const l of lignes) {
      try {
        tickets.set(l.numero, JSON.parse(l.data) as TicketRange);
      } catch {
        // Un document illisible n'empêche pas la vente de s'afficher : c'est
        // son montant qu'on ignorera, pas son existence.
      }
    }
  }

  return ops.map((o) => {
    const reference = o.payload.reference ?? "";
    const t = tickets.get(reference);
    return {
      vue: {
        id: o.payload.id,
        reference,
        client: t?.customerName ?? null,
        // `undefined` du ticket se lit INCONNU, jamais zéro : un montant nul
        // fabriqué fausserait le total de la journée sans rien signaler.
        total: typeof t?.total === "number" ? t.total : null,
        resteAPayer: typeof t?.amountDue === "number" ? t.amountDue : 0,
        devise: t?.currency ?? null,
        date: o.occurredAt,
        nbArticles: Array.isArray(t?.items) ? t.items.length : null,
        session: o.payload.session ?? null,
        entrepot: o.payload.warehouse ?? null,
        envoi: o.envoi,
      },
      corps: o.payload,
      ticket: t,
    };
  });
}

/**
 * Une vente du journal, par son identifiant.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ SA PROPRE LISTE Y MENAIT, ET LA FICHE RÉPONDAIT « VENTE INTROUVABLE ».  │
 * │                                                                          │
 * │ `detailVente` ne lit que `sales`, la table TIRÉE. Une vente encaissée    │
 * │ hors ligne y est absente par construction, si bien que le hub et         │
 * │ l'historique la listaient - c'est tout leur objet - et que taper dessus  │
 * │ annonçait qu'elle n'existait pas. Le caissier tient le ticket dans une   │
 * │ main et son terminal dans l'autre : il ne peut que conclure à une perte, │
 * │ et rien à l'écran ne le détrompe.                                        │
 * │                                                                          │
 * │ La fiche ne peut pas TOUT montrer - les lignes et les règlements sont    │
 * │ dans le corps de l'opération, pas dans une table lisible - et elle le    │
 * │ DIT plutôt que d'afficher des sections vides, qui se lisent comme une    │
 * │ vente sans articles. Ce qu'elle peut faire, elle le fait : le ticket est │
 * │ rangé dans `print_jobs`, donc il se réimprime.                           │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * `null` quand l'identifiant n'est pas non plus dans le journal : la vente
 * n'existe nulle part sur ce terminal, et là « introuvable » est la vérité.
 */
export async function venteEnAttenteParId(id: string): Promise<VenteEnAttente | null> {
  const toutes = await ventesEnAttente();
  return toutes.find((v) => v.id === id) ?? null;
}
