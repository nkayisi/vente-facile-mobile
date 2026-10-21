/**
 * Le logo de l'établissement, chargé en dataURL pour le modèle de document.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE SOCLE ÉTAIT LÀ, LE CHARGEUR MANQUAIT - ET LA DOCSTRING DU PAQUET     │
 * │ PARTAGÉ RÉFÉRENÇAIT CE FICHIER SANS QU'IL EXISTE.                       │
 * │                                                                          │
 * │ `core/receipt/identity.ts` émet déjà un bloc `logo`, `render-html.ts` le │
 * │ rend, `logoMaxHeight` suit la largeur du papier, et le BACK-OFFICE       │
 * │ imprime son logo depuis longtemps (`lib/receipt/identity.ts::loadLogo`,  │
 * │ appelé par `use-receipt-chrome`). Seul le terminal n'en avait pas, si    │
 * │ bien que le même ticket sortait avec logo au bureau et sans au comptoir. │
 * │ C'est T16 du retour de test.                                             │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ VOLONTAIREMENT TOLÉRANT. Un logo injoignable, une URL expirée, un fichier
 * trop gros ou un format inconnu ne doit JAMAIS empêcher d'imprimer un reçu :
 * on rend `null` et le bloc disparaît. C'est la même règle que côté web, et
 * c'est la seule tenable - le papier du client ne se négocie pas.
 *
 * ⚠ AUCUN APLATISSEMENT SUR FOND BLANC, contrairement au web. Le web dessine
 * dans un `canvas` et doit y poser le blanc lui-même, faute de quoi un PNG
 * transparent vire au noir et sort en pavé d'encre. Ici le logo est rendu par
 * une WebView, dont la page EST blanche : la transparence est composée par le
 * moteur, et le même bitmap part ensuite sur les trois transports.
 */
import { Directory, File, Paths } from "expo-file-system";
import { Image } from "react-native";

import type { LoadedLogo } from "@vente-facile/core/receipt";

import { API_BASE_URL } from "@/api/config";

/**
 * Plafond de taille, en octets.
 *
 * Un logo voyage ensuite en dataURL dans le HTML du document, donc en mémoire
 * et dans la page rastérisée. Un fichier de plusieurs mégaoctets ferait gonfler
 * chaque ticket pour une image rendue sur douze millimètres de haut.
 */
const TAILLE_MAX = 2 * 1024 * 1024;

/** Les deux formats que le modèle de document déclare, et eux seuls. */
const FORMATS: Record<string, "PNG" | "JPEG"> = {
  png: "PNG",
  jpg: "JPEG",
  jpeg: "JPEG",
};

/**
 * L'URL absolue du logo, miroir de `getMediaUrl` du back-office.
 *
 * Le serializer rend un chemin RELATIF quand il n'a pas de requête en contexte,
 * et c'est le cas de la charge utile de session : la préfixer est donc
 * nécessaire, pas défensif.
 */
export function urlDuLogo(chemin: string | null | undefined): string | undefined {
  if (!chemin) return undefined;
  if (chemin.startsWith("http://") || chemin.startsWith("https://")) return chemin;
  const racine = API_BASE_URL.replace(/\/api\/v1\/?$/, "");
  return `${racine}${chemin.startsWith("/") ? "" : "/"}${chemin}`;
}

/** Le dossier de cache des logos. Un seul fichier par établissement. */
function dossier(): Directory {
  const d = new Directory(Paths.cache, "logos");
  if (!d.exists) d.create({ intermediates: true });
  return d;
}

export async function chargerLogo(
  chemin: string | null | undefined
): Promise<LoadedLogo | null> {
  const url = urlDuLogo(chemin);
  if (!url) return null;

  const extension = (url.split("?")[0].split(".").pop() ?? "").toLowerCase();
  const format = FORMATS[extension];
  // Un format inconnu n'est pas une erreur : on ne devine pas le type d'une
  // image, et le modèle de document n'en déclare que deux.
  if (!format) return null;

  let fichier: File | null = null;
  try {
    // ⚠ Le CACHE, pas le dossier de documents : un logo se retélécharge, et il
    // n'a aucune valeur probante. Le réimprimer un reçu hors ligne le fera
    // simplement sortir sans logo, ce qui est le repli prévu.
    fichier = await File.downloadFileAsync(url, dossier());

    if (!fichier.exists || (fichier.size ?? 0) === 0) return null;
    if ((fichier.size ?? 0) > TAILLE_MAX) return null;

    // ⚠ ON MESURE LE FICHIER LOCAL, PAS L'URL DISTANTE. `Image.getSize` fait
    //   sa PROPRE requête réseau : lui passer `url` retéléchargeait les mêmes
    //   octets que `downloadFileAsync` venait d'écrire, donc un logo de deux
    //   mégaoctets - le plafond `TAILLE_MAX` - coûtait quatre mégaoctets par
    //   démarrage à froid, sur les liens 2G que ce produit vise, avant le
    //   premier ticket. `fichier.uri` est un `file://`, que le moteur d'images
    //   lit sans réseau.
    const [base64, proportion] = await Promise.all([
      fichier.base64(),
      proportionDe(fichier.uri),
    ]);
    if (!base64 || !proportion) return null;

    return {
      dataUrl: `data:image/${format === "PNG" ? "png" : "jpeg"};base64,${base64}`,
      format,
      aspectRatio: proportion,
    };
  } catch {
    return null;
  } finally {
    // Le fichier a servi : son contenu vit maintenant dans la dataURL. Le
    // garder doublerait l'occupation pour rien, et un logo change rarement
    // assez souvent pour qu'un cache disque soit utile.
    //
    // ⚠ ON NE GARDE DÉLIBÉRÉMENT PAS DE CACHE DISQUE, et le motif compte : un
    //   logo changé au back-office ressortirait sur le papier d'un client sous
    //   son ancienne forme, et une invalidation fiable demanderait une clé que
    //   le serveur ne fournit pas (le chemin ne porte ni empreinte ni version).
    //   Un téléchargement par démarrage à froid est le minimum honnête pour
    //   une image distante - et `use-logo-etablissement` mémorise déjà par
    //   session, donc il n'y en a qu'UN par lancement.
    try {
      fichier?.delete();
    } catch {
      // Un cache qu'on ne sait pas nettoyer n'empêche pas d'imprimer.
    }
  }
}

/**
 * Le rapport largeur / hauteur, mesuré par le moteur d'images.
 *
 * ⚠ IL EST INDISPENSABLE, et pas seulement esthétique : `render-html` borne la
 * hauteur du logo à `logoMaxHeight` ET à `contentWidth / aspectRatio`. Un
 * rapport faux ferait sortir un logo écrasé ou débordant de la bande imprimée.
 *
 * ⚠ ON LUI PASSE UN `file://`, JAMAIS L'URL DISTANTE : `Image.getSize` fait sa
 * propre requête, et la mesure doublait donc le transfert de chaque logo.
 */
function proportionDe(uri: string): Promise<number | null> {
  return new Promise((resolve) => {
    Image.getSize(
      uri,
      (largeur, hauteur) =>
        resolve(largeur > 0 && hauteur > 0 ? largeur / hauteur : null),
      () => resolve(null)
    );
  });
}
