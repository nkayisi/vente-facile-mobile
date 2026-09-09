import { libellePeriodeFiltre } from "@/data/periode-filtre";
import { codesParSens } from "@/data/types-mouvement";

import {
  CLES_FILTRES,
  FILTRES_VIDES,
  aDesFiltres,
  nombreDeFiltresActifs,
  parametresApprovisionnement,
  parametresDExport,
  resumeDesFiltres,
  sansLeFiltre,
  type CleFiltre,
  type FiltresEcran,
} from "./filtres-mouvements";

/** Une valeur par clé, pour poser chaque filtre isolément. */
const VALEURS: Record<CleFiltre, Partial<FiltresEcran>> = {
  recherche: { recherche: "casse" },
  sens: { sens: true },
  type: { type: "damage" },
  entrepot: { entrepot: "w1" },
  categorie: { categorie: "c1" },
  periode: { periode: { mode: "mois", mois: "2026-07" } },
};

describe("le décompte de la pastille", () => {
  it("ne compte QUE ce que la feuille cache", () => {
    // La recherche a son champ et le sens ses puces : les compter ferait dire
    // « 2 filtres » à un écran qui n'en cache aucun.
    expect(nombreDeFiltresActifs({ ...FILTRES_VIDES, recherche: "x", sens: true }))
      .toBe(0);
  });

  it("compte les quatre filtres de la feuille", () => {
    expect(
      nombreDeFiltresActifs({
        ...FILTRES_VIDES,
        type: "damage",
        entrepot: "w1",
        categorie: "c1",
        periode: { mode: "jour" },
      })
    ).toBe(4);
  });

  it("distingue « aucun filtre caché » de « aucun filtre du tout »", () => {
    expect(aDesFiltres(FILTRES_VIDES)).toBe(false);
    expect(aDesFiltres({ ...FILTRES_VIDES, sens: true })).toBe(true);
    expect(aDesFiltres({ ...FILTRES_VIDES, recherche: " " })).toBe(false);
  });
});

describe("chaque filtre atteint RÉELLEMENT le document", () => {
  it("le balayage balaie six clés", () => {
    // Sans ce compte, une boucle sur une table vidée passerait au vert sans
    // rien démontrer. Ce dépôt s'est fait prendre trois fois.
    expect(CLES_FILTRES).toHaveLength(6);
  });

  it.each(CLES_FILTRES)("« %s » change les paramètres d'export", (cle) => {
    const nu = parametresDExport(FILTRES_VIDES);
    const pose = parametresDExport({ ...FILTRES_VIDES, ...VALEURS[cle] });
    expect(pose).not.toEqual(nu);
  });

  it("un jeu de filtres vide n'envoie AUCUN paramètre", () => {
    const p = parametresDExport(FILTRES_VIDES);
    expect(Object.values(p).every((v) => v === undefined)).toBe(true);
  });
});

describe("le sens part en liste de types, jamais en `direction`", () => {
  it("envoie tous les types d'entrée, `unpack` COMPRIS", () => {
    // Le serveur ne range `unpack` dans aucun des deux sens : `?direction=in`
    // l'exclurait du fichier alors que la liste le montre parmi les entrées.
    const p = parametresDExport({ ...FILTRES_VIDES, sens: true });
    expect(p.movement_type?.split(",")).toEqual(codesParSens(true));
    expect(p.movement_type).toContain("unpack");
  });

  it("INTERSECTE le type et le sens, il ne les écrase pas", () => {
    expect(parametresDExport({ ...FILTRES_VIDES, type: "purchase", sens: true })
      .movement_type).toBe("purchase");
  });

  it("n'envoie AUCUN type quand les deux se contredisent", () => {
    // C'est le cas qui rendait un document plein sous une liste vide.
    // L'écran, lui, ferme son bouton : son cadran compte déjà zéro.
    expect(parametresDExport({ ...FILTRES_VIDES, type: "sale", sens: true })
      .movement_type).toBeUndefined();
  });
});

describe("les puces retirables", () => {
  const libelle = (p: Parameters<typeof libellePeriodeFiltre>[0]) =>
    libellePeriodeFiltre(p, new Date(2026, 8, 5));

  it("nomme chaque filtre posé, dans l'ordre de la feuille", () => {
    const puces = resumeDesFiltres(
      { ...FILTRES_VIDES, entrepot: "w1", categorie: "c1", type: "damage",
        periode: { mode: "mois", mois: "2026-07" } },
      { entrepot: "Dépôt central", categorie: "Boissons" },
      libelle
    );
    expect(puces.map((p) => p.cle)).toEqual(["entrepot", "categorie", "type", "periode"]);
    expect(puces.map((p) => p.label)).toEqual([
      "Dépôt central", "Boissons", "Dommage/Perte", "juillet 2026",
    ]);
  });

  it("écrit « inconnu » plutôt qu'un IDENTIFIANT quand le nom manque", () => {
    // Un UUID dans une puce de filtre n'est pas un nom, c'est du bruit.
    const puces = resumeDesFiltres(
      { ...FILTRES_VIDES, entrepot: "0c9f-…" }, {}, libelle
    );
    expect(puces[0].label).toBe("Entrepôt inconnu");
    expect(puces[0].label).not.toContain("0c9f");
  });

  it("ne montre rien quand aucun filtre n'est posé", () => {
    expect(resumeDesFiltres(FILTRES_VIDES, {}, libelle)).toEqual([]);
  });
});

describe("retirer un filtre", () => {
  it.each(CLES_FILTRES)("« %s » revient à sa valeur vide sans toucher aux autres", (cle) => {
    const tout: FiltresEcran = {
      recherche: "x", sens: true, type: "damage",
      entrepot: "w1", categorie: "c1", periode: { mode: "jour" },
    };
    const apres = sansLeFiltre(tout, cle);
    expect(apres[cle]).toEqual(FILTRES_VIDES[cle]);
    for (const autre of CLES_FILTRES) {
      if (autre !== cle) expect(apres[autre]).toEqual(tout[autre]);
    }
  });
});

describe("le périmètre hérité par le rapport d'approvisionnement", () => {
  it("garde l'entrepôt, la catégorie et la période", () => {
    const p = parametresApprovisionnement({
      ...FILTRES_VIDES, entrepot: "w1", categorie: "c1",
      periode: { mode: "mois", mois: "2026-07" },
    });
    expect(p).toEqual({ warehouse: "w1", category: "c1", month: "2026-07" });
  });

  it("N'HÉRITE NI du type NI de la recherche", () => {
    // Le rapport porte sur les ENTRÉES : y superposer un filtre de sortie le
    // viderait, et la recherche le réduirait à un produit.
    const p = parametresApprovisionnement({
      ...FILTRES_VIDES, type: "damage", sens: false, recherche: "casse",
    });
    expect(p.movement_type).toBeUndefined();
    expect(p.search).toBeUndefined();
  });
});
