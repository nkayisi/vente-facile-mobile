import type { LigneTransfert } from "@/data/stock-operations";
import {
  lignesDeReception,
  partageExpedie,
  refusDeReception,
  saisiesInitiales,
} from "@/features/stock/reception";

const ligne = (
  id: string,
  facteur: number | null,
  produit = `Article ${id}`,
  partage: { contenants: number | null; vrac: number | null } = {
    contenants: 2,
    vrac: 0,
  }
): LigneTransfert => ({
  id,
  produit,
  sku: null,
  demandeAffiche: "2 CASIERS",
  demande: 24,
  expedie: 24,
  recu: null,
  facteur,
  contenantsExpedies: partage.contenants,
  vracExpedie: partage.vrac,
});

/** 3 casiers de 12 + 7 bouteilles = 43 unités expédiées. */
const CONDITIONNE: LigneTransfert = {
  ...ligne("l1", 12),
  demandeAffiche: "3 CASIERS + 7 BOUTEILLES",
  demande: 43,
  expedie: 43,
  contenantsExpedies: 3,
  vracExpedie: 7,
};
const SIMPLE = ligne("l2", null, "Savon", { contenants: null, vrac: null });
/** Conditionné, mais préparé en total : aucun partage n'a été enregistré. */
const SANS_PARTAGE: LigneTransfert = {
  ...ligne("l3", 12, "Sucre", { contenants: null, vrac: null }),
  demande: 24,
  expedie: 24,
};

describe("le partage expédié, lu et jamais redivisé", () => {
  it("rend les deux canaux ENREGISTRÉS, sans diviser le total", () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ `expedie / facteur` REDÉCOUPERAIT au facteur du jour un envoi      │
    // │ préparé sous un autre. 43 / 12 rendrait « 3 casiers + 7 », ce qui  │
    // │ tombe juste ici par hasard ; le jour où le marchand passe ses      │
    // │ casiers de 12 à 24, la même ligne rendrait « 1 casier + 19 » pour  │
    // │ une marchandise qui a voyagé en trois casiers.                      │
    // └────────────────────────────────────────────────────────────────────┘
    expect(partageExpedie(CONDITIONNE)).toEqual({
      canaux: true,
      contenants: 3,
      vrac: 7,
      total: 43,
    });
  });

  it("retombe sur le TOTAL quand aucun partage n'est enregistré", () => {
    // Il n'y a alors rien à proposer par canal, et l'inventer serait pire que
    // ne rien offrir.
    expect(partageExpedie(SANS_PARTAGE)).toEqual({ canaux: false, total: 24 });
    expect(partageExpedie(SIMPLE)).toEqual({ canaux: false, total: 24 });
  });
});

describe("les champs à l'ouverture de la feuille", () => {
  it("portent l'EXPÉDIÉ, canal par canal", () => {
    expect(saisiesInitiales([CONDITIONNE, SIMPLE])).toEqual({
      l1: { contenants: "3", vrac: "7" },
      l2: { contenants: "", vrac: "24" },
    });
  });

  it("valident le cas ordinaire sans une frappe", () => {
    // « Tout est arrivé » est le cas le plus fréquent : ce qui est à l'écran
    // part tel quel, et redonne exactement l'expédition.
    const lignes = [CONDITIONNE, SIMPLE];
    expect(lignesDeReception(lignes, saisiesInitiales(lignes))).toEqual([
      { ligne: "l1", contenants: 3, vrac: 7 },
      { ligne: "l2", total: 24 },
    ]);
  });
});

