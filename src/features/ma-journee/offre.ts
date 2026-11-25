/**
 * Les filtres de « Ma journée » : la règle du noyau, à la forme des autres écrans.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ PAR DÉFAUT, CHACUN VOIT SA PROPRE JOURNÉE, PROPRIÉTAIRE COMPRIS.        │
 * │                                                                          │
 * │ C'est l'inverse des listes, où le gérant voit d'emblée tout son          │
 * │ entrepôt. Ici les filtres ÉLARGISSENT : un entrepôt choisi montre toute  │
 * │ sa journée (le champ Utilisateur vide se nomme alors « Toute l'équipe »),│
 * │ une personne la sienne. Le caissier n'a AUCUN champ, quelles que soient  │
 * │ ses cases. La règle vit dans `@vente-facile/core` (`journee.ts`), et le  │
 * │ back-office l'applique aussi.                                            │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ ON REND UNE `OffrePerimetre`, LA FORME DES AUTRES ÉCRANS. La feuille de
 * filtres et ses puces la lisent déjà : un second jeu de composants pour un
 * seul écran ferait deux grammaires pour le même geste.
 *
 * ⚠ `applique` BORNE LA BASE LOCALE, qui porte déjà ce que le membre a le droit
 * de lire (le tirage borne les entrepôts et, pour un caissier, l'auteur). Il ne
 * dit donc que ce que la portée AJOUTE : un auteur, un entrepôt, ou les
 * entrepôts du défaut d'un membre « Consulter tous ».
 *
 * Module PUR : une portée qui se trompe ne lève rien, elle montre la journée
 * d'un collègue sous le titre « Mes opérations ».
 */
import {
  CHOIX_TOUS,
  LIBELLE_TOUS_ENTREPOTS,
  LIBELLE_TOUTE_L_EQUIPE,
  champsDeLaJournee,
  defautDuPerimetre,
  libelleDeLaPortee,
  libelleEntrepotVide,
  libelleUtilisateurVide,
  litTousLesEntrepots,
  parametresDeLaJournee,
  porteeDeLaJournee,
  proposeSoiMeme,
  proposeTouteLEquipe,
  type PorteeJournee,
} from "@vente-facile/core";

import {
  entrepotsLisiblesDuMembre,
  libelleEntrepot,
  type EntrepotNomme,
  type MembreDuTerminal,
} from "../perimetre/entrepots";
import type {
  ContexteFile,
  FiltrePerimetre,
  MembrePerimetre,
  OffrePerimetre,
} from "../perimetre/filtre-perimetre";

export interface EntreeJournee {
  membre: MembreDuTerminal;
  moi: string | null;
  tousLesEntrepots: EntrepotNomme[];
  /** `undefined` : roster inconnu. `[]` : roster vide. */
  equipe: MembrePerimetre[] | undefined;
  choix: FiltrePerimetre;
}

export interface OffreJournee extends OffrePerimetre {
  portee: PorteeJournee;
  /** Ce qu'une ligne encore dans le journal doit savoir pour être jugée. */
  file: ContexteFile;
  /** Ce qu'on écrit sous le titre et en tête du rapport. */
  libelle: string;
  /** Les paramètres du rapport serveur (`my-day-export`). Vide : « mes opérations ». */
  parametres: Record<string, string>;
}

