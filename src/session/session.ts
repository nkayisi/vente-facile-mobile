/**
 * Opérations de session.
 *
 * Séparées du fournisseur React : elles sont testables sans arbre de rendu, et
 * c'est là que vivent les règles qui ne doivent jamais être enfreintes.
 */
import * as Device from "expo-device";
import { Platform } from "react-native";

import { api, request, setOrganizationId } from "@/api/client";
import { ApiError } from "@/api/errors";
import { versionInstallee } from "@/features/mise-a-jour/version-installee";
import {
  clearSession,
  clearTokens,
  readDeviceToken,
  readSnapshot,
  writeDeviceToken,
  writeSnapshot,
  writeTokens,
} from "./storage";
import type { SessionResponse, SessionSnapshot } from "./types";

export interface OrganizationChoice {
  id: string;
  name: string;
  role: string;
  role_display: string;
}

/**
 * Connexion par mot de passe.
 *
 * Ne choisit PAS l'organisation : elle rend la liste, et l'écran demande. Une
 * seule organisation se sélectionne d'office ; au-delà, l'ancienne application
 * prenait `orgs[0]` en silence, si bien qu'un gérant de deux boutiques
 * encaissait dans la mauvaise sans jamais l'apprendre.
 */
export async function loginWithPassword(
  email: string,
  password: string
): Promise<{ organizations: OrganizationChoice[] }> {
  const data = await request<{
    access: string;
    refresh: string;
    user: { organizations?: OrganizationChoice[] };
  }>("/auth/login/", {
    method: "POST",
    body: { email, password },
    auth: false,
    org: false,
  });

  await writeTokens({ access: data.access, refresh: data.refresh });
  return { organizations: data.user.organizations ?? [] };
}

/** Description du terminal, telle qu'elle apparaîtra dans la liste du gérant. */
function describeDevice(): {
  name: string;
  platform: "android" | "ios";
  model: string;
  os_version: string;
  app_version: string;
} {
  const model = Device.modelName ?? "Terminal";
  return {
    name: model,
    platform: Platform.OS === "ios" ? "ios" : "android",
    model,
    os_version: Device.osVersion ?? "",
    app_version: versionInstallee() ?? "",
  };
}

function toSnapshot(data: SessionResponse): SessionSnapshot {
  return {
    user: data.user,
    organization: data.organization,
    membership: data.membership,
    settings: data.settings,
    currencies: data.currencies,
    loyalty_program: data.loyalty_program,
    device: data.device,
    // `?? null` et non l'omission : un serveur antérieur ne l'envoie pas, et
    // la distinction « absent » / « nul » n'a aucun sens ici - les deux se
    // lisent « pas de verdict », donc porte ouverte (`jugerAcces`, règle 1).
    subscription: data.subscription ?? null,
    // Même forme que `subscription`, et pour la même raison : « absent » et
    // « nul » se lisent tous deux « aucune exigence », donc porte ouverte
    // (`jugerMiseAJour`, règles 1 et 2). Les distinguer n'aurait aucun sens.
    app_update: data.app_update ?? null,
    // ⚠ ICI, `undefined` ET `null` NE SE VALENT PAS, contrairement à
    // `subscription` juste au-dessus. Un serveur antérieur n'envoie pas la clé :
    // la laisser `undefined` fait dire « roster inconnu », donc verrouille le
    // filtre avec son motif. La forcer à `null` reviendrait à affirmer que
    // l'organisation n'a personne.
    team: data.team,
    fetched_at: data.server_time ?? new Date().toISOString(),
  };
}

/**
 * Enrôle le terminal dans une organisation et met la session en cache.
 *
 * Un seul aller-retour : jetons, identité, permissions, devises, fidélité. La
 * connexion qui vient de s'établir peut repartir, et ce qui manquerait ici
 * manquerait pour la journée.
 */
