/**
 * Quand synchroniser, et jusqu'où.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE QUI DÉCIDE SE TESTE, CE QUI BRANCHE SE RELIT.                        │
 * │                                                                          │
 * │ Le fournisseur de synchronisation est du câblage : des écouteurs, un     │
 * │ verrou, un minuteur. Rien de tout cela ne se teste sans appareil, et une │
 * │ cadence fausse ne lève AUCUNE erreur - elle fait simplement partir des   │
 * │ cycles pour rien, ou n'en fait plus partir du tout. C'est le genre de    │
 * │ défaut qu'on découvre sur le terminal d'un marchand, six semaines après. │
 * │                                                                          │
 * │ Toute la décision vit donc ici, dans une fonction sans état, sans        │
 * │ horloge et sans hasard : on lui passe l'instant et le tirage au sort.    │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/** D'où vient la sollicitation. */
export type Declencheur =
  /** Le groupe `(app)` vient d'être monté : connexion, inscription, déverrouillage. */
  | "entree"
  /** Transition hors ligne -> en ligne. */
  | "reseau"
  /** L'application revient au premier plan. */
  | "premier-plan"
  /** `outbox_operations` a changé : une écriture locale vient d'avoir lieu. */
  | "journal"
  /** Réveil programmé par la décision précédente. */
  | "minuteur"
  /** L'utilisateur a demandé. */
  | "manuel";

/**
 * `envoi` : la poussée seule. Elle retire d'elle-même les tables touchées
 * (`pushOnce` appelle `refreshTables`), donc ce qui vient de changer redescend
 * sans que les trente-huit tables soient sondées.
 * `complet` : poussée, photos, tirage, rafraîchissement des droits.
 */
export type Portee = "envoi" | "complet";

/**
 * Le premier écran doit peindre avant que le réseau ne soit sollicité, et les
 * migrations Drizzle doivent avoir fini. `(app)/_layout.tsx` affirme que le
 * fournisseur « ne fait aucun travail au montage, ce qui est la condition du
 * démarrage à froid sans réseau » : un cycle lancé dans le même tour de boucle
 * que le montage contredirait cette promesse.
 */
export const DELAI_ENTREE_MS = 1_500;

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA GIGUE DU RETOUR DE RÉSEAU N'EST PAS UN DÉTAIL.                       │
 * │                                                                          │
 * │ Douze terminaux d'un même marché qui ont perdu le réseau ensemble le     │
 * │ retrouvent ensemble. Sans gigue ils repartent en choeur, avec leurs      │
 * │ journaux pleins, et reproduisent côté serveur la panne dont ils          │
 * │ sortent. C'est la raison pour laquelle `backoffMs` en porte déjà une ;   │
 * │ le retour de réseau est le MÊME risque, par l'autre bout.                │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export const GIGUE_RESEAU_MS = 3_000;

/**
 * Une vente encaissée écrit son acte, son règlement et son ticket : trois
 * réveils de l'écouteur en quelques centaines de millisecondes. Le débounce
 * les réunit en un seul envoi, et laisse au caissier le temps de revenir au
 * comptoir avant que le réseau ne parte.
 */
export const DEBOUNCE_JOURNAL_MS = 2_000;

/**
 * Sous ce plancher, un retour au premier plan ne refait pas un tirage complet.
 * Le verrouillage se déclenche après cinq minutes d'arrière-plan, et chaque
 * déverrouillage remonte le groupe `(app)` : sans plancher, un caissier qui
 * repose son terminal toutes les deux minutes sonderait trente-huit tables à
 * chaque reprise.
 */
export const PLANCHER_COMPLET_MS = 5 * 60_000;

/** Cadence de réveil tant qu'il reste quelque chose à envoyer. */
export const CADENCE_ENVOI_MS = 60_000;

export interface EntreePlanificateur {
  declencheur: Declencheur;
  enLigne: boolean;
  /** Un cycle tourne déjà. Le verrou du fournisseur tranche aussi, mais on évite d'empiler. */
  cycleEnCours: boolean;
  /** Opérations `pending` dont le `nextAttemptAt` est échu, donc prêtes à partir. */
  nbPret: number;
  /** Le plus proche `nextAttemptAt` encore à venir, s'il en existe un. */
  prochaineTentativeAt: Date | null;
  derniereComplete: Date | null;
  maintenant: Date;
  /** Tirage au sort dans [0, 1], INJECTÉ : un module pur ne tire pas au hasard. */
  alea: number;
}

export interface Decision {
  lancer: boolean;
  portee: Portee | null;
  /** Débounce ou gigue à respecter avant de partir. */
  delaiMs: number;
  /** Pourquoi. Sert au journal de développement et nomme le cas dans les tests. */
  motif: string;
  /** Dans combien de temps se réveiller. `null` = ne programmer aucun minuteur. */
  reveilDans: number | null;
}