export function offreDeLaJournee(e: EntreeJournee): OffreJournee {
  const m = e.membre;
  const champs = champsDeLaJournee(m);
  const lisibles = entrepotsLisiblesDuMembre(m, e.tousLesEntrepots);
  const permis = new Set(lisibles.map((d) => d.id));

  // ── L'entrepôt choisi, validé : « Tous » seulement s'il est proposé.
  const choixE = champs.entrepot ? e.choix.entrepot : null;
  const entrepot =
    choixE === CHOIX_TOUS
      ? champs.tousLesEntrepots
        ? CHOIX_TOUS
        : null
      : choixE && permis.has(choixE)
        ? choixE
        : null;

  // ── Les personnes proposées suivent l'entrepôt retenu.
  const defaut = defautDuPerimetre(m);
  const bornes: Set<string> | null = entrepot && entrepot !== CHOIX_TOUS
    ? new Set([entrepot])
    : entrepot === CHOIX_TOUS
      ? null
      : defaut.entrepots !== null
        ? new Set(defaut.entrepots)
        : litTousLesEntrepots(m)
          ? null
          : permis;
  const choixPartiel = { entrepot, utilisateur: null };
  const membres = (e.equipe ?? []).filter((p) => {
    // Soi-même seulement quand le champ vide ne le dit pas déjà.
    if (p.userId === e.moi) return proposeSoiMeme(choixPartiel);
    if (p.role === "owner") return true;
    if (bornes === null) return true;
    return p.entrepots.some((id) => bornes.has(id));
  });
  const offreEquipe = proposeTouteLEquipe(choixPartiel);
  const utilisateurs = champs.utilisateur && e.equipe !== undefined
    ? [
        ...(offreEquipe ? [{ valeur: CHOIX_TOUS, label: LIBELLE_TOUTE_L_EQUIPE }] : []),
        ...membres.map((p) => ({ valeur: p.userId, label: p.nom })),
      ]
    : [];

  const choixU = champs.utilisateur ? e.choix.utilisateur : null;
  const utilisateur =
    choixU === CHOIX_TOUS
      ? offreEquipe
        ? CHOIX_TOUS
        : null
      : choixU && membres.some((p) => p.userId === choixU)
        ? choixU
        : null;

  const choix = { entrepot, utilisateur };
  const portee = porteeDeLaJournee(m, choix);

  // ── Le périmètre APPLIQUÉ à la base locale.
  const entrepotPrecis = "entrepot" in portee && portee.entrepot && portee.entrepot !== CHOIX_TOUS
    ? portee.entrepot
    : null;
  const tousEntrepots = "entrepot" in portee && portee.entrepot === CHOIX_TOUS;
  const applique: FiltrePerimetre =
    portee.kind === "moi"
      ? { entrepot: null, utilisateur: e.moi }
      : {
          entrepot: entrepotPrecis,
          utilisateur: portee.kind === "membre" ? portee.utilisateur : null,
          // Sans entrepôt choisi, le DÉFAUT : pour la case « Consulter tous »,
          // ses seuls entrepôts ; pour les autres, la base locale y est déjà.
          entrepots: entrepotPrecis || tousEntrepots ? null : defaut.entrepots,
          tousEntrepots,
          tousUtilisateurs: portee.kind === "equipe",
        };

  const noms = {
    role: m.role,
    entrepot: (id: string) => lisibles.find((d) => d.id === id)?.nom,
    utilisateur: (id: string) =>
      id === e.moi ? "Mes opérations" : e.equipe?.find((p) => p.userId === id)?.nom,
  };

  return {
    entrepots: champs.entrepot
      ? [
          ...(champs.tousLesEntrepots ? [{ valeur: CHOIX_TOUS, label: LIBELLE_TOUS_ENTREPOTS }] : []),
          ...lisibles.map((d) => ({ valeur: d.id, label: libelleEntrepot(d) })),
        ]
      : [],
    utilisateurs,
    champEntrepot: champs.entrepot,
    champUtilisateur: champs.utilisateur,
    libelleDefautEntrepot: libelleEntrepotVide(m),
    libelleDefautUtilisateur: libelleUtilisateurVide(choix),
    entrepotVerrouille: null,
    utilisateurVerrouille: champs.utilisateur && e.equipe === undefined ? "equipe-inconnue" : null,
    choisi: choix,
    applique,
    portee,
    // Une ligne en file est forcément à moi. Son entrepôt INCONNU ne passe que
    // si aucun entrepôt précis n'est demandé : sous « Boutique B », une vente
    // dont on ignore le dépôt ne répond pas à la question.
    file: { moi: e.moi, entrepotInconnuAdmis: entrepotPrecis === null },
    libelle: libelleDeLaPortee(portee, noms),
    parametres:
      portee.kind === "moi" || !e.moi
        ? {}
        : (parametresDeLaJournee(portee, e.moi) as Record<string, string>),
  };
}
