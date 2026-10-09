/**
 * Ma journée : ce que J'AI vendu, encaissé et dépensé.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA SEULE LECTURE DE RAPPORT OUVERTE À UN CAISSIER.                      │
 * │                                                                          │
 * │ Les huit onglets de `rapports.ts` sont gardés par `reports.view`, accordé │
 * │ au seul propriétaire et au gérant : un caissier qui ouvrait la rubrique   │
 * │ recevait 403 sur les huit, donc il n'avait AUCUN moyen de savoir ce qu'il │
 * │ avait vendu dans la journée. C'est la contrepartie du cloisonnement : on  │
 * │ ne lui retire pas la lecture de son périmètre en lui retirant celle des   │
 * │ autres.                                                                   │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ CE MODULE N'EST PAS SOUMIS À LA PARITÉ, et c'est pourquoi il vit à côté
 * de `rapports.ts` plutôt que dedans. Les huit onglets doivent rendre colonne
 * pour colonne ce que le back-office rend, et `rapports-parite.test.ts` le
 * tient ; « Ma journée » n'a AUCUN équivalent web, donc elle suit la grammaire
 * du terminal - un cadran, un graphique, pas de tableau à colonnes.
 *
 * ⚠ ON N'ENVOIE AUCUN PÉRIMÈTRE. Le serveur le neutralise de son côté, mais
 * l'envoyer quand même serait un paramètre qui voyage là où il n'a rien à
 * faire, et ce dépôt a déjà payé cela : `?user=` partait sur les quatre appels
 * de l'onglet Ventes, où personne ne le lit.
 */
import { api } from "@/api/client";

import { CHEMIN_MA_JOURNEE } from "./rapports";

/**
 * Les deux coercitions sont LOCALES, et ce n'est pas un oubli.
 *
 * `rapports.ts` a les siennes, privées. Les y exporter coupleraient un module
 * sans contrainte de parité aux rouages d'un module qui en a une ; et ce ne
 * sont pas des règles métier, seulement une lecture prudente de JSON.
 */
const nb = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const bloc = (d: Record<string, unknown>, cle: string): Record<string, unknown> => {
  const v = d[cle];
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
};

/** Un seau de la ventilation temporelle. */
export interface SeauJournee {
  /** `AAAA-MM-JJ`, ou `AAAA-MM-JJ HH:00` à l'heure. */
  bucket: string;
  ventes: number;
  total: number;
}

export interface MaJournee {
  /** Qui, tel que le serveur le nomme : c'est moi, l'endpoint n'accepte rien d'autre. */
  nom: string;
  role: string;
  debut: string;
  fin: string;
  /** `hour` ou `day`, tel que le serveur l'a retenu. */
  parHeure: boolean;

  ventes: { nombre: number; total: number };
  /** Ce qui est entré, par moyen de paiement. */
  parMoyen: { moyen: string; total: number }[];
  depenses: { nombre: number; total: number };
  caisse: { entrees: number; sorties: number; net: number };
  detail: SeauJournee[];
}

export interface ContexteMaJournee {
  organisation: string;
  /** `AAAA-MM-JJ`, bornes LOCALES - jamais un mot clé de période. */
  debut: string;
  fin: string;
  groupBy?: "day" | "hour";
}

/**
 * ⚠ ON ENVOIE TOUJOURS DES DATES EXPLICITES, jamais un `period=`.
 *
 * C'est la règle de tout ce dépôt, et elle est née d'un défaut mesuré : sans
 * dates, le serveur retombait sur son défaut calendaire, la fenêtre couvrait
 * deux jours au début d'un mois, et l'écran annonçait « aucune donnée » sur un
 * établissement qui venait de vendre.
 */
export async function chargerMaJournee(ctx: ContexteMaJournee): Promise<MaJournee> {
  const q = new URLSearchParams({
    date_from: ctx.debut,
    date_to: ctx.fin,
    group_by: ctx.groupBy ?? "day",
  });

  const d = await api.get<Record<string, unknown>>(
    `/reports/statistics/${CHEMIN_MA_JOURNEE}/?${q.toString()}`,
    { headers: { "X-Organization-ID": ctx.organisation } }
  );

  const qui = bloc(d, "user");
  const periode = bloc(d, "period");
  const ventes = bloc(d, "sales");
  const depenses = bloc(d, "expenses");
  const caisse = bloc(d, "cash");

  const moyens = Array.isArray(ventes.by_payment_method) ? ventes.by_payment_method : [];
  const detail = Array.isArray(d.breakdown) ? d.breakdown : [];

  return {
    nom: String(qui.name ?? ""),
    role: String(qui.role ?? ""),
    debut: String(periode.start ?? ctx.debut),
    fin: String(periode.end ?? ctx.fin),
    parHeure: periode.group_by === "hour",

    ventes: { nombre: nb(ventes.count), total: nb(ventes.total) },
    parMoyen: (moyens as Record<string, unknown>[]).map((m) => ({
      moyen: String(m.method ?? "Autre"),
      total: nb(m.total),
    })),
    depenses: { nombre: nb(depenses.count), total: nb(depenses.total) },
    caisse: {
      entrees: nb(caisse.cash_in),
      sorties: nb(caisse.cash_out),
      net: nb(caisse.net),
    },
    detail: (detail as Record<string, unknown>[]).map((b) => ({
      bucket: String(b.bucket ?? ""),
      ventes: nb(b.count),
      total: nb(b.total),
    })),
  };
}