function borner(alea: number): number {
  if (!Number.isFinite(alea)) return 0;
  return Math.min(1, Math.max(0, alea));
}

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN JOURNAL VIDE NE PROGRAMME AUCUN RÉVEIL, ET C'EST LA PIÈCE MAÎTRESSE. │
 * │                                                                          │
 * │ Une vingtaine d'écrans ferment un bouton ou le passent en attente quand  │
 * │ un cycle tourne : `comptage/[id].tsx` grise ses transitions, tous les    │
 * │ `BandeauEnvoi` passent le leur en chargement. Un minuteur qui lancerait  │
 * │ un cycle toutes les minutes ferait donc CLIGNOTER ces commandes au       │
 * │ hasard, sur l'écran d'un magasinier en train de valider un inventaire.   │
 * │                                                                          │
 * │ En régime normal - rien à envoyer - il ne se passe donc strictement      │
 * │ rien : pas de minuteur, pas de cycle, pas de clignotement. Le remède est │
 * │ ici et non dans les écrans, qui n'ont pas à connaître la cadence.        │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Hors ligne, on ne programme rien non plus : c'est le retour du réseau qui
 * réveillera, et un minuteur qui bat dans le vide ne fait que réveiller le
 * processeur d'un terminal sur batterie.
 */
function prochainReveil(e: EntreePlanificateur): number | null {
  if (!e.enLigne) return null;

  const candidats: number[] = [];
  if (e.nbPret > 0) candidats.push(CADENCE_ENVOI_MS);

  // Le réveil d'une temporisation est ce qui referme le défaut le plus ancien
  // de cette couche : `backoffMs` posait un `nextAttemptAt` que RIEN ne venait
  // relire. Une opération qui avait pris un verdict `retry` attendait qu'un
  // humain appuie, indéfiniment.
  if (e.prochaineTentativeAt) {
    candidats.push(Math.max(0, e.prochaineTentativeAt.getTime() - e.maintenant.getTime()));
  }

  if (candidats.length === 0) return null;
  return Math.min(...candidats);
}

function tirageCompletDu(e: EntreePlanificateur): boolean {
  if (!e.derniereComplete) return true;
  return e.maintenant.getTime() - e.derniereComplete.getTime() >= PLANCHER_COMPLET_MS;
}

export function decider(e: EntreePlanificateur): Decision {
  const reveilDans = prochainReveil(e);
  const rien = (motif: string): Decision => ({
    lancer: false,
    portee: null,
    delaiMs: 0,
    motif,
    reveilDans,
  });

  if (e.cycleEnCours) return rien("un cycle tourne déjà");

  // ┌──────────────────────────────────────────────────────────────────────┐
  // │ LE MANUEL PART MÊME HORS LIGNE, ET C'EST VOULU.                     │
  // │                                                                      │
  // │ Le marchand a appuyé : il mérite une réponse, fût-elle « Serveur     │
  // │ injoignable ». Ne rien faire le laisserait devant un bouton qui ne   │
  // │ réagit pas, ce que ce dépôt traite partout comme un défaut. Les      │
  // │ déclencheurs automatiques, eux, ne brûleraient qu'un délai de deux   │
  // │ minutes pour rien.                                                   │
  // └──────────────────────────────────────────────────────────────────────┘
  if (e.declencheur !== "manuel" && !e.enLigne) return rien("hors ligne");

  switch (e.declencheur) {
    case "manuel":
      return {
        lancer: true,
        portee: "complet",
        delaiMs: 0,
        motif: "demande de l'utilisateur",
        reveilDans,
      };

    case "entree":
      return {
        lancer: true,
        portee: "complet",
        delaiMs: DELAI_ENTREE_MS,
        motif: "entrée dans l'application",
        reveilDans,
      };

    case "reseau":
      return {
        lancer: true,
        portee: "complet",
        delaiMs: Math.round(borner(e.alea) * GIGUE_RESEAU_MS),
        motif: "retour du réseau",
        reveilDans,
      };

    case "premier-plan": {
      if (tirageCompletDu(e)) {
        return {
          lancer: true,
          portee: "complet",
          delaiMs: 0,
          motif: "retour au premier plan",
          reveilDans,
        };
      }
      if (e.nbPret > 0) {
        return {
          lancer: true,
          portee: "envoi",
          delaiMs: 0,
          motif: "retour au premier plan, envoi seul",
          reveilDans,
        };
      }
      return rien("retour au premier plan, rien à faire");
    }

    case "journal":
      if (e.nbPret === 0) return rien("le journal n'a rien de prêt");
      return {
        lancer: true,
        portee: "envoi",
        delaiMs: DEBOUNCE_JOURNAL_MS,
        motif: "écriture locale",
        reveilDans,
      };

    case "minuteur":
      if (e.nbPret === 0) return rien("le journal n'a rien de prêt");
      return {
        lancer: true,
        portee: "envoi",
        delaiMs: 0,
        motif: "réveil programmé",
        reveilDans,
      };
  }
}
