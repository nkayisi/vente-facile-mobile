import { readFileSync } from "fs";
import { resolve } from "path";

import {
  COULEUR_DEFAUT,
  corpsCategorie,
  corpsModificationCategorie,
  couleurValide,
  fusionnerCategories,
  palette,
  type CategorieEnFile,
} from "./categorie";

describe("la palette", () => {
  it("porte le défaut du genre EN TÊTE", () => {
    // C'est ce que le back-office propose d'emblée, et ce que le serveur
    // écrirait si le champ était omis.
    expect(palette("depense")[0]).toBe("#6B7280");
    expect(palette("recette")[0]).toBe("#10B981");
  });

  it("ne répète jamais une teinte", () => {
    for (const genre of ["recette", "depense"] as const) {
      const p = palette(genre);
      expect(new Set(p.map((c) => c.toLowerCase())).size).toBe(p.length);
    }
  });

  it("ne contient que des couleurs valides", () => {
    for (const genre of ["recette", "depense"] as const) {
      for (const couleur of palette(genre)) {
        expect(couleurValide(couleur)).toBe(couleur);
      }
    }
  });
});

describe("une couleur venue de la base", () => {
  it("passe si elle est un hexadécimal à six chiffres", () => {
    expect(couleurValide("#10B981")).toBe("#10B981");
    expect(couleurValide("  #abcdef  ")).toBe("#abcdef");
  });

  it("est REFUSÉE sinon, et rendue `null`", () => {
    // `backgroundColor` accepte n'importe quelle chaîne et échoue en silence :
    // une pastille invisible se lirait comme une catégorie sans couleur.
    for (const fautive of ["", "  ", "rouge", "#abc", "#12345", "#1234567", null, undefined]) {
      expect(couleurValide(fautive)).toBeNull();
    }
  });
});

describe("le corps envoyé au serveur", () => {
  it("porte le nom, la description et la couleur, et rien d'autre", () => {
    expect(
      corpsCategorie({
        genre: "depense", nom: "  Carburant  ",
        description: " Gasoil ", couleur: "#22c55e",
      })
    ).toEqual({
      name: "Carburant", description: "Gasoil",
      color: "#22c55e", is_active: true,
    });
  });

  it("n'envoie NI `code` NI `slug`", () => {
    // Le `code` est facultatif côté serveur et jamais dérivé ; ces deux
    // modèles ne portent aucun slug, contrairement aux catégories de PRODUITS.
    const corps = corpsCategorie({ genre: "recette", nom: "Subvention" });
    expect(corps).not.toHaveProperty("code");
    expect(corps).not.toHaveProperty("slug");
  });

  it("retombe sur le défaut du genre quand la couleur est absente ou fautive", () => {
    expect(corpsCategorie({ genre: "depense", nom: "X" }).color)
      .toBe(COULEUR_DEFAUT.depense);
    expect(corpsCategorie({ genre: "recette", nom: "X", couleur: "rouge" }).color)
      .toBe(COULEUR_DEFAUT.recette);
  });
});

/**
 * Garde-fou de SOURCE : les clés du corps sont celles du serializer.
 *
 * On lit `backend/apps/cashbook/serializers.py`, on ne recopie pas sa liste :
 * une table recopiée à la main est ce qui a produit six codes de mouvement
 * fantômes au lot précédent. Le backend vit dans le même dépôt.
 */
