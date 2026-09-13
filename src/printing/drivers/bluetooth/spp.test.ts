/**
 * Le lien série, et les deux choses qu'aucune relecture ne montre :
 * CE QUI PART SUR LE FIL, et CE QU'ON REJOUE QUAND ÇA CASSE.
 *
 * ⚠ Sans `jest.mock` explicite, le `require` paresseux du pilote lève, le
 * module se dégrade en `null`, et tout le chemin passant devient vert sans rien
 * démontrer. La fabrique est donc obligatoire, et le préfixe `mock` aussi :
 * jest hisse les `jest.mock()` au-dessus des déclarations.
 */
import { Buffer } from "buffer";
import { Platform } from "react-native";

import { ErreurImpression } from "../../erreurs";
import { MORCEAU_SPP } from "./flux";

/** Ce qui a RÉELLEMENT atteint l'imprimante : une écriture qui lève n'écrit rien. */
const mockRecus: Buffer[] = [];

const mockNatif = {
  isBluetoothAvailable: jest.fn(async () => true),
  isBluetoothEnabled: jest.fn(async () => true),
  requestBluetoothEnabled: jest.fn(async () => true),
  openBluetoothSettings: jest.fn(),
  getBondedDevices: jest.fn(async () => [] as unknown[]),
  startDiscovery: jest.fn(async () => [] as unknown[]),
  cancelDiscovery: jest.fn(async () => true),
  pairDevice: jest.fn(async () => ({ address: "AA:BB", name: "POS58" })),
  connectToDevice: jest.fn(async () => ({})),
  disconnectFromDevice: jest.fn(async () => true),
  isDeviceConnected: jest.fn(async () => true),
  writeToDevice: jest.fn(async (_adresse: string, data: string) => {
    mockRecus.push(Buffer.from(data, "base64"));
    return true;
  }),
};

jest.mock("react-native-bluetooth-classic", () => ({ default: mockNatif }));

// Le module se charge paresseusement, et se refuse hors Android.
(Platform as { OS: string }).OS = "android";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const spp = require("./spp") as typeof import("./spp");

const ADRESSE = "AA:BB:CC:DD:EE:FF";
const flux = (n: number) => Uint8Array.from({ length: n }, (_, i) => i % 256);

function recu(): Uint8Array {
  return new Uint8Array(Buffer.concat(mockRecus));
}

const ecritureNormale = async (_adresse: string, data: string) => {
  mockRecus.push(Buffer.from(data, "base64"));
  return true;
};

beforeEach(() => {
  jest.clearAllMocks();
  mockRecus.length = 0;
  mockNatif.isDeviceConnected.mockResolvedValue(true);
  mockNatif.writeToDevice.mockImplementation(ecritureNormale);
});

