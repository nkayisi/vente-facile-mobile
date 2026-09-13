/**
 * Le réglage, et la seule garantie qui empêche un plantage au comptoir.
 *
 * Avant la fusion des deux Bluetooth, `transport` pouvait valoir `ble`. Cette
 * valeur n'existe plus dans la table des pilotes : l'y chercher rend
 * `undefined`, et la première impression plante. Le terminal d'un marchand qui
 * avait choisi le BLE porte cette valeur en base, aujourd'hui.
 */
import {
  libelleTransport,
  normaliserReglage,
  REGLAGE_PAR_DEFAUT,
  TRANSPORTS,
} from "./reglage";

describe("normaliserReglage", () => {
  it("migre l'ancien transport `ble` en un lien Bluetooth", () => {
    const r = normaliserReglage({
      transport: "ble",
      adresse: "AA:BB:CC:DD:EE:FF",
      nom: "MPT-II",
      paperWidth: 58,
      cut: true,
      densite: 110,
    });

    expect(r.transport).toBe("bluetooth");
    expect(r.lien).toBe("gatt");
    // L'imprimante choisie ne se perd pas : la migrer sans elle obligerait le
    // marchand à la rechercher, sans savoir pourquoi elle a disparu.
    expect(r.adresse).toBe("AA:BB:CC:DD:EE:FF");
    expect(r.nom).toBe("MPT-II");
  });

  it("lit un ancien `bluetooth` sans lien comme du profil série", () => {
    const r = normaliserReglage({ transport: "bluetooth", adresse: "AA:BB", nom: "POS58" });
    // C'est ce que le mot voulait dire avant la fusion.
    expect(r.lien).toBe("spp");
  });

  it("garde le lien déjà enregistré", () => {
    expect(normaliserReglage({ transport: "bluetooth", adresse: "AA:BB", lien: "gatt" }).lien)
      .toBe("gatt");
  });

  it("oublie l'appareil dès que le transport n'est plus le Bluetooth", () => {
    const r = normaliserReglage({
      transport: "pdf",
      adresse: "AA:BB",
      nom: "POS58",
      lien: "spp",
    });
    // Une adresse oubliée ressortirait au prochain passage en Bluetooth, sur
    // une imprimante dont le marchand ne se souvient pas.
    expect(r.adresse).toBeUndefined();
    expect(r.nom).toBeUndefined();
    expect(r.lien).toBeUndefined();
  });

  it("ne retient ni lien ni nom sans adresse : les trois vont ensemble", () => {
    // C'est l'état réel d'un terminal qui a choisi Bluetooth et n'a jamais pu
    // désigner d'imprimante, faute de permission.
    const r = normaliserReglage({ transport: "bluetooth", nom: "POS58", lien: "gatt" });
    expect(r.transport).toBe("bluetooth");
    expect(r.lien).toBeUndefined();
    expect(r.nom).toBeUndefined();
  });

  it("conserve le papier, la coupe et la densité", () => {
    const r = normaliserReglage({ transport: "pdf", paperWidth: 80, cut: false, densite: 130 });
    expect(r).toMatchObject({ paperWidth: 80, cut: false, densite: 130 });
  });

  it("corrige une largeur, une coupe ou une densité que le reste du module ne saurait pas lire", () => {
    const r = normaliserReglage({
      transport: "embedded",
      paperWidth: 57,
      cut: "oui",
      densite: "sombre",
    });
    expect(r.paperWidth).toBe(58);
    expect(r.cut).toBe(true);
    expect(r.densite).toBe(REGLAGE_PAR_DEFAUT.densite);
  });

  /**
   * L'INVARIANT ANTI-PLANTAGE.
   *
   * C'est celui qui aurait évité `PAR_ID["ble"] === undefined`. Il ne porte pas
   * sur la migration mais sur TOUTE valeur, y compris celles qu'une version
   * future écrirait.
   */
  it.each([
    ["ble", "l'ancien transport"],
    ["usb", "un transport qui n'existe pas"],
    ["", "une chaîne vide"],
    [42, "un nombre"],
    [null, "un nul"],
    [undefined, "une clé absente"],
    [{ nested: true }, "un objet"],
  ])("rend un transport connu quand `transport` vaut %p (%s)", (valeur, _quoi) => {
    const r = normaliserReglage({ transport: valeur });
    expect(TRANSPORTS).toContain(r.transport);
  });

  it.each([
    [null, "un nul"],
    [undefined, "rien"],
    ["{}", "une chaîne"],
    [42, "un nombre"],
    [[1, 2], "un tableau"],
  ])("retombe sur le défaut quand la base rend %p (%s)", (brut, _quoi) => {
    // `JSON.parse` d'une valeur abîmée rend n'importe quoi, et il n'y a alors
    // rien à sauver.
    expect(normaliserReglage(brut)).toEqual(REGLAGE_PAR_DEFAUT);
  });
});

describe("libelleTransport", () => {
  it("nomme les trois transports en français", () => {
    expect(libelleTransport("embedded")).toBe("imprimante du terminal");
    expect(libelleTransport("bluetooth")).toBe("Bluetooth");
    expect(libelleTransport("pdf")).toBe("PDF");
  });

  it("nomme aussi l'ancien `ble`, que le journal d'impression porte encore", () => {
    // `print_jobs.transport` est un JOURNAL : ses lignes d'avant la fusion ne
    // sont pas migrées, et elles s'affichent.
    expect(libelleTransport("ble")).toBe("Bluetooth");
  });

  it("rend une valeur inconnue telle quelle plutôt que de se taire", () => {
    expect(libelleTransport("usb")).toBe("usb");
  });
});
