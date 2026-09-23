import {
  comparerProprietaire,
  doitRattraper,
  estampillerDepuis,
  suitePourBase,
  type Estampille,
} from "./proprietaire";

const X: Estampille = {
  userId: "u-1",
  organizationId: "o-1",
  userLibelle: "Nelly Kayisi",
  userEmail: "nelly@exemple.cd",
  organizationLibelle: "NekaShop",
  estampilleeAt: "2026-09-18T08:00:00.000Z",
};

describe("comparerProprietaire", () => {
  it("rend `vierge` sur une base neuve et vide", () => {
    expect(comparerProprietaire(null, { userId: "u-1", organizationId: "o-1" }, false)).toBe(
      "vierge"
    );
  });

  /**
   * ⚠ Réinstallation par-dessus, ou purge interrompue : des données sont là et
   * personne ne peut dire de qui. Les traiter comme vierges rouvrirait la fusion
   * par le seul chemin que la modale ne couvre pas.
   */
  it("rend `etrangere` sans estampille quand la base est HABITÉE", () => {
    expect(comparerProprietaire(null, { userId: "u-1", organizationId: "o-1" }, true)).toBe(
      "etrangere"
    );
  });

  it("rend `meme` pour le même utilisateur dans le même établissement", () => {
    expect(comparerProprietaire(X, { userId: "u-1", organizationId: "o-1" }, true)).toBe("meme");
  });

  it("rend `etrangere` pour un autre utilisateur", () => {
    expect(comparerProprietaire(X, { userId: "u-2", organizationId: "o-1" }, true)).toBe(
      "etrangere"
    );
  });

  /**
   * ⚠ LE CAS QU'ON OUBLIE.
   *
   * Aucune table tirée ne porte de colonne de locataire, et le serveur l'écrit
   * déjà : « changer d'organisation impose de repartir d'une base locale vide ».
   * Un gérant de deux boutiques verrait sinon l'union des deux catalogues.
   */
  it("rend `etrangere` pour le MÊME utilisateur dans une AUTRE organisation", () => {
    expect(comparerProprietaire(X, { userId: "u-1", organizationId: "o-2" }, true)).toBe(
      "etrangere"
    );
  });

  it("ne regarde pas la population quand l'estampille est là", () => {
    expect(comparerProprietaire(X, { userId: "u-1", organizationId: "o-1" }, false)).toBe("meme");
  });
});

describe("suitePourBase", () => {
  it("ouvre sur `vierge` et sur `meme`, quoi qu'il reste en file", () => {
    expect(suitePourBase("vierge", 0)).toBe("ouvrir");
    expect(suitePourBase("meme", 12)).toBe("ouvrir");
  });

  it("purge une base étrangère qui ne porte plus rien à envoyer", () => {
    expect(suitePourBase("etrangere", 0)).toBe("purger");
  });

  /**
   * ⚠ LE TEST QUI COMPTE.
   *
   * Purger ici détruirait en silence des ventes encaissées, dont le client tient
   * le ticket. Un refus se NOMME avant de se subir.
   */
  it("fait ARBITRER dès qu'une seule opération n'est pas envoyée", () => {
    expect(suitePourBase("etrangere", 1)).toBe("arbitrer");
    expect(suitePourBase("etrangere", 200)).toBe("arbitrer");
  });
});

describe("estampillerDepuis", () => {
  it("retient de quoi nommer l'ancien propriétaire après `clearSession`", () => {
    const e = estampillerDepuis(
      { id: "u-1", email: "nelly@exemple.cd", full_name: "Nelly Kayisi" },
      { id: "o-1", name: "NekaShop" },
      new Date("2026-09-18T08:00:00.000Z")
    );
    expect(e).toEqual(X);
  });

  it("se replie sur le courriel quand le nom complet est vide", () => {
    const e = estampillerDepuis(
      { id: "u-1", email: "nelly@exemple.cd", full_name: "" },
      { id: "o-1", name: "NekaShop" }
    );
    expect(e.userLibelle).toBe("nelly@exemple.cd");
  });
});

describe("doitRattraper", () => {
  it("adopte l'instantané sur une base HABITÉE sans estampille", () => {
    // Le parc déjà en service : base pleine, aucune estampille. Sans cela, le
    // premier lancement après la mise à jour enverrait tout le monde sur
    // l'écran de reprise.
    expect(doitRattraper(null, true)).toBe(true);
  });

  /**
   * ⚠ LE TEST QUI COMPTE.
   *
   * Sans cette borne, le rattrapage reste armé indéfiniment : tout instantané
   * écrit hors du fournisseur se ferait adopter par les données du compte
   * précédent, et les deux établissements fusionneraient en silence.
   */
  it("n'adopte RIEN sur une base vide : il n'y a rien à sauver", () => {
    expect(doitRattraper(null, false)).toBe(false);
  });

  it("ne touche jamais à une estampille existante", () => {
    expect(doitRattraper(X, true)).toBe(false);
    expect(doitRattraper(X, false)).toBe(false);
  });
});
