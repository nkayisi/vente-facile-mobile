/**
 * Les notifications reçues, et les alertes du périmètre.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ELLES EXIGENT LE RÉSEAU, ET C'EST DÉLIBÉRÉ.                            │
 * │                                                                          │
 * │ `notifications` et `alerts` ne sont PAS au manifeste de tirage, et n'ont │
 * │ rien à y faire : une alerte est un FAIT CONSTATÉ PAR LE SERVEUR, à       │
 * │ l'instant où il le constate. Descendue puis relue hors ligne, elle       │
 * │ annoncerait une rupture déjà réapprovisionnée, ou tairait celle de ce    │
 * │ matin - et le marchand ne saurait pas laquelle croire. Ce qui doit       │
 * │ marcher hors ligne, c'est vendre et encaisser.                           │
 * │                                                                          │
 * │ L'écran le DIT quand il n'y a pas de réseau, plutôt que d'afficher une   │
 * │ liste vide qui se lirait « rien à signaler ».                            │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import { api } from "@/api/client";

export interface NotificationRecue {
  id: string;
  genre: "info" | "success" | "warning" | "error" | "alert";
  titre: string;
  message: string;
  /** Là où l'on va pour agir. Vide quand il n'y a rien à ouvrir. */
  destination: string;
  libelleAction: string;
  lue: boolean;
  le: string;
  /** L'alerte dont elle vient, quand elle en vient d'une. */
  alerteId: string | null;
}

interface Enveloppe<T> {
  count: number;
  results: T[];
}

interface NotificationApi {
  id: string;
  notification_type: NotificationRecue["genre"];
  title: string;
  message: string;
  action_url: string;
  action_label: string;
  is_read: boolean;
  created_at: string;
  data: Record<string, unknown> | null;
}

function lire(n: NotificationApi): NotificationRecue {
  return {
    id: n.id,
    genre: n.notification_type,
    titre: n.title,
    message: n.message,
    destination: n.action_url ?? "",
    libelleAction: n.action_label ?? "",
    lue: Boolean(n.is_read),
    le: n.created_at,
    alerteId: (n.data?.alert_id as string) ?? null,
  };
}

export async function chargerNotifications(
  opts: { nonLues?: boolean } = {}
): Promise<{ total: number; elements: NotificationRecue[] }> {
  const params = new URLSearchParams({ page_size: "50" });
  if (opts.nonLues) params.set("is_read", "false");
  const d = await api.get<Enveloppe<NotificationApi>>(
    `/notifications/?${params.toString()}`
  );
  return { total: d.count, elements: (d.results ?? []).map(lire) };
}

/** Le décompte de la pastille. Une requête, un nombre. */
export async function compterNonLues(): Promise<number> {
  const d = await api.get<{ count: number }>("/notifications/unread-count/");
  return Number(d.count ?? 0);
}

export async function marquerLue(id: string): Promise<void> {
  await api.post(`/notifications/${id}/mark-read/`, {});
}

export async function marquerToutLu(): Promise<number> {
  const d = await api.post<{ updated: number }>(
    "/notifications/mark-all-read/",
    {}
  );
  return Number(d.updated ?? 0);
}
