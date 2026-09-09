/**
 * Le parc de CAISSES. Miroir de `app/dashboard/sales/registers/page.tsx`.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ NE PAS CONFONDRE avec `data/caisse.ts`, qui est le LIVRE de caisse       │
 * │ (`cashbook`, les entrées et sorties d'argent). Ici, une « caisse » est   │
 * │ un `Register` : un comptoir, avec son tiroir et ses sessions. Le web     │
 * │ emploie le même mot pour les deux, et les range sous deux menus          │
 * │ différents ; le terminal fait pareil, d'où le pluriel dans la route.     │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * **L'ordre du web est repris tel quel** : la caisse dont une session est
 * ouverte d'abord, puis les actives, puis les désactivées. C'est la seule chose
 * qu'un caissier cherche en arrivant, et un tri alphabétique la noierait.
 *
 * **L'ouverture en attente compte comme une session ouverte.** Elle n'est PAS
 * dans `register_sessions` (les tables tirées ne sont écrites que par le
 * tirage) : elle se lit dans le journal. Sans cela, le caissier qui vient
 * d'ouvrir hors ligne verrait « Aucune session ouverte » et rouvrirait, ce qui
 * partirait en quarantaine côté serveur.
 */
import { desc, eq, inArray } from "drizzle-orm";

import { db } from "@/db/client";
import {
  registerSessions,
  registers,
  sales,
  users,
  warehouses,
} from "@/db/schema";
import { enAttenteParType, type EtatEnvoi } from "@/sync";

import { compteursDeSessions, compteursVides } from "./sessions";

const nb = (v: string | number | null | undefined): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

export interface SessionDeCaisse {
  id: string;
  ouverteLe: Date | null;
  /** Nom de qui a ouvert. Vide tant que l'utilisateur n'est pas descendu. */
  parQui: string | null;
  nbVentes: number;
  encaisseParDevise: { devise: string; montant: number }[];
  /**
   * Ventes comptées dont le montant est INCONNU, faute de ticket retrouvé.
   *
   * Un total présenté comme complet alors qu'un ticket manque se compare au
   * tiroir et tombe faux. La carte l'écrit (« +1 sans montant ») plutôt que de
   * laisser croire que la somme est celle de la journée.
   */
  sansMontant: number;
  /**
   * Où en est l'ouverture : acceptée, en file, ou BLOQUÉE.
   *
   * Une ouverture bloquée reste une session : elle partira dès que
   * l'abonnement sera réglé. La montrer comme inexistante ferait ouvrir un
   * second comptoir sur la même caisse, et c'est lui que le serveur refuse.
   */
  envoi: EtatEnvoi;
}

/**
 * Ce que la dernière clôture a laissé dans le tiroir.
 *
 * C'est ce dont le serveur HÉRITE quand une nouvelle session s'ouvre sans
 * fonds saisi. L'écran d'ouverture l'annonce : sans lui, « laissez vide pour
 * reprendre le tiroir » demande au caissier de faire confiance à un chiffre
 * qu'il ne voit pas.
 *
 * `compte` à `null` n'est PAS zéro : une session close sans comptage
 * enregistré n'est pas une session à tiroir vide.
 */
export interface DerniereCloture {
  le: Date | null;
  compte: number | null;
}

export interface CaisseParc {
  id: string;
  nom: string;
  code: string;
  entrepot: string | null;
  actif: boolean;
  session: SessionDeCaisse | null;
  /** Combien de clôtures sont descendues sur ce terminal, pour cette caisse. */
  nbClotures: number;
  derniereCloture: DerniereCloture | null;
}

export interface ParcDeCaisses {
  caisses: CaisseParc[];
  /** Le sous-titre de l'écran, comme sur le web : l'état du parc. */
  nbSessionsOuvertes: number;
}

