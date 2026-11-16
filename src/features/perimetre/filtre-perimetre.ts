/**
 * Le couple de filtres « Entrepôt » et « Utilisateur », et qui a le droit d'y toucher.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ `applique` N'EST PAS `choix`, ET SEUL `applique` A LE DROIT D'ÊTRE LU.  │
 * │                                                                          │
 * │ Un caissier peut avoir n'importe quoi dans son état d'écran - un panneau │
 * │ resté ouvert, un filtre restauré d'une session précédente, un rôle qui a │
 * │ changé au back-office pendant qu'il vendait. Ce qui borne sa lecture ne  │
 * │ doit jamais venir de là : `offreDePerimetre` rend le périmètre           │
 * │ CONTRAINT, et les modules de données ne consomment que celui-là.         │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ `undefined` N'EST PAS `[]`, POUR L'ÉQUIPE.                              │
 * │                                                                          │
 * │ Un instantané de session mis en cache avant ce lot ne porte pas la clé   │
 * │ `team`. Le lire comme un roster VIDE afficherait « aucun collègue » à un │
 * │ propriétaire qui en a cinquante, et il conclurait que ses employés ont   │
 * │ disparu. C'est « `null` ne se lit jamais comme zéro », appliqué aux gens.│
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Module PUR : il décide de ce qu'un écran montre ET de ce qu'une requête
 * borne. Une règle de périmètre qui se trompe ne lève rien, elle affiche les
 * chiffres d'un dépôt sous le nom d'un autre : elle doit s'éprouver sans
 * appareil.
 */
import {
  CHOIX_TOUS,
  LIBELLE_TOUS_ENTREPOTS,
  LIBELLE_TOUS_UTILISATEURS,
  LIBELLES_VERROU_PERIMETRE,
  afficheFiltreEntrepot,
  afficheFiltreUtilisateur,
  defautDuPerimetre,
  estBorneParAuteur,
  libelleDefautEntrepot,
  libelleDefautUtilisateur,
  litTousLesEntrepots,
  proposeTousLesEntrepots,
  proposeTousLesUtilisateurs,
  verrouEntrepot,
  type MotifVerrouPerimetre,
} from "@vente-facile/core";

import {
  entrepotsLisiblesDuMembre,
  libelleEntrepot,
  type EntrepotNomme,
  type MembreDuTerminal,
  type RoleMembre,
} from "./entrepots";

export { CHOIX_TOUS };

/**
 * Les deux filtres que tous les écrans partagent. PLAT, jamais imbriqué.
 *
 * Dans le CHOIX d'un écran, `null` est le défaut, `CHOIX_TOUS` le choix
 * explicite « Tous », un identifiant un choix précis. Dans le périmètre
 * APPLIQUÉ, les trois champs optionnels portent ce qu'une lecture doit savoir
 * de plus :
 *
 * - `entrepots` : l'ensemble d'entrepôts du DÉFAUT, quand il borne sans être un
 *   choix (la case « Consulter tous » par défaut : ses seuls entrepôts) ;
 * - `tousEntrepots` / `tousUtilisateurs` : le choix « Tous », pour que les
 *   documents et les rapports demandent au serveur d'élargir, son défaut
 *   n'étant pas « tous ».
 */
export interface FiltrePerimetre {
  entrepot: string | null;
  utilisateur: string | null;
  entrepots?: readonly string[] | null;
  tousEntrepots?: boolean;
  tousUtilisateurs?: boolean;
}

export const PERIMETRE_VIDE: FiltrePerimetre = { entrepot: null, utilisateur: null };

/** Un membre de l'ÉQUIPE, tel que la SESSION le descend. Jamais la table locale. */
export interface MembrePerimetre {
  userId: string;
  nom: string;
  role: RoleMembre;
  /** Identifiants seuls : les noms descendent déjà par la table `warehouses`. */
  entrepots: string[];
}

