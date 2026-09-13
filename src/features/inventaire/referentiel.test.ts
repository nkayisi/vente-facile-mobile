import type { EntreeReferentiel } from "@/data/articles";
import {
  BORNES,
  fusionnerReferentiels,
  optionsDeParent,
  rangerEnArbre,
  corpsCreationReferentiel,
  corpsModificationReferentiel,
  slugDisponible,
  verifierReferentiel,
  type EntreeConnue,
  type FicheEnAttente,
  type SaisieReferentiel,
} from "@/features/inventaire/referentiel";

const saisie = (p: Partial<SaisieReferentiel> = {}): SaisieReferentiel => ({
  genre: "categories",
  nom: "Boissons",
  symbole: "",
  parent: null,
  actif: true,
  ...p,
});

/** « Boissons > Sodas > Colas », plus « Épicerie » à part. */
const ARBRE: EntreeConnue[] = [
  { id: "b", nom: "Boissons", slug: "boissons", parentId: null },
  { id: "s", nom: "Sodas", slug: "sodas", parentId: "b" },
  { id: "c", nom: "Colas", slug: "colas", parentId: "s" },
  { id: "e", nom: "Épicerie", slug: "epicerie", parentId: null },
];

describe("le nom qui ne rentre pas", () => {
  it("refuse un nom vide", () => {
    expect(verifierReferentiel(saisie({ nom: "   " }), []).nom).toBe(
      "Le nom est requis."
    );
  });

  it("borne une catégorie à 255 signes", () => {
    expect(verifierReferentiel(saisie({ nom: "a".repeat(256) }), []).nom).toContain(
      "255"
    );
    expect(verifierReferentiel(saisie({ nom: "a".repeat(255) }), []).nom).toBeUndefined();
  });

  it("borne une unité à CINQUANTE, pas à 255", () => {
    // `Unit.name` est un `CharField(max_length=50)` quand `Category.name` monte
    // à 255 : un nom de soixante signes passe sur une catégorie et part en
    // quarantaine sur une unité.
    const longuet = saisie({ genre: "unites", nom: "a".repeat(60), symbole: "u" });
    expect(verifierReferentiel(longuet, []).nom).toContain("50");
    expect(BORNES.unites.nom).toBe(50);
    expect(BORNES.categories.nom).toBe(255);
  });

  it("refuse un nom sans lettre ni chiffre, pour une catégorie et une marque", () => {
    // `slugifier("!!!")` rend `""`, et le serveur refuserait alors sur le
    // `slug`, un champ que l'écran français ne montre nulle part.
    expect(verifierReferentiel(saisie({ nom: "!!!" }), []).nom).toContain("lettre");
    expect(
      verifierReferentiel(saisie({ genre: "marques", nom: "!!!" }), []).nom
    ).toContain("lettre");
  });

  it("ACCEPTE un nom sans lettre ni chiffre pour une unité : elle n'a pas de slug", () => {
    expect(
      verifierReferentiel(saisie({ genre: "unites", nom: "%", symbole: "%" }), []).nom
    ).toBeUndefined();
  });
});

describe("le même nom, à la CASSE près", () => {
  it("refuse un doublon quelle que soit la casse", () => {
    const e = verifierReferentiel(saisie({ nom: "BOISSONS" }), ARBRE);
    expect(e.nom).toBe("Une catégorie porte déjà ce nom.");
  });

  it("nomme le bon genre dans le message", () => {
    const connues: EntreeConnue[] = [{ id: "x", nom: "Coca" }];
    expect(verifierReferentiel(saisie({ genre: "marques", nom: "coca" }), connues).nom)
      .toBe("Une marque porte déjà ce nom.");
  });

  it("laisse une fiche GARDER SON PROPRE NOM en modification", () => {
    // Sans l'exclusion, une catégorie se refuserait elle-même à chaque
    // enregistrement : c'est le défaut exact que le serializer de création
    // porte, et que le back-office évite en passant par celui de détail.
    expect(verifierReferentiel(saisie({ nom: "Boissons" }), ARBRE, "b").nom)
      .toBeUndefined();
  });
});

