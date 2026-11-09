/**
 * Le compte d'un client sur une PÉRIODE : ses achats, sa dette, sa cagnotte.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ IL EXIGE LE RÉSEAU, ET L'ÉCRAN LE DIT.                                   │
 * │                                                                          │
 * │ `loyalty_transactions` n'est PAS au manifeste de tirage et n'a rien à y  │
 * │ faire : la fidélité GAGNÉE sur une période ne se calcule pas hors ligne. │
 * │ Et les montants sont convertis par le serveur au taux FIGÉ sur chaque     │
 * │ facture, que le terminal n'a pas ligne par ligne - les recalculer        │
 * │ donnerait deux chiffres pour le même client, et le marchand n'aurait     │
 * │ aucun moyen de savoir lequel a raison. C'est l'arbitrage déjà rendu pour │
 * │ les huit onglets de rapports.                                            │
 * │                                                                          │
 * │ ⚠ LA CAGNOTTE, ELLE, RESTE LOCALE : `customer_loyalty` est tirée, et la  │
 * │   fiche continue de l'afficher sans réseau. Un écran vide se lirait « ce │
 * │   client n'a rien », pas « je n'ai pas pu regarder ».                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import { api } from "@/api/client";
import { deviseOuPrincipale, deviseOuRepli } from "@/data/devise-principale";

/** Le chemin de l'action, et son export. */
export const CHEMIN_RAPPORT_CLIENT = "report";

const nb = (v: unknown): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "0"));
  return Number.isFinite(n) ? n : 0;
};

export interface LigneDeviseClient {
  devise: string;
  /** Facturé dans SA devise : c'est lui qui se relit. */
  totalNatif: number;
  /** Converti en principale : c'est lui qui se compare. */
  totalPrincipal: number;
  nombre: number;
}

export interface RapportClient {
  nom: string;
  code: string;
  telephone: string;
  /** La date d'ARRÊTÉ : ce qui n'a pas de période s'y rapporte. */
  arreteAu: string | null;
  /** Devise de tous les montants CONVERTIS. */
  devisePrincipale: string;

  nombreVentes: number;
  chiffre: number;
  panierMoyen: number;
  articles: number;
  encaisse: number;
  resteDu: number;

  parDevise: LigneDeviseClient[];
  /** Ce que le client doit AUJOURD'HUI, par devise. Hors période. */
  comptes: { devise: string; montant: number; genre: "dette" | "avance" }[];

  fidelite: {
    /** Gagnée SUR LA PÉRIODE. */
    gagnee: number;
    /** Utilisée SUR LA PÉRIODE, rendue positive. */
    utilisee: number;
    ecritures: number;
    /** ⚠ HORS PÉRIODE : c'est le solde d'aujourd'hui. */
    cagnotte: number;
    aUnProgramme: boolean;
  };
}

export interface ContexteRapportClient {
  organisation: string;
  client: string;
  /** Bornes INCLUSIVES, au format `AAAA-MM-JJ`. */
  debut?: string;
  fin?: string;
}

/**
 * La chaîne de requête.
 *
 * ⚠ ON ENVOIE TOUJOURS DES DATES EXPLICITES, comme les huit onglets : sans
 * elles le serveur retombe sur son défaut, et une fenêtre calculée ici est une
 * fenêtre qu'on peut afficher, tester et comparer.
 */
function requete(ctx: ContexteRapportClient): string {
  const p = new URLSearchParams();
  if (ctx.debut) p.set("date_from", ctx.debut);
  if (ctx.fin) p.set("date_to", ctx.fin);
  const q = p.toString();
  return q ? `?${q}` : "";
}

export async function chargerRapportClient(
  ctx: ContexteRapportClient
): Promise<RapportClient> {
  const d = await api.get<Record<string, any>>(
    `/customers/${ctx.client}/${CHEMIN_RAPPORT_CLIENT}/${requete(ctx)}`,
    { headers: { "X-Organization-ID": ctx.organisation } }
  );

  const v = d.sales ?? {};
  const f = d.loyalty ?? {};
  return {
    nom: String(d.customer?.name ?? ""),
    code: String(d.customer?.code ?? ""),
    telephone: String(d.customer?.phone ?? ""),
    arreteAu:
      typeof d.period?.as_of === "string" && d.period.as_of ? d.period.as_of : null,
    // ⚠ LE SERVEUR DIT SA DEVISE : la deviner ferait étiqueter des montants
    //   convertis du symbole que l'écran porte, sans jamais savoir s'ils le
    //   sont. C'est le défaut que le tableau de bord a déjà payé.
    //
    //   ⚠ ET LE REPLI N'EST JAMAIS LA CHAÎNE VIDE : `money(x, "")` rend un
    //     montant SANS SYMBOLE, en silence, dans une application où le même
    //     chiffre vaut soit trois dollars, soit trois francs. Un garde-fou de
    //     doctrine l'interdit, et c'est lui qui a attrapé cette ligne.
    devisePrincipale: deviseOuPrincipale(d.currency),

    nombreVentes: nb(v.count),
    chiffre: nb(v.revenue),
    panierMoyen: nb(v.average_basket),
    articles: nb(v.items_sold),
    encaisse: nb(v.collected),
    resteDu: nb(v.outstanding),

    parDevise: (Array.isArray(d.by_currency) ? d.by_currency : []).map((l: any) => ({
      // La devise de CETTE ligne, et la principale à défaut : une ligne de
      // ventilation sans devise n'aurait rien à ventiler.
      devise: deviseOuRepli(l.currency, deviseOuPrincipale(d.currency)),
      totalNatif: nb(l.native_total),
      totalPrincipal: nb(l.primary_total),
      nombre: nb(l.count),
    })),
    comptes: (Array.isArray(d.debt) ? d.debt : []).map((l: any) => ({
      devise: deviseOuRepli(l.currency, deviseOuPrincipale(d.currency)),
      montant: nb(l.amount),
      genre: l.kind === "advance" ? "avance" : "dette",
    })),

    fidelite: {
      gagnee: nb(f.earned),
      utilisee: nb(f.used),
      ecritures: nb(f.entries),
      cagnotte: nb(f.balance),
      aUnProgramme: Boolean(f.has_program),
    },
  };
}