/**
 * Pourquoi un filtre est fermé. `null` : il est ouvert.
 *
 * Les QUATRE PREMIERS viennent de `@vente-facile/core` : ils sont communs au
 * back-office, et leurs libellés y étaient recopiés au caractère près. Les deux
 * suivants sont PROPRES au terminal - le back-office retire le champ d'une
 * donnée sans auteur plutôt que de l'expliquer, et lui n'a pas de roster à
 * attendre.
 */
export type MotifVerrou =
  | MotifVerrouPerimetre
  | "sans-auteur"
  | "equipe-inconnue";

export interface OptionPerimetre {
  valeur: string;
  label: string;
}

export interface OffrePerimetre {
  /** Les choix d'entrepôt, « Tous les entrepôts » en tête quand il est proposé. */
  entrepots: OptionPerimetre[];
  /** Les choix d'utilisateur, « Tous les utilisateurs » en tête quand il est proposé. */
  utilisateurs: OptionPerimetre[];
  /**
   * Le champ s'AFFICHE-t-il ? Distinct du verrou : un verrou dit ce qui borne
   * la lecture, ceci dit si le marchand a quelque chose à choisir.
   */
  champEntrepot: boolean;
  champUtilisateur: boolean;
  /** Ce que le champ annonce quand rien n'est choisi : le défaut, nommé. */
  libelleDefautEntrepot: string;
  libelleDefautUtilisateur: string;
  entrepotVerrouille: MotifVerrou | null;
  utilisateurVerrouille: MotifVerrou | null;
  /**
   * Le choix EXPLICITE retenu, validé : un identifiant, `CHOIX_TOUS`, ou `null`
   * (le défaut). C'est lui qu'on montre en puce et qu'on compte.
   */
  choisi: { entrepot: string | null; utilisateur: string | null };
  /** Le périmètre CONTRAINT : la seule chose qu'une lecture a le droit de lire. */
  applique: FiltrePerimetre;
}

export interface EntreeDePerimetre {
  /** Le membre au sens du noyau : rôle, case, `sales.view_all`, affectations. */
  membre: MembreDuTerminal;
  /** L'identifiant de l'utilisateur connecté. */
  moi: string | null;
  /** Tous les entrepôts que le terminal sait nommer (`entrepotsConnus`). */
  tousLesEntrepots: EntrepotNomme[];
  /** `undefined` : roster inconnu. `[]` : roster vide. Les deux diffèrent. */
  equipe: MembrePerimetre[] | undefined;
  choix: FiltrePerimetre;
  /** Faux là où la donnée n'a pas d'auteur : stock, inventaire, transferts. */
  avecAuteur: boolean;
}

/**
 * Ce qu'un écran propose, ce qu'il verrouille, et ce qu'il applique réellement.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE QU'ON PEUT LIRE N'EST PAS CE QU'ON VOIT PAR DÉFAUT (2026-11-16).     │
 * │                                                                          │
 * │ La base locale porte tout ce que le membre a le DROIT de lire : le       │
 * │ tirage descend les ventes des collègues sous « Voir tout dans son        │
 * │ entrepôt », les autres entrepôts sous « Consulter tous ». C'est ce qui   │
 * │ permet aux filtres d'élargir hors ligne. Mais SANS filtre, l'écran        │
 * │ montre le DÉFAUT (`defautDuPerimetre` du noyau) :                        │
 * │                                                                          │
 * │ - le caissier, ses seules données, quelles que soient ses cases ;       │
 * │ - le gérant et le magasinier, toutes les données de leurs entrepôts ;   │
 * │ - le propriétaire, tout.                                                 │
 * │                                                                          │
 * │ Élargir est un CHOIX : un collègue, un autre entrepôt, ou « Tous ».      │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN FILTRE EST DE LECTURE : LES ENTREPÔTS DÉSACTIVÉS Y RESTENT.          │
 * │                                                                          │
 * │ Ils disparaissaient des filtres, même pour le propriétaire : un dépôt    │
 * │ fermé hier ne permettait plus de relire ses ventes d'avant-hier. Ils y   │
 * │ sont, et leur libellé le dit (« (inactif) ») : c'est l'ACTION qui leur   │
 * │ est fermée, pas le passé.                                                │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ MASQUER N'EST PAS LEVER : `applique` garde ses verrous et son défaut. Et un
 * choix resté dans l'état d'un écran n'est plus appliqué quand son champ est
 * masqué : il deviendrait un filtre invisible, impossible à retirer.
 */
