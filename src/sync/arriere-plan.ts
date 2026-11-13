/**
 * La poussée du journal en ARRIÈRE-PLAN, application fermée (lot L14).
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE MODULE EST CHARGÉ PAR `index.js`, AVANT L'APPLICATION.               │
 * │                                                                          │
 * │ `TaskManager.defineTask` DOIT être appelé dans la portée globale du      │
 * │ paquet JavaScript : quand le système réveille l'application pour la      │
 * │ tâche, il n'y a ni écran, ni routeur, ni fournisseur de session - rien   │
 * │ que ce qui s'exécute au chargement. Défini dans un composant, la tâche   │
 * │ n'existerait pas au réveil, et le système la retirerait sans un mot.     │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ POUSSÉE SEULE, sans relecture (`relire: false`) et sans tirage : la
 *   décision est dans `decision-poussee.ts`, pur et testé ; ici, on ne fait que
 *   lire l'état, puis envoyer sous le MÊME verrou que le premier plan - deux
 *   cycles concurrents enverraient deux fois le même lot.
 *
 * ⚠ NI L'ORGANISATION NI LE GESTIONNAIRE DE SESSION PERDUE ne sont posés au
 *   réveil : c'est le fournisseur de session qui les pose, et il n'est pas
 *   monté. L'organisation est donc posée ici, depuis l'instantané.
 */
import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";

import { setOrganizationId } from "@/api/client";
import { connection } from "@/db/client";
import { lireEstampille } from "@/session/estampille";
import { readSnapshot, readTokens } from "@/session/storage";
import type { SessionSnapshot } from "@/session/types";
import migrations from "../../drizzle/migrations";

import { doitPousser, type EtatPourPoussee } from "./decision-poussee";
import { readyToSend } from "./outbox";
import { pushAll } from "./push";
import { avecVerrou } from "./verrou";

export const TACHE_POUSSEE = "vf-poussee";

/** Au mieux toutes les quinze minutes : c'est le plancher du système. */
const INTERVALLE_MINUTES = 15;

/**
 * Le schéma local est-il celui que ce paquet attend ?
 *
 * Les migrations ne tournent qu'au montage de l'interface (`db/provider`).
 * Une application mise à jour puis jamais rouverte porte encore l'ancien
 * schéma : y écrire lèverait au milieu d'un envoi.
 */
async function schemaAJour(): Promise<boolean> {
  try {
    const ligne = await connection.getFirstAsync<{ n: number }>(
      "select count(*) as n from __drizzle_migrations"
    );
    return Number(ligne?.n ?? 0) >= migrations.journal.entries.length;
  } catch {
    // Table absente : la base n'a jamais été migrée.
    return false;
  }
}

async function jetonsLisibles(): Promise<boolean> {
  try {
    return (await readTokens()) !== null;
  } catch {
    // Trousseau fermé, appareil verrouillé : on ne devine rien.
    return false;
  }
}

/** Tout ce que la décision doit savoir, lu sans jamais lever. */
export async function lireEtatPourPoussee(): Promise<EtatPourPoussee> {
  const schema = await schemaAJour();
  // ⚠ Sur un schéma en retard on n'interroge PAS le journal : la requête
  //   elle-même pourrait viser une colonne qui n'existe pas encore.
  if (!schema) {
    return { schemaAJour: false, jetonsLisibles: false, session: null, estampille: null, pretes: 0 };
  }
  const [jetons, instantane, estampille] = await Promise.all([
    jetonsLisibles(),
    readSnapshot<SessionSnapshot>().catch(() => null),
    lireEstampille().catch(() => null),
  ]);
  const pretes = (await readyToSend(1).catch(() => [])).length;
  return {
    schemaAJour: true,
    jetonsLisibles: jetons,
    session: instantane
      ? {
          userId: instantane.user.id,
          organizationId: instantane.organization.id,
          deviceId: instantane.device?.id ?? null,
        }
      : null,
    estampille: estampille
      ? { userId: estampille.userId, organizationId: estampille.organizationId }
      : null,
    pretes,
  };
}

/**
 * Le corps de la tâche. Exporté pour le test : la tâche elle-même ne se
 * déclenche que sur un appareil.
 */
export async function executerPoussee(): Promise<BackgroundTask.BackgroundTaskResult> {
  try {
    const decision = doitPousser(await lireEtatPourPoussee());
    if (!decision.pousser) return BackgroundTask.BackgroundTaskResult.Success;
    setOrganizationId(decision.organizationId);
    // `null` : un cycle tenait déjà le verrou (le premier plan est actif).
    // Ce n'est pas un échec - il est en train de faire ce travail.
    await avecVerrou(() => pushAll(decision.deviceId ?? undefined, { relire: false }));
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    // Panne réseau, serveur en défaut : le journal reste intact, et le
    // premier plan, ou le réveil suivant, reprendra.
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
}

TaskManager.defineTask(TACHE_POUSSEE, executerPoussee);

/**
 * Inscrit la tâche. Appelée quand la session est prête ; sans effet si elle
 * l'est déjà. Un échec ne bloque rien : le premier plan pousse de toute façon.
 */
export async function inscrireTachePoussee(): Promise<void> {
  try {
    const statut = await BackgroundTask.getStatusAsync();
    if (statut !== BackgroundTask.BackgroundTaskStatus.Available) return;
    if (await TaskManager.isTaskRegisteredAsync(TACHE_POUSSEE)) return;
    await BackgroundTask.registerTaskAsync(TACHE_POUSSEE, {
      minimumInterval: INTERVALLE_MINUTES,
    });
  } catch {
    // Arrière-plan refusé par le système : rien à faire, et rien à dire.
  }
}

/** Retire la tâche à la déconnexion : un terminal sans session n'a rien à envoyer. */
export async function retirerTachePoussee(): Promise<void> {
  try {
    if (await TaskManager.isTaskRegisteredAsync(TACHE_POUSSEE)) {
      await BackgroundTask.unregisterTaskAsync(TACHE_POUSSEE);
    }
  } catch {
    // Déjà retirée.
  }
}