describe("parité avec le serializer du serveur", () => {
  const SERIALIZERS = resolve(__dirname, "../../../../../backend/apps/cashbook/serializers.py");

  function champsDe(classe: string): string[] {
    let source: string;
    try {
      source = readFileSync(SERIALIZERS, "utf8");
    } catch {
      throw new Error(
        `Serializers du serveur introuvables : ${SERIALIZERS}. Ce test croise ` +
          "les clés envoyées avec la source, il ne peut pas s'en passer."
      );
    }
    const debut = source.indexOf(`class ${classe}(serializers.ModelSerializer):`);
    if (debut === -1) throw new Error(`Classe \`${classe}\` absente de ${SERIALIZERS}.`);
    const bloc = source.slice(debut, source.indexOf("]", source.indexOf("fields = [", debut)));
    return [...bloc.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  }

  it("le balayage MORD", () => {
    // Sans ce contrôle, une expression qui ne trouve rien ferait passer le
    // test suivant sur un ensemble vide.
    expect(champsDe("ExpenseCategoryCreateSerializer").length).toBeGreaterThan(4);
  });

  it.each(["recette", "depense"] as const)(
    "chaque clé envoyée pour une %s est acceptée par le serveur",
    (genre) => {
      const accepte = champsDe(
        genre === "recette"
          ? "IncomeCategoryCreateSerializer"
          : "ExpenseCategoryCreateSerializer"
      );
      const envoye = Object.keys(corpsCategorie({ genre, nom: "X" }));
      const refusees = envoye.filter((k) => !accepte.includes(k));
      expect(refusees).toEqual([]);
    }
  );
});


describe("le corps d'une modification", () => {
  it("porte la cible, et `id` ne l'attribue pas", () => {
    const corps = corpsModificationCategorie("abc", {
      genre: "depense",
      nom: "Carburant",
    });
    expect(corps.id).toBe("abc");
    expect(corps.name).toBe("Carburant");
  });

  it("ENVOIE `is_active` même à faux", () => {
    // ⚠ Sous `partial=True`, une clé ABSENTE veut dire « ne touche pas » :
    // l'omettre rendrait la désactivation impossible, en silence.
    const corps = corpsModificationCategorie("abc", {
      genre: "depense",
      nom: "Loyer",
      actif: false,
    });
    expect(corps.is_active).toBe(false);
    expect(Object.keys(corps)).toContain("is_active");
  });

  it("est actif par défaut : on ne crée pas une rubrique déjà fermée", () => {
    expect(corpsCategorie({ genre: "recette", nom: "Apport" }).is_active).toBe(true);
  });
});

describe("la fusion du journal", () => {
  const tiree = (id: string, nom: string, actif = true) => ({
    id, nom, couleur: "#111111", description: "", actif,
  });
  const enFile = (
    id: string,
    nom: string,
    extra: Partial<CategorieEnFile> = {}
  ): CategorieEnFile => ({
    id, nom, couleur: "#222222", description: "", actif: true,
    envoi: "en_attente", ...extra,
  });

  it("montre une rubrique créée au comptoir, avec son état d'envoi", () => {
    const r = fusionnerCategories([], [enFile("n1", "Carburant")], new Map());
    expect(r).toHaveLength(1);
    expect(r[0].envoi).toBe("en_attente");
  });

  it("UNE MODIFICATION EN FILE SE SUPERPOSE À LA LIGNE TIRÉE", () => {
    // Sans cela, le marchand corrige « Carburan », la liste continue de
    // l'écrire, et il corrige une seconde fois.
    const r = fusionnerCategories(
      [tiree("a", "Carburan")],
      [],
      new Map([["a", enFile("a", "Carburant")]])
    );
    expect(r[0].nom).toBe("Carburant");
    expect(r[0].envoi).toBe("en_attente");
  });

  it("une DÉSACTIVATION en file se superpose aussi", () => {
    const r = fusionnerCategories(
      [tiree("a", "Loyer")],
      [],
      new Map([["a", enFile("a", "Loyer", { actif: false })]])
    );
    expect(r[0].actif).toBe(false);
  });

  it("corrige une rubrique elle-même encore en file", () => {
    // Le cas ordinaire hors ligne : on crée, puis on corrige avant le réseau.
    const r = fusionnerCategories(
      [],
      [enFile("n1", "Carburan")],
      new Map([["n1", enFile("n1", "Carburant")]])
    );
    expect(r[0].nom).toBe("Carburant");
  });

  it("le PIRE état d'envoi l'emporte", () => {
    const r = fusionnerCategories(
      [],
      [enFile("n1", "X", { envoi: "bloque" })],
      new Map([["n1", enFile("n1", "Y", { envoi: "en_attente" })]])
    );
    expect(r[0].envoi).toBe("bloque");
  });

  it("ne compte pas deux fois une création déjà redescendue", () => {
    // La table fait foi, sinon la rubrique doublerait le temps que le journal
    // se vide.
    const r = fusionnerCategories(
      [tiree("a", "Carburant")],
      [enFile("a", "Carburant")],
      new Map()
    );
    expect(r).toHaveLength(1);
    expect(r[0].envoi).toBeNull();
  });

  it("une rubrique acquise n'a AUCUN état d'envoi", () => {
    expect(fusionnerCategories([tiree("a", "Loyer")], [], new Map())[0].envoi).toBeNull();
  });

  it("range par nom, journal compris", () => {
    const r = fusionnerCategories(
      [tiree("a", "Zèbre"), tiree("b", "Ananas")],
      [enFile("n1", "Melon")],
      new Map()
    );
    expect(r.map((c) => c.nom)).toEqual(["Ananas", "Melon", "Zèbre"]);
  });
});
