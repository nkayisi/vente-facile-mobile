/**
 * Lectures des ventes. Miroir de `frontend/actions/sales.actions.ts`.
 *
 * **Les totaux ne se somment JAMAIS entre devises** : chaque vente porte la
 * sienne, et le hub les rend par devise. C'est la règle que le back-office a dû
 * apprendre à ses dépens (`MultiCurrencyTotal`), et elle vaut ici mot pour mot.
 */
import { and, desc, eq, gte, inArray, like, lt, or, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { sessionOuverte } from "@/features/pos/caisse";
import { ventesEnAttente } from "@/features/ventes/attente";
import type { EtatEnvoi } from "@/sync";

import { customers, saleItems, sales } from "@/db/schema";

import { depuisQuand, type Periode } from "./periodes";
import { compteursDeSessions, compteursVides } from "./sessions";
import { deviseOuPrincipale } from "./devise-principale";
import { referencesDejaTirees } from "./deja-tirees";

export type { Periode };

const nb = (v: string | null | undefined): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** Bornes du jour en heure LOCALE, comme le back-office (`day_bounds`). */
function bornesDuJour(): { debut: Date; fin: Date } {
  const d = new Date();
  const debut = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const fin = new Date(debut);
  fin.setDate(fin.getDate() + 1);
  return { debut, fin };
}

export interface VenteResume {
  id: string;
  reference: string;
  client: string | null;
  statut: string;
  total: number;
  /**
   * Faux quand le ticket rangé n'a pas été retrouvé : le montant est INCONNU.
   *
   * `total` vaut alors zéro faute de mieux, et ce zéro n'entre dans AUCUNE
   * somme d'argent - il fausserait la journée sans rien signaler. L'écran le
   * dit plutôt que de présenter un total comme complet. Absent pour une vente
   * tirée : le serveur a arrêté ses montants.
   */
  montantConnu?: boolean;
  resteAPayer: number;
  devise: string;
  date: Date | null;
  /**
   * Nombre de LIGNES de la vente, comme `items_count` du back-office.
   *
   * Absent quand la lecture ne le compte pas : seul le hub l'affiche, et le
   * joindre partout ferait payer une agrégation à des écrans qui n'en font
   * rien. `undefined` se lit « pas compté », jamais « zéro article ».
   */
  nbArticles?: number;
  /**
   * L'échéance de la facture, quand la lecture la porte.
   *
   * `undefined` se lit « pas relue », `null` « aucune échéance fixée » - et une
   * facture sans échéance n'est jamais en retard, elle n'a rien à dépasser.
   */
  echeance?: Date | null;
  /**
   * Jours de retard, zéro quand rien n'est dépassé.
   *
   * Compté en JOURS CIVILS locaux : une facture due hier est en retard d'un
   * jour dès minuit, et pas seulement vingt-quatre heures plus tard. C'est la
   * lecture du marchand, et celle du serveur (`aging_date`, comparé à `today`).
   */
  joursDeRetard?: number;
  /**
   * Où en est l'envoi de cette vente, quand elle vit encore dans le JOURNAL.
   *
   * Absent pour une vente tirée : elle est arrêtée, il n'y a rien à dire. Son
   * numéro est définitif et ses montants sont ceux du papier dans les deux cas,
   * mais « attend son envoi » et « attend un droit » n'appellent pas le même
   * geste : le premier passera seul, le second demande de régler l'abonnement.
   */
  envoi?: EtatEnvoi;
}

export interface RelevesVentes {
  /** Une entrée par devise : on ne somme jamais entre devises. */
  totalParDevise: { devise: string; montant: number }[];
  transactions: number;
  panierMoyenParDevise: { devise: string; montant: number }[];
  aEncaisserParDevise: { devise: string; montant: number }[];
  nbAEncaisser: number;
  ventesDuJour: VenteResume[];
}

export async function relevesVentes(): Promise<RelevesVentes> {
  const { debut, fin } = bornesDuJour();

  const lignes = await db
    .select({
      id: sales.id,
      reference: sales.reference,
      statut: sales.status,
      total: sales.total,
      amountDue: sales.amountDue,
      currency: sales.currency,
      saleDate: sales.saleDate,
      client: customers.name,
    })
    .from(sales)
    .leftJoin(customers, eq(customers.id, sales.customerId))
    .where(and(gte(sales.saleDate, debut), lt(sales.saleDate, fin)))
    .orderBy(desc(sales.saleDate));

  // Le nombre de lignes par vente, en UNE requête groupée. Le relire vente par
  // vente ferait une lecture par ligne de la liste, sur le premier écran que
  // le caissier ouvre le matin.
  const compte = new Map<string, number>();
  if (lignes.length > 0) {
    const parVente = await db
      .select({ saleId: saleItems.saleId, n: sql<number>`count(*)` })
      .from(saleItems)
      .where(inArray(saleItems.saleId, lignes.map((l) => l.id)))
      .groupBy(saleItems.saleId);
    for (const c of parVente) compte.set(c.saleId, Number(c.n) || 0);
  }

  // ┌────────────────────────────────────────────────────────────────────────┐
  // │ LES VENTES DU JOURNAL COMPTENT AUTANT QUE CELLES DE LA TABLE.          │
  // │                                                                        │
  // │ Sans elles, un caissier qui vend hors ligne - le mode pour lequel ce   │
  // │ terminal existe - encaisse, imprime, revient ici et lit « Ventes du    │
  // │ jour (0) ». Voir `features/ventes/attente.ts` : elles sont FUSIONNÉES  │
  // │ à la lecture, jamais écrites dans `sales`, qui n'appartient qu'au      │
  // │ tirage.                                                                │
  // └────────────────────────────────────────────────────────────────────────┘
  const attente = await ventesEnAttente();
  const dejaTirees = new Set(lignes.map((l) => l.reference));
  // ┌────────────────────────────────────────────────────────────────────────┐
  // │ LES MÊMES BORNES DE JOUR DES DEUX CÔTÉS.                               │
  // │                                                                        │
  // │ Les ventes tirées sont bornées à la journée ; celles du journal        │
  // │ arrivaient entières. Après trois jours hors ligne - le mode pour       │
  // │ lequel ce terminal existe - « Ventes du jour » annonçait trois jours   │
  // │ de recette, sur les quatre relevés à la fois. Le caissier compare ce   │
  // │ chiffre à son tiroir, et il ne peut pas tomber juste.                  │
  // │                                                                        │
  // │ Le filtre porte sur `occurredAt`, l'heure où le caissier a pris        │
  // │ l'argent : c'est ce que « ventes du jour » veut dire, et c'est ce que  │
  // │ le tiroir contient.                                                    │
  // │                                                                        │
  // │ Le serveur inscrit LA MÊME HEURE dans `sale_date` depuis l'horloge de  │
  // │ l'acte (`apps.core.clock`) : une vente ne change donc pas de jour en   │
  // │ se synchronisant, et la borne d'ici est celle de la table. Avant cela, │
  // │ `sale_date` était un `auto_now_add` posé à la poussée, et la vente     │
  // │ sautait au jour du retour du réseau.                                   │
  // └────────────────────────────────────────────────────────────────────────┘
  // Une vente poussée puis retirée est dans les DEUX : la table fait foi, sinon
  // elle se compterait deux fois le temps que le journal se vide.
  const restantes = attente.filter(
    (v) =>
      !dejaTirees.has(v.reference) &&
      v.date >= debut &&
      v.date < fin
  );
  // Les ventes dont le ticket est introuvable : leur montant est INCONNU.
  const sansMontant = new Set(
    restantes.filter((v) => v.total === null).map((v) => v.id)
  );

  const ventesDuJour: VenteResume[] = [
    ...restantes.map((v) => ({
      id: v.id,
      reference: v.reference,
      client: v.client,
      // Le statut se déduit du restant dû, comme le serveur le posera.
      statut: v.resteAPayer > 0 ? "partially_paid" : "completed",
      total: v.total ?? 0,
      resteAPayer: v.resteAPayer,
      devise: deviseOuPrincipale(v.devise),
      date: v.date,
      nbArticles: v.nbArticles ?? undefined,
      envoi: v.envoi,
    })),
    ...lignes.map((l) => ({
      id: l.id,
      reference: l.reference,
      client: l.client ?? null,
      statut: l.statut,
      total: nb(l.total),
      resteAPayer: nb(l.amountDue),
      devise: deviseOuPrincipale(l.currency),
      date: l.saleDate ?? null,
      nbArticles: compte.get(l.id) ?? 0,
    })),
  ].sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0));

  // Les agrégats se refont sur la liste FUSIONNÉE. Une vente dont le ticket
  // n'a pas été retrouvé porte un montant INCONNU : elle compte comme
  // transaction, jamais dans une somme d'argent - un zéro inventé fausserait
  // la journée sans rien signaler.
  const chiffrees = ventesDuJour.filter(
    (v) => v.devise !== "" && !sansMontant.has(v.id)
  );
  const somme = (choisir: (v: VenteResume) => number) => {
    const m = new Map<string, number>();
    for (const v of chiffrees) {
      const montant = choisir(v);
      if (montant === 0) continue;
      m.set(v.devise, (m.get(v.devise) ?? 0) + montant);
    }
    return [...m.entries()]
      .map(([devise, montant]) => ({ devise, montant }))
      .sort((a, b) => a.devise.localeCompare(b.devise));
  };

  const n = ventesDuJour.length;
  const dues = ventesDuJour.filter((v) => v.resteAPayer > 0);

  return {
    totalParDevise: somme((v) => v.total),
    transactions: n,
    panierMoyenParDevise: n === 0 ? [] : somme((v) => v.total / n),
    aEncaisserParDevise: somme((v) => v.resteAPayer),
    nbAEncaisser: dues.length,
    ventesDuJour,
  };
}