describe("le symbole d'une unité", () => {
  const unite = (p: Partial<SaisieReferentiel> = {}) =>
    saisie({ genre: "unites", nom: "Bouteille", ...p });

  it("est REQUIS : le repli sur le nom fabriquait un symbole hors borne", () => {
    expect(verifierReferentiel(unite({ symbole: " " }), []).symbole).toBe(
      "Le symbole est requis."
    );
  });

  it("borne à dix signes, la longueur qui s'imprime sur un ticket", () => {
    expect(verifierReferentiel(unite({ symbole: "a".repeat(11) }), []).symbole)
      .toContain("10");
    expect(verifierReferentiel(unite({ symbole: "a".repeat(10) }), []).symbole)
      .toBeUndefined();
  });

  it("refuse un symbole déjà pris, à la casse près", () => {
    const connues: EntreeConnue[] = [{ id: "u", nom: "Litre", symbole: "L" }];
    expect(verifierReferentiel(unite({ symbole: "l" }), connues).symbole).toBe(
      "Une unité porte déjà ce symbole."
    );
  });

  it("ne compare pas un symbole absent : deux marques sans symbole ne se heurtent pas", () => {
    const connues: EntreeConnue[] = [{ id: "u", nom: "Litre" }];
    expect(verifierReferentiel(unite({ symbole: "btl" }), connues).symbole)
      .toBeUndefined();
  });
});

describe("une catégorie sous sa propre DESCENDANCE", () => {
  it("refuse de se prendre elle-même pour parent", () => {
    expect(verifierReferentiel(saisie({ parent: "b" }), ARBRE, "b").parent)
      .toBe("Une catégorie ne peut pas être son propre parent.");
  });

  it("refuse un enfant DIRECT", () => {
    expect(verifierReferentiel(saisie({ parent: "s" }), ARBRE, "b").parent)
      .toContain("sous-catégories");
  });

  it("refuse un PETIT-ENFANT, deux niveaux plus bas", () => {
    expect(verifierReferentiel(saisie({ parent: "c" }), ARBRE, "b").parent)
      .toContain("sous-catégories");
  });

  it("accepte un parent d'une autre branche", () => {
    expect(verifierReferentiel(saisie({ parent: "e" }), ARBRE, "b").parent)
      .toBeUndefined();
  });

  it("ne contrôle rien à la CRÉATION : la fiche n'a pas encore de descendance", () => {
    expect(verifierReferentiel(saisie({ parent: "c" }), ARBRE).parent).toBeUndefined();
  });
});

describe("un SLUG qui heurte un autre nom", () => {
  it("désambiguïse deux noms qui donnent le même slug", () => {
    // « Café » et « Cafe » rendent tous deux « cafe » : le contrôle de nom
    // passe, et c'est le serveur qui refuserait, sur un champ invisible.
    expect(slugDisponible("Cafe", ["cafe"])).toBe("cafe-2");
    expect(slugDisponible("Cafe", ["cafe", "cafe-2"])).toBe("cafe-3");
  });

  it("rend le slug nu quand il est libre", () => {
    expect(slugDisponible("Épicerie salée", [])).toBe("epicerie-salee");
  });

  it("ignore la casse des slugs déjà pris", () => {
    expect(slugDisponible("Cafe", ["CAFE"])).toBe("cafe-2");
  });

  it("tronque la BASE, jamais le suffixe", () => {
    // Amputer le suffixe rendrait `cafe-1` et `cafe-12` indistinguables.
    const long = "a".repeat(60);
    expect(slugDisponible(long, ["a".repeat(50)])).toBe("a".repeat(48) + "-2");
    expect(slugDisponible(long, ["a".repeat(50)]).length).toBeLessThanOrEqual(50);
  });

  it("rend une chaîne vide pour un nom sans lettre ni chiffre", () => {
    // `verifierReferentiel` a déjà refusé : on ne fabrique pas un « -2 » qui
    // ferait croire à un slug valide.
    expect(slugDisponible("!!!", [])).toBe("");
  });
});