export function offreDePerimetre(e: EntreeDePerimetre): OffrePerimetre {
  const defaut = defautDuPerimetre(e.membre);
  const champEntrepot = afficheFiltreEntrepot(e.membre);
  const champUtilisateur = e.avecAuteur && afficheFiltreUtilisateur(e.membre);

  const lisibles = entrepotsLisiblesDuMembre(e.membre, e.tousLesEntrepots);
  const offreTousEntrepots = champEntrepot && proposeTousLesEntrepots(e.membre);
  const entrepots: OptionPerimetre[] = [
    ...(offreTousEntrepots ? [{ valeur: CHOIX_TOUS, label: LIBELLE_TOUS_ENTREPOTS }] : []),
    ...lisibles.map((d) => ({ valeur: d.id, label: libelleEntrepot(d) })),
  ];
  const permis = new Set(lisibles.map((d) => d.id));

  // ── Le verrou d'entrepôt vient du paquet, partagé avec le back-office :
  // « un-seul-entrepot » impose son unique dépôt là où rien ne borne déjà par
  // l'auteur ; « aucun-entrepot » le DIT ; le propriétaire et la case « Consulter
  // tous » ne sont jamais fermés.
  const entrepotVerrouille: MotifVerrou | null = verrouEntrepot(
    e.membre,
    lisibles.length,
    "lecture"
  );

  // ── Le choix d'entrepôt, validé. Un champ masqué ne choisit rien.
  const choixE = champEntrepot ? e.choix.entrepot : null;
  const tousEntrepots = choixE === CHOIX_TOUS && offreTousEntrepots;
  const entrepotDemande =
    choixE && choixE !== CHOIX_TOUS && permis.has(choixE) ? choixE : null;

  // ── L'utilisateur : le DROIT d'abord, puis le choix, puis le défaut.
  const borneDroit = e.avecAuteur && estBorneParAuteur(e.membre, "lecture");
  const offreTousUtilisateurs = champUtilisateur && proposeTousLesUtilisateurs(e.membre);
  const choixU = champUtilisateur && !borneDroit ? e.choix.utilisateur : null;
  const tousUtilisateurs = choixU === CHOIX_TOUS && offreTousUtilisateurs;
  // Un identifiant ne vaut que s'il désigne quelqu'un que la liste PROPOSE,
  // c'est-à-dire dans l'entrepôt choisi : sinon c'est un choix périmé, ou un
  // filtre fantôme (un membre du dépôt B retenu sous « Dépôt A » vide la liste
  // sans que la puce le montre). On revient alors au défaut.
  // ── Les membres proposés suivent l'entrepôt RETENU : un dépôt choisi, sinon
  // « Tous les entrepôts », sinon le défaut du membre (ses entrepôts pour la
  // case « Consulter tous », son périmètre pour les autres). Proposer un
  // collègue du dépôt B sous le défaut « Mes entrepôts » donnerait une liste
  // vide : le serveur garde son défaut tant que l'entrepôt n'est pas élargi.
  const bornesMembres: Set<string> | null = entrepotDemande
    ? new Set([entrepotDemande])
    : tousEntrepots
      ? null
      : defaut.entrepots !== null
        ? new Set(defaut.entrepots)
        : litTousLesEntrepots(e.membre)
          ? null
          : permis;
  const visables =
    e.equipe === undefined
      ? []
      : membresProposables(e, bornesMembres).map((m) => m.userId);
  const utilisateurDemande =
    choixU && choixU !== CHOIX_TOUS && visables.includes(choixU) ? choixU : null;

  let utilisateurApplique: string | null = null;
  if (!e.avecAuteur) utilisateurApplique = null;
  else if (borneDroit) utilisateurApplique = e.moi;
  else if (utilisateurDemande) utilisateurApplique = utilisateurDemande;
  else if (tousUtilisateurs) utilisateurApplique = null;
  else utilisateurApplique = defaut.auteurBorne ? e.moi : null;

  // ┌──────────────────────────────────────────────────────────────────────┐
  // │ UN MEMBRE BORNÉ PAR AUTEUR VOIT AUSSI SES LIGNES SANS ENTREPÔT.      │
  // │                                                                      │
  // │ C'est la règle du serveur (`borner_visibilite`) : ses propres lignes │
  // │ dans ses entrepôts, PLUS celles qui n'en ont aucun - un mouvement de │
  // │ caisse poussé après la clôture du tiroir n'obtient jamais de         │
  // │ session, et un mouvement saisi hors ligne n'en a pas encore. Lui     │
  // │ imposer un entrepôt sur une donnée qui a un auteur les lui cacherait │
  // │ sur le seul écran où il les cherche, et il les ressaisirait.         │
  // │                                                                      │
  // │ Sur une donnée SANS auteur (stock, transferts), l'entrepôt est au    │
  // │ contraire la seule borne, et il s'applique.                          │
  // └──────────────────────────────────────────────────────────────────────┘
  const borneParAuteur = e.avecAuteur && utilisateurApplique !== null && utilisateurApplique === e.moi && !utilisateurDemande;

  let entrepotApplique: string | null = entrepotDemande;
  let entrepotsApplique: string[] | null = null;
  if (!entrepotDemande && !tousEntrepots && !borneParAuteur) {
    if (entrepotVerrouille === "un-seul-entrepot") {
      entrepotApplique = lisibles[0]?.id ?? null;
    } else if (defaut.entrepots !== null) {
      // La case « Consulter tous » : par défaut, ses seuls entrepôts.
      entrepotsApplique = defaut.entrepots;
    }
  }

  // ── Les choix d'utilisateur proposés, selon l'entrepôt retenu.
  let utilisateurVerrouille: MotifVerrou | null = null;
  let utilisateurs: OptionPerimetre[] = [];
  if (!e.avecAuteur) {
    // ⚠ Une donnée sans auteur le dit, plutôt que d'annoncer « vous ne voyez
    // que vos propres données » sur un niveau de stock qui n'a jamais eu
    // d'auteur, pour personne.
    utilisateurVerrouille = "sans-auteur";
  } else if (borneDroit) {
    utilisateurVerrouille = "propres-donnees";
  } else if (e.equipe === undefined) {
    utilisateurVerrouille = "equipe-inconnue";
  } else {
    const membres = membresProposables(e, bornesMembres);
    utilisateurs = [
      ...(offreTousUtilisateurs
        ? [{ valeur: CHOIX_TOUS, label: LIBELLE_TOUS_UTILISATEURS }]
        : []),
      ...membres
        // Le défaut d'un caissier EST « moi » : se proposer soi-même ferait
        // une seconde façon de dire « Moi uniquement ».
        .filter((m) => !(defaut.auteurBorne && m.userId === e.moi))
        .map((m) => ({ valeur: m.userId, label: m.nom })),
    ];
  }

  return {
    entrepots,
    utilisateurs,
    champEntrepot,
    champUtilisateur,
    libelleDefautEntrepot: libelleDefautEntrepot(e.membre),
    libelleDefautUtilisateur: libelleDefautUtilisateur(e.membre),
    entrepotVerrouille,
    utilisateurVerrouille,
    choisi: {
      entrepot: entrepotDemande ?? (tousEntrepots ? CHOIX_TOUS : null),
      utilisateur: utilisateurDemande ?? (tousUtilisateurs ? CHOIX_TOUS : null),
    },
    applique: {
      entrepot: entrepotApplique,
      utilisateur: utilisateurApplique,
      entrepots: entrepotsApplique,
      tousEntrepots,
      tousUtilisateurs,
    },
  };
}

