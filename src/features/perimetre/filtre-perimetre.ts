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
  LIBELLES_VERROU_PERIMETRE,
  verrouEntrepot,
  type MotifVerrouPerimetre,
} from "@vente-facile/core";

import {
  entrepotsAccessibles,
  type EntrepotNomme,
  type RoleMembre,
} from "./entrepots";

/** Les deux filtres que tous les écrans partagent. PLAT, jamais imbriqué. */
export interface FiltrePerimetre {
  entrepot: string | null;
  utilisateur: string | null;
}

export const PERIMETRE_VIDE: FiltrePerimetre = { entrepot: null, utilisateur: null };

/** Un membre, tel que la SESSION le descend. Jamais la table locale. */
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
 * Les TROIS PREMIERS viennent de `@vente-facile/core` : ils sont communs au
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
  entrepots: OptionPerimetre[];
  utilisateurs: OptionPerimetre[];
  entrepotVerrouille: MotifVerrou | null;
  utilisateurVerrouille: MotifVerrou | null;
  /** Le périmètre CONTRAINT : la seule chose qu'une lecture a le droit de lire. */
  applique: FiltrePerimetre;
}

export interface EntreeDePerimetre {
  role: RoleMembre;
  /** L'identifiant de l'utilisateur connecté. */
  moi: string | null;
  assignes: { id: string }[];
  tousLesEntrepots: EntrepotNomme[];
  /** `undefined` : roster inconnu. `[]` : roster vide. Les deux diffèrent. */
  equipe: MembrePerimetre[] | undefined;
  choix: FiltrePerimetre;
  /** Faux là où la donnée n'a pas d'auteur : stock, inventaire, transferts. */
  avecAuteur: boolean;
}

/**
 * Ce qu'un écran propose, ce qu'il verrouille, et ce qu'il applique réellement.
 */