describe("le contrat du transport", () => {
  it("une unité n'envoie NI slug NI is_active : elle ne porte aucun des deux", () => {
    const c = corpsCreationReferentiel(
      saisie({ genre: "unites", nom: "Bouteille", symbole: "btl" }),
      "ignore"
    );
    expect(new Set(Object.keys(c))).toEqual(new Set(["name", "symbol"]));
  });

  it("une création OMET `parent` quand la catégorie est racine", () => {
    const c = corpsCreationReferentiel(saisie({ parent: null }), "boissons");
    expect(c).not.toHaveProperty("parent");
    expect(new Set(Object.keys(c))).toEqual(new Set(["name", "slug", "is_active"]));
  });

  it("une création porte `parent` quand il est choisi", () => {
    expect(corpsCreationReferentiel(saisie({ parent: "b" }), "sodas"))
      .toHaveProperty("parent", "b");
  });

  it("une MODIFICATION envoie `parent: null`, et c'est la seule clé qui le fait", () => {
    // Sous `partial=True`, une clé ABSENTE veut dire « ne touche pas » :
    // omettre `parent` rendrait impossible de détacher une sous-catégorie.
    const m = corpsModificationReferentiel(saisie({ parent: null }));
    expect(m).toHaveProperty("parent", null);
  });

  it("une modification n'envoie JAMAIS de slug, comme le back-office", () => {
    expect(corpsModificationReferentiel(saisie())).not.toHaveProperty("slug");
    expect(corpsModificationReferentiel(saisie({ genre: "marques" })))
      .not.toHaveProperty("slug");
  });

  it("une marque n'envoie pas de `parent` : elle n'a pas de hiérarchie", () => {
    expect(corpsModificationReferentiel(saisie({ genre: "marques" })))
      .not.toHaveProperty("parent");
  });

  it("les noms voyagent ÉLAGUÉS", () => {
    expect(corpsCreationReferentiel(saisie({ nom: "  Boissons  " }), "x"))
      .toHaveProperty("name", "Boissons");
  });

  it("aucune clé vide, et aucune valeur indéfinie", () => {
    for (const corps of [
      corpsCreationReferentiel(saisie({ parent: "b" }), "sodas"),
      corpsCreationReferentiel(saisie({ genre: "unites", symbole: "kg" }), "x"),
      corpsModificationReferentiel(saisie({ parent: "b" })),
    ]) {
      for (const [cle, valeur] of Object.entries(corps)) {
        expect(cle).not.toBe("");
        expect(valeur).toBeDefined();
      }
    }
  });
});

describe("la fusion du journal", () => {
  const tiree = (id: string, nom: string, p: Partial<EntreeReferentiel> = {}) =>
    ({
      id, genre: "categories" as const, nom, detail: null, actif: true,
      produits: 3, slug: nom.toLowerCase(), symbole: null, parentId: null,
      profondeur: 0, ...p,
    }) as EntreeReferentiel;

  const enAttente = (
    fiche: string,
    nom: string,
    p: Partial<FicheEnAttente> = {}
  ): FicheEnAttente => ({
    fiche, genre: "categories", nom, slug: nom.toLowerCase(),
    symbole: null, parentId: null, actif: true, ...p,
  });

  it("ajoute une création en file, à ZÉRO produit", () => {
    const r = fusionnerReferentiels(
      [tiree("b", "Boissons")], [enAttente("n", "Épicerie")], new Map(), "categories"
    );
    expect(r.map((e) => e.nom)).toEqual(["Boissons", "Épicerie"]);
    expect(r[1].produits).toBe(0);
  });

  it("pose une modification sur une ligne TIRÉE", () => {
    const r = fusionnerReferentiels(
      [tiree("b", "Boisons")], [],
      new Map([["b", enAttente("b", "Boissons")]]), "categories"
    );
    expect(r[0].nom).toBe("Boissons");
    // Le nombre de produits vient de la ligne tirée, pas du journal.
    expect(r[0].produits).toBe(3);
  });

  it("pose une modification sur une CRÉATION encore en file", () => {
    // On crée « Boisons » hors ligne, on voit la faute, on corrige. Sans ceci,
    // la liste écrirait toujours « Boisons » et le marchand renommerait deux
    // fois.
    const r = fusionnerReferentiels(
      [], [enAttente("n", "Boisons")],
      new Map([["n", enAttente("n", "Boissons")]]), "categories"
    );
    expect(r).toHaveLength(1);
    expect(r[0].nom).toBe("Boissons");
  });

  it("n'emporte pas le journal d'un AUTRE genre", () => {
    const r = fusionnerReferentiels(
      [tiree("b", "Boissons")],
      [enAttente("m", "Coca", { genre: "marques" })],
      new Map([["b", enAttente("b", "Volée", { genre: "marques" })]]),
      "categories"
    );
    expect(r.map((e) => e.nom)).toEqual(["Boissons"]);
  });

  it("laisse une modification DÉTACHER une sous-catégorie", () => {
    const r = fusionnerReferentiels(
      [tiree("s", "Sodas", { parentId: "b" })], [],
      new Map([["s", enAttente("s", "Sodas", { parentId: null })]]), "categories"
    );
    expect(r[0].parentId).toBeNull();
  });
});

