/**
 * Téléchargement d'un document fabriqué par le SERVEUR.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE TERMINAL NE DESSINE PLUS SES RAPPORTS.                               │
 * │                                                                          │
 * │ Il décrivait un `RapportSpec` à partir des lignes qu'il avait à l'écran, │
 * │ puis `expo-print` en tirait un PDF. Deux conséquences : le fichier ne    │
 * │ portait que la PAGE affichée (vingt lignes, sous un en-tête qui          │
 * │ annonçait « 347 articles »), et le back-office, lui, produisait sa       │
 * │ propre mise en page. Un même rapport donnait deux documents.             │
 * │                                                                          │
 * │ Le serveur les rend désormais tous les trois, sur le périmètre entier,   │
 * │ avec le moteur qui produit déjà les exports Stock et Ventes du web.      │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * L'historique des ventes garde son propre avertissement plutôt qu'un rendu
 * local : il FUSIONNE les ventes encore dans le journal, que le serveur ne
 * connaît pas, et son document ne peut donc pas les porter. L'écran le DIT
 * avant le partage (voir `features/export/en-file.ts`) au lieu d'entretenir un
 * second moteur de mise en page pour un seul écran.
 */
import { nomDeFichier } from "@vente-facile/core/report";
import { Directory, File, FileMode, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

import { API_BASE_URL } from "@/api/config";
import { currentOrganizationId, ensureFreshTokens } from "@/api/client";
import { ApiError } from "@/api/errors";
import { classerEnTete } from "./sniff";

export type FormatExport = "pdf" | "xlsx" | "csv";

const EXTENSIONS: Record<FormatExport, string> = {
  pdf: "pdf",
  xlsx: "xlsx",
  csv: "csv",
};

const MIMES: Record<FormatExport, string> = {
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv",
};

/**
 * Le dossier des documents exportés.
 *
 * `Paths.document` et NON `Paths.cache` : le cache est effacé par le système
 * dès que le stockage se tend. Un marchand qui ferme la feuille de partage
 * sans choisir d'application doit pouvoir retrouver son fichier plus tard,
 * sinon « télécharger » ne veut rien dire.
 */
function dossier(): Directory {
  const cible = new Directory(Paths.document, "exports");
  if (!cible.exists) cible.create({ intermediates: true });
  return cible;
}

/**
 * Télécharge un document servi par l'API, puis l'offre au partage.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE FICHIER DESCEND DIRECTEMENT SUR LE DISQUE.                           │
 * │                                                                          │
 * │ `File.downloadFileAsync` écrit le flux tel quel : ni base64, ni chaîne   │
 * │ intermédiaire. Un classeur de plusieurs mégaoctets passé en base64 par   │
 * │ le pont JavaScript ferait tripler la mémoire pour rien.                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Le jeton est rafraîchi AVANT l'appel : `downloadFileAsync` court-circuite le
 * client HTTP, donc sa reprise sur 401 aussi. Sans cela, un export lancé après
 * une longue veille échouerait une fois sur deux.
 */
export async function telechargerDocument(
  chemin: string,
  parametres: Record<string, string | undefined>,
  format: FormatExport,
  nom: string
): Promise<void> {
  const query = new URLSearchParams({ export_format: format });
  for (const [cle, valeur] of Object.entries(parametres)) {
    if (valeur !== undefined && valeur !== null && valeur !== "") {
      query.set(cle, String(valeur));
    }
  }
  await telechargerEtPartager(`${chemin}?${query.toString()}`, format, nom);
}

/**
 * Le téléchargement lui-même, sans le vocabulaire des rapports.
 *
 * Extrait pour le MODÈLE d'import : `/products/import-template/` rend un
 * classeur et n'accepte aucun `export_format`. Lui en poser un marcherait -
 * DRF ignore un paramètre inconnu - mais écrirait dans l'URL une intention qui
 * n'existe pas, et le prochain lecteur chercherait le format que le serveur
 * n'offre pas.
 */
export async function telechargerEtPartager(
  cheminComplet: string,
  format: FormatExport,
  nom: string
): Promise<void> {
  const jetons = await ensureFreshTokens();

  const cible = new File(
    dossier(),
    `${nomDeFichier(nom) || "rapport"}.${EXTENSIONS[format]}`
  );
  // Un export porte le même nom que le précédent quand rien n'a changé : on
  // écrase, plutôt que d'empiler « rapport (3) » dans le dossier du marchand.
  if (cible.exists) cible.delete();

  let fichier: File;
  try {
    fichier = await File.downloadFileAsync(
      `${API_BASE_URL}${cheminComplet}`,
      cible,
      {
        headers: {
          Authorization: `Bearer ${jetons.access}`,
          "X-Organization-ID": currentOrganizationId() ?? "",
        },
      }
    );
  } catch {
    // Tout ce qui n'est pas une réponse du serveur est une panne de transport :
    // on ne suppose jamais que la session est morte sur cette voie.
    throw new ApiError("network", "Le serveur est injoignable.", {});
  }

  // ⚠ `downloadFileAsync` ne lève PAS sur un 4xx : il écrit le corps de
  // l'erreur dans le fichier. Sans ce contrôle, le marchand partagerait un
  // « PDF » de quarante octets contenant du JSON, illisible dans son lecteur.
  const nature = classerEnTete(premiersOctets(fichier));
  if (nature !== "document") {
    // ⚠ Le message se lit AVANT la suppression : `messageDe` ouvre le fichier,
    // et l'inverser ferait retomber tout refus sur le message générique - donc
    // perdre en silence la seule phrase qui dit ce qui a échoué.
    const message = messageDe(fichier, nature);
    fichier.delete();
    throw new ApiError("server", message, {});
  }

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(fichier.uri, {
      mimeType: MIMES[format],
      dialogTitle: nom,
    });
  }
}

