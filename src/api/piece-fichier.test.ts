/**
 * Le corps multipart d'un envoi de fichier, sérialisé par le VRAI code d'Expo.
 *
 * ⚠ Les suites des trois envois remplacent `fetch` par une doublure : elles
 * étaient vertes pendant que tous les envois de fichier échouaient sur le
 * terminal. Ce test passe la pièce à `convertFormDataAsync`, la fonction même
 * que le `fetch` d'Expo appelle avant de partir.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

jest.mock("expo-file-system", () => ({
  // Pas de propriété de paramètre (`public uri`) : Babel la lit comme une
  // variable hors portée et refuse toute la fabrique.
  File: class {
    bytes() {
      return Promise.resolve(new Uint8Array([0x50, 0x4e, 0x47]));
    }
  },
}));

// eslint-disable-next-line import/first
import { convertFormDataAsync } from "expo/src/winter/fetch/convertFormData";
// eslint-disable-next-line import/first
import { pieceFichier } from "./piece-fichier";

/** Un `FormData` minimal, au contrat du correctif d'Expo (`entries`). */
function formulaire(champ: string, valeur: unknown): FormData {
  return { entries: () => [[champ, valeur]] } as unknown as FormData;
}

describe("une pièce de fichier", () => {
  it("est sérialisée par le fetch d'Expo, avec son nom, son type et ses octets", async () => {
    const { body } = await convertFormDataAsync(
      formulaire("logo", pieceFichier("file:///cache/abc.png", "logo.png", "image/png")),
      "BORNE"
    );
    const texte = new TextDecoder().decode(body);
    expect(texte).toContain('content-disposition: form-data; name="logo"; filename="logo.png"');
    expect(texte).toContain("content-type: image/png");
    expect(texte).toContain("PNG");
  });

  it("la forme React Native `{ uri, name, type }` est REFUSÉE : c'est le défaut corrigé", async () => {
    await expect(
      convertFormDataAsync(
        formulaire("logo", { uri: "file:///cache/abc.png", name: "logo.png", type: "image/png" }),
        "BORNE"
      )
    ).rejects.toThrow(/Unsupported FormDataPart implementation/);
  });
});

describe("aucun envoi ne revient à la forme React Native", () => {
  const RACINE = join(__dirname, "..");

  function fichiers(dossier: string): string[] {
    return readdirSync(dossier).flatMap((nom) => {
      const chemin = join(dossier, nom);
      if (statSync(chemin).isDirectory()) return fichiers(chemin);
      return /\.tsx?$/.test(nom) && !/\.test\.tsx?$/.test(nom) ? [chemin] : [];
    });
  }

  it("aucun `{ uri … } as unknown as Blob` dans le code de l'application", () => {
    const tous = fichiers(RACINE);
    expect(tous.length).toBeGreaterThan(200);
    const fautifs = tous
      .filter((f) => /\{\s*uri\b[^}]*\}\s*as\s+unknown\s+as\s+Blob/.test(readFileSync(f, "utf8")))
      .map((f) => relative(RACINE, f));
    expect(fautifs).toEqual([]);
  });
});
