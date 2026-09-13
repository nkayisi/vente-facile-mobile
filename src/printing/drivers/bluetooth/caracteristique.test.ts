import { classerCaracteristiques, court, type CaracteristiqueInscriptible } from "./caracteristique";

const c = (
  uuid: string,
  options: Partial<CaracteristiqueInscriptible> = {}
): CaracteristiqueInscriptible => ({
  uuid,
  serviceUUID: "0000ffe0-0000-1000-8000-00805f9b34fb",
  isWritableWithResponse: false,
  isWritableWithoutResponse: true,
  ...options,
});

const INCONNUE = "0000abcd-0000-1000-8000-00805f9b34fb";
const FFE1 = "0000ffe1-0000-1000-8000-00805f9b34fb";
const NORDIC_RX = "6e400002-b5a3-f393-e0a9-e50e24dcca9e";

describe("court", () => {
  it("extrait la forme 16 bits d'un UUID posé sur la base Bluetooth", () => {
    expect(court(FFE1)).toBe("FFE1");
  });

  it("rend entier un UUID qui n'est pas sur la base", () => {
    expect(court(NORDIC_RX)).toBe(NORDIC_RX.toUpperCase());
  });
});

describe("classerCaracteristiques", () => {
  it("fait passer une voie connue devant une inconnue découverte plus tôt", () => {
    // C'est le défaut que ce classement referme : une imprimante qui expose
    // d'abord une caractéristique de configuration avalait le ticket sans rien
    // imprimer et sans lever.
    const [premiere] = classerCaracteristiques([c(INCONNUE), c(FFE1)]);
    expect(court(premiere.uuid)).toBe("FFE1");
  });

  it("reconnaît le Nordic UART sous sa forme 128 bits", () => {
    const [premiere] = classerCaracteristiques([c(INCONNUE), c(NORDIC_RX)]);
    expect(premiere.uuid).toBe(NORDIC_RX);
  });

  it("ignore la casse : ble-plx rend des minuscules", () => {
    const [premiere] = classerCaracteristiques([c(INCONNUE), c(FFE1.toUpperCase())]);
    expect(court(premiere.uuid)).toBe("FFE1");
  });

  it("respecte l'ordre de préférence entre deux voies connues", () => {
    const FF02 = "0000ff02-0000-1000-8000-00805f9b34fb";
    const [premiere] = classerCaracteristiques([c(FF02), c(FFE1)]);
    expect(court(premiere.uuid)).toBe("FFE1");
  });

  /**
   * LA DOCTRINE DU FICHIER, ÉPINGLÉE.
   *
   * Le classement n'est PAS une liste blanche. Sans aucun UUID connu, la tête
   * de liste doit être exactement ce que rendait l'ancienne « première
   * inscriptible », sinon une imprimante d'un modèle non listé cesserait
   * d'imprimer du jour au lendemain.
   */
  it("rend la première inscriptible quand aucune voie connue ne figure", () => {
    const premiere = c("0000aaaa-0000-1000-8000-00805f9b34fb");
    const seconde = c("0000bbbb-0000-1000-8000-00805f9b34fb");
    expect(classerCaracteristiques([premiere, seconde])[0]).toBe(premiere);
  });

  it("préfère l'écriture sans réponse entre deux inconnues", () => {
    const avecReponse = c("0000aaaa-0000-1000-8000-00805f9b34fb", {
      isWritableWithoutResponse: false,
      isWritableWithResponse: true,
    });
    const sansReponse = c("0000bbbb-0000-1000-8000-00805f9b34fb");
    expect(classerCaracteristiques([avecReponse, sansReponse])[0]).toBe(sansReponse);
  });

  it("écarte ce qui n'est pas inscriptible", () => {
    const lecture = c(FFE1, { isWritableWithoutResponse: false, isWritableWithResponse: false });
    expect(classerCaracteristiques([lecture])).toEqual([]);
  });

  it("rend une liste vide plutôt que de lever", () => {
    expect(classerCaracteristiques([])).toEqual([]);
  });
});
