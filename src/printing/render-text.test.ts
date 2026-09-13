/**
 * Le rendu 32 colonnes.
 *
 * Ce que ces tests protègent n'est pas une mise en page, c'est la LISIBILITÉ
 * d'un papier qu'on remet à un client. Un défaut ici ne plante pas : il sort de
 * l'imprimante, illisible, et personne ne le voit avant le comptoir.
 */
import type { Block } from "@vente-facile/core/receipt";

import { colonnesPour, paire, regleDeCalibration, rendreTexte, replier } from "./render-text";

const LARGEUR = 32;

/** Largeur réellement occupée : une ligne en double échelle compte double. */
const occupe = (l: { text: string; scale?: 1 | 2 }) => l.text.length * (l.scale ?? 1);

const rendre = (blocks: Block[]) => rendreTexte(blocks);

describe("Largeur", () => {
  it("58 mm vaut 32 colonnes : la police A, celle qui se LIT", () => {
    // 42 colonnes imposent la police B, dont la chasse fait 9 points sur 17 de
    // haut. Mesuré sur une T58_9345 en Bluetooth le 13 septembre 2026 : le
    // marchand ne pouvait pas lire son propre ticket, et à 32 colonnes la
    // règle de calibration confirme que le dernier « # » touche le bord.
    expect(colonnesPour(58)).toBe(32);
  });

  it("80 mm vaut 48 colonnes, une largeur que l'encodeur accepte", () => {
    // 57 venait du rapport des millimètres de PAPIER et n'existait sur aucune
    // imprimante : l'encodeur ESC/POS levait, donc plus aucun ticket ne sortait
    // en Bluetooth dès que le marchand basculait son réglage sur 80 mm.
    expect(colonnesPour(80)).toBe(48);
    expect([32, 35, 42, 44, 48]).toContain(colonnesPour(80));
    expect([32, 35, 42, 44, 48]).toContain(colonnesPour(58));
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
    // Le cas documenté : « Montant payé » et un montant CDF à huit chiffres se
    // recouvraient de plusieurs colonnes.
    const [ligne] = paire("Montant payé au comptoir", "12 500 000.00 CDF", LARGEUR);
    expect(ligne).toHaveLength(LARGEUR);
    expect(ligne).toContain("12 500 000.00 CDF");
    expect(ligne.endsWith("12 500 000.00 CDF")).toBe(true);
  });

  it("passe le montant à la ligne quand le libellé n'a plus de place lisible", () => {
    // 12 + 1 + 29 dépasse 32, et il ne resterait que 2 colonnes au libellé :
    // l'abréger le rendrait illisible, la valeur descend donc seule. Elle tient
    // en revanche sur une ligne entière, donc elle n'est pas repliée.
    const valeur = "1 234 567 890 123 456 789 CDF";
    expect(valeur.length).toBeLessThanOrEqual(LARGEUR);
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
    // Sur 32, ce nom de quarante signes se replie, et RIEN ne s'en perd.
    expect(textes[0]).toBe("AACEFEMINE 30CE 2MG COMPRIMES");
    expect(textes[1]).toBe("PELLICULES");
    expect(`${textes[0]} ${textes[1]}`).toBe("AACEFEMINE 30CE 2MG COMPRIMES PELLICULES");
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


describe("Les deux largeurs, et pas seulement celle qui est mesurée", () => {
  const DOCUMENT: Block[] = [
    { kind: "text", text: "ETABLISSEMENT KALUME & FILS SARL", role: "orgName", align: "center" },
    { kind: "band", text: "Vente à crédit", sub: "Duplicata" },
    { kind: "chip", text: "DETTE SOLDÉE" },
    {
      kind: "items",
      rows: [
        {
          name: "AACEFEMINE 30CE 2MG COMPRIMES PELLICULES",
          quantity: "12",
          unitPrice: "92 000",
          total: "1 104 000",
          quantityLabel: "1 carton + 2 plaquettes",
          discountPercentage: 15,
        },
      ],
    },
    { kind: "amounts", rows: [{ label: "Montant payé", value: "12 500 000 FC", strong: true }] },
    { kind: "total", label: "Net à payer", value: "12 500 000 FC" },
    { kind: "kv", mode: "inline", rows: [{ label: "Client", value: "Etablissement Kalume & Fils SARL" }] },
    { kind: "rule", weight: "heavy" },
  ];

  for (const papier of [58, 80] as const) {
    it(`ne laisse rien déborder sur ${papier} mm`, () => {
      const largeur = colonnesPour(papier);
      for (const ligne of rendreTexte(DOCUMENT, { paperWidth: papier })) {
        expect(occupe(ligne)).toBeLessThanOrEqual(largeur);
      }
    });

    it(`gradue sa règle de calibration sur ${papier} mm`, () => {
      const largeur = colonnesPour(papier);
      for (const ligne of rendreTexte(regleDeCalibration(papier), { paperWidth: papier })) {
        expect(occupe(ligne)).toBeLessThanOrEqual(largeur);
      }
    });
  }
});

describe("Un montant ne se tronque jamais", () => {
  it("replie une valeur trop longue au lieu de lui manger la tête", () => {
    // `padStart(...).slice(-largeur)` gardait la FIN : « 1 234 567 890 123 »
    // sortait amputé de son premier chiffre, donc plausible et faux.
    const valeur = "1234567890123456789012345678901234567890123456";
    const lignes = paire("Montant payé", valeur, 42);
    expect(lignes.join("")).toContain(valeur.slice(0, 20));
    // Aucun chiffre perdu : la concaténation des lignes porte toute la valeur.
    expect(lignes.join("").replace(/\s/g, "")).toContain(valeur);
  });

  it("garde le cas courant sur une seule ligne, valeur collée à droite", () => {
    const [ligne] = paire("Total", "12 500 FC", 42);
    expect(ligne).toHaveLength(42);
    expect(ligne.endsWith("12 500 FC")).toBe(true);
  });
});

describe("Pastille", () => {
  it("se replie plutôt que de déborder en silence", () => {
    const blocks: Block[] = [
      { kind: "chip", text: "DUPLICATA D'UN RECU DE REGLEMENT TRES LONG A IMPRIMER" },
    ];
    for (const ligne of rendreTexte(blocks, { paperWidth: 58 })) {
      expect(occupe(ligne)).toBeLessThanOrEqual(42);
    }
  });
});
