/**
 * Politique du verrou local.
 *
 * Ce que ces tests protègent : un passant ne doit pas pouvoir encaisser sur un
 * terminal laissé sur le comptoir, et une série d'essais ratés ne doit JAMAIS
 * détruire quoi que ce soit. L'ancienne application effaçait la base au
 * moindre doute sur la session, ce qui emportait les ventes non synchronisées ;
 * ici, la seule sanction est du temps perdu.
 */
import {
  PIN_MAX_LENGTH,
  PIN_MIN_LENGTH,
  hasPin,
  removePin,
  setPin,
  unlockDelayRemaining,
  verifyPin,
} from "./lock";
import {
  readPin,
  readSnapshot,
  writePinLockedUntil,
  writeSnapshot,
} from "./storage";

beforeEach(() => {
  (global as unknown as { __resetKeychain: () => void }).__resetKeychain();
});

describe("définition du code", () => {
  it("range un sel et une empreinte, jamais le code lui-même", async () => {
    await setPin("1234");

    const record = await readPin();
    expect(record).not.toBeNull();
    expect(record!.salt).toBeTruthy();
    expect(record!.hash).not.toContain("1234");
    expect(await hasPin()).toBe(true);
  });

  it("refuse un code trop court ou trop long", async () => {
    await expect(setPin("123")).rejects.toThrow();
    await expect(setPin("1".repeat(PIN_MAX_LENGTH + 1))).rejects.toThrow();
    await expect(setPin("1".repeat(PIN_MIN_LENGTH))).resolves.toBeUndefined();
  });

  it("deux codes identiques donnent des empreintes différentes", async () => {
    await setPin("1234");
    const first = await readPin();
    await removePin();
    await setPin("1234");
    const second = await readPin();

    // Le sel est aléatoire : deux terminaux avec le même code ne se
    // reconnaissent pas à leur empreinte.
    expect(first!.salt).not.toBe(second!.salt);
  });
});

describe("vérification", () => {
  it("accepte le bon code et refuse un autre", async () => {
    await setPin("1234");

    expect(await verifyPin("1234")).toEqual({ status: "ok" });
    expect((await verifyPin("9999")).status).toBe("wrong");
  });

  it("annonce le nombre d'essais restants", async () => {
    await setPin("1234");

    const first = await verifyPin("0000");
    expect(first).toEqual({ status: "wrong", remaining: 9 });

    const second = await verifyPin("0000");
    expect(second).toEqual({ status: "wrong", remaining: 8 });
  });

  it("remet le compteur à zéro dès qu'un essai réussit", async () => {
    await setPin("1234");
    await verifyPin("0000");
    await verifyPin("0000");

    expect(await verifyPin("1234")).toEqual({ status: "ok" });
    expect(await verifyPin("0000")).toEqual({ status: "wrong", remaining: 9 });
  });

  it("répond « pas de code » quand aucun n'est défini", async () => {
    expect(await verifyPin("1234")).toEqual({ status: "no_pin" });
  });
});

describe("temporisation", () => {
  it("temporise à partir du cinquième essai raté", async () => {
    await setPin("1234");

    for (let i = 0; i < 4; i++) {
      expect((await verifyPin("0000")).status).toBe("wrong");
    }

    const fifth = await verifyPin("0000");
    expect(fifth.status).toBe("delayed");
    expect(await unlockDelayRemaining()).toBeGreaterThan(0);
  });

  it("refuse même le BON code pendant la temporisation", async () => {
    await setPin("1234");
    for (let i = 0; i < 5; i++) await verifyPin("0000");

    // Sinon la temporisation ne coûterait rien : il suffirait d'attendre le
    // bon coup pour la traverser.
    expect((await verifyPin("1234")).status).toBe("delayed");
  });

  it("la temporisation survit à un redémarrage de l'application", async () => {
    await setPin("1234");
    for (let i = 0; i < 5; i++) await verifyPin("0000");

    // Le trousseau la porte, pas la mémoire du processus : relire suffit à
    // prouver qu'un redémarrage ne l'efface pas.
    const remaining = await unlockDelayRemaining();
    expect(remaining).toBeGreaterThan(0);
  });

  it("bloque définitivement au dixième essai, sans rien détruire", async () => {
    await setPin("1234");

    let outcome = await verifyPin("0000");
    for (let i = 1; i < 10 && outcome.status !== "exhausted"; i++) {
      // On force l'écoulement de la temporisation : le test porte sur le
      // compteur d'essais, pas sur l'horloge.
      await writePinLockedUntil(0);
      outcome = await verifyPin("0000");
    }

    expect(outcome.status).toBe("exhausted");

    // Et surtout : le code et l'identité mise en cache sont TOUJOURS là. Un
    // caissier bloqué se reconnecte, il ne perd pas sa journée.
    expect(await hasPin()).toBe(true);
  });
});

describe("l'instantané survit à tout ce qui précède", () => {
  it("n'est pas touché par les essais ratés", async () => {
    await writeSnapshot({ marqueur: "ventes du jour" });
    await setPin("1234");
    for (let i = 0; i < 6; i++) await verifyPin("0000");

    expect(await readSnapshot()).toEqual({ marqueur: "ventes du jour" });
  });
});
