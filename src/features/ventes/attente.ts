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
  items?: unknown[];
}

/**
 * Les ventes du journal, enrichies de leur ticket.
 *
 * L'ordre suit celui du journal (`seq`), donc celui de l'encaissement.
 */
export async function ventesEnAttente(): Promise<VenteEnAttente[]> {
  // Les ventes BLOQUÉES en sont, et elles y comptent doublement : elles ont
  // été encaissées et imprimées comme les autres, et leur blocage dure - le
  // temps qu'un abonnement soit réglé. Les taire ferait relire au caissier
  // « Ventes du jour (0) » après une journée de comptoir, c'est-à-dire le
  // défaut exact que ce module referme, sur la période où il fait le plus mal.
  const ops = await enAttenteParType<{ id: string; reference?: string }>(
    "sale.create",
    { avecBloquees: true }
  );
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
      envoi: o.envoi,
    };
  });
}
