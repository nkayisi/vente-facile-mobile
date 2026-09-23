/**
 * Ce que la déconnexion a le droit de faire, selon ce qui reste en file.
 *
 * Module PUR : aucune base, aucun rendu. Ces règles décident de DÉTRUIRE ou non
 * les données d'un marchand ; elles doivent pouvoir être jugées sans appareil,
 * et une erreur ici ne lève rien - elle efface, ou elle bloque, en silence.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ON NE DÉTRUIT JAMAIS DEPUIS CETTE MODALE.                               │
 * │                                                                          │
 * │ Quand la file ne peut pas se vider, on NOMME ce qui reste et on offre de │
 * │ se déconnecter SANS effacer. La base survit alors intacte, avec son      │
 * │ estampille, et c'est le filet d'entrée (`proprietaire.ts`) qui empêche   │
 * │ la fusion à la connexion suivante. Rien n'est perdu, rien ne se mélange. │
 * │                                                                          │
 * │ Cette issue est ce qui rend un PIN oublié hors réseau non bloquant : sans │
 * │ elle, un marchand qui a perdu son code et n'a pas de réseau n'aurait     │
 * │ aucune sortie.                                                           │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/**
 * Tout ce qui n'a jamais atteint le serveur.
 *
 * Les quatre états d'opération qui SURVIVENT - `done` se purge, pas eux - et les
 * PHOTOS.
 *
 * ⚠ **Les photos comptent, et c'est le piège qu'on a payé.** Une photo en
 * attente est la SEULE copie d'un fichier : le serveur ne l'a pas, et rien ne la
 * reconstitue. `viderDossierPhotos()` la détruit. La laisser hors du compte
 * revenait à l'effacer en silence, ce que ce module existe pour empêcher.
 */
export interface EtatFile {
  pending: number;
  inflight: number;
  quarantined: number;
  blocked: number;
  photos: number;
}

export const FILE_VIDE: EtatFile = {
  pending: 0,
  inflight: 0,
  quarantined: 0,
  blocked: 0,
  photos: 0,
};

export function nbEnFile(f: EtatFile): number {
  return f.pending + f.inflight + f.quarantined + f.blocked + f.photos;
}

/** Une opération, ou plusieurs. Le français ne pardonne pas l'approximation. */
function pluriel(n: number, singulier: string, plur: string): string {
  return `${n} ${n > 1 ? plur : singulier}`;
}

function operations(n: number): string {
  return pluriel(n, "opération", "opérations");
}

export interface Confirmation {
  titre: string;
  message: string;
  /** Libellé de l'action principale. */
  action: string;
}

/** Ce que la purge emporte sans qu'aucun serveur puisse le rendre. */
export interface PerissablesLocaux {
  paniers: number;
  documents: number;
}

export const AUCUN_PERISSABLE: PerissablesLocaux = { paniers: 0, documents: 0 };

/**
 * La phrase qui NOMME ce qui ne reviendra jamais.
 *
 * ⚠ **« Tout redescendra à la prochaine connexion » est FAUX** pour les paniers
 * en attente et les documents à réimprimer : ils sont purement locaux. Purger
 * reste juste - un panier rangé ne porte que des identifiants de l'ancien
 * établissement - mais le taire ne l'est pas. Le marchand ne doit pas découvrir
 * la perte quand un client revient avec son ticket.
 *
 * Vide quand il n'y a rien à annoncer : une phrase qui parle de zéro panier
 * apprend à ne plus lire les phrases.
 */
export function phrasePerissables(p: PerissablesLocaux): string {
  const parts: string[] = [];
  if (p.paniers > 0) parts.push(pluriel(p.paniers, "panier en attente", "paniers en attente"));
  if (p.documents > 0) {
    parts.push(pluriel(p.documents, "document à réimprimer", "documents à réimprimer"));
  }
  if (parts.length === 0) return "";
  // ⚠ UN SEUL TEST DE PLURALITÉ, pour le verbe ET pour le pronom. Ils
  // divergeaient : le verbe comptait les OBJETS, le pronom comptait les
  // GROUPES. D'où, sur deux paniers et aucun document : « 2 paniers en attente
  // seront perdus : il n'existe que sur ce terminal. »
  const plusieurs = p.paniers + p.documents > 1;
  return ` ${parts.join(" et ")} ${plusieurs ? "seront perdus" : "sera perdu"} : ${plusieurs ? "ils n'existent" : "il n'existe"} que sur ce terminal.`;
}

/**
 * Le premier dialogue, avant tout envoi.
 *
 * Quand tout est déjà parti, on ne promet pas une synchronisation qui n'aurait
 * rien à faire : le libellé dit ce qui va réellement se passer.
 */
export function confirmationAvant(
  file: EtatFile,
  perissables: PerissablesLocaux = AUCUN_PERISSABLE
): Confirmation {
  const n = nbEnFile(file);
  const local = phrasePerissables(perissables);

  if (n === 0) {
    return {
      titre: "Se déconnecter ?",
      message:
        "Tout est synchronisé. Les données de cet établissement seront retirées de ce terminal, et redescendront à la prochaine connexion." +
        local,
      action: "Se déconnecter",
    };
  }
  return {
    titre: "Synchroniser et déconnecter",
    message:
      `${operations(n)} n'${n > 1 ? "ont" : "a"} pas encore atteint le serveur. ` +
      "Elles seront envoyées avant que les données de cet établissement ne soient retirées de ce terminal." +
      local,
    action: "Synchroniser et déconnecter",
  };
}