describe("ce que le magasinier a réellement déchargé", () => {
  it("CORRIGER UN CANAL NE VIDE PAS L'AUTRE", () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ LE DÉFAUT QUE CE MODULE EXISTE POUR FERMER.                        │
    // │                                                                    │
    // │ La règle du serveur est PAR LIGNE : dès qu'un canal porte une      │
    // │ valeur, l'autre part à zéro. Avec des champs laissés vides, le     │
    // │ magasinier qui saisissait « 2 contenants » sur un envoi de         │
    // │ « 3 casiers + 7 bouteilles » perdait les sept bouteilles, en       │
    // │ silence, en croyant avoir tout réceptionné.                         │
    // └────────────────────────────────────────────────────────────────────┘
    const depart = saisiesInitiales([CONDITIONNE]);
    const corrige = { l1: { ...depart.l1, contenants: "2" } };
    expect(lignesDeReception([CONDITIONNE], corrige)).toEqual([
      { ligne: "l1", contenants: 2, vrac: 7 },
    ]);
  });

  it("envoie TOUTES les lignes, pas seulement celles qu'on a touchées", () => {
    // Les champs étant préremplis, une ligne non corrigée porte déjà son
    // expédition : l'omettre reviendrait au même, mais le dire est ce qui rend
    // la feuille relisible.
    const lignes = [CONDITIONNE, SIMPLE];
    const depart = saisiesInitiales(lignes);
    const recues = lignesDeReception(lignes, { ...depart, l2: { contenants: "", vrac: "3" } });
    expect(recues).toHaveLength(2);
    expect(recues).toContainEqual({ ligne: "l2", total: 3 });
  });

  it("ZÉRO est une valeur : on peut ne rien recevoir d'une ligne", () => {
    // Un camion arrive sans l'un des articles : c'est un constat, et il doit
    // pouvoir s'écrire. Un champ VIDÉ à la main vaut donc zéro - le
    // préremplissage a montré ce qui était attendu, l'effacer est une
    // affirmation.
    expect(
      lignesDeReception([SIMPLE], { l2: { contenants: "", vrac: "0" } })
    ).toEqual([{ ligne: "l2", total: 0 }]);
    expect(
      lignesDeReception([SIMPLE], { l2: { contenants: "", vrac: "" } })
    ).toEqual([{ ligne: "l2", total: 0 }]);
  });

  it("rend un TOTAL pour un produit sans conditionnement", () => {
    expect(
      lignesDeReception([SIMPLE], { l2: { contenants: "", vrac: "7" } })
    ).toEqual([{ ligne: "l2", total: 7 }]);
  });

  it("lit un séparateur de milliers et une virgule décimale", () => {
    // `lireNombre` existe pour ça : « 1 200 » ne doit pas valoir 1.
    expect(
      lignesDeReception([SIMPLE], { l2: { contenants: "", vrac: "1 200" } })
    ).toEqual([{ ligne: "l2", total: 1200 }]);
    expect(
      lignesDeReception([SIMPLE], { l2: { contenants: "", vrac: "2,5" } })
    ).toEqual([{ ligne: "l2", total: 2.5 }]);
  });

  it("rend `undefined` sur une saisie illisible, jamais un zéro", () => {
    // Compter zéro sur une faute de frappe ferait réceptionner une ligne vide.
    expect(
      lignesDeReception([SIMPLE], { l2: { contenants: "", vrac: "1,2,3" } })
    ).toBeUndefined();
  });

  it("n'envoie rien du tout quand le transfert n'a aucune ligne", () => {
    expect(lignesDeReception([], {})).toBeUndefined();
  });
});

describe("le motif de refus, en toutes lettres", () => {
  it("se tait quand tout est lisible", () => {
    expect(refusDeReception([CONDITIONNE], { l1: { contenants: "2", vrac: "0" } })).toBeNull();
    expect(refusDeReception([CONDITIONNE], {})).toBeNull();
  });

  it("NOMME l'article et ce qui cloche", () => {
    // Un refus qui ne dit pas SUR QUELLE LIGNE laisse le magasinier relire
    // toute sa feuille.
    const m = refusDeReception([SIMPLE], { l2: { contenants: "", vrac: "abc" } });
    expect(m).toContain("Savon");
    expect(m).toContain("illisible");
  });

  it("distingue le négatif de l'illisible", () => {
    const m = refusDeReception([SIMPLE], { l2: { contenants: "", vrac: "-3" } });
    expect(m).toContain("négative");
  });
});
