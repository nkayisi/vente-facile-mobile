/**
 * Lecture de l'échéance d'un JWT.
 *
 * Sans dépendance et sans `atob` : Hermes, le moteur de React Native, ne le
 * fournit pas. TypeScript l'accepte pourtant, parce que les types du DOM sont
 * chargés, si bien que l'appel compile et échoue seulement sur l'appareil, dans
 * un `catch` qui le rend muet. On aurait alors perdu le rafraîchissement
 * anticipé sans que rien ne le signale, et chaque expiration se serait payée
 * d'un aller-retour en 401.
 */

const ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Décode du base64url en chaîne UTF-8. */
export function decodeBase64Url(input: string): string {
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);

  const bytes: number[] = [];
  for (let i = 0; i < padded.length; i += 4) {
    const chunk = [0, 1, 2, 3].map((k) => ALPHABET.indexOf(padded[i + k] ?? "="));
    const value =
      (Math.max(chunk[0]!, 0) << 18) |
      (Math.max(chunk[1]!, 0) << 12) |
      (Math.max(chunk[2]!, 0) << 6) |
      Math.max(chunk[3]!, 0);

    bytes.push((value >> 16) & 0xff);
    if (chunk[2]! >= 0) bytes.push((value >> 8) & 0xff);
    if (chunk[3]! >= 0) bytes.push(value & 0xff);
  }

  // Passage par le pourcentage-encodage : c'est ce qui rend les accents
  // corrects sans `TextDecoder`, dont la présence n'est pas plus garantie.
  return decodeURIComponent(
    bytes.map((b) => `%${b.toString(16).padStart(2, "0")}`).join("")
  );
}

/** Échéance d'un JWT en millisecondes, ou `null` si elle est illisible. */
export function tokenExpiry(jwt: string): number | null {
  try {
    const payload = jwt.split(".")[1];
    if (!payload) return null;
    const exp = (JSON.parse(decodeBase64Url(payload)) as { exp?: number }).exp;
    return typeof exp === "number" ? exp * 1000 : null;
  } catch {
    return null;
  }
}
