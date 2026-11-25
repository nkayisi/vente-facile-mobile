/**
 * Le logo de l'établissement, demandé au SERVEUR déjà prêt à imprimer.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE TERMINAL NE TÉLÉCHARGE PLUS LE FICHIER DU LOGO.                      │
 * │                                                                          │
 * │ Il le téléchargeait depuis son URL, devinait son format par l'EXTENSION  │
 * │ (PNG et JPEG seulement), le mesurait, puis jetait le fichier. Chaque     │
 * │ étape pouvait échouer en silence, et le logo de la plateforme, imprimé à │
 * │ la place, masquait l'échec : un logo envoyé ne sortait jamais.           │
 * │ `GET /organizations/{id}/receipt-logo/` rend l'image réduite, en PNG sur │
 * │ fond blanc, avec ses dimensions : il n'y a plus rien à deviner.          │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ IL N'Y A PLUS DE LOGO DE REPLI (2026-11-25) : un établissement sans logo
 * imprime sans logo.
 */
import type { LoadedLogo } from "@vente-facile/core/receipt";

import { api } from "@/api/client";
import { API_BASE_URL } from "@/api/config";

/** Ce que rend `receipt-logo/`. `path: null` = pas de logo à imprimer. */
export interface ReponseLogo {
  path: string | null;
  data_url?: string;
  format?: string;
  width?: number;
  height?: number;
}

/**
 * Le `LoadedLogo` d'une réponse, ou `null`.
 *
 * Une réponse incomplète vaut « pas de logo » : on n'invente ni un format, ni
 * une proportion, qui ferait sortir le logo écrasé ou débordant.
 */
export function logoDeLaReponse(reponse: ReponseLogo | null | undefined): LoadedLogo | null {
  if (!reponse?.path || !reponse.data_url) return null;
  if (!reponse.data_url.startsWith("data:image/png;base64,")) return null;
  const { width, height } = reponse;
  if (!width || !height || width <= 0 || height <= 0) return null;
  return { dataUrl: reponse.data_url, format: "PNG", aspectRatio: width / height };
}

/**
 * Le logo prêt à imprimer.
 *
 * ⚠ UN ÉCHEC RÉSEAU LÈVE, une absence de logo rend `null` : l'appelant ne
 * retient comme « chargé » que ce que le serveur a vraiment dit, et réessaie
 * le reste.
 */
export async function chargerLogo(organisationId: string): Promise<LoadedLogo | null> {
  const reponse = await api.get<ReponseLogo>(`/organizations/${organisationId}/receipt-logo/`);
  return logoDeLaReponse(reponse);
}

/**
 * L'URL absolue d'un chemin de logo, pour l'AFFICHER (aperçu des paramètres).
 *
 * La charge utile de session porte un chemin RELATIF : le préfixer est
 * nécessaire, pas défensif. Elle ne sert plus jamais à imprimer.
 */
export function urlDuLogo(chemin: string | null | undefined): string | undefined {
  if (!chemin) return undefined;
  if (chemin.startsWith("http://") || chemin.startsWith("https://")) return chemin;
  const racine = API_BASE_URL.replace(/\/api\/v1\/?$/, "");
  return `${racine}${chemin.startsWith("/") ? "" : "/"}${chemin}`;
}