describe("le rangement en arbre", () => {
  const cat = (id: string, nom: string, parentId: string | null) =>
    ({
      id, genre: "categories" as const, nom, detail: null, actif: true,
      produits: 0, slug: id, symbole: null, parentId, profondeur: 0,
    }) as EntreeReferentiel;

  it("range un enfant sous son parent et NOMME ce parent", () => {
    // « Sous-catégorie » ne disait pas SOUS QUOI, et c'est la seule chose qu'on
    // vient y chercher.
    const r = rangerEnArbre(
      [cat("b", "Boissons", null), cat("s", "Sodas", "b")], "categories"
    );
    expect(r.map((e) => [e.nom, e.profondeur, e.detail])).toEqual([
      ["Boissons", 0, null],
      ["Sodas", 1, "Boissons"],
    ]);
  });

  it("range une sous-catégorie sous un parent LUI-MÊME en file", () => {
    // C'est tout l'objet du lot : créer « Boissons » hors ligne puis « Sodas »
    // dessous, sans réseau entre les deux.
    const r = rangerEnArbre(
      [cat("nouveau", "Boissons", null), cat("enfant", "Sodas", "nouveau")],
      "categories"
    );
    expect(r[1].profondeur).toBe(1);
    expect(r[1].detail).toBe("Boissons");
  });

  it("laisse marques et unités TELLES QUELLES : elles n'ont pas de hiérarchie", () => {
    const marques = [cat("a", "Coca", null)];
    expect(rangerEnArbre(marques, "marques")).toBe(marques);
  });
});

describe("le choix d'une catégorie parente", () => {
  const cat = (
    id: string,
    nom: string,
    parentId: string | null,
    p: Partial<EntreeReferentiel> = {}
  ) =>
    ({
      id, genre: "categories" as const, nom, detail: null, actif: true,
      produits: 0, slug: id, symbole: null, parentId,
      profondeur: parentId ? 1 : 0, ...p,
    }) as EntreeReferentiel;

  // « Boissons > Sodas », plus « Épicerie » et une inactive.
  const CONNUES = [
    cat("b", "Boissons", null),
    cat("s", "Sodas", "b"),
    cat("e", "Épicerie", null),
    cat("x", "Ancienne", null, { actif: false }),
  ];

  it("indente l'arbre quand on ne cherche RIEN", () => {
    expect(optionsDeParent(CONNUES, null, null, "")).toEqual([
      { valeur: "b", label: "Boissons" },
      { valeur: "s", label: "    Sodas" },
      { valeur: "e", label: "Épicerie" },
    ]);
  });

  it("APLATIT et nomme le parent dès qu'un terme est saisi", () => {
    // Garder le retrait afficherait « Sodas » indenté sous rien, ce qui
    // affirmerait une hiérarchie fausse.
    expect(optionsDeParent(CONNUES, null, null, "sod")).toEqual([
      { valeur: "s", label: "Sodas (dans Boissons)" },
    ]);
  });

  it("cherche sans tenir compte de la CASSE ni des espaces de bord", () => {
    expect(optionsDeParent(CONNUES, null, null, "  BOISS  ")).toEqual([
      { valeur: "b", label: "Boissons" },
    ]);
  });

  it("ne propose ni la fiche éditée NI sa descendance", () => {
    // S'y placer ferait un cycle, que le serveur refuserait après coup.
    expect(optionsDeParent(CONNUES, "b", null, "").map((o) => o.valeur))
      .toEqual(["e"]);
  });

  it("écarte les catégories INACTIVES, comme le back-office", () => {
    expect(optionsDeParent(CONNUES, null, null, "").map((o) => o.valeur))
      .not.toContain("x");
  });

  it("garde le parent ACTUEL même inactif", () => {
    // Sans lui le déclencheur afficherait « Aucune » pour une catégorie qui a
    // un parent, et enregistrer la DÉTACHERAIT en silence.
    expect(optionsDeParent(CONNUES, null, "x", "").map((o) => o.valeur))
      .toContain("x");
  });

  it("rend une liste vide quand rien ne correspond", () => {
    expect(optionsDeParent(CONNUES, null, null, "zzz")).toEqual([]);
  });
});
