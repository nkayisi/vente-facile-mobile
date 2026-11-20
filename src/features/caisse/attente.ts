/**
 * Ce que le livre de caisse tient dans le JOURNAL, et pas encore en table.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE TIROIR A DÉJÀ BOUGÉ, LA TABLE NON.                                   │
 * │                                                                          │
 * │ Un apport de fonds saisi hors ligne est de l'argent PHYSIQUEMENT entré : │
 * │ les billets sont dans la caisse. La table `cash_movements` n'est écrite  │
 * │ que par le TIRAGE, donc le solde affiché ne bougeait pas, et le caissier │
 * │ qui vient de saisir 50 000 FC voyait le même chiffre qu'avant. Il le     │
 * │ ressaisit, et le serveur applique les deux.                              │
 * │                                                                          │
 * │ C'est la doctrine de la réserve locale du comptoir, prise par l'autre    │
 * │ bout : ses propres opérations en file, le terminal les connaît mieux que │
 * │ quiconque.                                                               │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UNE DÉPENSE EN FILE NE BOUGE PAS LE TIROIR, ET C'EST MESURÉ.            │
 * │                                                                          │
 * │ `create_expense` enregistre en BROUILLON et ne crée aucun mouvement :    │
 * │ seul `pay` appelle `create_cash_movement_for_expense` - l'approbation    │
 * │ ne sort plus rien, l'argent sort au paiement, de la caisse du payeur.    │
 * │ La compter dans le solde ferait sortir de la caisse un argent qui y est  │
 * │ encore. Elle est donc LISTÉE avec sa pastille d'envoi, et exclue de tout │
 * │ relevé de solde.                                                         │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ `avecBloquees` partout : un blocage tient le temps qu'un abonnement soit
 * réglé ou un droit accordé, et les billets, eux, sont déjà dans le tiroir.
 * Confondre « bloqué » et « refusé » ferait disparaître du solde une somme
 * bien réelle pendant des jours. La quarantaine, elle, n'y entre jamais : le
 * serveur a refusé, et le caissier a repris son argent.
 */
import { dateDepuisJourISO } from "@/data/dates";
import { deviseOuPrincipale } from "@/data/devise-principale";
import { enAttenteParType, type EtatEnvoi } from "@/sync";

/** Le corps d'un `cash_movement.create`, tel que `actes.ts` le met en file. */
interface CorpsMouvement {
  id: string;
  direction: string;
  movement_type: string;
  amount: string;
  currency: string;
  description: string;
  movement_date: string;
}

/** Le corps d'un `expense.create`. */
interface CorpsDepense {
  id: string;
  /** Le numéro d'appareil, alloué avant l'impression. */
  reference?: string;
  category: string;
  description: string;
  amount: string;
  currency: string;
  beneficiary?: string;
  payment_method?: string;
  warehouse?: string;
  notes?: string;
  expense_date: string;
}

export interface MouvementEnFile {
  id: string;
  direction: "in" | "out";
  type: string;
  description: string;
  montant: number;
  devise: string;
  date: Date | null;
  envoi: EtatEnvoi;
}

export interface DepenseEnFile {
  id: string;
  /** `null` sur une dépense mise en file avant la numérotation par appareil. */
  reference: string | null;
  categorieId: string;
  description: string;
  montant: number;
  devise: string;
  beneficiaire: string | null;
  methode: string | null;
  entrepot: string | null;
  notes: string;
  date: Date | null;
  envoi: EtatEnvoi;
}

const nombre = (v: string | undefined): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/**
 * La date de l'ACTE, avec l'horodatage de mise en file comme repli.
 *
 * `occurred_at` est l'heure à laquelle le caissier a saisi ; une date de corps
 * illisible ne doit pas faire retomber la ligne sur « maintenant », qui la
 * rangerait au mauvais jour dans un cadran borné à aujourd'hui.
 */
function date(brut: string | undefined, repli: Date | null): Date | null {
  // Un JOUR (« 2026-11-20 ») se lit en minuit LOCAL : `new Date` le lirait en
  // UTC, donc « 01:00 » à Kinshasa et la veille à l'ouest de Greenwich.
  const jour = /^\d{4}-\d{2}-\d{2}$/.test(brut ?? "") ? dateDepuisJourISO(brut) : null;
  if (jour) return jour;
  if (brut) {
    const d = new Date(brut);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return repli ?? null;
}

/**
 * Le corps d'un `expense.pay`, tel que `actes.ts::transitionDepense` le met en
 * file. `sortie_tiroir` n'est posé que si les billets quittent la caisse :
 * paiement en espèces, et aucune sortie déjà faite à l'approbation.
 */
interface CorpsPaiementDepense {
  expense: string;
  sortie_tiroir?: { amount: string; currency: string; description: string };
}

export async function mouvementsEnFile(): Promise<MouvementEnFile[]> {
  const [ops, paiements] = await Promise.all([
    enAttenteParType<CorpsMouvement>("cash_movement.create", { avecBloquees: true }),
    // ┌──────────────────────────────────────────────────────────────────┐
    // │ UNE DÉPENSE PAYÉE EN ESPÈCES A VIDÉ LE TIROIR, MÊME EN FILE.     │
    // │                                                                  │
    // │ L'argent sort au PAIEMENT, du tiroir de celui qui paie : le       │
    // │ caissier vient de remettre les billets. Taire le paiement tant    │
    // │ qu'il n'est pas parti laisserait un solde qui ne correspond plus  │
    // │ à aucune liasse.                                                  │
    // └──────────────────────────────────────────────────────────────────┘
    enAttenteParType<CorpsPaiementDepense>("expense.pay", { avecBloquees: true }),
  ]);
  const sorties: MouvementEnFile[] = paiements
    .filter((o) => o.payload.sortie_tiroir)
    .map((o) => ({
      id: `paiement-${o.payload.expense}`,
      direction: "out" as const,
      type: "expense",
      description: o.payload.sortie_tiroir?.description ?? "",
      montant: nombre(o.payload.sortie_tiroir?.amount),
      devise: deviseOuPrincipale(o.payload.sortie_tiroir?.currency),
      date: o.occurredAt ?? null,
      envoi: o.envoi,
    }));
  return [...sorties, ...ops.map((o): MouvementEnFile => ({
    id: o.payload.id,
    // Le SENS vient du corps, jamais du signe du montant : le montant est
    // toujours positif, c'est l'acte qui porte la direction.
    direction: o.payload.direction === "out" ? "out" : "in",
    type: o.payload.movement_type,
    description: o.payload.description ?? "",
    montant: nombre(o.payload.amount),
    devise: o.payload.currency,
    date: date(o.payload.movement_date, o.occurredAt),
    envoi: o.envoi,
  }))];
}

export async function depensesEnFile(): Promise<DepenseEnFile[]> {
  const ops = await enAttenteParType<CorpsDepense>("expense.create", {
    avecBloquees: true,
  });
  return ops.map((o) => ({
    id: o.payload.id,
    reference: o.payload.reference ?? null,
    categorieId: o.payload.category,
    description: o.payload.description ?? "",
    montant: nombre(o.payload.amount),
    devise: o.payload.currency,
    beneficiaire: o.payload.beneficiary?.trim() || null,
    methode: o.payload.payment_method ?? null,
    entrepot: o.payload.warehouse ?? null,
    notes: o.payload.notes ?? "",
    date: date(o.payload.expense_date, o.occurredAt),
    envoi: o.envoi,
  }));
}
