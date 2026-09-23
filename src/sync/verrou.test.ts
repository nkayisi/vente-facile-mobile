import {
  attendreLibre,
  avecVerrou,
  estPris,
  prendre,
  reinitialiserPourTest,
  rendre,
} from "./verrou";

beforeEach(reinitialiserPourTest);

describe("le verrou de cycle", () => {
  it("est libre au repos", () => {
    expect(estPris()).toBe(false);
  });

  it("refuse un second preneur tant qu'il est tenu", () => {
    expect(prendre()).toBe(true);
    expect(prendre()).toBe(false);
    expect(estPris()).toBe(true);
  });

  it("se reprend une fois rendu", () => {
    prendre();
    rendre();
    expect(prendre()).toBe(true);
  });

  it("tolère un `rendre` sur un verrou libre", () => {
    expect(() => rendre()).not.toThrow();
    expect(estPris()).toBe(false);
  });
});

describe("avecVerrou", () => {
  it("exécute et rend le résultat", async () => {
    await expect(avecVerrou(async () => 42)).resolves.toBe(42);
    expect(estPris()).toBe(false);
  });

  it("rend `null` sans exécuter quand le verrou est tenu", async () => {
    prendre();
    const espion = jest.fn(async () => 42);
    await expect(avecVerrou(espion)).resolves.toBeNull();
    expect(espion).not.toHaveBeenCalled();
  });

  /**
   * ⚠ LE TEST QUI COMPTE.
   *
   * Sans le `finally`, une exception laisserait le verrou tenu pour toujours et
   * plus aucune synchronisation ne partirait de la session. Rien ne le dirait :
   * le terminal cesserait simplement de se synchroniser.
   */
  it("rend le verrou même quand la fonction lève", async () => {
    await expect(
      avecVerrou(async () => {
        throw new Error("boum");
      })
    ).rejects.toThrow("boum");
    expect(estPris()).toBe(false);
    expect(prendre()).toBe(true);
  });

  it("sérialise deux appels concurrents : le second ne s'exécute pas", async () => {
    let entrees = 0;
    const lent = avecVerrou(async () => {
      entrees += 1;
      await new Promise((r) => setTimeout(r, 30));
      return "premier";
    });
    const refuse = await avecVerrou(async () => {
      entrees += 1;
      return "second";
    });

    expect(refuse).toBeNull();
    await expect(lent).resolves.toBe("premier");
    expect(entrees).toBe(1);
  });
});

describe("attendreLibre", () => {
  it("rend vrai tout de suite quand le verrou est libre", async () => {
    await expect(attendreLibre(50)).resolves.toBe(true);
  });

  it("rend vrai dès que le verrou se libère", async () => {
    prendre();
    setTimeout(rendre, 50);
    await expect(attendreLibre(2000)).resolves.toBe(true);
  });

  /**
   * On rend la main plutôt que d'attendre indéfiniment : un cycle bloqué sur
   * une requête qui n'expire jamais retiendrait le marchand devant une roue.
   */
  it("rend faux quand l'attente expire", async () => {
    prendre();
    await expect(attendreLibre(50)).resolves.toBe(false);
  });
});
