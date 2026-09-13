/**
 * Le rapport d'import, tel que le SERVEUR le rend.
 *
 * Les charges utiles sont RELEVÉES sur le vrai serveur, jamais inventées : un
 * test écrit sur une réponse imaginée valide l'imagination, et c'est ce qui a
 * déjà laissé passer cinq noms de champs faux dans `data/rapports`.
 */
import {
  aBesoinDAttention,
  lireRapport,
  refusDuFichier,
  titreDuRapport,
} from "./import-articles";

/** Relevé : deux articles créés, rien d'autre. */
const SUCCES = JSON.stringify({
  success: true,
  created: 2,
  updated: 0,
  skipped: 0,
  errors: [],
  renamed: [],
});

/** Relevé : réimport du même fichier, tout est ignoré. */
const TOUT_IGNORE = JSON.stringify({
  success: true,
  created: 0,
  updated: 0,
  skipped: 2,
  errors: [
    { row: 3, name: "TEST IMPORT DETAIL", errors: ["SKU 'TST-IMP-001' existe déjà"] },
    { row: 4, name: "TEST IMPORT GROS", errors: ["SKU 'TST-IMP-002' existe déjà"] },
  ],
  renamed: [],
});

/** Relevé : un code déjà pris par un AUTRE article, donc dérivé. */
const RENOMME = JSON.stringify({
  success: true,
  created: 3,
  updated: 0,
  skipped: 1,
  errors: [{ row: 3, name: "ZTEST Article Alpha", errors: ["SKU 'ZT-001' existe déjà"] }],
  renamed: [
    { row: 4, name: "ZTEST Article Omega", requested_sku: "ZT-001", assigned_sku: "ZT-001-2" },
    { row: 5, name: "ZTEST Article Sigma", requested_sku: "ZT-003", assigned_sku: "ZT-003-2" },
  ],
});

/** Relevé : classeur qui n'est pas le modèle officiel. */
const HORS_MODELE = JSON.stringify({
  success: false,
  error: "Feuille 'Produits' introuvable. Utilisez le template officiel.",
  created: 0,
  updated: 0,
  skipped: 0,
  errors: [],
});

describe("lireRapport", () => {
  it("lit un import réussi", () => {
    expect(lireRapport(200, SUCCES)).toMatchObject({
      success: true,
      created: 2,
      skipped: 0,
      errors: [],
      renamed: [],
    });
  });

  it("porte les lignes refusées avec leur motif", () => {
    const r = lireRapport(200, TOUT_IGNORE);
    expect(r.skipped).toBe(2);
    expect(r.errors[0]).toMatchObject({ row: 3, name: "TEST IMPORT DETAIL" });
    expect(r.errors[0].errors[0]).toContain("existe déjà");
  });

  it("porte les codes DÉRIVÉS, avec l'ancien et le nouveau", () => {
    const r = lireRapport(200, RENOMME);
    expect(r.renamed).toHaveLength(2);
    expect(r.renamed[0]).toMatchObject({
      requested_sku: "ZT-001",
      assigned_sku: "ZT-001-2",
    });
  });

  it("rend `renamed` VIDE quand le serveur ne l'envoie pas", () => {
    // ⚠ Un serveur antérieur à la règle du code dérivé n'a pas cette clé, et
    // lire `undefined.length` planterait l'écran du rapport.
    const r = lireRapport(200, HORS_MODELE);
    expect(r.renamed).toEqual([]);
  });

  it("remonte le refus du serveur en toutes lettres", () => {
    expect(lireRapport(400, HORS_MODELE).error).toContain("template officiel");
  });

  it("un message d'erreur est une PHRASE, jamais une page", () => {
    // Un 500 de Django rend sa page de débogage complète : la recopier dans un
    // bandeau donnerait deux écrans de balises.
    const page = "<!DOCTYPE html><html><head><title>Error</title></head>" + "x".repeat(5000);
    const r = lireRapport(500, page);
    expect(r.error).toBe("L'import a échoué (erreur 500).");
    expect(r.error).not.toContain("<");
  });

  it("un corps illisible ne fait pas planter la lecture", () => {
    expect(lireRapport(502, "Bad Gateway").error).toBeTruthy();
    expect(lireRapport(200, "").error).toBeTruthy();
  });

  it("ne rend jamais NaN sur un compteur manquant", () => {
    const r = lireRapport(200, JSON.stringify({ success: true }));
    expect(r.created).toBe(0);
    expect(r.skipped).toBe(0);
    expect(r.updated).toBe(0);
  });
});

describe("titreDuRapport", () => {
  it("distingue les quatre issues", () => {
    // ⚠ Le serveur répond `success: true` dès que le fichier est LISIBLE, même
    // si toutes ses lignes ont été refusées : une coche verte sur zéro article
    // ferait refermer la feuille en croyant le catalogue à jour.
    expect(titreDuRapport(lireRapport(200, SUCCES))).toBe("Importation terminée");
    expect(titreDuRapport(lireRapport(200, TOUT_IGNORE))).toBe("Aucun produit importé");
    expect(titreDuRapport(lireRapport(200, RENOMME))).toBe("Importation partielle");
    expect(titreDuRapport(lireRapport(400, HORS_MODELE))).toBe("Erreur d'importation");
  });

  it("annonce les codes à vérifier quand rien n'a été refusé", () => {
    const r = lireRapport(
      200,
      JSON.stringify({
        success: true,
        created: 2,
        skipped: 0,
        errors: [],
        renamed: [{ row: 3, name: "x", requested_sku: "A", assigned_sku: "A-2" }],
      })
    );
    expect(titreDuRapport(r)).toBe("Importation terminée, codes à vérifier");
  });
});

describe("aBesoinDAttention", () => {
  it("ne crie que lorsqu'il y a quelque chose à lire", () => {
    expect(aBesoinDAttention(lireRapport(200, SUCCES))).toBe(false);
    expect(aBesoinDAttention(lireRapport(200, TOUT_IGNORE))).toBe(true);
    expect(aBesoinDAttention(lireRapport(200, RENOMME))).toBe(true);
    expect(aBesoinDAttention(lireRapport(400, HORS_MODELE))).toBe(true);
  });
});

describe("refusDuFichier", () => {
  it("accepte les deux extensions du serveur", () => {
    expect(refusDuFichier({ uri: "u", nom: "produits.xlsx", taille: 10 })).toBeNull();
    expect(refusDuFichier({ uri: "u", nom: "PRODUITS.XLS", taille: 10 })).toBeNull();
  });

  it("refuse le reste AVANT l'envoi", () => {
    // Le serveur oppose le même refus, mais après le voyage : sur une 2G, le
    // marchand attendrait pour apprendre qu'il a choisi une photo.
    expect(refusDuFichier({ uri: "u", nom: "notes.txt", taille: 10 })).toBeTruthy();
    expect(refusDuFichier({ uri: "u", nom: "photo.jpg", taille: 10 })).toBeTruthy();
  });
});
