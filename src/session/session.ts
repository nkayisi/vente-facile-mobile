/**
 * Opérations de session.
 *
 * Séparées du fournisseur React : elles sont testables sans arbre de rendu, et
 * c'est là que vivent les règles qui ne doivent jamais être enfreintes.
 */
import * as Application from "expo-application";
import * as Device from "expo-device";
import { Platform } from "react-native";

import { api, request, setOrganizationId } from "@/api/client";
import { ApiError } from "@/api/errors";
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
    app_version: Application.nativeApplicationVersion ?? "",
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

/**
 * Rafraîchit l'identité mise en cache, sans bloquer.
 *
 * Appelée en tâche de fond quand le réseau revient. Un échec ne change RIEN :
 * l'instantané précédent reste valable, c'est tout l'intérêt du cache.
 */
export async function refreshSnapshot(): Promise<SessionSnapshot | null> {
  const previous = await readSnapshot<SessionSnapshot>();
  if (!previous) return null;

  const deviceToken = await readDeviceToken();
  if (!deviceToken) return previous;

  try {
    setOrganizationId(previous.organization.id);
    const data = await api.post<SessionResponse>("/auth/devices/session/", {
      device_token: deviceToken,
    });
    const snapshot = toSnapshot(data);
    await writeSnapshot(snapshot);
    return snapshot;
  } catch {
    return previous;
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