describe("envoyer", () => {
  it("fait arriver le flux EXACTEMENT, recollé dans l'ordre", () => {
    const octets = flux(1300);
    return spp.envoyer(ADRESSE, octets).then(() => {
      expect(recu()).toEqual(octets);
    });
  });

  it("découpe : les 58 mm bon marché ont un tampon de quelques centaines d'octets", async () => {
    await spp.envoyer(ADRESSE, flux(1300));
    expect(mockNatif.writeToDevice.mock.calls.length).toBeGreaterThan(1);
    for (const appel of mockNatif.writeToDevice.mock.calls) {
      expect(Buffer.from(appel[1] as string, "base64").length).toBeLessThanOrEqual(MORCEAU_SPP);
    }
  });

  it("se connecte quand la socket est fermée", async () => {
    mockNatif.isDeviceConnected.mockResolvedValue(false);
    await spp.envoyer(ADRESSE, flux(10));
    expect(mockNatif.connectToDevice).toHaveBeenCalledTimes(1);
  });

  /**
   * UNE SOCKET MORTE APRÈS UNE VEILLE SE SIGNALE AU PREMIER MORCEAU.
   *
   * `isDeviceConnected` rend encore vrai, et c'est la première écriture qui
   * tombe. Rouvrir et rejouer est la bonne réponse : rien n'est sorti du
   * papier, et le marchand ne voit rien.
   */
  it("rouvre et rejoue tout quand le PREMIER morceau échoue", async () => {
    // Le premier morceau lève, donc n'écrit RIEN : c'est ce que fait une socket
    // morte, et c'est pourquoi le rejeu est légitime ici.
    mockNatif.writeToDevice.mockImplementationOnce(async () => {
      throw new Error("socket fermée");
    });
    const octets = flux(1300);

    await spp.envoyer(ADRESSE, octets);

    expect(mockNatif.disconnectFromDevice).toHaveBeenCalledTimes(1);
    expect(mockNatif.connectToDevice).toHaveBeenCalledTimes(1);
    // Le premier morceau a été retenté, et le ticket est arrivé entier.
    expect(recu()).toEqual(octets);
  });

  /**
   * EN MILIEU DE TICKET, ON NE REJOUE PAS.
   *
   * Une partie du papier est déjà sortie. Un demi-ticket suivi d'un ticket
   * entier est pire au comptoir qu'une erreur claire suivie du repli PDF : le
   * client repartirait avec deux morceaux de papier dont un seul porte le total.
   */
  it("ne rejoue RIEN quand l'échec tombe en milieu de ticket", async () => {
    mockNatif.writeToDevice
      .mockImplementationOnce(ecritureNormale)
      .mockImplementationOnce(async () => {
        throw new Error("liaison perdue");
      });

    await expect(spp.envoyer(ADRESSE, flux(1300))).rejects.toBeInstanceOf(ErreurImpression);

    expect(mockNatif.disconnectFromDevice).not.toHaveBeenCalled();
    expect(mockNatif.connectToDevice).not.toHaveBeenCalled();
  });

  it("classe un refus de l'imprimante comme un échec d'écriture", async () => {
    mockNatif.writeToDevice.mockImplementation(async () => false);
    await expect(spp.envoyer(ADRESSE, flux(10))).rejects.toMatchObject({ raison: "ecriture" });
  });
});

describe("appairees", () => {
  /**
   * LE DÉFAUT QUI A COÛTÉ DES MOIS.
   *
   * Sans `BLUETOOTH_CONNECT`, cet appel lève une `SecurityException`. Un
   * `catch { return [] }` la rendait indiscernable d'une absence d'imprimante,
   * et l'écran affichait « Aucune imprimante appairée ».
   */
  it("laisse remonter un refus système au lieu de rendre une liste vide", async () => {
    mockNatif.getBondedDevices.mockRejectedValueOnce(
      new Error("Need android.permission.BLUETOOTH_CONNECT")
    );
    await expect(spp.appairees()).rejects.toThrow("BLUETOOTH_CONNECT");
  });

  it("étiquette une appairée en basse consommation comme telle", async () => {
    // `getBondedDevices()` rend TOUS les appairés : une imprimante BLE s'appaire
    // elle aussi, et la traiter en série la ferait échouer à l'impression.
    mockNatif.getBondedDevices.mockResolvedValueOnce([
      { address: "AA:BB", name: "BLE-58", type: "LOW_ENERGY" },
      { address: "CC:DD", name: "SPP-58", type: "CLASSIC" },
    ]);
    const liste = await spp.appairees();
    expect(liste.map((i) => i.lien)).toEqual(["gatt", "spp"]);
    expect(liste.every((i) => i.appairee)).toBe(true);
  });

  it("retombe sur l'adresse quand l'appareil n'annonce pas de nom", async () => {
    mockNatif.getBondedDevices.mockResolvedValueOnce([{ address: "AA:BB", name: "" }]);
    expect((await spp.appairees())[0].nom).toBe("AA:BB");
  });
});

describe("decouvrir", () => {
  it("ferme une découverte déjà en cours avant d'en ouvrir une", async () => {
    // Une découverte en cours fait échouer la suivante : le marchand qui
    // réessaie recevrait une erreur au lieu d'une liste.
    await spp.decouvrir();
    expect(mockNatif.cancelDiscovery).toHaveBeenCalled();
    expect(mockNatif.startDiscovery).toHaveBeenCalled();
  });

  it("rend les découvertes comme NON appairées", async () => {
    mockNatif.startDiscovery.mockResolvedValueOnce([{ address: "EE:FF", name: "Neuve" }]);
    expect((await spp.decouvrir())[0]).toMatchObject({ appairee: false, lien: "spp" });
  });
});
