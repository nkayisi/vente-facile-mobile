/**
 * Ce qu'une session de caisse a fait : la table ET le journal réunis.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UNE SESSION OUVERTE HORS LIGNE ANNONÇAIT « 0 VENTE » TOUTE LA JOURNÉE.  │
 * │                                                                          │
 * │ Le hub des ventes fusionne déjà les ventes du journal dans ses relevés   │
 * │ et dans sa liste, et le parc de caisses sait rendre une ouverture encore │
 * │ en file. Mais les COMPTEURS de cette session, eux, ne se lisaient que    │
 * │ dans `sales`, où aucune de ses ventes n'est écrite tant que le serveur   │
 * │ n'a pas répondu : le bandeau du comptoir et la carte de la caisse        │
 * │ affichaient « 0 vente · 0 $ » sur une session qui venait d'en encaisser  │
 * │ douze, à côté d'une liste qui les montrait toutes.                       │
 * │                                                                          │
 * │ Deux chiffres contradictoires sur le même écran, et c'est le plus bas    │
 * │ qui inquiète : un caissier qui lit « 0 encaissé » avant de compter son   │
 * │ tiroir conclut qu'il a perdu sa journée.                                 │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * **Une vente poussée puis pas encore purgée du journal est dans les DEUX** :
 * la table fait foi, sinon elle se compterait deux fois le temps que le journal
 * se vide. Le rapprochement se fait sur la RÉFÉRENCE, qui est définitive dès
 * l'impression et que le serveur reprend telle quelle.
 *
 * **`null` ne se lit jamais zéro** : une vente dont le ticket rangé est
 * introuvable compte comme transaction et n'entre dans aucune somme d'argent.
 * `sansMontant` le dit à l'appelant, à charge pour l'écran de ne pas présenter
 * un total comme complet quand il ne l'est pas.
 */
import { inArray } from "drizzle-orm";

import { db } from "@/db/client";
import { sales } from "@/db/schema";
import { ventesEnAttente } from "@/features/ventes/attente";
import { deviseOuPrincipale } from "./devise-principale";

export interface CompteursSession {
  nbVentes: number;
  /** Une entrée par devise : on ne somme jamais entre devises. */
  encaisseParDevise: { devise: string; montant: number }[];
  /** Ventes comptées dont le montant est inconnu, faute de ticket retrouvé. */
  sansMontant: number;
}

const VIDE: CompteursSession = { nbVentes: 0, encaisseParDevise: [], sansMontant: 0 };

export function compteursVides(): CompteursSession {
  return { ...VIDE, encaisseParDevise: [] };
}

const nb = (v: string | null | undefined): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

export async function compteursDeSessions(
  ids: string[]
): Promise<Map<string, CompteursSession>> {
  const sortie = new Map<string, { nb: number; sansMontant: number; devises: Map<string, number> }>();
  for (const id of ids) sortie.set(id, { nb: 0, sansMontant: 0, devises: new Map() });
  if (ids.length === 0) return new Map();

  const tirees = await db
    .select({
      sessionId: sales.sessionId,
      reference: sales.reference,
      currency: sales.currency,
      total: sales.total,
    })
    .from(sales)
    .where(inArray(sales.sessionId, ids));

  const dejaTirees = new Set<string>();
  for (const v of tirees) {
    const e = sortie.get(v.sessionId ?? "");
    if (!e) continue;
    dejaTirees.add(v.reference);
    e.nb += 1;
    const devise = deviseOuPrincipale(v.currency);
    if (devise === "") {
      e.sansMontant += 1;
      continue;
    }
    e.devises.set(devise, (e.devises.get(devise) ?? 0) + nb(v.total));
  }

  // Les ventes BLOQUÉES en sont : elles ont été encaissées et imprimées comme
  // les autres, et leur blocage dure - le temps qu'un abonnement soit réglé.
  // `ventesEnAttente` les rend déjà, pour cette raison exactement.
  for (const v of await ventesEnAttente()) {
    const e = v.session ? sortie.get(v.session) : undefined;
    if (!e || dejaTirees.has(v.reference)) continue;
    e.nb += 1;
    if (v.total === null || !v.devise) {
      e.sansMontant += 1;
      continue;
    }
    e.devises.set(v.devise, (e.devises.get(v.devise) ?? 0) + v.total);
  }

  const sortieFinale = new Map<string, CompteursSession>();
  for (const [id, e] of sortie) {
    sortieFinale.set(id, {
      nbVentes: e.nb,
      sansMontant: e.sansMontant,
      encaisseParDevise: [...e.devises.entries()]
        .map(([devise, montant]) => ({ devise, montant }))
        .sort((a, b) => a.devise.localeCompare(b.devise)),
    });
  }
  return sortieFinale;
}