export async function enrollDevice(
  organizationId: string
): Promise<SessionSnapshot> {
  setOrganizationId(organizationId);

  const data = await api.post<SessionResponse>(
    "/auth/devices/enroll/",
    describeDevice()
  );

  await writeTokens({ access: data.access, refresh: data.refresh });
  if (data.device_token) {
    // Le jeton brut ne réapparaîtra jamais : on le range AVANT de traiter le
    // reste de la réponse.
    await writeDeviceToken(data.device_token);
  }

  const snapshot = toSnapshot(data);
  await writeSnapshot(snapshot);
  return snapshot;
}

/** Types d'établissement, exactement ceux de l'assistant web. */
export type TypeEtablissement =
  | "boutique" | "supermarket" | "pharmacy" | "depot" | "restaurant" | "other";

export interface SaisieCompte {
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  password: string;
  password_confirm: string;
}

export interface SaisieEtablissement {
  organization_name: string;
  organization_phone: string;
  business_type: TypeEtablissement;
  currency: string;
  country: string;
}

/** À quelle étape l'inscription a échoué. Ce n'est pas la même conséquence. */
export type EtapeInscription = "creation" | "enrolement";

export class EchecInscription extends Error {
  constructor(
    readonly etape: EtapeInscription,
    readonly cause: unknown,
    /** Renseigné quand l'établissement EXISTE déjà côté serveur. */
    readonly organizationId?: string
  ) {
    super(etape === "creation" ? "Création impossible" : "Enrôlement impossible");
    this.name = "EchecInscription";
  }
}

/**
 * Crée le compte, l'établissement, PUIS enrôle le terminal.
 *
 * **LES DEUX APPELS SONT ENCHAÎNÉS ICI, et c'est délibéré.** Les laisser à deux
 * écrans exposerait au pire cas : l'application fermée entre les deux, on
 * revient avec des JWT mais sans appareil, et le démarrage du fournisseur de
 * session renvoie à `anonymous` puisqu'il exige un instantané. L'utilisateur
 * aurait payé une inscription pour se retrouver devant l'écran de connexion.
 *
 * `Device.organization` est une clé étrangère non nulle et `/devices/enroll/`
 * exige l'en-tête `X-Organization-ID` : l'enrôlement ne PEUT pas précéder la
 * création. L'ordre n'est donc pas un choix.
 *
 * Si le second appel échoue, **on ne perd rien** : les jetons sont écrits et
 * l'établissement existe. L'erreur porte son identifiant pour que l'écran
 * propose de reprendre à l'enrôlement, sans recréer une seconde boutique.
 */
export async function registerAndEnroll(
  compte: SaisieCompte,
  etablissement: SaisieEtablissement
): Promise<SessionSnapshot> {
  let organizationId: string;
  try {
    const data = await request<{
      access: string;
      refresh: string;
      organization: { id: string; name: string; slug: string };
    }>("/auth/register-with-organization/", {
      method: "POST",
      body: { ...compte, ...etablissement },
      auth: false,
      org: false,
    });
    await writeTokens({ access: data.access, refresh: data.refresh });
    organizationId = data.organization.id;
  } catch (error) {
    throw new EchecInscription("creation", error);
  }

  try {
    return await enrollDevice(organizationId);
  } catch (error) {
    throw new EchecInscription("enrolement", error, organizationId);
  }
}

/**
 * Ce qu'une relecture d'identité rapporte.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA FRAÎCHEUR SE DIT, ELLE NE SE DEVINE PAS.                             │
 * │                                                                          │
 * │ Rendre le seul instantané ne distinguait pas « le serveur a répondu et   │
 * │ rien n'a changé » de « le serveur n'a pas répondu du tout ». Or c'est    │
 * │ exactement ce qu'un marchand enfermé a besoin de savoir : un             │
 * │ administrateur vient peut-être de vider le seuil qui le bloque, et le    │
 * │ bouton « Vérifier à nouveau » est la main qui lève la porte. Derrière un │
 * │ portail captif, il ne levait rien et ne disait rien.                     │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export interface RelectureSession {
  /** L'instantané à retenir : le frais, ou celui d'avant. */
  snapshot: SessionSnapshot | null;
  /** Le serveur a-t-il répondu ? `false` = rien n'a bougé. */
  frais: boolean;
}

