/**
 * Ce qu'une session d'inventaire PROPOSE, et ce qui le lui interdit.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE TYPE ET LA TABLE VIVENT ICI, PAS DANS `actes.ts`.                    │
 * │                                                                          │
 * │ `actes.ts` importe `@/sync`, qui ouvre SQLite au chargement du module :  │
 * │ le contrat des transitions ne serait alors éprouvable sur aucune machine │
 * │ sans appareil. C'est le motif déjà retenu pour `nouvelle-session.ts` et  │
 * │ pour `payload-mouvement.ts`.                                             │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Le VOCABULAIRE de l'envoi, lui, reste dans `data/envoi.ts` : il est partagé
 * avec « Opérations à corriger », et deux mots différents pour le même état
 * font douter qu'il s'agisse du même.
 */
import type { EtatEnvoi } from "@/sync";
// Type seul : effacé à la compilation, aucun coût de chargement.
import type { IconName } from "@/ui";

export type TransitionSession = "start" | "submit" | "validate" | "cancel";

export interface ActeSession {
  /** Ce que la confirmation demande, en toutes lettres. */
  label: string;
  /**
   * Le même geste, sur une DEMI-LARGEUR.
   *
   * La barre d'actions porte deux boutons côte à côte : « Annuler la session »
   * ne tient pas sur cent quatre-vingts points à 390. Le libellé long reste
   * dans la boîte de confirmation, où il y a la place et où c'est lui qui
   * engage.
   */
  labelCourt: string;
  /**
   * Le glyphe du bouton.
   *
   * ⚠ Pris dans le registre EXISTANT (`ui/icons/registre.ts`, engendré) : ce
   * qui n'y est pas listé n'entre pas dans le paquet, et l'y ajouter demande
   * de régénérer le fichier. `Play` et `Send`, les choix naturels, n'y sont
   * pas ; `ClipboardList` dit la feuille qu'on engendre et `Upload` dit qu'on
   * envoie pour révision, ce qui est exactement ce que ces gestes font.
   */
  icone: IconName;
  depuis: string[];
  permission: string;
  question: string;
  destructif?: boolean;
}

/**
 * Ce qui est proposé, selon l'état de la session ET LE DROIT.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ SEUL LE COMPTAGE ÉTAIT GARDÉ, LES QUATRE TRANSITIONS NE L'ÉTAIENT PAS.  │
 * │                                                                          │
 * │ Démarrer, soumettre, valider et annuler étaient proposés à quiconque     │
 * │ atteignait l'écran. Le back-office les réserve depuis toujours           │
 * │ (`InventorySessionViewSet.action_permissions`), et le serveur les refuse │
 * │ désormais aussi sur le chemin du journal : sans ce filtre, le magasinier │
 * │ verrait un bouton « Valider » qui part en opération bloquée.             │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export const ACTIONS: Record<TransitionSession, ActeSession> = {
  start: {
    label: "Démarrer le comptage",
    labelCourt: "Démarrer",
    icone: "ClipboardList",
    depuis: ["draft"],
    permission: "inventory.start",
    question:
      "Le stock des produits visés est VERROUILLÉ et la feuille de comptage est engendrée avec le stock théorique du moment.",
  },
  submit: {
    label: "Soumettre pour révision",
    labelCourt: "Soumettre",
    icone: "Upload",
    depuis: ["in_progress"],
    permission: "inventory.submit",
    question:
      "Toutes les lignes doivent être comptées. La session passe en révision, le stock ne bouge pas encore.",
  },
  validate: {
    label: "Valider l'inventaire",
    labelCourt: "Valider",
    icone: "CheckCircle2",
    depuis: ["review"],
    permission: "inventory.validate",
    question:
      "Les écarts sont APPLIQUÉS au stock et des mouvements sont écrits. Cette opération ne se défait pas.",
  },
  cancel: {
    label: "Annuler la session",
    labelCourt: "Annuler",
    icone: "XCircle",
    depuis: ["draft", "in_progress", "review"],
    permission: "inventory.cancel",
    question: "La session est annulée, le stock se déverrouille et ne bouge pas.",
    destructif: true,
  },
};

/**
 * Pourquoi « Soumettre pour révision » est fermé. Chaîne vide sinon.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE REFUS VENAIT DU SERVEUR, DONC IL VENAIT EN QUARANTAINE.              │
 * │                                                                          │
 * │ L'avancement était calculé depuis toujours et le bouton n'était JAMAIS   │
 * │ fermé. Le magasinier soumettait une feuille à laquelle il manquait trois │
 * │ lignes, l'acte partait au journal, et le refus revenait à la             │
 * │ synchronisation suivante - le lendemain, sur l'écran « Opérations à      │
 * │ corriger », loin de la feuille et loin du rayon. Le back-office, lui,    │
 * │ l'interdit au clic.                                                      │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function motifSoumissionFermee(f: {
  lignes: number;
  /** Lignes comptées dont le comptage PARTIRA. Les bloquées en sont exclues. */
  comptees: number;
  /** Comptages qui attendent un droit : ils n'arriveront pas encore. */
  bloquees: number;
}): string {
  // `0 - 0 > 0` est faux : sans ce cas, le bouton s'ouvrirait sur une feuille
  // qui n'a aucune ligne à soumettre.
  if (f.lignes === 0) return "La feuille est vide : il n'y a rien à soumettre.";

  if (f.bloquees > 0) {
    // Un comptage bloqué s'AFFICHE compté - c'est du travail fait dans le
    // rayon, le masquer ferait recompter - mais il n'arrivera pas au serveur,
    // qui verrait donc une feuille incomplète et refuserait la soumission.
    return f.bloquees === 1
      ? "Un comptage attend un droit : il n'arrivera pas au serveur, qui refuserait la soumission."
      : `${f.bloquees} comptages attendent un droit : ils n'arriveront pas au serveur, qui refuserait la soumission.`;
  }

  const reste = f.lignes - f.comptees;
  if (reste > 0) {
    // Le motif NOMME ce qui manque : « la feuille est incomplète » laisserait
    // le magasinier chercher lesquelles, la puce « À compter » les donne.
    return reste === 1
      ? "Une ligne n'est pas encore comptée. Toutes doivent l'être."
      : `${reste} lignes ne sont pas encore comptées. Toutes doivent l'être.`;
  }
  return "";
}

/** Les actes du journal qui portent une session, transition ou création. */
export type ActeEnFile = "create" | TransitionSession;

const QUOI: Record<ActeEnFile, string> = {
  create: "La création",
  start: "Le démarrage",
  submit: "La soumission",
  validate: "La validation",
  cancel: "L'annulation",
};

/**
 * Pourquoi une transition est fermée parce qu'elle attend déjà. Chaîne vide
 * quand rien n'attend.
 *
 * Même partage que `motifClotureFermee` : la file part seule, le blocage non.
 * Le second ne dit JAMAIS « synchronisez » - ce serait envoyer le marchand
 * chercher un réseau déjà là, potentiellement des jours durant.
 */
export function motifTransitionEnFile(acte: ActeEnFile, envoi: EtatEnvoi): string {
  if (envoi === "envoye") return "";
  return envoi === "bloque"
    ? `${QUOI[acte]} de cette session attend un droit : elle repartira dès que l'abonnement sera réglé ou la permission accordée.`
    : `${QUOI[acte]} de cette session est déjà en file. Le statut changera après la prochaine synchronisation.`;
}