export function offreDePerimetre(e: EntreeDePerimetre): OffrePerimetre {
  const accessibles = entrepotsAccessibles(e.role, e.assignes, e.tousLesEntrepots);
  const options: OptionPerimetre[] = accessibles.map((d) => ({
    valeur: d.id,
    label: d.nom,
  }));

  // ── LE CAISSIER : les deux filtres sont fermés, et son périmètre est imposé.
  //
  // C'est la première fois que la règle de rôle du serveur s'applique aux
  // listes LOCALES : le tirage borne par entrepôt mais pas par auteur, si bien
  // qu'un caissier détient en base les ventes de ses collègues du même dépôt.
  // Le verrou n'est donc pas cosmétique, et le masquer d'un champ ne suffirait
  // pas.
  //
  // ┌──────────────────────────────────────────────────────────────────────┐
  // │ ⚠ SA BORNE N'EST PAS LA MÊME SELON QUE LA DONNÉE A UN AUTEUR.        │
  // │                                                                      │
  // │ C'est la seule asymétrie du rôle, et l'ignorer se paie des deux       │
  // │ côtés. Le serveur oppose au caissier :                                │
  // │                                                                      │
  // │ - sur une donnée qui a un AUTEUR (ventes, caisse, dépenses) :         │
  // │   `filter(created_by=user)`, **sans le moindre entrepôt**             │
  // │   (`restrict_visibility_for_*`,                                       │
  // │   `_scope_cash_movements_to_membership`) ;                            │
  // │ - sur une donnée qui n'en a PAS (stock, transferts, inventaire) :     │
  // │   son ENTREPÔT, et rien d'autre (`WarehouseScopedQuerysetMixin`,      │
  // │   `filter_stock_transfer_queryset`, qui n'ont aucune branche          │
  // │   caissier).                                                          │
  // │                                                                      │
  // │ Lui imposer son dépôt sur la PREMIÈRE famille resserrait au-delà de   │
  // │ la règle, et la donnée disparaissait sans un mot : un mouvement de    │
  // │ caisse saisi HORS LIGNE n'a ni vente, ni dépense, ni session tant     │
  // │ que la poussée ne l'a pas rattaché, si bien qu'il n'existait nulle    │
  // │ part sur l'écran même où le caissier le cherche - et il le            │
  // │ ressaisissait. Pire, un mouvement poussé APRÈS la clôture du tiroir   │
  // │ n'obtient JAMAIS de session (`get_open_session_for_user` résout au    │
  // │ rejeu, pas à la saisie) : il restait invisible pour toujours.         │
  // │                                                                      │
  // │ Le lui retirer sur la SECONDE l'élargirait tout autant :              │
  // │ `stock_transfers` n'est délibérément pas borné au tirage (un          │
  // │ transfert relie deux dépôts), et son entrepôt y est la seule borne.   │
  // │                                                                      │
  // │ Rien ne s'élargit sur la première famille : `cash_movements` et       │
  // │ `expenses` n'ont pas de `warehouse_path` au tirage, donc l'auteur y   │
  // │ est la seule borne qui tienne - et elle est plus étroite que le       │
  // │ dépôt ; `sales` et `stock_movements`, eux, sont déjà bornés par       │
  // │ entrepôt AU TIRAGE pour un rôle borné.                                │
  // └──────────────────────────────────────────────────────────────────────┘
  if (e.role === "cashier") {
    const sonDepot = options.length === 1 ? options[0].valeur : null;
    return {
      entrepots: options,
      utilisateurs: [],
      entrepotVerrouille: "cashier",
      // ⚠ Une donnée sans auteur le dit, plutôt que d'annoncer « vous ne
      // voyez que vos propres données » sur un niveau de stock qui n'a
      // jamais eu d'auteur, pour personne.
      utilisateurVerrouille: e.avecAuteur ? "cashier" : "sans-auteur",
      applique: e.avecAuteur
        ? { entrepot: null, utilisateur: e.moi }
        : { entrepot: sonDepot, utilisateur: null },
    };
  }

  // ── L'ENTREPÔT. Le verrou vient du paquet, il n'est plus calculé ici : la
  // même règle vivait dans `hooks/use-perimeter.ts` du back-office, et deux
  // copies d'une règle de visibilité divergent sans qu'aucune erreur ne le dise.
  //
  // Ce qu'elle porte, et qui ne se devine pas :
  //
  // - un rôle borné SANS affectation rend « aucun-entrepot ». ⚠ Le serveur,
  //   lui, NE BORNE PAS dans ce cas (« borner ici viderait l'écran d'un membre
  //   mal configuré au lieu de signaler la configuration ») : on le DIT plutôt
  //   que de laisser croire à un accès complet ou à une organisation vide ;
  // - choisir entre une seule chose n'est pas un choix, d'où
  //   « un-seul-entrepot » ;
  // - un PROPRIÉTAIRE n'est jamais fermé, même à zéro ou un dépôt : il n'a
  //   aucune affectation, et c'est précisément ce qui le rend « partout ».
  const entrepotVerrouille: MotifVerrou | null = verrouEntrepot(
    e.role,
    accessibles.length
  );

  const permis = new Set(options.map((o) => o.valeur));
  const entrepotDemande =
    e.choix.entrepot && permis.has(e.choix.entrepot) ? e.choix.entrepot : null;
  // Un entrepôt unique s'applique SANS être choisi : c'est déjà le périmètre.
  const entrepotApplique =
    entrepotVerrouille === "un-seul-entrepot" ? options[0].valeur : entrepotDemande;

  // ── L'UTILISATEUR.
  if (!e.avecAuteur) {
    return {
      entrepots: options,
      utilisateurs: [],
      entrepotVerrouille,
      utilisateurVerrouille: "sans-auteur",
      applique: { entrepot: entrepotApplique, utilisateur: null },
    };
  }
  if (e.equipe === undefined) {
    return {
      entrepots: options,
      utilisateurs: [],
      entrepotVerrouille,
      utilisateurVerrouille: "equipe-inconnue",
      applique: { entrepot: entrepotApplique, utilisateur: null },
    };
  }

  const membres = membresProposables(e, entrepotApplique, permis);
  const utilisateurs: OptionPerimetre[] = membres.map((m) => ({
    valeur: m.userId,
    label: m.nom,
  }));
  const connus = new Set(utilisateurs.map((o) => o.valeur));
  const utilisateurApplique =
    e.choix.utilisateur && connus.has(e.choix.utilisateur)
      ? e.choix.utilisateur
      : null;

  return {
    entrepots: options,
    utilisateurs,
    entrepotVerrouille,
    utilisateurVerrouille: null,
    applique: { entrepot: entrepotApplique, utilisateur: utilisateurApplique },
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
  entrepotApplique: string | null,
  permis: Set<string>
): MembrePerimetre[] {
  const equipe = e.equipe ?? [];
  return equipe.filter((m) => {
    if (m.userId === e.moi) return true;
    if (m.role === "owner") return true;
    if (entrepotApplique) return m.entrepots.includes(entrepotApplique);
    // Sans entrepôt choisi, un rôle borné ne propose que les membres avec qui
    // il partage au moins un dépôt : sans cette borne, un gérant lirait
    // l'activité d'une boutique qu'il ne dirige pas.
    if (e.role === "owner") return true;
    return m.entrepots.some((id) => permis.has(id));
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
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function entrepotInconnuAdmis(o: OffrePerimetre): boolean {
  return o.entrepotVerrouille !== null;
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
  if (!o.entrepotVerrouille && o.applique.entrepot) n += 1;
  if (!o.utilisateurVerrouille && o.applique.utilisateur) n += 1;
  return n;
}

/**
 * Le périmètre tel qu'il doit APPARAÎTRE, verrous exclus.
 *
 * Un caissier porte deux contraintes qu'il n'a pas posées : les rendre en puces
 * retirables lui promettrait de pouvoir les retirer, et l'appui ne ferait rien.
 * Un écran affiche donc ceci, et lit `applique` pour ses données.
 */
export function perimetreAffichable(o: OffrePerimetre): FiltrePerimetre {
  return {
    entrepot: o.entrepotVerrouille ? null : o.applique.entrepot,
    utilisateur: o.utilisateurVerrouille ? null : o.applique.utilisateur,
  };
}

/** Une puce retirable par filtre de périmètre réellement posé. */
export function resumeDuPerimetre(
  o: OffrePerimetre
): { cle: "entrepot" | "utilisateur"; label: string }[] {
  const puces: { cle: "entrepot" | "utilisateur"; label: string }[] = [];
  if (!o.entrepotVerrouille && o.applique.entrepot) {
    const nom = o.entrepots.find((x) => x.valeur === o.applique.entrepot)?.label;
    // Un nom manquant s'écrit « inconnu » et JAMAIS l'identifiant : un UUID
    // dans une puce n'est pas un nom, c'est du bruit.
    puces.push({ cle: "entrepot", label: nom || "Entrepôt inconnu" });
  }
  if (!o.utilisateurVerrouille && o.applique.utilisateur) {
    const nom = o.utilisateurs.find((x) => x.valeur === o.applique.utilisateur)?.label;
    puces.push({ cle: "utilisateur", label: nom || "Utilisateur inconnu" });
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
export function parametresDePerimetre(
  f: FiltrePerimetre
): { warehouse?: string; user?: string } {
  return {
    warehouse: f.entrepot ?? undefined,
    user: f.utilisateur ?? undefined,
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