/**
 * Qui proposer, une fois l'entrepôt choisi.
 *
 * ⚠ UN PROPRIÉTAIRE EST TOUJOURS PROPOSÉ. Il n'a aucune affectation - c'est ce
 * qui le rend « partout » - et le croiser avec un entrepôt le ferait
 * disparaître de sa propre liste dès qu'un dépôt est choisi.
 *
 * ⚠ ET ON SE PROPOSE TOUJOURS SOI-MÊME. Un gérant qui vend au comptoir doit
 * pouvoir lire sa propre journée, y compris sur un dépôt où il n'est pas
 * nominalement affecté.
 */
function membresProposables(
  e: EntreeDePerimetre,
  /** Les entrepôts dont on propose les membres ; `null` : tous. */
  bornes: Set<string> | null
): MembrePerimetre[] {
  const equipe = e.equipe ?? [];
  return equipe.filter((m) => {
    if (m.userId === e.moi) return true;
    // Le propriétaire n'a AUCUNE affectation : c'est son rôle qui lui donne
    // tout, et l'intersection le ferait disparaître de toutes les listes.
    if (m.role === "owner") return true;
    if (bornes === null) return true;
    return m.entrepots.some((id) => bornes.has(id));
  });
}

/**
 * Ce qu'une lecture doit savoir pour juger une ligne ENCORE DANS LE JOURNAL.
 *
 * Une ligne en file n'est pas une ligne comme les autres : elle appartient
 * forcément au compte connecté, et une partie de ce que le serveur lui posera
 * n'existe pas encore. Les deux réponses tiennent ici, et nulle part ailleurs -
 * les recopier dans chaque module de données finirait par en donner deux.
 */
