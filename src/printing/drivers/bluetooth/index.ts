/**
 * L'imprimante Bluetooth, quel que soit son protocole.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UNE SEULE OPTION, PARCE QUE LE MARCHAND N'A PAS L'INFORMATION.          │
 * │                                                                          │
 * │ L'écran proposait « Bluetooth (classique) » et « Bluetooth (basse        │
 * │ consommation) ». Personne ne sait de quel protocole relève l'imprimante  │
 * │ qu'il vient d'acheter : c'était lui demander une information qu'il n'a   │
 * │ pas, sur un écran où se tromper donne EXACTEMENT le même message que ne  │
 * │ pas avoir d'imprimante du tout.                                          │
 * │                                                                          │
 * │ On cherche donc des deux côtés, on présente UNE liste, et le protocole   │
 * │ est relevé au moment où il désigne sa machine. Plus rien n'est deviné à  │
 * │ l'impression : `reglage.lien` le dit.                                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import type { Block } from "@vente-facile/core/receipt";

import type { ContexteImpression, PiloteImpression } from "../../driver";
import { ErreurImpression, messageDe } from "../../erreurs";
import { lireReglage } from "../../preferences";
import { rasterDuTicket } from "../../raster";
import { rendreEscPos, rendreEscPosImage } from "../../render-escpos";
import { rendreTexte } from "../../render-text";
import { fusionner, type ImprimanteTrouvee } from "./fusion";
import * as gatt from "./gatt";
import { permissionsAccordees } from "./permissions-android";
import * as spp from "./spp";

export { avecImprimanteChoisie, type ImprimanteTrouvee } from "./fusion";
export { demanderPermissionsBluetooth, permissionsAccordees } from "./permissions-android";

/**
 * Ce qu'une recherche a donné.
 *
 * ⚠ C'EST LA PIÈCE QUI REFERME LE DÉFAUT DE LECTURE. Avant, toute panne rendait
 * une liste vide : un refus de permission, une radio coupée et une absence
 * d'imprimante s'affichaient de la même façon, « Aucune imprimante trouvée ».
 * Le marchand allait chercher une panne de matériel.
 */
export type RechercheImprimantes =
  | { etat: "ok"; imprimantes: ImprimanteTrouvee[]; avertissement?: string }
  | { etat: "permission_refusee"; definitif: boolean }
  | { etat: "bluetooth_eteint" }
  | { etat: "localisation_coupee" }
  | { etat: "sans_bluetooth" }
  | { etat: "erreur"; message: string };

function classerEchec(e: unknown): RechercheImprimantes {
  if (e instanceof ErreurImpression) {
    switch (e.raison) {
      case "permission":
        return { etat: "permission_refusee", definitif: true };
      case "eteint":
        return { etat: "bluetooth_eteint" };
      case "localisation":
        return { etat: "localisation_coupee" };
      case "absente":
        return { etat: "sans_bluetooth" };
      default:
        return { etat: "erreur", message: e.message };
    }
  }
  return { etat: "erreur", message: messageDe(e, "La recherche d'imprimantes a échoué.") };
}

/** Ni l'un ni l'autre des deux liens n'existe sur cette plateforme. */
function sansRadio(): boolean {
  return !spp.disponibleSurCettePlateforme() && !gatt.disponibleSurCettePlateforme();
}

/**
 * Les contrôles communs aux deux recherches.
 *
 * Rend `null` quand tout va bien, sinon l'état à afficher. L'ordre compte : une
 * permission manquante fait échouer la lecture de l'état de la radio, donc
 * demander « le Bluetooth est-il allumé ? » d'abord rendrait un refus système
 * sous les traits d'une radio éteinte.
 */
async function obstacle(): Promise<RechercheImprimantes | null> {
  if (sansRadio()) return { etat: "sans_bluetooth" };

  // Silencieux : la recherche ne demande rien, c'est l'écran qui orchestre.
  if (!(await permissionsAccordees())) {
    return { etat: "permission_refusee", definitif: false };
  }

  try {
    if (spp.disponibleSurCettePlateforme()) {
      if (!(await spp.allume())) return { etat: "bluetooth_eteint" };
      return null;
    }
    const etat = await gatt.etat();
    if (etat === "PoweredOff") return { etat: "bluetooth_eteint" };
    // iOS n'a pas de permission à demander : son refus se lit ici.
    if (etat === "Unauthorized") return { etat: "permission_refusee", definitif: true };
    if (etat === "Unsupported") return { etat: "sans_bluetooth" };
    return null;
  } catch (e) {
    return classerEchec(e);
  }
}

/** Les imprimantes déjà appairées. Immédiat : aucune radio n'est sollicitée. */
export async function imprimantesAppairees(): Promise<RechercheImprimantes> {
  const arret = await obstacle();
  if (arret) return arret;
  try {
    return { etat: "ok", imprimantes: fusionner(await spp.appairees()) };
  } catch (e) {
    return classerEchec(e);
  }
}

/**
 * Cherche partout : appairées, série à portée, et basse consommation.
 *
 * ⚠ UNE BRANCHE QUI ÉCHOUE N'EFFACE PAS L'AUTRE. Un scan basse consommation qui
 * tombe ne doit pas cacher l'imprimante appairée qui, elle, marche : on rend ce
 * qu'on a et on AVERTIT, plutôt que de tout refuser.
 */