export interface SessionOuverte {
  id: string;
  caisse: string;
  ouverteLe: Date | null;
  nbVentes: number;
  encaisseParDevise: { devise: string; montant: number }[];
  /** Ventes comptées dont le ticket est introuvable : montant INCONNU. */
  sansMontant: number;
  /** Acceptée par le serveur, en file, ou bloquée faute de droit. */
  envoi: EtatEnvoi;
}

/**
 * La session de caisse en cours, s'il y en a une.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE HUB DISAIT « AUCUNE SESSION » PENDANT QUE LE COMPTOIR VENDAIT.       │
 * │                                                                          │
 * │ Cette lecture n'interrogeait que `register_sessions`, la table TIRÉE, où │
 * │ une session ouverte hors ligne n'est pas écrite - elle vit dans le       │
 * │ journal, et c'est délibéré (voir `features/pos/caisse.ts`). Relevé sur   │
 * │ l'émulateur : le parc de caisses annonçait « 1 session ouverte » et      │
 * │ « Attend son envoi » quand le hub, à deux écrans de là, affichait        │
 * │ « Aucune session ouverte » et proposait d'en ouvrir une.                 │
 * │                                                                          │
 * │ Ce n'est pas qu'un affichage : le bandeau mène au parc de caisses, où le │
 * │ caissier qui croit n'avoir rien d'ouvert ouvre une SECONDE session. Elle │
 * │ porte un autre identifiant, et au déblocage c'est elle que le serveur    │
 * │ refuse, avec toutes les ventes qui s'y rattachaient.                     │
 * │                                                                          │
 * │ Une seule lecture pour toute l'application, donc : `sessionOuverte()`,   │
 * │ celle du comptoir, qui sait déjà lire la table, les clôtures en attente  │
 * │ et le journal, dans cet ordre.                                           │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export async function sessionOuverteResume(): Promise<SessionOuverte | null> {
  const s = await sessionOuverte();
  if (!s) return null;

  const compteurs =
    (await compteursDeSessions([s.id])).get(s.id) ?? compteursVides();

  return {
    id: s.id,
    caisse: s.registerName,
    ouverteLe: s.openedAt,
    nbVentes: compteurs.nbVentes,
    encaisseParDevise: compteurs.encaisseParDevise,
    sansMontant: compteurs.sansMontant,
    envoi: s.envoi,
  };
}

// Les libellés vivent dans un module PUR : les garder ici obligeait tout
// module qui veut seulement NOMMER un statut à charger la base SQLite.
export { STATUT_VENTE, type TonStatut } from "./statuts-vente";

/**
 * Jours de retard d'une échéance, en jours CIVILS locaux.
 *
 * Comparer des horodatages ferait dire « à l'heure » d'une facture due hier à
 * 14 h jusqu'à cet après-midi, alors que le marchand - et le serveur, qui
 * compare des DATES (`aging_date` contre `today`) - la comptent en retard dès
 * minuit. Une facture sans échéance n'est jamais en retard : elle n'a rien à
 * dépasser, et inventer un retard ferait relancer un client qui ne doit rien
 * encore.
 */