export interface ContexteFile {
  /** L'utilisateur connecté, seul auteur possible d'une ligne en file. */
  moi: string | null;
  /** Voir `entrepotInconnuAdmis` : un verrou tolère l'inconnu, un choix non. */
  entrepotInconnuAdmis: boolean;
}

/**
 * Le contexte le plus STRICT : aucun auteur connu, aucune tolérance.
 *
 * C'est le repli d'une lecture appelée hors d'un écran à périmètre. Il est
 * conservateur par choix : une lecture qui oublie son contexte montre MOINS,
 * jamais plus - on ne veut pas qu'un oubli élargisse un périmètre en silence.
 */
export const FILE_SANS_PERIMETRE: ContexteFile = {
  moi: null,
  entrepotInconnuAdmis: false,
};

/** Le contexte de file d'une offre. Dérivé, jamais une seconde source. */
export function contexteFileDe(o: OffrePerimetre, moi: string | null): ContexteFile {
  return { moi, entrepotInconnuAdmis: entrepotInconnuAdmis(o) };
}

/**
 * Une ligne dont l'entrepôt est INCONNU passe-t-elle le filtre courant ?
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN VERROU TOLÈRE L'INCONNU ; UN CHOIX EST EXACT.                        │
 * │                                                                          │
 * │ C'est la règle du serveur, transposée : le périmètre de RÔLE y tolère    │
 * │ les lignes non rattachées, le filtre VOLONTAIRE non (« un apport sans    │
 * │ pièce apparaîtrait sinon sous chaque dépôt, et la somme des dépôts       │
 * │ dépasserait le total du tiroir »).                                       │
 * │                                                                          │
 * │ Un verrou n'est pas un filtre : c'est le périmètre du rôle, que le       │
 * │ marchand n'a pas posé et ne peut pas retirer. Une ligne qu'il vient de   │
 * │ saisir et que la synchronisation n'a pas encore rattachée ne peut        │
 * │ appartenir qu'à ce périmètre-là - l'écarter la lui cacherait sur le      │
 * │ seul écran où il la cherche, et il la ressaisirait.                      │
 * │                                                                          │
 * │ Sous un CHOIX délibéré, la question est « qu'y a-t-il eu dans le dépôt   │
 * │ B ? » : une ligne dont on ignore le dépôt n'y répond pas.                │
 * │                                                                          │
 * │ Le DÉFAUT d'un membre (« Mes entrepôts » sous la case « Consulter        │
 * │ tous ») est, comme un verrou, un périmètre qu'il n'a pas posé : il       │
 * │ tolère l'inconnu.                                                        │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function entrepotInconnuAdmis(o: OffrePerimetre): boolean {
  return o.choisi.entrepot === null || o.choisi.entrepot === CHOIX_TOUS;
}

/** Ce qu'une lecture sait de l'entrepôt qu'on regarde. */
export interface PorteeEntrepot {
  entrepot?: string | null;
  entrepots?: readonly string[] | null;
}

