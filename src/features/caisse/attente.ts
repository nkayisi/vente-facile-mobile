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
 * │ seuls `approve` et `pay` appellent `_create_cash_movement_for_expense`.  │
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
  if (brut) {
    const d = new Date(brut);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return repli ?? null;
}

export async function mouvementsEnFile(): Promise<MouvementEnFile[]> {
  const ops = await enAttenteParType<CorpsMouvement>("cash_movement.create", {
    avecBloquees: true,
  });
  return ops.map((o) => ({
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
  }));
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
