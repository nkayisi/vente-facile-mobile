import { avecImprimanteChoisie, fusionner, type ImprimanteTrouvee } from "./fusion";

const i = (p: Partial<ImprimanteTrouvee> & { adresse: string }): ImprimanteTrouvee => ({
  nom: "POS58",
  lien: "spp",
  appairee: false,
  ...p,
});

describe("fusionner", () => {
  it("réunit une imprimante bimode en UNE rangée, en profil série", () => {
    // Sur Android l'identifiant d'un périphérique BLE EST sa MAC : la collision
    // est certaine, et la série est le lien le plus sûr pour un flux d'octets.
    const r = fusionner(
      [i({ adresse: "AA:BB:CC:DD:EE:FF", lien: "spp", appairee: true })],
      [i({ adresse: "AA:BB:CC:DD:EE:FF", lien: "gatt" })]
    );
    expect(r).toHaveLength(1);
    expect(r[0].lien).toBe("spp");
  });

  it("reconnaît la même machine écrite dans une autre casse", () => {
    const r = fusionner(
      [i({ adresse: "aa:bb:cc:dd:ee:ff" })],
      [i({ adresse: "AA:BB:CC:DD:EE:FF", lien: "gatt" })]
    );
    expect(r).toHaveLength(1);
  });

  it("garde en basse consommation une appairée qui ne parle que ce lien", () => {
    // `getBondedDevices()` rend TOUS les appareils appairés, BLE compris : les
    // traiter en série les ferait échouer à l'impression.
    const r = fusionner([i({ adresse: "AA:BB", lien: "gatt", appairee: true })], []);
    expect(r[0].lien).toBe("gatt");
  });

  it("préfère l'appairée à la découverte, à lien égal", () => {
    const r = fusionner(
      [i({ adresse: "AA:BB", nom: "Nom du système", appairee: true })],
      [i({ adresse: "AA:BB", nom: "Nom annoncé" })]
    );
    expect(r[0].appairee).toBe(true);
    expect(r[0].nom).toBe("Nom du système");
  });

  it("met les appairées en tête : ce sont celles qui impriment tout de suite", () => {
    const r = fusionner(
      [i({ adresse: "11:11", nom: "Zebra" })],
      [i({ adresse: "22:22", nom: "Alpha", appairee: true })]
    );
    expect(r.map((x) => x.nom)).toEqual(["Alpha", "Zebra"]);
  });

  it("range par nom à l'intérieur de chaque groupe", () => {
    const r = fusionner([
      i({ adresse: "33:33", nom: "Charlie" }),
      i({ adresse: "11:11", nom: "Alpha" }),
      i({ adresse: "22:22", nom: "Bravo" }),
    ]);
    expect(r.map((x) => x.nom)).toEqual(["Alpha", "Bravo", "Charlie"]);
  });

  it("range deux homonymes de façon stable", () => {
    // Deux imprimantes du même modèle portent le même nom : sans départage,
    // la ligne visée changerait de place d'un rendu à l'autre.
    const r = fusionner([i({ adresse: "BB:BB", nom: "POS58" }), i({ adresse: "AA:AA", nom: "POS58" })]);
    expect(r.map((x) => x.adresse)).toEqual(["AA:AA", "BB:BB"]);
  });

  it("rend une liste vide sans lever", () => {
    expect(fusionner([], [])).toEqual([]);
  });
});

describe("avecImprimanteChoisie", () => {
  /**
   * LE DÉFAUT RELEVÉ À L'ÉCRAN.
   *
   * Le terminal imprimait par Bluetooth sur « T58_9345 » et l'écran annonçait
   * « Aucune imprimante pour l'instant » : la liste ne portait que le résultat
   * d'une recherche, et une imprimante au repos n'y figure pas. Le marchand en
   * conclut que son réglage est perdu, et le refait.
   */
  it("ajoute l'imprimante choisie quand la recherche ne l'a pas vue", () => {
    const r = avecImprimanteChoisie([], {
      adresse: "86:67:7A:91:93:45",
      nom: "T58_9345",
      lien: "spp",
    });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ adresse: "86:67:7A:91:93:45", nom: "T58_9345", lien: "spp" });
  });

  it("la met en TÊTE : c'est celle que le marchand vient vérifier", () => {
    const r = avecImprimanteChoisie([i({ adresse: "11:11", nom: "Autre" })], {
      adresse: "22:22",
      nom: "La mienne",
      lien: "gatt",
    });
    expect(r[0].nom).toBe("La mienne");
  });

  it("ne la double PAS quand la recherche l'a trouvée", () => {
    const trouvee = i({ adresse: "AA:BB", nom: "T58", appairee: true });
    const r = avecImprimanteChoisie([trouvee], { adresse: "aa:bb", nom: "T58", lien: "spp" });
    expect(r).toEqual([trouvee]);
  });

  it("ne touche à rien quand aucune imprimante n'est choisie", () => {
    const liste = [i({ adresse: "11:11" })];
    expect(avecImprimanteChoisie(liste, {})).toEqual(liste);
  });

  it("retombe sur l'adresse quand le nom manque", () => {
    expect(avecImprimanteChoisie([], { adresse: "AA:BB" })[0].nom).toBe("AA:BB");
  });
});