/**
 * Une ligne ENCORE DANS LE JOURNAL passe-t-elle le périmètre d'entrepôt ?
 *
 * Le pendant de `conditionEntrepot` (`data/perimetre-sql.ts`) pour les lignes
 * qu'aucune table ne porte encore. Un CHOIX est exact (l'inconnu ne passe que
 * si `inconnuAdmis`) ; le DÉFAUT « mes entrepôts » tolère l'inconnu, la ligne
 * ne pouvant venir que de ce terminal, donc de ce membre.
 */
export function retientEntrepot(
  entrepot: string | null | undefined,
  f: PorteeEntrepot,
  inconnuAdmis: boolean
): boolean {
  const e = entrepot ?? null;
  if (f.entrepot) return e === f.entrepot || (e === null && inconnuAdmis);
  if (f.entrepots) return e === null || f.entrepots.includes(e);
  return true;
}

/**
 * L'écran a-t-il au moins un champ de périmètre à proposer ?
 *
 * Faux : il ne pose ni bouton de filtres ni feuille. Un bouton qui ouvre une
 * feuille vide se lirait comme une panne.
 */
export function afficheFiltresDePerimetre(o: OffrePerimetre): boolean {
  return o.champEntrepot || o.champUtilisateur;
}

/**
 * Combien de filtres de périmètre pèsent, pour la pastille du bouton.
 *
 * ⚠ ON COMPTE CE QUI EST CHOISI, JAMAIS CE QUI EST APPLIQUÉ. Un caissier porte
 * deux contraintes en permanence : une pastille figée sur « 2 » cesserait
 * d'être un signal, et il n'a de toute façon aucun moyen de la faire descendre.
 */
export function nombreDeFiltresPerimetre(o: OffrePerimetre): number {
  let n = 0;
  if (o.choisi.entrepot) n += 1;
  if (o.choisi.utilisateur) n += 1;
  return n;
}

/**
 * Le périmètre tel qu'il doit APPARAÎTRE : les seuls choix EXPLICITES.
 *
 * Un caissier porte des contraintes qu'il n'a pas posées (son verrou, son
 * défaut) : les rendre en puces retirables lui promettrait de pouvoir les
 * retirer, et l'appui ne ferait rien. Un écran affiche donc ceci, et lit
 * `applique` pour ses données. « Tous » est un choix : il a sa puce, et la
 * retirer ramène au défaut.
 */
export function perimetreAffichable(o: OffrePerimetre): FiltrePerimetre {
  return { entrepot: o.choisi.entrepot, utilisateur: o.choisi.utilisateur };
}