/**
 * Quand un cycle de synchronisation tient déjà le verrou.
 *
 * ⚠ **Ce n'est PAS une panne de réseau, et le dire serait mentir.** On n'a pas
 * essayé : un autre cycle tournait. Annoncer « le serveur est injoignable »
 * enverrait le marchand chercher du réseau qui est déjà là.
 */
export const MESSAGE_OCCUPE = {
  titre: "Une synchronisation est déjà en cours",
  message:
    "Ce terminal est en train d'échanger avec le serveur. Attendez qu'il ait fini, puis réessayez : se déconnecter maintenant couperait l'échange en deux.",
} as const;

export type Issue =
  /** La file est vide : on peut vider la base sans rien perdre. */
  | "purger"
  /** Il reste de quoi partir, mais le réseau ou la temporisation s'y oppose. */
  | "impasse_reseau"
  /** Il reste ce qui ne repartira pas tout seul : un droit, ou un refus. */
  | "impasse_decision";

/**
 * Que faire une fois l'envoi terminé.
 *
 * ⚠ **On relit la BASE, jamais le bilan d'envoi.** Un `pending` dont l'échéance
 * est future n'apparaît dans aucun `PushOutcome` : se fier au bilan ferait
 * effacer des opérations qui n'ont jamais été tentées.
 *
 * ⚠ **Le réseau passe AVANT la décision.** Tant qu'il reste quelque chose de
 * réessayable, c'est ce qu'il faut dire : renvoyer vers « Opérations à
 * corriger » pour une panne de réseau ferait chercher une faute là où il n'y en
 * a pas.
 */
export function issueApresEnvoi(apres: EtatFile): Issue {
  if (nbEnFile(apres) === 0) return "purger";
  if (apres.pending + apres.inflight > 0) return "impasse_reseau";
  return "impasse_decision";
}

/** La phrase des photos, ou rien. Elles s'ajoutent à n'importe quelle impasse. */
function phrasePhotos(n: number): string {
  if (n === 0) return "";
  return (
    ` ${pluriel(n, "photo d'article n'a", "photos d'articles n'ont")} pas pu partir, et ` +
    `${n > 1 ? "elles n'existent" : "elle n'existe"} que sur ce terminal.`
  );
}

export interface MessageImpasse {
  titre: string;
  message: string;
  /** Un nouvel envoi peut-il encore changer quelque chose ? */
  offreReessayer: boolean;
  /** « Opérations à corriger » a-t-il quelque chose à montrer ? */
  offreCorriger: boolean;
}

/**
 * Ce que l'écran dit quand la file n'a pas pu se vider.
 *
 * ⚠ **Ni « réessayez » ni « synchronisez » sur une opération BLOQUÉE.** Les deux
 * sont sans effet : elle attend un abonnement ou un droit, pas le réseau. Le
 * marchand qui lit cette phrase cherche du réseau, le trouve, synchronise, et
 * rien ne bouge - potentiellement des jours. `data/envoi.ts` a déjà tranché, et
 * un test interdit ces deux mots ici.
 */
export function messageImpasse(
  avant: EtatFile,
  apres: EtatFile,
  enLigne: boolean
): MessageImpasse {
  const parties = Math.max(0, nbEnFile(avant) - nbEnFile(apres));
  const envoyees = parties > 0 ? `${operations(parties)} sont parties. ` : "";

  if (issueApresEnvoi(apres) === "impasse_reseau") {
    const reste = apres.pending + apres.inflight;
    return {
      titre: "Impossible de tout envoyer",
      message:
        envoyees +
        `${operations(reste)} ${reste > 1 ? "attendent" : "attend"} encore ${reste > 1 ? "leur" : "son"} envoi. ` +
        (enLigne
          ? "Elles repartent d'elles-mêmes dans quelques minutes."
          : "Le serveur est injoignable.") +
        phrasePhotos(apres.photos) +
        " Se déconnecter et effacer maintenant les perdrait.",
      offreReessayer: true,
      offreCorriger: false,
    };
  }

  const bloquees = apres.blocked;
  const refusees = apres.quarantined;
  const parts: string[] = [];
  if (bloquees > 0) {
    parts.push(
      `${operations(bloquees)} ${bloquees > 1 ? "attendent" : "attend"} un droit : ` +
        "un abonnement à régler, ou une permission à accorder."
    );
  }
  if (refusees > 0) {
    parts.push(
      `${operations(refusees)} ${refusees > 1 ? "ont été refusées" : "a été refusée"} par le serveur. ` +
        `${refusees > 1 ? "Elles ne repartiront" : "Elle ne repartira"} pas ${refusees > 1 ? "d'elles-mêmes" : "d'elle-même"}.`
    );
  }

  if (apres.photos > 0) parts.push(phrasePhotos(apres.photos).trim());

  return {
    titre: "Il reste des données sur ce terminal",
    message: envoyees + parts.join(" ") + " Se déconnecter et effacer maintenant les perdrait.",
    // ⚠ Réessayer a du sens pour une PHOTO - son envoi est un `PATCH` qui peut
    // échouer sur le réseau - jamais pour une opération qu'un droit retient.
    offreReessayer: apres.photos > 0,
    // « Opérations à corriger » montre des OPÉRATIONS, pas des photos : y
    // renvoyer pour une photo ferait chercher dans une liste où elle n'est pas.
    offreCorriger: bloquees + refusees > 0,
  };
}
