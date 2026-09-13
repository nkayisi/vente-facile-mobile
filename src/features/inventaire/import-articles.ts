/**
 * Import Excel des articles, depuis le terminal.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CET IMPORT EXIGE LE RÉSEAU, ET C'EST DÉLIBÉRÉ.                          │
 * │                                                                          │
 * │ Le classeur est lu par le SERVEUR (`ProductExcelService`), qui seul      │
 * │ connaît les SKU déjà pris, les catégories à créer au passage et le       │
 * │ plafond du plan. Le lire ici demanderait un second lecteur de classeurs  │
 * │ et une seconde version des règles - exactement la divergence que ce      │
 * │ dépôt a déjà payée sur les rapports.                                     │
 * │                                                                          │
 * │ Un import n'est d'ailleurs PAS un geste de comptoir : on prépare son     │
 * │ fichier, on l'importe, on relit ses erreurs. Ce qui doit marcher hors    │
 * │ ligne, c'est vendre et encaisser.                                        │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ Ceci REVIENT sur une décision écrite : « l'import Excel reste au
 * back-office, choisir un fichier et relire ses erreurs ligne à ligne se fait
 * au clavier, pas au pouce ». L'arbitrage a été rendu à l'inverse - un
 * marchand qui n'a qu'un téléphone doit pouvoir garnir son catalogue. Le
 * confort de lecture, lui, reste meilleur au back-office, et l'écran le dit.
 */
import * as DocumentPicker from "expo-document-picker";

import { API_BASE_URL } from "@/api/config";
import { currentOrganizationId, ensureFreshTokens } from "@/api/client";
import { ApiError } from "@/api/errors";
import { telechargerEtPartager } from "@/features/export/telecharger";

/** Les deux formes qu'Android rend pour un classeur, selon l'application source. */
const TYPES_EXCEL = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
];

export interface LigneRefusee {
  row: number;
  name: string;
  errors: string[];
}

export interface LigneRenommee {
  row: number;
  name: string;
  requested_sku: string;
  assigned_sku: string;
}

export interface ResultatImport {
  success: boolean;
  error?: string;
  created: number;
  updated: number;
  skipped: number;
  errors: LigneRefusee[];
  /** Articles créés sous un code DÉRIVÉ, leur SKU étant déjà pris. */
  renamed: LigneRenommee[];
}

/** Le modèle officiel, tel que le back-office le sert. */
export async function telechargerModeleImport(): Promise<void> {
  await telechargerEtPartager(
    "/products/import-template/",
    "xlsx",
    "Modele import produits"
  );
}

export interface FichierChoisi {
  uri: string;
  nom: string;
  taille: number | null;
}

/**
 * Ouvre le sélecteur de fichiers du système.
 *
 * ⚠ `copyToCacheDirectory` est OBLIGATOIRE : sans lui, l'URI rendue par
 * Android est un `content://` que l'application ne peut pas relire une fois le
 * fournisseur refermé, et l'envoi part sur un fichier vide - sans erreur.
 */
export async function choisirClasseur(): Promise<FichierChoisi | null> {
  const resultat = await DocumentPicker.getDocumentAsync({
    type: TYPES_EXCEL,
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (resultat.canceled || resultat.assets.length === 0) return null;

  const a = resultat.assets[0];
  return { uri: a.uri, nom: a.name, taille: a.size ?? null };
}

/** Ce que le serveur refuse avant même de lire le classeur. */
export function refusDuFichier(f: FichierChoisi): string | null {
  const nom = f.nom.toLowerCase();
  if (!nom.endsWith(".xlsx") && !nom.endsWith(".xls")) {
    return "Choisissez un fichier Excel (.xlsx).";
  }
  return null;
}

/**
 * Envoie le classeur et rend le rapport du serveur.
 *
 * ⚠ On n'écrit PAS `Content-Type` : `fetch` doit poser lui-même
 * `multipart/form-data; boundary=…`, et la frontière n'est connue que de lui.
 * L'imposer produit un corps que Django ne sait pas découper, et le fichier
 * arrive vide - « Aucun fichier fourni », sur un envoi qui en portait un.
 */
export async function importerClasseur(
  fichier: FichierChoisi
): Promise<ResultatImport> {
  const jetons = await ensureFreshTokens();

  const corps = new FormData();
  corps.append("file", {
    uri: fichier.uri,
    name: fichier.nom,
    type: TYPES_EXCEL[0],
  } as unknown as Blob);

  let reponse: Response;
  try {
    reponse = await fetch(`${API_BASE_URL}/products/import/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jetons.access}`,
        "X-Organization-ID": currentOrganizationId() ?? "",
      },
      body: corps,
    });
  } catch {
    throw new ApiError("network", "Le serveur est injoignable.", {});
  }

  const texte = await reponse.text().catch(() => "");
  return lireRapport(reponse.status, texte);
}

/**
 * Le rapport du serveur, ou une PHRASE.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN MESSAGE D'ERREUR EST UNE PHRASE, JAMAIS UNE PAGE.                    │
 * │                                                                          │
 * │ Un 500 de Django rend sa page de débogage complète ; la recopier dans un │
 * │ bandeau donnerait deux écrans de balises. Même règle que                 │
 * │ `readableMessage` et que le renifleur d'export.                          │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function lireRapport(status: number, texte: string): ResultatImport {
  const vide: ResultatImport = {
    success: false,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
    renamed: [],
  };

  const propre = texte.trim();
  if (!propre || propre.startsWith("<") || propre.length > 20000) {
    return { ...vide, error: `L'import a échoué (erreur ${status}).` };
  }

  let json: Record<string, unknown>;
  try {
    json = JSON.parse(propre) as Record<string, unknown>;
  } catch {
    return { ...vide, error: `L'import a échoué (erreur ${status}).` };
  }

  return {
    // Le serveur répond `success: true` dès que le fichier est LISIBLE, même
    // si toutes ses lignes ont été refusées : l'écran ne s'en contente pas.
    success: json.success === true,
    error: messageDErreur(json.error) ?? (status >= 400 ? messageDErreur(json.detail) : undefined),
    created: nombre(json.created),
    updated: nombre(json.updated),
    skipped: nombre(json.skipped),
    errors: Array.isArray(json.errors) ? (json.errors as LigneRefusee[]) : [],
    // ⚠ Facultatif : un serveur antérieur à la règle du code dérivé ne renvoie
    // pas la clé, et lire `undefined.length` planterait l'écran.
    renamed: Array.isArray(json.renamed) ? (json.renamed as LigneRenommee[]) : [],
  };
}

function nombre(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/** `error` peut être une chaîne, ou l'objet d'un refus de quota. */
function messageDErreur(v: unknown): string | undefined {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (Array.isArray(v) && typeof v[0] === "string") return v[0];
  if (v && typeof v === "object") {
    const premier = Object.values(v as Record<string, unknown>)[0];
    if (typeof premier === "string") return premier;
    if (Array.isArray(premier) && typeof premier[0] === "string") return premier[0];
  }
  return undefined;
}

/** Ce qu'un import « réussi » demande de LIRE plutôt que de refermer. */
export function aBesoinDAttention(r: ResultatImport): boolean {
  return !r.success || r.created === 0 || r.skipped > 0 || r.renamed.length > 0;
}

/** Le titre du bandeau, dans les mots du back-office. */
export function titreDuRapport(r: ResultatImport): string {
  if (!r.success) return "Erreur d'importation";
  if (r.created === 0) return "Aucun produit importé";
  if (r.skipped > 0) return "Importation partielle";
  if (r.renamed.length > 0) return "Importation terminée, codes à vérifier";
  return "Importation terminée";
}