/** Le nom d'un choix, tel que la liste le propose. Jamais l'identifiant. */
export function nomDuChoix(
  o: OffrePerimetre,
  cle: "entrepot" | "utilisateur"
): string | undefined {
  const valeur = o.choisi[cle];
  const options = cle === "entrepot" ? o.entrepots : o.utilisateurs;
  return valeur ? options.find((x) => x.valeur === valeur)?.label : undefined;
}

/** Une puce retirable par filtre de périmètre réellement posé. */
export function resumeDuPerimetre(
  o: OffrePerimetre
): { cle: "entrepot" | "utilisateur"; label: string }[] {
  const puces: { cle: "entrepot" | "utilisateur"; label: string }[] = [];
  // Un nom manquant s'écrit « inconnu » et JAMAIS l'identifiant : un UUID
  // dans une puce n'est pas un nom, c'est du bruit.
  if (o.choisi.entrepot) {
    puces.push({ cle: "entrepot", label: nomDuChoix(o, "entrepot") || "Entrepôt inconnu" });
  }
  if (o.choisi.utilisateur) {
    puces.push({
      cle: "utilisateur",
      label: nomDuChoix(o, "utilisateur") || "Utilisateur inconnu",
    });
  }
  return puces;
}

/** Le filtre `cle` retiré, l'autre intact. */
export function sansLeFiltrePerimetre(
  f: FiltrePerimetre,
  cle: "entrepot" | "utilisateur"
): FiltrePerimetre {
  return cle === "entrepot"
    ? { ...f, entrepot: null }
    : { ...f, utilisateur: null };
}

/**
 * Les paramètres de requête du périmètre, pour un document ou un rapport.
 *
 * `warehouse` et `user` : un seul nom sur toute l'application, serveur compris.
 * Deux noms voudraient dire une table de correspondance par écran, donc un
 * écran qui en manquera.
 */
export function parametresDePerimetre(f: FiltrePerimetre): {
  warehouse?: string;
  user?: string;
  all_warehouses?: string;
  all_users?: string;
} {
  return {
    warehouse: f.entrepot ?? undefined,
    user: f.utilisateur ?? undefined,
    // « Tous » se DEMANDE au serveur : son défaut n'est pas « tous » (un
    // caissier n'y voit que ses données, la case « Consulter tous » que ses
    // entrepôts), et ne rien envoyer y retomberait.
    all_warehouses: f.tousEntrepots ? "1" : undefined,
    all_users: f.tousUtilisateurs ? "1" : undefined,
  };
}

/** Ce qu'on écrit sous un filtre fermé. Un verrou muet se lit comme une panne. */
export function libelleDuVerrou(m: MotifVerrou): string {
  switch (m) {
    case "sans-auteur":
      return "Ces données ne sont rattachées à aucun utilisateur.";
    case "equipe-inconnue":
      // ⚠ LE SEUL MOTIF QUI A LE DROIT DE PROPOSER « Synchronisez » : les
      // autres ne se règlent pas ainsi, et l'écrire enverrait le marchand
      // chercher du réseau pour une règle de droit.
      return "La liste des utilisateurs n'a pas encore été reçue. Synchronisez.";
    default:
      // Les trois motifs COMMUNS : leurs libellés étaient recopiés ici au
      // caractère près, en face de ceux du back-office.
      return LIBELLES_VERROU_PERIMETRE[m];
  }
}

/**
 * Le jeu de filtres d'un écran porte-t-il bien le périmètre ?
 *
 * Employé en `type _X = AssertPerimetre<FiltresEcran>` dans chaque module de
 * filtres : oublier une clé NOMME alors le module au type-check, au lieu de se
 * découvrir sur un écran qui ignore la puce qu'il affiche.
 */
export type AssertPerimetre<F extends FiltrePerimetre> = F;
export type AssertEntrepot<F extends Pick<FiltrePerimetre, "entrepot">> = F;