export async function parcDeCaisses(recherche = ""): Promise<ParcDeCaisses> {
  const lignes = await db
    .select({
      id: registers.id,
      nom: registers.name,
      code: registers.code,
      actif: registers.isActive,
      entrepot: warehouses.name,
    })
    .from(registers)
    .leftJoin(warehouses, eq(warehouses.id, registers.warehouseId));

  const ouvertes = await db
    .select({
      id: registerSessions.id,
      registerId: registerSessions.registerId,
      openedAt: registerSessions.openedAt,
      prenom: users.firstName,
      nom: users.lastName,
    })
    .from(registerSessions)
    .leftJoin(users, eq(users.id, registerSessions.openedById))
    .where(eq(registerSessions.status, "open"))
    .orderBy(desc(registerSessions.openedAt));

  // Les ouvertures BLOQUÉES en sont : voir `features/pos/caisse.ts`, c'est la
  // même lecture, et deux écrans qui ne voient pas la même chose de la même
  // caisse est la pire des situations pour qui essaie de comprendre.
  const attentes = await enAttenteParType<{ register: string }>(
    "register_session.open",
    { avecBloquees: true }
  );
  const enAttenteParCaisse = new Map<
    string,
    { id: string; date: Date | null; envoi: EtatEnvoi }
  >();
  for (const o of attentes) {
    enAttenteParCaisse.set(o.payload.register, {
      id: o.id, date: o.occurredAt, envoi: o.envoi,
    });
  }

  // ┌──────────────────────────────────────────────────────────────────────┐
  // │ UNE SESSION EN FILE COMPTAIT « 0 VENTE · 0 $ », TOUTE LA JOURNÉE.    │
  // │                                                                      │
  // │ Ses ventes ne sont pas dans `sales` - elles sont dans le journal,    │
  // │ avec elle. La carte affichait donc un tiroir vide sur un comptoir    │
  // │ qui venait d'encaisser, à côté d'un hub qui les listait toutes. Les  │
  // │ compteurs se lisent des DEUX sources, en une fois pour toutes les    │
  // │ sessions : une requête par comptoir ferait autant d'allers-retours   │
  // │ SQLite qu'il y a de caisses.                                         │
  // └──────────────────────────────────────────────────────────────────────┘
  const idsSessions = [
    ...ouvertes.map((s) => s.id),
    ...[...enAttenteParCaisse.values()].map((a) => a.id),
  ];
  const compteurs = await compteursDeSessions(idsSessions);

  // ┌──────────────────────────────────────────────────────────────────────┐
  // │ LES CLÔTURES PASSÉES, EN UNE SEULE LECTURE POUR TOUT LE PARC.        │
  // │                                                                      │
  // │ Elles servent deux fois : le compteur de la carte, qui dit ce qu'on  │
  // │ trouvera derrière le chevron, et le FONDS HÉRITÉ que l'écran         │
  // │ d'ouverture annonce. Une requête par comptoir ferait autant          │
  // │ d'allers-retours SQLite qu'il y a de caisses, pour deux nombres.     │
  // └──────────────────────────────────────────────────────────────────────┘
  const fermetures = await db
    .select({
      registerId: registerSessions.registerId,
      closedAt: registerSessions.closedAt,
      compte: registerSessions.countedBalance,
    })
    .from(registerSessions)
    .where(eq(registerSessions.status, "closed"))
    .orderBy(desc(registerSessions.closedAt));

  const nbClotures = new Map<string, number>();
  const derniere = new Map<string, DerniereCloture>();
  for (const f of fermetures) {
    if (!f.closedAt) continue;
    nbClotures.set(f.registerId, (nbClotures.get(f.registerId) ?? 0) + 1);
    // La requête est déjà triée du plus récent au plus ancien : la PREMIÈRE
    // rencontrée est la dernière clôture.
    if (!derniere.has(f.registerId)) {
      derniere.set(f.registerId, {
        le: f.closedAt,
        // `null` ne se lit jamais zéro : une session close sans comptage
        // enregistré n'est pas une session à tiroir vide.
        compte: f.compte === null ? null : nb(f.compte),
      });
    }
  }

  const sessionDe = (registerId: string): SessionDeCaisse | null => {
    const s = ouvertes.find((x) => x.registerId === registerId);
    if (s) {
      const agg = compteurs.get(s.id) ?? compteursVides();
      const qui = `${s.prenom ?? ""} ${s.nom ?? ""}`.trim();
      return {
        id: s.id,
        ouverteLe: s.openedAt ?? null,
        parQui: qui || null,
        nbVentes: agg.nbVentes,
        encaisseParDevise: agg.encaisseParDevise,
        sansMontant: agg.sansMontant,
        envoi: "envoye",
      };
    }
    const attente = enAttenteParCaisse.get(registerId);
    if (!attente) return null;
    const agg = compteurs.get(attente.id) ?? compteursVides();
    return {
      id: attente.id,
      ouverteLe: attente.date,
      parQui: null,
      nbVentes: agg.nbVentes,
      encaisseParDevise: agg.encaisseParDevise,
      sansMontant: agg.sansMontant,
      envoi: attente.envoi,
    };
  };

  const terme = recherche.trim().toLowerCase();
  const caisses = lignes
    .map((l) => ({
      ...l,
      entrepot: l.entrepot ?? null,
      session: sessionDe(l.id),
      nbClotures: nbClotures.get(l.id) ?? 0,
      derniereCloture: derniere.get(l.id) ?? null,
    }))
    .filter(
      (c) =>
        !terme ||
        c.nom.toLowerCase().includes(terme) ||
        c.code.toLowerCase().includes(terme)
    )
    .sort((a, b) => {
      const rang = (c: { session: SessionDeCaisse | null; actif: boolean }) =>
        c.session ? 0 : c.actif ? 1 : 2;
      return rang(a) - rang(b) || a.nom.localeCompare(b.nom, "fr");
    });

  return {
    caisses,
    nbSessionsOuvertes: caisses.filter((c) => c.session).length,
  };
}

