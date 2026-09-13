/**
 * Le lien basse consommation, et les deux choses qu'aucune relecture ne montre :
 * LA TAILLE DES PAQUETS, et CE QU'UNE ERREUR DE SCAN devient à l'écran.
 *
 * ⚠ Sans `jest.mock` explicite, le `require` paresseux du pilote lève et le
 * module se dégrade en `null` : tout deviendrait vert sans rien démontrer.
 */
import { Buffer } from "buffer";

import { ErreurImpression } from "../../erreurs";

const FFE1 = "0000ffe1-0000-1000-8000-00805f9b34fb";
const INCONNUE = "0000abcd-0000-1000-8000-00805f9b34fb";
const SERVICE = "0000ffe0-0000-1000-8000-00805f9b34fb";

const mockEtatBle = {
  mtu: 185,
  refuserMtu: false,
  caracteristiques: [] as unknown[],
  // On garde le BASE64 tel quel : la fabrique de `jest.mock` n'a pas le droit
  // de toucher `Buffer`, qu'un import de module fait sortir de sa portée.
  ecritures: [] as { uuid: string; service: string; b64: string; avecReponse: boolean }[],
  erreurScan: undefined as unknown,
  appareilsScan: [] as unknown[],
  connexionsFermees: 0,
};

jest.mock("react-native-ble-plx", () => {
  const appareil: Record<string, unknown> = {
    id: "AA:BB",
    name: "POS58",
    isConnected: async () => true,
    discoverAllServicesAndCharacteristics: async () => appareil,
    requestMTU: async () => {
      if (mockEtatBle.refuserMtu) throw new Error("négociation refusée");
      return { mtu: mockEtatBle.mtu };
    },
    requestConnectionPriority: async () => appareil,
    services: async () => [{ characteristics: async () => mockEtatBle.caracteristiques }],
    writeCharacteristicWithoutResponseForService: async (s: string, c: string, b64: string) => {
      mockEtatBle.ecritures.push({ service: s, uuid: c, b64, avecReponse: false });
    },
    writeCharacteristicWithResponseForService: async (s: string, c: string, b64: string) => {
      mockEtatBle.ecritures.push({ service: s, uuid: c, b64, avecReponse: true });
    },
    cancelConnection: async () => {
      mockEtatBle.connexionsFermees += 1;
    },
  };

  class BleManager {
    state = async () => "PoweredOn";
    onStateChange = (ecouteur: (e: string) => void, emettre: boolean) => {
      if (emettre) ecouteur("PoweredOn");
      return { remove: () => undefined };
    };
    startDeviceScan = (
      _u: unknown,
      _o: unknown,
      ecouteur: (e: unknown, d: unknown) => void
    ) => {
      if (mockEtatBle.erreurScan) {
        ecouteur(mockEtatBle.erreurScan, null);
        return;
      }
      for (const a of mockEtatBle.appareilsScan) ecouteur(null, a);
    };
    stopDeviceScan = () => undefined;
    devices = async () => [] as unknown[];
    connectToDevice = async () => appareil;
  }
  return { BleManager };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const gatt = require("./gatt") as typeof import("./gatt");

const carac = (uuid: string, sansReponse = true) => ({
  uuid,
  serviceUUID: SERVICE,
  isWritableWithoutResponse: sansReponse,
  isWritableWithResponse: !sansReponse,
});

const flux = (n: number) => Uint8Array.from({ length: n }, (_, i) => i % 256);
const octetsDe = (e: { b64: string }) => Buffer.from(e.b64, "base64");
const recu = () => new Uint8Array(Buffer.concat(mockEtatBle.ecritures.map(octetsDe)));

beforeEach(() => {
  mockEtatBle.mtu = 185;
  mockEtatBle.refuserMtu = false;
  mockEtatBle.caracteristiques = [carac(FFE1)];
  mockEtatBle.ecritures = [];
  mockEtatBle.erreurScan = undefined;
  mockEtatBle.appareilsScan = [];
  mockEtatBle.connexionsFermees = 0;
});

describe("envoyer", () => {
  it("découpe sur le MTU ACCORDÉ, jamais sur celui demandé", async () => {
    mockEtatBle.mtu = 185;
    await gatt.envoyer("AA:BB", flux(1000));
    // 185 accordés moins les 3 octets d'en-tête ATT.
    for (const e of mockEtatBle.ecritures) expect(octetsDe(e).length).toBeLessThanOrEqual(182);
    expect(mockEtatBle.ecritures.some((e) => octetsDe(e).length === 182)).toBe(true);
  });

  it("retombe sur vingt octets quand la pile refuse la négociation", async () => {
    // Dépasser un MTU refusé fait tomber la fin du ticket sans le moindre message.
    mockEtatBle.refuserMtu = true;
    await gatt.envoyer("AA:BB", flux(200));
    for (const e of mockEtatBle.ecritures) expect(octetsDe(e).length).toBeLessThanOrEqual(20);
  });

  it("fait arriver le flux EXACTEMENT, recollé dans l'ordre", async () => {
    const octets = flux(1000);
    await gatt.envoyer("AA:BB", octets);
    expect(recu()).toEqual(octets);
  });

  it("écrit sur la voie CLASSÉE, pas sur la première rencontrée", async () => {
    // L'imprimante qui expose d'abord une caractéristique de configuration
    // avalait le ticket sans rien imprimer et sans lever.
    mockEtatBle.caracteristiques = [carac(INCONNUE), carac(FFE1)];
    await gatt.envoyer("AA:BB", flux(10));
    expect(mockEtatBle.ecritures.every((e) => e.uuid === FFE1)).toBe(true);
  });

  it("emploie l'écriture acquittée quand c'est la seule offerte", async () => {
    mockEtatBle.caracteristiques = [carac(FFE1, false)];
    await gatt.envoyer("AA:BB", flux(10));
    expect(mockEtatBle.ecritures.every((e) => e.avecReponse)).toBe(true);
  });

  it("refuse un appareil sans voie d'écriture, et le NOMME", async () => {
    mockEtatBle.caracteristiques = [];
    await expect(gatt.envoyer("AA:BB", flux(10))).rejects.toMatchObject({
      raison: "voie_introuvable",
    });
  });

  it("ferme la liaison quand l'envoi échoue, et la garde quand il réussit", async () => {
    await gatt.envoyer("AA:BB", flux(10));
    expect(mockEtatBle.connexionsFermees).toBe(0);

    mockEtatBle.caracteristiques = [];
    await expect(gatt.envoyer("AA:BB", flux(10))).rejects.toBeInstanceOf(ErreurImpression);
    expect(mockEtatBle.connexionsFermees).toBe(1);
  });
});

describe("chercher", () => {
  it("rend les appareils NOMMÉS trouvés", async () => {
    mockEtatBle.appareilsScan = [
      { id: "AA:BB", name: "POS58" },
      { id: "CC:DD", name: null, localName: null },
    ];
    const trouves = await gatt.chercher(10);
    // Un appareil sans nom ne se choisit pas : le caissier n'a qu'une adresse
    // pour distinguer sa caisse d'un casque audio.
    expect(trouves).toEqual([{ adresse: "AA:BB", nom: "POS58", lien: "gatt", appairee: false }]);
  });

  /**
   * LE DÉFAUT QUI A CACHÉ LA CAUSE PREMIÈRE.
   *
   * Le scan rendait `[]` sur un refus de permission, et l'écran affichait
   * « Aucune imprimante trouvée » : un refus système présenté comme une panne
   * de matériel. Chaque code a désormais sa cause NOMMÉE.
   */
  it.each([
    [101, "permission"],
    [102, "eteint"],
    [601, "localisation"],
  ])("classe l'erreur de scan %i en « %s », et ne rend PAS une liste vide", async (code, raison) => {
    mockEtatBle.erreurScan = { errorCode: code, message: "erreur de pile" };
    await expect(gatt.chercher(10)).rejects.toMatchObject({ raison });
  });

  it("classe une erreur sans code plutôt que de la taire", async () => {
    mockEtatBle.erreurScan = new Error("la pile a lâché");
    await expect(gatt.chercher(10)).rejects.toThrow("la pile a lâché");
  });
});
