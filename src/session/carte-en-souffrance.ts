/**
 * Ce qu'un voile DIT de ce qui n'a pas atteint le serveur.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ON N'AFFIRME JAMAIS CE QU'ON NE SAIT PAS, ET ON NE PROMET JAMAIS CE     │
 * │ QU'UN ENVOI NE PEUT PAS TENIR.                                          │
 * │                                                                          │
 * │ Les deux voiles coupent le marchand du comptoir avec lequel il gagne sa  │
 * │ journée. La première question qu'il se pose n'est pas « quelle version » │
 * │ ni « que dois-je payer », c'est « où sont mes ventes ». Une carte qui    │
 * │ répond « tout est parti » alors qu'elle n'en sait rien envoie un         │
 * │ marchand poser un APK à la main - donc désinstaller, donc détruire sa    │
 * │ base - la conscience tranquille.                                        │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Module PUR : aucune base, aucun rendu. Ces phrases sont la seule chose que le
 * marchand reçoit, et elles s'éprouvent sans appareil. C'est le motif de
 * `deconnexion-regles.ts`, juste à côté, dont ce module emprunte les accords -
 * une seconde pluralisation finirait par diverger de la première.
 *
 * ⚠ **LES DEUX CARTES NE DISENT PAS LA MÊME CHOSE D'UNE OPÉRATION BLOQUÉE, et
 * c'est juste.** Sous le voile d'ABONNEMENT, régler débloque réellement : « elle
 * repartira seule » est vrai. Sous le voile de MISE À JOUR, le blocage n'a aucun
 * rapport avec la version : presser « Envoyer » ne la fera pas partir, jamais.
 * C'est cette asymétrie qui fait qu'on partage la LECTURE et pas les phrases.
 */
import type { EtatFile } from "./deconnexion-regles";
import { operations, pluriel } from "./deconnexion-regles";

/**
 * ⚠ **LES DEUX BUILDERS PRENNENT LA FORME `{file, inconnu}` EN LIGNE, PAS LE TYPE
 * `VueEnSouffrance` DE `use-en-souffrance.ts`.** L'importer tirerait `@/data/live`,
 * donc `expo-sqlite`, donc la base OUVERTE au chargement : ce module cesserait
 * d'être éprouvable sans appareil, et ces phrases sont la seule chose que le
 * marchand reçoit. Les deux formes coïncident, et c'est `tsc` qui le tient.
 */
export type TonCarte = "neutre" | "alerte";

export interface CarteEnSouffrance {
  titre: string;
  phrase: string;
  /** `alerte` dès qu'on ne peut PAS affirmer qu'il n'y a rien en jeu. */
  ton: TonCarte;
  /** Libellé du bouton d'envoi, ou `null` quand un envoi ne changerait rien. */
  envoi: string | null;
}

/*
 * ⚠ **AUCUN BOUTON VERS « OPÉRATIONS À CORRIGER », ET CE N'EST PAS UN OUBLI.**
 * Un voile est un frère de la pile de navigation, posé PAR-DESSUS : un
 * `router.push` y déplace ce qui est SOUS le voile, donc le marchand appuie et
 * ne voit rien changer. C'est la raison même pour laquelle le paiement
 * d'abonnement est une feuille. L'écran se NOMME dans la phrase, et le marchand
 * l'atteint en levant le voile.
 */

/**
 * Ce que ce terminal porte, rangé par CE QU'ON PEUT EN FAIRE.
 *
 * Les cinq compteurs bruts ne se lisent pas : ce qui décide d'une phrase, c'est
 * si un envoi les fera partir, si un droit les retient, ou si le serveur les a
 * déjà refusés.
 */
export interface PartsEnSouffrance {
  /** Opérations qu'un envoi fait partir : prêtes, ou en vol. */
  aEnvoyer: number;
  /**
   * Photos en attente. Elles partent d'un cycle elles aussi (le fournisseur de
   * synchronisation les envoie après la poussée), mais elles se NOMMENT à part :
   * une photo en attente est la SEULE copie de son fichier, et aucun serveur ne
   * la reconstitue.
   */
  photos: number;
  /** Ce qu'un droit retient. Repart seul dès que le droit est accordé. */
  bloquees: number;
  /** Ce que le serveur a REFUSÉ. Ne repartira jamais de lui-même. */
  refusees: number;
}