/**
 * Les sessions déjà FERMÉES d'une caisse, pour retrouver un Z.
 *
 * Le web ne les liste pas : il n'a que le tiroir du moment. Sur le terminal
 * c'est l'inverse qui compte - un caissier vient chercher le Z d'hier soir,
 * parce que c'est le papier qu'on lui demande. Le duplicata se réimprime
 * depuis la file d'impression, qui garde les DONNÉES du document.
 */
export interface SessionFermee {
  id: string;
  caisse: string;
  ouverteLe: Date | null;
  fermeeLe: Date | null;
  nbVentes: number;
  fondOuverture: number;
  /** Null quand le serveur ne l'a pas enregistré : ce n'est PAS zéro. */
  attendu: number | null;
  compte: number | null;
  ecart: number | null;
  notes: string;
  parQui: string | null;
}

export async function sessionsFermees(
  registerId: string,
  limite = 20
): Promise<SessionFermee[]> {
  const lignes = await db
    .select({
      id: registerSessions.id,
      caisse: registers.name,
      openedAt: registerSessions.openedAt,
      closedAt: registerSessions.closedAt,
      openingBalance: registerSessions.openingBalance,
      expectedBalance: registerSessions.expectedBalance,
      countedBalance: registerSessions.countedBalance,
      difference: registerSessions.difference,
      notes: registerSessions.notes,
      prenom: users.firstName,
      nom: users.lastName,
    })
    .from(registerSessions)
    .leftJoin(registers, eq(registers.id, registerSessions.registerId))
    .leftJoin(users, eq(users.id, registerSessions.closedById))
    .where(eq(registerSessions.registerId, registerId))
    .orderBy(desc(registerSessions.closedAt))
    .limit(limite);

  const fermees = lignes.filter((l) => l.closedAt !== null);
  if (fermees.length === 0) return [];

  const ventes = await db
    .select({ id: sales.id, sessionId: sales.sessionId })
    .from(sales)
    .where(inArray(sales.sessionId, fermees.map((f) => f.id)));

  const compte = new Map<string, number>();
  for (const v of ventes) {
    const cle = v.sessionId ?? "";
    compte.set(cle, (compte.get(cle) ?? 0) + 1);
  }

  // `null` ne se lit JAMAIS comme zéro : une session close sans écart
  // enregistré n'est pas une session sans écart. L'écran dira « non
  // enregistré » plutôt que d'afficher un rassurant « 0 ».
  const ou = (v: string | null): number | null => (v === null ? null : nb(v));

  return fermees.map((l) => {
    const qui = `${l.prenom ?? ""} ${l.nom ?? ""}`.trim();
    return {
      id: l.id,
      caisse: l.caisse ?? "Caisse",
      ouverteLe: l.openedAt ?? null,
      fermeeLe: l.closedAt ?? null,
      nbVentes: compte.get(l.id) ?? 0,
      fondOuverture: nb(l.openingBalance),
      attendu: ou(l.expectedBalance),
      compte: ou(l.countedBalance),
      ecart: ou(l.difference),
      notes: l.notes ?? "",
      parQui: qui || null,
    };
  });
}