export async function chercherImprimantes(duree = 8000): Promise<RechercheImprimantes> {
  const arret = await obstacle();
  if (arret) return arret;

  const branches: Promise<ImprimanteTrouvee[]>[] = [];
  if (spp.disponibleSurCettePlateforme()) {
    branches.push(spp.appairees(), spp.decouvrir());
  }
  if (gatt.disponibleSurCettePlateforme()) {
    branches.push(gatt.chercher(duree));
  }

  const resultats = await Promise.allSettled(branches);
  const listes = resultats
    .filter((r): r is PromiseFulfilledResult<ImprimanteTrouvee[]> => r.status === "fulfilled")
    .map((r) => r.value);
  const echecs = resultats.filter((r) => r.status === "rejected") as PromiseRejectedResult[];

  // Tout est tombé : c'est une panne, et elle se nomme.
  if (listes.length === 0) {
    return echecs.length > 0
      ? classerEchec(echecs[0].reason)
      : { etat: "ok", imprimantes: [] };
  }

  return {
    etat: "ok",
    imprimantes: fusionner(...listes),
    avertissement:
      echecs.length > 0
        ? "Une partie de la recherche a échoué : certaines imprimantes peuvent manquer."
        : undefined,
  };
}

/** Appaire une imprimante série. Le système garde le code PIN. */
export async function appairerImprimante(adresse: string): Promise<boolean> {
  return spp.appairer(adresse);
}

export async function annulerRecherche(): Promise<void> {
  await spp.annulerDecouverte();
}

/**
 * Demande au système d'allumer la radio.
 *
 * ⚠ EXIGE DÉJÀ `BLUETOOTH_CONNECT` sur Android 12+. L'écran ne doit donc le
 * proposer qu'APRÈS l'octroi des permissions, jamais avant : sinon l'appel
 * échoue, et le marchand conclut que le bouton ne marche pas.
 */
export async function activerBluetooth(): Promise<boolean> {
  try {
    return await spp.activer();
  } catch {
    spp.ouvrirReglagesBluetooth();
    return false;
  }
}

export function ouvrirReglagesBluetooth(): void {
  spp.ouvrirReglagesBluetooth();
}

async function radioAllumee(lien: "spp" | "gatt"): Promise<boolean> {
  if (lien === "gatt") return (await gatt.etat()) === "PoweredOn";
  return spp.allume();
}

/**
 * Le ticket en octets : la page dessinée, ou le texte en secours.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UNE IMPRIMANTE SANS FIL IMPRIME LE MÊME DOCUMENT QUE LES AUTRES.        │
 * │                                                                          │
 * │ Elle recevait du TEXTE de 32 colonnes : pas de bandeau en vidéo          │
 * │ inversée, pas de hiérarchie de police, accents retirés, articles mis en  │
 * │ page autrement. Chez un marchand qui a les deux machines, la même vente  │
 * │ sortait sur deux papiers différents - et c'est le client qui les         │
 * │ compare, un ticket dans chaque main.                                      │
 * │                                                                          │
 * │ Elle reçoit désormais la page rastérisée, celle du PDF et de             │
 * │ l'imprimante intégrée. Le texte reste, et seulement pour deux cas :      │
 * │ le rastériseur absent (un appareil sans le module natif) et le mode de   │
 * │ secours que le marchand pose lui-même sur une machine trop ancienne.     │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
async function octetsDuTicket(
  blocks: Block[],
  contexte: ContexteImpression,
  cut: boolean,
  texteSimple?: boolean
): Promise<Uint8Array> {
  if (!texteSimple) {
    const raster = await rasterDuTicket(blocks, contexte.paperWidth);
    if (raster) {
      return rendreEscPosImage(raster, { paperWidth: contexte.paperWidth, cut });
    }
  }
  return rendreEscPos(rendreTexte(blocks, { paperWidth: contexte.paperWidth }), {
    paperWidth: contexte.paperWidth,
    cut,
  });
}

export const piloteBluetooth: PiloteImpression = {
  id: "bluetooth",
  action: "Imprimer le reçu",

  /**
   * ⚠ SILENCIEUSE, ET APPELÉE À CHAQUE TICKET. Aucune boîte de dialogue ne
   * s'ouvre ici : une invite de permission surgirait au moment d'encaisser,
   * devant un client. Faux fait descendre la cascade au PDF tout de suite,
   * plutôt que de payer une `SecurityException` par ticket.
   */
  async disponible() {
    try {
      const reglage = await lireReglage();
      if (reglage.transport !== "bluetooth" || !reglage.adresse) return false;
      if (!(await permissionsAccordees())) return false;
      return await radioAllumee(reglage.lien ?? "spp");
    } catch {
      return false;
    }
  },

  async imprimer(blocks: Block[], contexte: ContexteImpression) {
    const reglage = await lireReglage();
    if (!reglage.adresse) {
      throw new ErreurImpression("aucune_imprimante", "Aucune imprimante Bluetooth choisie.");
    }
    if (!(await permissionsAccordees())) {
      throw new ErreurImpression(
        "permission",
        "Android n'autorise pas encore le Bluetooth. Ouvrez Imprimante pour l'accorder."
      );
    }

    const octets = await octetsDuTicket(blocks, contexte, reglage.cut, reglage.texteSimple);

    // Le lien a été relevé quand le marchand a choisi sa machine : on ne le
    // devine pas, et c'est tout l'objet de la fusion des deux options.
    if ((reglage.lien ?? "spp") === "gatt") await gatt.envoyer(reglage.adresse, octets);
    else await spp.envoyer(reglage.adresse, octets);
  },
};