export function partsDe(file: EtatFile): PartsEnSouffrance {
  return {
    aEnvoyer: file.pending + file.inflight,
    photos: file.photos,
    bloquees: file.blocked,
    refusees: file.quarantined,
  };
}

/** Rien du tout sur ce terminal : la seule situation qui autorise à affirmer. */
function rienEnJeu(p: PartsEnSouffrance): boolean {
  return p.aEnvoyer + p.photos + p.bloquees + p.refusees === 0;
}

function photos(n: number): string {
  return pluriel(n, "photo d'article", "photos d'articles");
}

/** La phrase des photos, ou rien. Elles s'ajoutent à n'importe quel état. */
function phrasePhotos(n: number): string {
  if (n === 0) return "";
  return (
    `${photos(n)} ${n > 1 ? "attendent" : "attend"} aussi ${n > 1 ? "leur" : "son"} envoi, ` +
    `et ${n > 1 ? "elles n'existent" : "elle n'existe"} que sur ce terminal.`
  );
}

/**
 * Ce qui ne partira PAS d'un envoi, et où le regarder.
 *
 * ⚠ Ni « synchronisez » ni « réessayez » : les deux sont sans effet, et les
 * proposer envoie le marchand chercher du réseau qui est déjà là. `data/envoi.ts`
 * a tranché, et un test l'interdit ici aussi.
 */
function phraseRetenu(p: PartsEnSouffrance): string {
  const parts: string[] = [];
  if (p.bloquees > 0) {
    parts.push(
      `${operations(p.bloquees)} ${p.bloquees > 1 ? "attendent" : "attend"} un droit : ` +
        "un abonnement à régler, ou une permission à accorder."
    );
  }
  if (p.refusees > 0) {
    parts.push(
      `${operations(p.refusees)} ${p.refusees > 1 ? "ont été refusées" : "a été refusée"} ` +
        `par le serveur. ${p.refusees > 1 ? "Elles ne repartiront" : "Elle ne repartira"} ` +
        `pas ${p.refusees > 1 ? "d'elles-mêmes" : "d'elle-même"}.`
    );
  }
  if (parts.length === 0) return "";
  return `${parts.join(" ")} Regardez « Opérations à corriger » avant de continuer.`;
}

/**
 * La carte du voile de MISE À JOUR.
 *
 * ⚠ **UN ENVOI NE PROMET QUE CE QU'IL PEUT TENIR.** Fondre les opérations
 * bloquées dans le décompte d'envoi posait une condition IMPOSSIBLE à satisfaire :
 * la carte disait « envoyez-les avant de mettre à jour », le bouton partait, le
 * serveur refusait pour un droit manquant, le compte ne descendait jamais, et
 * « Mettre à jour » restait secondaire indéfiniment. On lui disait de ne pas
 * mettre à jour, et il ne pouvait jamais s'exécuter.
 *
 * ⚠ **CE QUI EST RETENU NE FAIT PAS CÉDER « METTRE À JOUR ».** Rien de ce que le
 * marchand fait ici ne le clôt : on le NOMME, on ne le lui oppose pas.
 */
export function carteMiseAJour(vue: {
  file: EtatFile;
  inconnu: boolean;
}): CarteEnSouffrance {
  if (vue.inconnu) {
    return {
      titre: "Vérification en cours",
      phrase:
        "On regarde ce qui reste à envoyer depuis ce terminal. Attendez cette " +
        "réponse avant de mettre à jour.",
      ton: "alerte",
      envoi: null,
    };
  }

  const p = partsDe(vue.file);

  if (rienEnJeu(p)) {
    return {
      titre: "Vos ventes sont intactes",
      phrase:
        "Tout ce qui a été encaissé est déjà parti au serveur. La mise à jour " +
        "ne touche pas à vos données.",
      ton: "neutre",
      envoi: null,
    };
  }

  const aPartir = p.aEnvoyer + p.photos;
  const parts: string[] = [];
  if (p.aEnvoyer > 0) {
    parts.push(
      `${operations(p.aEnvoyer)} n'${p.aEnvoyer > 1 ? "ont" : "a"} pas encore ` +
        "atteint le serveur."
    );
  }
  if (p.photos > 0) parts.push(phrasePhotos(p.photos));
  if (aPartir > 0) {
    parts.push(
      `Envoyez-${aPartir > 1 ? "les" : "la"} avant de mettre à jour : ` +
        `${aPartir > 1 ? "elles partiront" : "elle partira"} alors sans aucun risque.`
    );
  }
  const retenu = phraseRetenu(p);
  if (retenu) parts.push(retenu);

  return {
    titre: "Il reste des données sur ce terminal",
    phrase: parts.join(" "),
    ton: "alerte",
    // ⚠ Le bouton d'envoi ne paraît QUE si un envoi a quelque chose à faire
    // partir. Photos comprises : elles partent du même cycle.
    envoi: aPartir > 0 ? libelleBoutonEnvoi(p) : null,
  };
}

