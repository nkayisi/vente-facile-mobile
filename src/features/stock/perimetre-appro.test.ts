/**
 * Le périmètre d'un approvisionnement de masse.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE QUI S'ÉPROUVE ICI EST LA FRONTIÈRE SQL / MÉMOIRE.                    │
 * │                                                                          │
 * │ Une première écriture filtrait la catégorie et le seuil sur les lignes   │
 * │ DÉJÀ LUES, donc après la fenêtre : trois cents rayons lus puis aucun de │
 * │ la catégorie demandée. Le défaut exact que `/rayon` a déjà payé.         │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import {
  LIGNES_MAX,
  bornerFeuille,
  filtresDuPerimetre,
  manquePropose,
  retenirLesArticles,
} from "./perimetre-appro";

describe("les filtres d'un périmètre", () => {
  it("DEMANDE UNE LIGNE DE PLUS QUE LA BORNE", () => {
    // C'est ce qui permet de SAVOIR qu'on tronque : lire exactement la borne
    // rendrait « trois cents » indiscernable de « exactement trois cents ».
    expect(filtresDuPerimetre({ portee: "tout" }).limite).toBe(LIGNES_MAX + 1);
  });

  it("traduit « sous le seuil » en filtre SQL de RÉASSORT", () => {
    // ⚠ Et non en `etat: "bas"` : celui-là exige `quantite > 0`, donc il
    //   écarterait les ruptures - précisément les rayons qu'on rachète en
    //   premier.
    expect(filtresDuPerimetre({ portee: "bas" }).reassort).toBe(true);
    expect(filtresDuPerimetre({ portee: "tout" }).reassort).toBeUndefined();
  });

  it("passe le SOUS-ARBRE de catégories au SQL", () => {
    const f = filtresDuPerimetre({
      portee: "categorie",
      categories: ["boissons", "sodas"],
    });
    expect(f.categories).toEqual(["boissons", "sodas"]);
  });

  it("n'envoie PAS de filtre de catégorie quand rien n'est choisi", () => {
    // Une liste vide traduite en `inArray([])` ne ramènerait RIEN, et la
    // feuille s'afficherait vide sans que rien ne l'explique.
    expect(filtresDuPerimetre({ portee: "categorie" }).categories).toBeUndefined();
    expect(
      filtresDuPerimetre({ portee: "categorie", categories: [] }).categories
    ).toBeUndefined();
  });

  it("écarte une recherche vide ou faite d'espaces", () => {
    expect(filtresDuPerimetre({ portee: "tout", recherche: "   " }).recherche)
      .toBeUndefined();
    expect(filtresDuPerimetre({ portee: "tout", recherche: " eau " }).recherche)
      .toBe("eau");
  });

  it("NE FILTRE PAS la catégorie sur une portée qui ne la demande pas", () => {
    // Un périmètre « tout le catalogue » ne doit pas hériter des catégories
    // laissées dans l'écran par un choix précédent.
    const f = filtresDuPerimetre({ portee: "tout", categories: ["boissons"] });
    expect(f.categories).toBeUndefined();
  });
});

describe("la quantité proposée", () => {
  it("remonte au seuil, et pas au-delà", () => {
    expect(manquePropose({ seuilReassort: 10, total: 3 })).toBe(7);
  });

  it("ne propose RIEN au-dessus du seuil", () => {
    // Un négatif serait envoyé tel quel au champ de saisie, et le serveur
    // refuse désormais une entrée négative.
    expect(manquePropose({ seuilReassort: 10, total: 25 })).toBe(0);
  });

  it("propose tout le seuil sur un rayon vide", () => {
    expect(manquePropose({ seuilReassort: 48, total: 0 })).toBe(48);
  });
});

describe("la borne de la feuille", () => {
  it("DIT qu'elle tronque, et retire la ligne de trop", () => {
    const lignes = Array.from({ length: LIGNES_MAX + 1 }, (_, i) => ({ i }));
    const f = bornerFeuille(lignes);
    expect(f.tronquee).toBe(true);
    expect(f.lignes).toHaveLength(LIGNES_MAX);
  });

  it("ne tronque pas à la borne exacte", () => {
    const lignes = Array.from({ length: LIGNES_MAX }, (_, i) => ({ i }));
    const f = bornerFeuille(lignes);
    expect(f.tronquee).toBe(false);
    expect(f.lignes).toHaveLength(LIGNES_MAX);
  });

  it("laisse une feuille courte intacte", () => {
    const f = bornerFeuille([{ i: 1 }, { i: 2 }]);
    expect(f.tronquee).toBe(false);
    expect(f.lignes).toHaveLength(2);
  });
});

describe("la liste d'articles choisis", () => {
  const lignes = [
    { produitId: "a" },
    { produitId: "b" },
    { produitId: "c" },
  ];

  it("ne garde que ce qui est désigné", () => {
    expect(retenirLesArticles(lignes, ["a", "c"])).toEqual([
      { produitId: "a" },
      { produitId: "c" },
    ]);
  });

  it("ignore un article désigné qui n'est plus en base", () => {
    // Il a pu être supprimé entre le choix et la lecture : refuser toute la
    // feuille pour une référence disparue serait disproportionné.
    expect(retenirLesArticles(lignes, ["a", "zzz"])).toEqual([{ produitId: "a" }]);
  });

  it("rend une feuille VIDE quand rien n'est désigné", () => {
    // Et l'écran le DIT : « rien de choisi, la feuille serait vide ».
    expect(retenirLesArticles(lignes, [])).toEqual([]);
  });
});
