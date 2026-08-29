/**
 * Imprimante thermique en Bluetooth basse consommation (BLE).
 *
 * Les modèles plus récents n'exposent plus le profil série : ils publient un
 * service GATT dans lequel une caractéristique accepte l'écriture, et c'est là
 * que partent les octets ESC/POS. Le protocole imprimé, lui, ne change pas.
 *
 * LA CARACTÉRISTIQUE SE DÉCOUVRE, ELLE NE SE DEVINE PAS. Chaque fabricant a la
 * sienne (`FFE1`, `2AF1`, `FF02`…), et coder une liste d'UUID connus revient à
 * refuser d'imprimer sur le modèle suivant. On parcourt donc les services et on
 * retient la première caractéristique inscriptible, ce que fait tout pilote
 * ESC/POS générique.
 *
 * LE DÉCOUPAGE N'EST PAS FACULTATIF. Le MTU par défaut du GATT est de 23 octets,
 * dont 3 d'en-tête : un ticket de deux kilo-octets part en une centaine de
 * paquets. On négocie donc 512, et on découpe sur ce qui a été RÉELLEMENT
 * accordé, jamais sur ce qui a été demandé : dépasser le MTU accordé fait
 * silencieusement tomber la fin du ticket.
 */
import { Buffer } from "buffer";
import { Platform } from "react-native";

import type { Block } from "@vente-facile/core/receipt";

import type { ContexteImpression, PiloteImpression } from "../driver";
import { rendreEscPos } from "../render-escpos";
import { rendreTexte } from "../render-text";
import { lireReglage } from "../preferences";

export interface PeripheriqueBle {
  adresse: string;
  nom: string;
}

/** Surface de `react-native-ble-plx` réellement utilisée. */
interface Caracteristique {
  uuid: string;
  serviceUUID: string;
  isWritableWithResponse: boolean;
  isWritableWithoutResponse: boolean;
}
interface Appareil {
  id: string;
  name: string | null;
  localName?: string | null;
  connect(): Promise<Appareil>;
  discoverAllServicesAndCharacteristics(): Promise<Appareil>;
  requestMTU(mtu: number): Promise<{ mtu: number }>;
  services(): Promise<{ characteristics(): Promise<Caracteristique[]> }[]>;
  writeCharacteristicWithoutResponseForService(
    s: string, c: string, base64: string
  ): Promise<unknown>;
  writeCharacteristicWithResponseForService(
    s: string, c: string, base64: string
  ): Promise<unknown>;
  isConnected(): Promise<boolean>;
  cancelConnection(): Promise<unknown>;
}
interface Gestionnaire {
  state(): Promise<string>;
  startDeviceScan(
    uuids: string[] | null,
    options: Record<string, unknown> | null,
    listener: (erreur: unknown, appareil: Appareil | null) => void
  ): void;
  stopDeviceScan(): void;
  connectToDevice(id: string): Promise<Appareil>;
  devices(ids: string[]): Promise<Appareil[]>;
}

let gestionnaire: Gestionnaire | null | undefined;

function manager(): Gestionnaire | null {
  if (gestionnaire !== undefined) return gestionnaire;
  try {
     
    const { BleManager } = require("react-native-ble-plx") as {
      BleManager: new () => Gestionnaire;
    };
    gestionnaire = new BleManager();
  } catch {
    gestionnaire = null;
  }
  return gestionnaire;
}

/**
 * Cherche les imprimantes alentour pendant `duree` millisecondes.
 *
 * Un scan BLE ne se termine pas tout seul et vide la batterie : il est BORNÉ
 * dans le temps, et arrêté même si l'appel échoue.
 */
export function chercherPeripheriques(duree = 8000): Promise<PeripheriqueBle[]> {
  const ble = manager();
  if (!ble || Platform.OS === "web") return Promise.resolve([]);

  return new Promise((resolve) => {
    const trouves = new Map<string, PeripheriqueBle>();
    const fin = setTimeout(() => {
      ble.stopDeviceScan();
      resolve([...trouves.values()]);
    }, duree);

    try {
      ble.startDeviceScan(null, null, (erreur, appareil) => {
        if (erreur) {
          clearTimeout(fin);
          ble.stopDeviceScan();
          resolve([...trouves.values()]);
          return;
        }
        const nom = appareil?.name ?? appareil?.localName;
        // Un appareil sans nom ne se choisit pas dans une liste : le caissier
        // n'a qu'une adresse MAC pour distinguer sa caisse d'un casque audio.
        if (appareil && nom) trouves.set(appareil.id, { adresse: appareil.id, nom });
      });
    } catch {
      clearTimeout(fin);
      resolve([]);
    }
  });
}

async function caracteristiqueInscriptible(appareil: Appareil) {
  for (const service of await appareil.services()) {
    for (const c of await service.characteristics()) {
      if (c.isWritableWithoutResponse || c.isWritableWithResponse) return c;
    }
  }
  return null;
}

export const piloteBle: PiloteImpression = {
  id: "ble",
  action: "Imprimer le reçu",

  async disponible() {
    const ble = manager();
    if (!ble) return false;
    const reglage = await lireReglage();
    if (reglage.transport !== "ble" || !reglage.adresse) return false;
    try {
      return (await ble.state()) === "PoweredOn";
    } catch {
      return false;
    }
  },

  async imprimer(blocks: Block[], contexte: ContexteImpression) {
    const ble = manager();
    const reglage = await lireReglage();
    if (!ble || !reglage.adresse) throw new Error("Aucune imprimante BLE choisie.");

    const [connu] = await ble.devices([reglage.adresse]);
    let appareil = connu ?? null;
    if (!appareil || !(await appareil.isConnected())) {
      appareil = await ble.connectToDevice(reglage.adresse);
    }
    await appareil.discoverAllServicesAndCharacteristics();

    // Le MTU ACCORDÉ, pas le demandé : découper sur une taille refusée fait
    // tomber la fin du ticket sans le moindre message.
    let mtu = 23;
    try {
      mtu = (await appareil.requestMTU(512)).mtu;
    } catch {
      // Certaines piles refusent la négociation : on reste au minimum garanti.
    }
    const taille = Math.max(20, mtu - 3);

    const cible = await caracteristiqueInscriptible(appareil);
    if (!cible) throw new Error("Cette imprimante n'expose aucune voie d'écriture.");

    const octets = rendreEscPos(rendreTexte(blocks, { paperWidth: contexte.paperWidth }), {
      paperWidth: contexte.paperWidth,
      cut: reglage.cut,
    });

    for (let i = 0; i < octets.length; i += taille) {
      const morceau = Buffer.from(octets.slice(i, i + taille)).toString("base64");
      if (cible.isWritableWithoutResponse) {
        await appareil.writeCharacteristicWithoutResponseForService(
          cible.serviceUUID, cible.uuid, morceau
        );
      } else {
        await appareil.writeCharacteristicWithResponseForService(
          cible.serviceUUID, cible.uuid, morceau
        );
      }
    }
  },
};