/**
 * Rafraîchit l'identité mise en cache, sans bloquer.
 *
 * Appelée en tâche de fond quand le réseau revient. Un échec ne CHANGE rien -
 * l'instantané précédent reste valable, c'est tout l'intérêt du cache - mais il
 * se RAPPORTE, par `frais: false`.
 *
 * ⚠ **Elle ne lève jamais.** C'est délibéré : ouvrir l'application sans réseau ne
 * doit pas enfermer dehors, et un appelant qui oublierait un `catch` ne doit pas
 * casser un démarrage à froid. Le prix de cette garantie est précisément que
 * l'échec doit se lire dans la valeur rendue.
 */
/**
 * Ce que le réveil dit de la notification poussée, s'il a quelque chose à dire.
 *
 * ⚠ ELLE NE DEMANDE RIEN et ne lève jamais : `etatPush` lit l'autorisation sans
 * ouvrir d'invite, et un module natif absent ne doit pas empêcher un terminal
 * de réveiller sa session. C'est le réveil qui compte ici, pas le rappel.
 */
async function champsPush(): Promise<Record<string, unknown>> {
  try {
    const { etatPush } = await import("@/notifications/jeton-push");
    const etat = await etatPush();
    if (etat.etat === "accorde") return { push_token: etat.jeton };
    if (etat.etat === "refuse" || etat.etat === "refuse_definitivement") {
      return { push_refused: true };
    }
    return {};
  } catch {
    return {};
  }
}

export async function refreshSnapshot(): Promise<RelectureSession> {
  const previous = await readSnapshot<SessionSnapshot>();
  // Aucune session en cache : il n'y a rien à rafraîchir, et rien n'a échoué.
  if (!previous) return { snapshot: null, frais: false };

  const deviceToken = await readDeviceToken();
  if (!deviceToken) return { snapshot: previous, frais: false };

  try {
    setOrganizationId(previous.organization.id);
    const data = await api.post<SessionResponse>("/auth/devices/session/", {
      device_token: deviceToken,
      // ⚠ L'ADRESSE DE NOTIFICATION VOYAGE AVEC LE RÉVEIL, et pas sur un
      // endpoint à elle. Expo la renouvelle sans prévenir - réinstallation,
      // restauration, mise à jour du système - et c'est le seul chemin qu'un
      // terminal emprunte à coup sûr, à chaque démarrage et à chaque retour au
      // premier plan. Un endpoint appelé une seule fois laisserait les envois
      // partir dans le vide pendant des semaines sans que rien ne le signale.
      ...(await champsPush()),
    });
    const snapshot = toSnapshot(data);
    await writeSnapshot(snapshot);
    return { snapshot, frais: true };
  } catch {
    return { snapshot: previous, frais: false };
  }
}

/**
 * Se déconnecte.
 *
 * **N'efface pas la base locale.** L'ancienne application appelait
 * `resetDatabase()` en se déconnectant, ce qui détruisait les ventes non
 * synchronisées d'un caissier qui voulait simplement changer de compte.
 */
export async function logout(): Promise<void> {
  try {
    await api.post("/auth/logout/", {});
  } catch {
    // Une déconnexion doit aboutir même hors ligne.
  }
  await clearSession();
  setOrganizationId(null);
}

/**
 * Abandonne les jetons sans toucher au reste.
 *
 * Utilisée quand le serveur a refusé l'identité : l'utilisateur devra retaper
 * son mot de passe, mais il retrouvera ses données et ses opérations en attente.
 */
export async function dropTokensOnly(): Promise<void> {
  await clearTokens();
}

export function isAuthFailure(error: unknown): boolean {
  return error instanceof ApiError && error.kind === "auth";
}