/** Assez d'octets pour reconnaître un corps d'erreur, et pas un de plus. */
const OCTETS_RENIFLES = 512;

/**
 * Au-delà, on ne cherche plus à lire le corps d'un refus.
 *
 * Un message d'erreur JSON est petit par construction ; la borne empêche qu'un
 * corps volumineux force le chargement complet du fichier, ce qui reviendrait
 * au défaut qu'on ferme.
 */
const CORPS_LISIBLE_MAX = 64 * 1024;

/**
 * Les premiers octets, SANS charger le fichier.
 *
 * `textSync()` chargeait le fichier ENTIER pour en regarder deux cents octets -
 * le coût mémoire exact que `downloadFileAsync` a été choisi pour éviter, et
 * qu'un classeur de plusieurs mégaoctets payait à chaque export.
 *
 * Un échec rend un tableau vide, donc « document » : un contrôle qui n'aboutit
 * pas laisse passer. Bloquer un téléchargement légitime parce qu'on n'a pas su
 * le renifler serait pire que le défaut.
 */
function premiersOctets(fichier: File): Uint8Array {
  let poignee;
  try {
    poignee = fichier.open(FileMode.ReadOnly);
    return poignee.readBytes(OCTETS_RENIFLES);
  } catch {
    return new Uint8Array([]);
  } finally {
    poignee?.close();
  }
}

/**
 * Le message d'un refus, jamais une page.
 *
 * Un appel à une route inexistante fait rendre à Django sa page de débogage
 * complète ; l'afficher telle quelle remplirait le bandeau de deux écrans de
 * balises. La règle du dépôt vaut ici comme ailleurs - d'où le repli SANS
 * lecture dès que le corps est du HTML : il n'y a rien à en tirer, et il pèse
 * des centaines de kilooctets.
 */
function messageDe(fichier: File, nature: "json" | "html"): string {
  const repli = "Le document n'a pas pu être produit.";
  if (nature === "html") return repli;
  try {
    // Le corps est du JSON, donc du texte, et petit : c'est le seul chemin où
    // le charger est sans risque.
    if (fichier.size > CORPS_LISIBLE_MAX) return repli;
    const donnees = JSON.parse(fichier.textSync()) as Record<string, unknown>;
    const premier = Object.values(donnees)[0];
    const texte = Array.isArray(premier) ? String(premier[0]) : String(premier);
    if (texte && texte.length <= 300) return texte;
  } catch {
    /* corps illisible */
  }
  return repli;
}