/**
 * Le libellé du bouton d'envoi.
 *
 * ⚠ Il compte les OPÉRATIONS quand il n'y a qu'elles, et cesse de les nommer dès
 * qu'une photo s'y mêle : « Envoyer mes 3 opérations » serait faux si l'une des
 * trois est une photo d'article.
 *
 * ⚠ Le nom est `libelleBoutonEnvoi` et non `libelleEnvoi` : ce dernier est déjà
 * exporté par `data/envoi.ts`, où il dit autre chose. Deux noms identiques pour
 * deux phrases différentes, c'est ce qui fait importer la mauvaise.
 */
function libelleBoutonEnvoi(p: PartsEnSouffrance): string {
  if (p.photos === 0) {
    return p.aEnvoyer === 1
      ? "Envoyer mon opération"
      : `Envoyer mes ${p.aEnvoyer} opérations`;
  }
  if (p.aEnvoyer === 0) {
    return p.photos === 1 ? "Envoyer ma photo" : `Envoyer mes ${p.photos} photos`;
  }
  return "Tout envoyer maintenant";
}

/**
 * La carte du voile d'ABONNEMENT.
 *
 * ⚠ **« Elles repartiront seules » est VRAI ici, et faux en face.** Régler
 * l'abonnement libère les opérations bloquées : c'est même ce que le cycle de
 * synchronisation fait, dans cet ordre précis. Seules les opérations REFUSÉES
 * échappent à cette promesse, et elles se disent donc à part.
 */
export function carteAbonnement(vue: {
  file: EtatFile;
  inconnu: boolean;
}): CarteEnSouffrance {
  if (vue.inconnu) {
    return {
      titre: "Vos ventes sont conservées",
      phrase:
        "On regarde ce qui reste sur ce terminal. Rien n'est effacé par un " +
        "abonnement échu.",
      ton: "neutre",
      envoi: null,
    };
  }

  const p = partsDe(vue.file);

  if (rienEnJeu(p)) {
    return {
      titre: "Vos ventes sont intactes",
      phrase:
        "Tout ce qui a été encaissé sur ce terminal est conservé et repartira " +
        "dès que l'abonnement sera réglé.",
      ton: "neutre",
      envoi: null,
    };
  }

  // Le blocage part avec le règlement, la photo aussi : elles se rangent
  // ensemble sous « repartiront ». Le refus, non.
  const repartiront = p.aEnvoyer + p.photos + p.bloquees;
  const parts: string[] = [];
  if (repartiront > 0) {
    parts.push(
      `${operations(repartiront)} ${repartiront > 1 ? "attendent" : "attend"} sur ce ` +
        `terminal. ${repartiront > 1 ? "Elles repartiront seules" : "Elle repartira seule"} ` +
        "dès que l'abonnement sera réglé. Rien n'est perdu."
    );
  }
  if (p.refusees > 0) {
    parts.push(
      `${operations(p.refusees)} ${p.refusees > 1 ? "ont été refusées" : "a été refusée"} ` +
        `par le serveur et ${p.refusees > 1 ? "ne repartiront" : "ne repartira"} pas ` +
        "d'un règlement. Regardez « Opérations à corriger »."
    );
  }

  return {
    titre: "Vos ventes sont intactes",
    phrase: parts.join(" "),
    ton: p.refusees > 0 ? "alerte" : "neutre",
    // Rien ne part tant que l'abonnement n'est pas réglé : un bouton d'envoi
    // serait un bouton qui ne fait rien.
    envoi: null,
  };
}
