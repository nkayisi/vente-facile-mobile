import { dateLongueFr } from "@/data/dates";
import {
  corpsDeLaSession,
  nomParDefaut,
  verifierSaisie,
  type SaisieSession,
} from "@/features/inventaire/nouvelle-session";

const LE_6_SEPTEMBRE = new Date(2026, 8, 6, 14, 7);

const saisie = (p: Partial<SaisieSession> = {}): SaisieSession => ({
  entrepot: "w1",
  perimetre: "full",
  categories: [],
  produits: [],
  notes: "",
  ...p,
});

describe("la date du jour, sans `Intl`", () => {
  it("écrit « 06 septembre 2026 », quantième sur deux chiffres", () => {
    // Deux chiffres comme `day: "2-digit"` du back-office : c'est ce qui aligne
    // les noms de session quand on les lit en liste.
    expect(dateLongueFr(LE_6_SEPTEMBRE)).toBe("06 septembre 2026");
  });

  it("ne rogne pas un quantième à deux chiffres", () => {
    expect(dateLongueFr(new Date(2026, 11, 31))).toBe("31 décembre 2026");
  });

  it("nomme la session comme le back-office", () => {
    expect(nomParDefaut(LE_6_SEPTEMBRE)).toBe("Inventaire du 06 septembre 2026");
  });

  it("lit les composantes LOCALES, jamais UTC", () => {
    // Une session créée à 23 h 30 à Kinshasa est déjà le lendemain en UTC :
    // `toISOString()` la daterait du jour suivant, et le nom mentirait.
    const tard = new Date(2026, 8, 6, 23, 30);
    expect(dateLongueFr(tard)).toBe("06 septembre 2026");
  });
});

describe("ce qui empêche d'enregistrer", () => {
  it("exige un entrepôt, et ne parle que de lui tant qu'il manque", () => {
    // Il décide du théorique de chaque ligne : sans lui, le périmètre ne
    // désigne rien, et empiler deux messages ferait chercher deux corrections.
    const e = verifierSaisie(saisie({ entrepot: null, perimetre: "category" }));
    expect(e.entrepot).toBe("Choisissez l'entrepôt à inventorier.");
    expect(e.perimetre).toBeUndefined();
  });

  it("laisse passer un inventaire complet sans autre choix", () => {
    expect(verifierSaisie(saisie())).toEqual({});
  });

  it("exige une catégorie sur un périmètre par catégorie", () => {
    expect(verifierSaisie(saisie({ perimetre: "category" })).perimetre).toBe(
      "Choisissez au moins une catégorie à compter."
    );
  });

  it("exige un article sur un périmètre par produit", () => {
    expect(verifierSaisie(saisie({ perimetre: "product" })).perimetre).toBe(
      "Choisissez au moins un article à compter."
    );
  });

  it("accepte dès qu'un choix est fait", () => {
    expect(verifierSaisie(saisie({ perimetre: "category", categories: ["c1"] }))).toEqual({});
    expect(verifierSaisie(saisie({ perimetre: "product", produits: ["p1"] }))).toEqual({});
  });
});

describe("le corps de l'acte", () => {
  it("emploie `category_ids`, la clé que le serveur DÉCLARE", () => {
    // `categories` était ignorée en silence par DRF, puis le refus parlait
    // d'une catégorie manquante alors qu'on en avait envoyé une.
    const c = corpsDeLaSession(
      saisie({ perimetre: "category", categories: ["c1", "c2"] }),
      LE_6_SEPTEMBRE
    );
    expect(c.category_ids).toEqual(["c1", "c2"]);
    expect(c).not.toHaveProperty("categories");
  });

  it("emploie `product_ids` de la même façon", () => {
    const c = corpsDeLaSession(
      saisie({ perimetre: "product", produits: ["p1"] }),
      LE_6_SEPTEMBRE
    );
    expect(c.product_ids).toEqual(["p1"]);
    expect(c).not.toHaveProperty("products");
  });

  it("n'envoie AUCUNE clé de périmètre sur un inventaire complet", () => {
    const c = corpsDeLaSession(saisie(), LE_6_SEPTEMBRE);
    expect(c).not.toHaveProperty("category_ids");
    expect(c).not.toHaveProperty("product_ids");
    expect(c.scope_type).toBe("full");
  });

  it("N'EMPORTE PAS un choix abandonné en changeant de périmètre", () => {
    // Les cases cochées survivent dans l'état de l'écran ; les envoyer ferait
    // compter un rayon que le magasinier venait d'écarter.
    const c = corpsDeLaSession(
      saisie({ perimetre: "full", categories: ["c1"], produits: ["p1"] }),
      LE_6_SEPTEMBRE
    );
    expect(c).not.toHaveProperty("category_ids");
    expect(c).not.toHaveProperty("product_ids");
  });

  it("compose le nom au moment de l'envoi", () => {
    expect(corpsDeLaSession(saisie(), LE_6_SEPTEMBRE).name).toBe(
      "Inventaire du 06 septembre 2026"
    );
  });

  it("émonde les notes", () => {
    expect(corpsDeLaSession(saisie({ notes: "  Allée 3  " }), LE_6_SEPTEMBRE).notes).toBe(
      "Allée 3"
    );
  });
});
