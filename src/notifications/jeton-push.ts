/**
 * L'adresse de notification de CE terminal.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ON NE DEMANDE PAS LA PERMISSION AU DÉMARRAGE.                           │
 * │                                                                          │
 * │ Une invite système au premier lancement arrive avant que le marchand ait │
 * │ compris ce que l'application fait : il refuse, et Android ne redemande   │
 * │ plus jamais - `requestPermissionsAsync` ne rouvre pas une invite         │
 * │ définitivement refusée. La demande part donc d'un GESTE, depuis les      │
 * │ réglages de l'appareil, quand le marchand sait ce qu'il accorde.         │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ LE JETON SE RENOUVELLE SANS PRÉVENIR - réinstallation, restauration, mise à
 * jour du système. On le relit donc à chaque réveil et on l'envoie au serveur
 * quand il a changé, sur le seul chemin qu'un terminal emprunte à coup sûr.
 */
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

/** Ce qu'on sait de l'autorisation, et ce qu'on peut en faire. */
export type EtatPush =
  /** Jamais demandé : un geste peut encore ouvrir l'invite. */
  | { etat: "a_demander" }
  /** Accordé, avec son adresse. */
  | { etat: "accorde"; jeton: string }
  /** Refusé, et redemandable (le marchand peut rouvrir l'invite). */
  | { etat: "refuse" }
  /**
   * Refusé DÉFINITIVEMENT : seul un détour par les réglages du système le
   * rouvre.
   *
   * ⚠ C'est le seul cas où un bouton « Autoriser » serait un mensonge :
   * l'invite ne s'ouvrira plus, et le marchand appuierait dans le vide.
   */
  | { etat: "refuse_definitivement" }
  /** L'appareil ne sait pas rendre de jeton (émulateur sans services Google). */
  | { etat: "indisponible"; motif: string };

/**
 * L'identifiant du projet Expo, sans lequel aucun jeton ne s'obtient.
 *
 * ⚠ IL EST LU DE LA CONFIGURATION, jamais écrit en dur : `app.config.ts` en est
 * la source, et un identifiant recopié ici dériverait le jour où le projet est
 * relié à un autre compte.
 */
function identifiantProjet(): string | null {
  return (
    Constants?.expoConfig?.extra?.eas?.projectId ??
    Constants?.easConfig?.projectId ??
    null
  );
}

/** L'état courant, SANS rien demander : aucune invite ne s'ouvre ici. */
export async function etatPush(): Promise<EtatPush> {
  const { status, canAskAgain } = await Notifications.getPermissionsAsync();

  if (status === "granted") {
    const jeton = await lireJeton();
    return jeton
      ? { etat: "accorde", jeton }
      : { etat: "indisponible", motif: "Cet appareil n'a pas rendu d'adresse." };
  }
  if (status === "undetermined") return { etat: "a_demander" };
  return canAskAgain ? { etat: "refuse" } : { etat: "refuse_definitivement" };
}

/** Demande la permission. À n'appeler que depuis un GESTE. */
export async function demanderPush(): Promise<EtatPush> {
  const { status, canAskAgain } = await Notifications.requestPermissionsAsync();
  if (status !== "granted") {
    return canAskAgain ? { etat: "refuse" } : { etat: "refuse_definitivement" };
  }
  const jeton = await lireJeton();
  return jeton
    ? { etat: "accorde", jeton }
    : { etat: "indisponible", motif: "Cet appareil n'a pas rendu d'adresse." };
}

async function lireJeton(): Promise<string | null> {
  const projectId = identifiantProjet();
  // ⚠ SANS IDENTIFIANT DE PROJET, AUCUN JETON. On rend `null` plutôt que de
  // laisser lever : le mécanisme est alors inerte, et rien ne casse - c'est
  // l'arbitrage déjà retenu pour `updates.url` et pour le DSN Sentry.
  if (!projectId) return null;
  try {
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    return data || null;
  } catch {
    // Un émulateur sans services Google, un appareil hors ligne au premier
    // lancement : on n'a pas d'adresse, et ce n'est pas une panne.
    return null;
  }
}

/**
 * Prépare le canal Android, sans lequel les notifications sont muettes.
 *
 * ⚠ ANDROID 8+ EXIGE UN CANAL. Sans lui, une notification arrive SANS SON et
 * sans vibration : elle se poserait silencieusement dans le volet, sur un
 * terminal posé sur un comptoir que personne ne regarde. Le nom du canal
 * (`alertes`) est celui que le serveur envoie dans `channelId`.
 */
export async function preparerCanal(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("alertes", {
    name: "Alertes",
    // ⚠ PAS `MAX` : une rupture de stock n'est pas un appel entrant. Une
    // notification qui s'impose en plein écran pendant un encaissement
    // couvrirait le montant que le caissier annonce à son client.
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 250],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
    showBadge: true,
  });
}