export function joursDeRetard(echeance: Date | null): number {
  if (!echeance) return 0;
  const jour = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const ecart = jour(new Date()) - jour(echeance);
  return ecart > 0 ? Math.round(ecart / 86400000) : 0;
}

/** « depuis 3 h 20 », « depuis 5 min », « depuis 80 j » - formulation du web. */
export function depuis(d: Date | null): string {
  if (!d) return "";
  const min = Math.max(0, Math.floor((Date.now() - d.getTime()) / 60000));
  if (min < 60) return `depuis ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) {
    const r = min % 60;
    return r === 0 ? `depuis ${h} h` : `depuis ${h} h ${String(r).padStart(2, "0")}`;
  }
  return `depuis ${Math.floor(h / 24)} j`;
}

// --------------------------------------------------------------- lot 6

export interface FiltresHistorique {
  recherche?: string;
  /** Code de statut, ou `null` pour tous. */
  statut?: string | null;
  periode?: Periode;
  /**
   * Combien de ventes tirées rendre. Le défilement infini l'AGRANDIT, il ne
   * demande pas la page suivante.
   *
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ UN RANG DE DÉPART NE SURVIVRAIT PAS À LA LECTURE RÉACTIVE.           │
   * │                                                                      │
   * │ Cet écran se recharge tout seul dès qu'une table bouge - une         │
   * │ synchronisation, une vente encaissée au comptoir - et la lecture      │
   * │ remplace alors ses données EN BLOC. Des pages accumulées dans l'état  │
   * │ de l'écran seraient perdues à chaque tirage, et la liste sauterait    │
   * │ toute seule à son début pendant qu'on la parcourt.                    │
   * │                                                                      │
   * │ Pire, un rang fige une POSITION dans un classement qui bouge : une    │
   * │ vente insérée par la synchronisation décale tout ce qui suit, et la   │
   * │ page suivante répète une ligne ou en saute une. Agrandir la fenêtre   │
   * │ depuis le début est la seule forme qui reste juste sous une écriture  │
   * │ concurrente, et le surcoût est une relecture locale de quelques       │
   * │ dizaines de lignes indexées sur `sale_date`.                         │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  limite?: number;
  /** L'entrepôt de la vente. `null` : tous ceux du périmètre. */
  entrepot?: string | null;
  /** Le VENDEUR (`sold_by`). `null` : tous. */
  utilisateur?: string | null;
  /**
   * L'utilisateur connecté, pour les ventes encore dans le journal : elles lui
   * appartiennent forcément (voir `retientVenteEnFile`), et sans lui un filtre
   * « Utilisateur » les laisserait toutes passer.
   */
  moi?: string | null;
  /**
   * Le filtre d'entrepôt courant tolère-t-il une vente dont on ignore le dépôt ?
   *
   * Vrai sous un VERROU (le périmètre du rôle, que le marchand n'a pas posé),
   * faux sous un CHOIX délibéré. Voir `entrepotInconnuAdmis`. Sans lui, un
   * membre borné à un seul dépôt perdait de son propre historique la vente
   * qu'il venait d'encaisser sur une caisse sans entrepôt.
   */
  entrepotInconnuAdmis?: boolean;
}

/**
 * Ce que pèse le périmètre affiché.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LES RELEVÉS SE CALCULENT EN SQL, SUR TOUT LE PÉRIMÈTRE FILTRÉ.          │
 * │                                                                          │
 * │ Les sommer sur `elements` donnerait le poids de la PAGE et non celui de  │
 * │ la période : « 12 400 $ » sous un compteur qui annonce trois cent        │
 * │ quarante ventes, sans que rien ne dise que le chiffre ne porte que sur   │
 * │ les cinquante premières. C'est le défaut exact que le back-office a dû   │
 * │ corriger sur ses niveaux de stock, où l'export ne couvrait pas le même   │
 * │ périmètre que l'écran ; ici il serait pire, parce qu'un total faux a     │
 * │ l'air juste.                                                             │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export interface RelevesHistorique {
  /** Une entrée par devise : on ne somme jamais entre devises. */
  totalParDevise: { devise: string; montant: number }[];
  /** Ce qu'il reste à encaisser sur ce périmètre, ventilé lui aussi. */
  resteParDevise: { devise: string; montant: number }[];
  /** Nombre de ventes, devises confondues : un décompte n'est pas un montant. */
  transactions: number;
  /**
   * Ventes comptées dont le montant est INCONNU (ticket introuvable).
   *
   * Elles pèsent dans `transactions` et dans aucune somme d'argent : un zéro
   * inventé fausserait le total sans rien signaler. L'écran le DIT plutôt que
   * de présenter un total comme complet.
   */
  sansMontant: number;
}

export interface PageVentes {
  elements: VenteResume[];
  /** Nombre total AVANT la limite : c'est lui que le sous-titre annonce. */
  total: number;
  /** Il reste des ventes au-delà de cette page. */
  aPlus: boolean;
  releves: RelevesHistorique;
  /**
   * Nombre de ventes de la période et de la recherche, TOUS STATUTS.
   *
   * `total` porte la liste affichée, donc le statut filtré : la puce « Tous »
   * annoncerait sinon le décompte de la puce ACTIVE, et taper « Annulée (3) »
   * ferait afficher « Tous (3) » à côté. Les deux chiffres sont différents dès
   * qu'un statut est choisi, et c'est le second qui dit ce que « Tous » ouvre.
   */
  totalTousStatuts: number;
  /**
   * Nombre de ventes par statut, calculé SANS le filtre de statut.
   *
   * Le calculer avec ferait afficher zéro sur toutes les puces sauf l'active,
   * et une puce à zéro se lit « il n'y en a pas » alors qu'elle voudrait dire
   * « vous ne les regardez pas ».
   */
  parStatut: Record<string, number>;
}

/** Additionne par devise, en écartant ce dont la devise est inconnue. */
function parDevise(
  lignes: { devise: string; montant: number }[]
): { devise: string; montant: number }[] {
  const m = new Map<string, number>();
  for (const l of lignes) {
    // Une devise vide donnerait un montant SANS SYMBOLE, en silence, dans une
    // application où le même chiffre vaut soit trois dollars, soit trois
    // francs. La vente reste comptée comme transaction, jamais comme argent.
    if (l.devise === "" || l.montant === 0) continue;
    m.set(l.devise, (m.get(l.devise) ?? 0) + l.montant);
  }
  return [...m.entries()]
    .map(([devise, montant]) => ({ devise, montant }))
    .sort((a, b) => a.devise.localeCompare(b.devise));
}

/**
 * L'historique complet.
 *
 * La recherche et les filtres sont poussés dans le SQL, pas appliqués après
 * coup sur une page déjà tronquée. Filtrer en mémoire une liste limitée à cent
 * lignes ferait mentir le compteur et cacherait les ventes plus anciennes que
 * la centième, ce qui est précisément le défaut que le back-office a dû
 * corriger sur son écran de niveaux de stock.
 */
/**
 * Le SQL du périmètre de l'historique, jumeau de `retientVenteHistoriqueEnFile`.
 *
 * ⚠ NOMMÉ, pour que `data/perimetre-parite.test.ts` croise les deux. Rendu en
 * TABLEAU pour se glisser dans le `cadre` existant : `sales` porte les deux
 * colonnes en direct, aucune jointure n'est donc nécessaire.
 */
function conditionsHistorique(f: FiltresHistorique) {
  return [
    f.entrepot ? eq(sales.warehouseId, f.entrepot) : undefined,
    f.utilisateur ? eq(sales.soldById, f.utilisateur) : undefined,
  ];
}

/**
 * Le périmètre de l'historique, opposé à une vente encore dans le journal.
 *
 * ⚠ NOMMÉ ET NON INLINE, pour que `data/perimetre-parite.test.ts` puisse le
 * croiser avec le SQL. Écrit dans une chaîne de `.filter()`, il échappait au
 * garde-fou : ajouter une condition au SQL et l'oublier ici ne lève RIEN,
 * l'écran affiche simplement des ventes que le filtre aurait dû écarter.
 *
 * « Pas d'entrepôt » se lit INCONNU, jamais « tous » : l'imputer à celui qu'on
 * regarde gonflerait son total d'une vente qu'un autre dépôt a peut-être faite.
 * L'auteur, lui, est certain - `session/proprietaire.ts` interdit qu'une base
 * habitée change de main.
 */
function retientVenteHistoriqueEnFile(
  f: FiltresHistorique,
  v: { entrepot: string | null }
): boolean {
  const entrepot = v.entrepot ?? null;
  if (f.entrepot && entrepot !== f.entrepot) {
    // Un verrou tolère l'inconnu, un choix est exact : voir `FiltresHistorique`.
    if (entrepot !== null || !f.entrepotInconnuAdmis) return false;
  }
  if (f.utilisateur && f.utilisateur !== (f.moi ?? null)) return false;
  return true;
}

export async function historiqueVentes(f: FiltresHistorique = {}): Promise<PageVentes> {
  const terme = (f.recherche ?? "").trim().toLowerCase();
  const motif = `%${terme}%`;
  const borne = depuisQuand(f.periode ?? "tout");
  const limite = f.limite ?? 50;

  // ┌────────────────────────────────────────────────────────────────────────┐
  // │ L'HISTORIQUE FUSIONNE LE JOURNAL, LUI AUSSI.                           │
  // │                                                                        │
  // │ Le hub ne rend que la JOURNÉE ; sans cette fusion, une vente encaissée │
  // │ avant-hier et pas encore poussée - trois jours sans réseau, le mode    │
  // │ pour lequel ce terminal existe - n'apparaîtrait plus nulle part. Le    │
  // │ caissier tient son ticket, cherche sa vente, et l'application lui      │
  // │ répond qu'elle n'existe pas. C'est la règle déjà posée sur les retours │
  // │ et les devis (`creationsEnAttente`) : on fusionne dans les LISTES      │
  // │ comme dans les fiches.                                                 │
  // └────────────────────────────────────────────────────────────────────────┘
  const attente = await ventesEnAttente();

  // Le dédoublonnage se fait contre la TABLE, jamais contre la page rendue :
  // avec le défilement infini, une vente poussée dont la ligne tirée tombe en
  // page trois reviendrait en tête de la page une, et son montant se compterait
  // deux fois dans les relevés, qui portent sur toute la table. Voir
  // `data/deja-tirees.ts`, que le tableau de bord consomme aussi.
  const dejaTirees = await referencesDejaTirees(attente.map((v) => v.reference));

  // Les mêmes filtres que le SQL, appliqués aux ventes du journal. Elles sont
  // peu nombreuses par construction - ce qui n'a pas encore été poussé - et
  // les filtrer en mémoire ne tronque rien, contrairement à un filtrage
  // appliqué après une page déjà limitée.
  const enFile: VenteResume[] = attente
    .filter((v) => !dejaTirees.has(v.reference))
    // Le périmètre se juge sur la vente DU JOURNAL : c'est elle qui porte
    // `entrepot`, le résumé ne le garde pas.
    .filter((v) => retientVenteHistoriqueEnFile(f, v))
    .map((v) => ({
      id: v.id,
      reference: v.reference,
      client: v.client,
      // Le statut se déduit du restant dû, comme le serveur le posera.
      statut: v.resteAPayer > 0 ? "partially_paid" : "completed",
      // `null` du ticket se lit INCONNU : `montantConnu` le porte, et le total
      // à zéro n'entre dans aucune somme. Voir `parDevise`.
      total: v.total ?? 0,
      montantConnu: v.total !== null,
      resteAPayer: v.resteAPayer,
      devise: deviseOuPrincipale(v.devise),
      date: v.date,
      nbArticles: v.nbArticles ?? undefined,
      envoi: v.envoi,
    }));
  const dansLaPeriode = enFile.filter((v) => !borne || (v.date && v.date >= borne));
  const dansLaRecherche = dansLaPeriode.filter(
    (v) =>
      !terme ||
      v.reference.toLowerCase().includes(terme) ||
      (v.client ?? "").toLowerCase().includes(terme)
  );
  const enAttente = dansLaRecherche.filter((v) => !f.statut || v.statut === f.statut);

  const cadre = [
    borne ? gte(sales.saleDate, borne) : undefined,
    // Dans le CADRE et non dans `conditions` : le décompte par statut s'en
    // sert aussi, et des puces qui annoncent un autre périmètre que la liste
    // sont exactement ce que ce fichier a déjà dû corriger.
    ...conditionsHistorique(f),
    terme
      ? or(
          like(sql`lower(${sales.reference})`, motif),
          like(sql`lower(coalesce(${customers.name}, ''))`, motif)
        )
      : undefined,
  ].filter(Boolean);
  const conditions = [...cadre, f.statut ? eq(sales.status, f.statut) : undefined].filter(Boolean);
  const filtre = conditions.length > 0 ? and(...conditions) : undefined;
  const filtreSansStatut = cadre.length > 0 ? and(...cadre) : undefined;

  // UNE requête pour le compteur ET les deux totaux : le décompte et les
  // sommes se lisent côte à côte, ils doivent venir du même balayage. Les
  // montants sont stockés en TEXTE (les décimales voyagent en chaîne), d'où
  // le `cast` - sans lui SQLite additionnerait des chaînes.
  const agregats = await db
    .select({
      devise: sales.currency,
      n: sql<number>`count(*)`,
      total: sql<number>`sum(cast(${sales.total} as real))`,
      du: sql<number>`sum(cast(${sales.amountDue} as real))`,
    })
    .from(sales)
    .leftJoin(customers, eq(customers.id, sales.customerId))
    .where(filtre)
    .groupBy(sales.currency);

  const parStatutTire = await db
    .select({ statut: sales.status, n: sql<number>`count(*)` })
    .from(sales)
    .leftJoin(customers, eq(customers.id, sales.customerId))
    .where(filtreSansStatut)
    .groupBy(sales.status);

  const lignes = await db
    .select({
      id: sales.id,
      reference: sales.reference,
      statut: sales.status,
      total: sales.total,
      amountDue: sales.amountDue,
      currency: sales.currency,
      saleDate: sales.saleDate,
      dueDate: sales.dueDate,
      client: customers.name,
    })
    .from(sales)
    .leftJoin(customers, eq(customers.id, sales.customerId))
    .where(filtre)
    .orderBy(desc(sales.saleDate))
    .limit(limite);

  // Le nombre de LIGNES par vente, en UNE requête groupée pour la page. Le
  // relire vente par vente ferait cinquante lectures par page, sur un écran
  // qu'on fait défiler.
  const nbLignes = new Map<string, number>();
  if (lignes.length > 0) {
    const parVente = await db
      .select({ saleId: saleItems.saleId, n: sql<number>`count(*)` })
      .from(saleItems)
      .where(inArray(saleItems.saleId, lignes.map((l) => l.id)))
      .groupBy(saleItems.saleId);
    for (const c of parVente) nbLignes.set(c.saleId, Number(c.n) || 0);
  }

  const totalTire = agregats.reduce((n, a) => n + (Number(a.n) || 0), 0);
  const total = totalTire + enAttente.length;

  const parStatut: Record<string, number> = {};
  for (const l of parStatutTire) parStatut[l.statut] = Number(l.n) || 0;
  for (const v of dansLaRecherche) parStatut[v.statut] = (parStatut[v.statut] ?? 0) + 1;

  const releves: RelevesHistorique = {
    totalParDevise: parDevise([
      ...agregats.map((a) => ({ devise: deviseOuPrincipale(a.devise), montant: Number(a.total) || 0 })),
      ...enAttente.map((v) => ({ devise: v.devise, montant: v.montantConnu ? v.total : 0 })),
    ]),
    resteParDevise: parDevise([
      ...agregats.map((a) => ({ devise: deviseOuPrincipale(a.devise), montant: Number(a.du) || 0 })),
      ...enAttente.map((v) => ({ devise: v.devise, montant: v.resteAPayer })),
    ]),
    transactions: total,
    sansMontant: enAttente.filter((v) => v.montantConnu === false).length,
  };

  const page: VenteResume[] = lignes.map((l) => ({
    id: l.id,
    reference: l.reference,
    client: l.client ?? null,
    statut: l.statut,
    total: nb(l.total),
    montantConnu: true,
    resteAPayer: nb(l.amountDue),
    devise: deviseOuPrincipale(l.currency),
    date: l.saleDate ?? null,
    nbArticles: nbLignes.get(l.id) ?? 0,
    echeance: l.dueDate ?? null,
    joursDeRetard: joursDeRetard(l.dueDate ?? null),
  }));

  return {
    // Le compteur porte la liste RÉELLE : l'annoncer sans les ventes en file
    // ferait dire « 3 ventes » au-dessus de quatre lignes.
    total,
    totalTousStatuts: Object.values(parStatut).reduce((n, v) => n + v, 0),
    // La fenêtre n'a pas tout ramené : il reste des ventes derrière, et la
    // liste doit le dire plutôt que de s'arrêter en silence.
    aPlus: lignes.length < totalTire,
    releves,
    parStatut,
    elements: [
      // Les ventes en file sont toujours en tête : elles sont peu nombreuses
      // par construction - c'est ce qui n'a pas encore été poussé - et la
      // fenêtre part du début, donc elles ne se dédoublent jamais.
      ...enAttente,
      ...page,
    ].sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0)),
  };
}

/**
 * Restant dû d'une liste de factures, VENTILÉ par devise.
 *
 * Elle vit ici et non dans l'écran parce qu'un écran qui filtre a besoin du
 * total de CE qu'il montre : un « restant dû » global au-dessus d'une liste
 * filtrée dit un montant que rien à l'écran ne compose. Et une addition écrite
 * dans un écran est exactement ce que ce module existe pour empêcher.
 *
 * Jamais de somme inter-devises : le même chiffre vaut soit trois dollars,
 * soit trois francs.
 */
export function duParDevise(
  ventes: VenteResume[]
): { devise: string; montant: number }[] {
  const parDevise = new Map<string, number>();
  for (const v of ventes) {
    parDevise.set(v.devise, (parDevise.get(v.devise) ?? 0) + v.resteAPayer);
  }
  return [...parDevise.entries()]
    .map(([devise, montant]) => ({ devise, montant }))
    .sort((a, b) => a.devise.localeCompare(b.devise));
}

export interface ReglementsEnAttente {
  ventes: VenteResume[];
  enAttente: number;
  partiellementPayees: number;
  /** Restant dû ventilé par devise : jamais une somme inter-devises. */
  duParDevise: { devise: string; montant: number }[];
  /** Factures dont l'échéance est dépassée. */
  enRetard: number;
}

/**
 * Les factures qui restent à encaisser.
 *
 * Le critère est `amount_due > 0` sur un statut ouvert, exactement celui
 * d'`open_credit_sales` côté serveur. S'en écarter ferait apparaître ici des
 * factures que le serveur refuserait de solder, ou l'inverse.
 */
export async function reglementsEnAttente(recherche = ""): Promise<ReglementsEnAttente> {
  const terme = recherche.trim().toLowerCase();
  const motif = `%${terme}%`;

  const lignes = await db
    .select({
      id: sales.id,
      reference: sales.reference,
      statut: sales.status,
      total: sales.total,
      amountDue: sales.amountDue,
      currency: sales.currency,
      saleDate: sales.saleDate,
      dueDate: sales.dueDate,
      client: customers.name,
    })
    .from(sales)
    .leftJoin(customers, eq(customers.id, sales.customerId))
    .where(
      and(
        inArray(sales.status, ["pending", "partially_paid"]),
        sql`cast(${sales.amountDue} as real) > 0`,
        terme
          ? or(
              like(sql`lower(${sales.reference})`, motif),
              like(sql`lower(coalesce(${customers.name}, ''))`, motif)
            )
          : undefined
      )
    )
    .orderBy(desc(sales.saleDate));

  const ventes: VenteResume[] = lignes.map((l) => ({
    id: l.id,
    reference: l.reference,
    client: l.client ?? null,
    statut: l.statut,
    total: nb(l.total),
    resteAPayer: nb(l.amountDue),
    devise: deviseOuPrincipale(l.currency),
    date: l.saleDate ?? null,
    echeance: l.dueDate ?? null,
    joursDeRetard: joursDeRetard(l.dueDate ?? null),
  }));

  // ┌────────────────────────────────────────────────────────────────────────┐
  // │ LE RETARD PASSE DEVANT, ET LE PLUS ANCIEN EN TÊTE.                     │
  // │                                                                        │
  // │ Cet écran ne se lit pas, il se TRAITE : on descend la liste et on       │
  // │ appelle. Trier par date de vente met en tête la facture la plus         │
  // │ récente, c'est-à-dire celle qu'on relance en dernier, et enterre sous   │
  // │ elle celle qui traîne depuis trois semaines. Le décompte « En retard »  │
  // │ désignait d'ailleurs des factures que rien ne montrait dans la liste.   │
  // └────────────────────────────────────────────────────────────────────────┘
  ventes.sort((a, b) => {
    const ra = a.joursDeRetard ?? 0;
    const rb = b.joursDeRetard ?? 0;
    if (ra !== rb) return rb - ra;
    return (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0);
  });

  return {
    enAttente: lignes.filter((l) => l.statut === "pending").length,
    partiellementPayees: lignes.filter((l) => l.statut === "partially_paid").length,
    enRetard: ventes.filter((v) => (v.joursDeRetard ?? 0) > 0).length,
    duParDevise: duParDevise(ventes),
    ventes,
  };
}
