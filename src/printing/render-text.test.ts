/**
 * Le rendu 42 colonnes.
 *
 * Ce que ces tests protègent n'est pas une mise en page, c'est la LISIBILITÉ
 * d'un papier qu'on remet à un client. Un défaut ici ne plante pas : il sort de
 * l'imprimante, illisible, et personne ne le voit avant le comptoir.
 */
import type { Block } from "@vente-facile/core/receipt";

import { colonnesPour, paire, regleDeCalibration, rendreTexte, replier } from "./render-text";

const LARGEUR = 42;

/** Largeur réellement occupée : une ligne en double échelle compte double. */
const occupe = (l: { text: string; scale?: 1 | 2 }) => l.text.length * (l.scale ?? 1);

const rendre = (blocks: Block[]) => rendreTexte(blocks);

describe("Largeur", () => {
  it("58 mm vaut 42 colonnes, valeur MESURÉE sur papier", () => {
    expect(colonnesPour(58)).toBe(42);
  });

  it("ne laisse aucune ligne déborder, double échelle comprise", () => {
    const blocks: Block[] = [
      { kind: "text", text: "ETABLISSEMENT KALUME & FILS SARL", role: "orgName", align: "center" },
      { kind: "band", text: "Vente à crédit" },
      { kind: "total", label: "Net à payer", value: "12 500 000 FC" },
      {
        kind: "kv",
        mode: "inline",
        rows: [{ label: "Client", value: "Etablissement Kalume & Fils SARL" }],
      },
    ];
    for (const ligne of rendre(blocks)) {
      expect(occupe(ligne)).toBeLessThanOrEqual(LARGEUR);
    }
  });
});

describe("Couple libellé / montant", () => {
  it("écarte les deux aux bords quand ils tiennent", () => {
    const [ligne] = paire("Sous-total", "9 000 FC", LARGEUR);
    expect(ligne).toHaveLength(LARGEUR);
    expect(ligne.startsWith("Sous-total ")).toBe(true);
    expect(ligne.endsWith(" 9 000 FC")).toBe(true);
  });

  it("abrège le LIBELLÉ, jamais le montant : un montant tronqué est un faux montant", () => {
    // Le cas documenté : sur 42 colonnes, « Montant payé » et un montant CDF à
    // huit chiffres se recouvraient de plusieurs colonnes.
    const [ligne] = paire("Montant payé au comptoir", "12 500 000.00 CDF", LARGEUR);
    expect(ligne).toHaveLength(LARGEUR);
    expect(ligne).toContain("12 500 000.00 CDF");
    expect(ligne.endsWith("12 500 000.00 CDF")).toBe(true);
  });

  it("passe le montant à la ligne quand le libellé n'a plus de place lisible", () => {
    // 12 + 1 + 38 dépasse 42, et il ne resterait que 3 colonnes au libellé :
    // l'abréger le rendrait illisible, la valeur descend donc seule.
    const valeur = "1 234 567 890 123 456 789 012 345 678 CDF";
    const lignes = paire("Montant payé", valeur, LARGEUR);
    expect(lignes).toHaveLength(2);
    expect(lignes[1].trimStart()).toBe(valeur);
  });

  it("ne laisse jamais les deux se toucher", () => {
    for (const valeur of ["1", "1 000", "12 500 000.00 CDF", "999 999 999 999 FC"]) {
      const [ligne] = paire("Montant payé", valeur, LARGEUR);
      if (ligne.includes(valeur)) {
        expect(ligne.length).toBeLessThanOrEqual(LARGEUR);
        expect(ligne.slice(0, ligne.indexOf(valeur))).toMatch(/ $/);
      }
    }
  });
});

describe("Articles", () => {
  const ligneArticle: Block = {
    kind: "items",
    rows: [
      {
        name: "AACEFEMINE 30CE 2MG COMPRIMES PELLICULES",
        quantity: "27",
        unitPrice: "92 000",
        total: "2 484 000",
        quantityLabel: "2 casiers + 3 bouteilles",
        discountPercentage: 10,
      },
    ],
  };

  it("donne au nom la PLEINE largeur, sur deux lignes s'il le faut", () => {
    const textes = rendre([ligneArticle]).map((l) => l.text);
    // Quatre colonnes ne tiendraient pas : le nom n'aurait que 18 caractères.
    expect(textes[0]).toBe("AACEFEMINE 30CE 2MG COMPRIMES PELLICULES");
  });

  it("porte le conditionnement, que l'ancien ticket mobile n'imprimait pas", () => {
    const textes = rendre([ligneArticle]).map((l) => l.text);
    expect(textes).toContain("  2 casiers + 3 bouteilles");
  });

  it("met la quantité et le prix à gauche, le total à droite", () => {
    const ligne = rendre([ligneArticle]).map((l) => l.text).find((t) => t.includes("27 x"));
    expect(ligne).toBeDefined();
    expect(ligne).toHaveLength(LARGEUR);
    expect(ligne!.endsWith("2 484 000")).toBe(true);
  });

  it("signale la remise de ligne", () => {
    expect(rendre([ligneArticle]).map((l) => l.text)).toContain("  Remise: -10%");
  });
});

describe("Identité du document", () => {
  it("remplace la vidéo inversée par des filets pleins et un titre doublé", () => {
    const lignes = rendre([{ kind: "band", text: "Vente à crédit" }]);
    expect(lignes[0].text).toBe("_".repeat(LARGEUR));
    expect(lignes[lignes.length - 1].text).toBe("_".repeat(LARGEUR));

    const titre = lignes.find((l) => l.scale === 2);
    expect(titre?.text).toBe("VENTE A CREDIT");
    expect(titre?.bold).toBe(true);
  });

  it("désaccentue tout : la page de code du NYX rend « Reçu » en « Re?u »", () => {
    const lignes = rendre([
      { kind: "chip", text: "Duplicata" },
      { kind: "text", text: "Reçu de règlement · dette soldée", role: "body" },
    ]);
    const tout = lignes.map((l) => l.text).join("\n");
    expect(tout).toContain("DUPLICATA");
    expect(tout).toContain("Recu de reglement");
    expect(tout).toContain("dette soldee");
    expect(tout).not.toMatch(/[çèéêà]/);
  });
});

describe("Repli", () => {
  it("ne coupe pas un mot qui tient sur la ligne suivante", () => {
    expect(replier("Etablissement Kalume et Fils", 20)).toEqual([
      "Etablissement Kalume",
      "et Fils",
    ]);
  });

  it("coupe un mot plus long que la ligne plutôt que de le laisser tronquer", () => {
    expect(replier("VT-20260829-JJK6-0001-SUPPLEMENT", 12)).toEqual([
      "VT-20260829-",
      "JJK6-0001-SU",
      "PPLEMENT",
    ]);
  });
});

describe("Règle de calibration", () => {
  it("gradue exactement la largeur supposée, pour se compter sur une photo", () => {
    const lignes = rendreTexte(regleDeCalibration(58)).map((l) => l.text);
    const pleine = lignes.find((t) => t.startsWith("#"));
    expect(pleine).toHaveLength(LARGEUR);
    expect(lignes.some((t) => t.includes(".........1"))).toBe(true);
  });

  it("passe par le chemin de production : une règle repliée mentirait", () => {
    // Si la graduation se repliait, elle mesurerait le repli et non le papier.
    const lignes = rendreTexte(regleDeCalibration(58));
    expect(lignes.filter((l) => l.text.startsWith("#"))).toHaveLength(1);
    for (const ligne of lignes) {
      expect(ligne.text.length * (ligne.scale ?? 1)).toBeLessThanOrEqual(LARGEUR);
    }
  });
});
