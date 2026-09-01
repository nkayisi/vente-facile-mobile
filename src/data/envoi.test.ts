/**
 * Ce qu'un écran DIT d'un acte qui n'est pas encore arrivé.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE MODULE N'A QU'UN TRAVAIL : NE PAS FAIRE ATTENDRE LE RÉSEAU À QUI     │
 * │ ATTEND UNE DÉCISION.                                                     │
 * │                                                                          │
 * │ Une opération bloquée ne part pas d'elle-même : il faut régler un        │
 * │ abonnement ou accorder un droit. « Attend son envoi » envoie le marchand │
 * │ chercher du réseau, le trouver, synchroniser, et constater que rien ne   │
 * │ bouge - potentiellement des jours durant.                                │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import { libelleEnvoi, pireEnvoi } from "./envoi";

describe("libelleEnvoi", () => {
  it("ne dit RIEN d'un acte arrivé", () => {
    // Une vente tirée est arrêtée : lui coller une mention en ferait douter.
    expect(libelleEnvoi("envoye")).toBeNull();
    expect(libelleEnvoi(undefined)).toBeNull();
  });

  it("distingue « attend son envoi » de « attend un droit »", () => {
    const file = libelleEnvoi("en_attente")!;
    const bloque = libelleEnvoi("bloque")!;

    expect(file.court).not.toBe(bloque.court);
    // Le ton aussi : un blocage appelle un geste, une file n'appelle rien.
    expect(file.ton).toBe("neutral");
    expect(bloque.ton).toBe("warning");
  });

  it("ne propose JAMAIS de synchroniser pour débloquer", () => {
    // C'est sans effet, et le proposer est précisément ce qui fait perdre des
    // jours : le marchand croit que son réseau est en cause.
    const detail = libelleEnvoi("bloque")!.detail.toLowerCase();
    expect(detail).not.toContain("synchronis");
    expect(detail).not.toContain("réessay");
    // Il doit en revanche nommer ce qui débloque.
    expect(detail).toMatch(/abonnement|permission/);
  });

  it("dit qu'une opération en file partira seule", () => {
    expect(libelleEnvoi("en_attente")!.detail.toLowerCase()).toContain(
      "synchronisation"
    );
  });
});

describe("pireEnvoi", () => {
  it("annonce le BLOCAGE dès qu'une seule pièce est bloquée", () => {
    // Un bandeau qui résume plusieurs actes doit dire le pire : « attend son
    // envoi » sur un lot dont une pièce est bloquée fait attendre en vain.
    expect(pireEnvoi(["envoye", "en_attente", "bloque"])).toBe("bloque");
  });

  it("retombe sur la file, puis sur le silence", () => {
    expect(pireEnvoi(["envoye", "en_attente"])).toBe("en_attente");
    expect(pireEnvoi(["envoye", "envoye"])).toBe("envoye");
    expect(pireEnvoi([])).toBe("envoye");
    expect(pireEnvoi([undefined, undefined])).toBe("envoye");
  });
});
