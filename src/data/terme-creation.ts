/**
 * Ce qu'une recherche sans résultat pré-remplit dans la création d'un article.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN CODE SCANNÉ EST UN CODE-BARRES, UN MOT EST UN NOM.                    │
 * │                                                                          │
 * │ Le vendeur cherche « savon omo » ou scanne 6001087011234 : rien ne sort. │
 * │ La création s'ouvre avec ce qu'il a déjà donné, pour qu'il ne retape     │
 * │ rien. Un terme fait uniquement de 8 à 14 chiffres est un code EAN, UPC   │
 * │ ou ITF tapé à la main ; tout ce qui sort d'un scanner l'est aussi, même  │
 * │ alphanumérique (Code 128, QR).                                           │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Copie tenue à la main de `frontend/lib/products/terme-creation.ts`,
 * éprouvée sur les MÊMES cas.
 */

export type PreRemplissage = { champ: "nom" | "code_barres"; valeur: string };

/** Un code numérique de 8 à 14 chiffres : EAN-8, UPC-A, EAN-13, ITF-14. */
const CODE_NUMERIQUE = /^\d{8,14}$/;

export function preRemplissageDeCreation(
  terme: string,
  scanne = false
): PreRemplissage | null {
  const valeur = terme.trim();
  if (!valeur) return null;
  if (scanne || CODE_NUMERIQUE.test(valeur)) return { champ: "code_barres", valeur };
  return { champ: "nom", valeur };
}

/**
 * Les paramètres de l'écran de création, pré-remplis.
 *
 * `retour` : l'écran a été ouvert depuis un autre (le comptoir, une feuille)
 * et doit lui rendre la main une fois l'article créé, au lieu d'ouvrir sa
 * fiche - un article encore en file y serait « introuvable ».
 */
export function parametresCreationArticle(
  terme: string,
  options: { scanne?: boolean; retour?: boolean } = {}
): { nom?: string; codeBarres?: string; retour?: "1" } | null {
  const pre = preRemplissageDeCreation(terme, options.scanne);
  if (!pre) return null;
  return {
    ...(pre.champ === "nom" ? { nom: pre.valeur } : { codeBarres: pre.valeur }),
    ...(options.retour ? { retour: "1" as const } : {}),
  };
}

/**
 * L'article déjà CRÉÉ sur ce terminal et encore en file, que ce terme désigne.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UNE CRÉATION EN FILE N'EST PAS ENCORE AU CATALOGUE, ET C'EST LE PIÈGE.   │
 * │                                                                          │
 * │ Les tables tirées ne sont écrites que par le tirage : l'article créé il  │
 * │ y a une minute, hors ligne, ne sort pas d'une recherche. Proposer de le  │
 * │ créer une seconde fois ferait partir deux créations du même SKU, et la   │
 * │ seconde finirait en quarantaine. On le NOMME à la place.                 │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Même nom, même SKU ou même code-barres, sans égard à la casse ni aux
 * espaces de bord.
 */
export function creationDejaEnFile(
  terme: string,
  enFile: { nom: string; sku: string; codeBarres?: string | null }[]
): string | null {
  const cherche = terme.trim().toLowerCase();
  if (!cherche) return null;
  const egal = (v: string | null | undefined) => (v ?? "").trim().toLowerCase() === cherche;
  const trouve = enFile.find((a) => egal(a.nom) || egal(a.sku) || egal(a.codeBarres));
  return trouve ? trouve.nom : null;
}
