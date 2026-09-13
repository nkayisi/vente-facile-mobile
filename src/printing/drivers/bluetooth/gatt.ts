/**
 * Le lien Bluetooth basse consommation (GATT).
 *
 * Les modèles plus récents n'exposent plus le profil série : ils publient un
 * service GATT dans lequel une caractéristique accepte l'écriture, et c'est là
 * que partent les octets ESC/POS. Le protocole imprimé, lui, ne change pas.
 *
 * Deux règles sont dans des modules à part, et testées : le CLASSEMENT des
 * caractéristiques (`caracteristique.ts`) et le DÉCOUPAGE sur le MTU accordé
 * (`flux.ts`). Ici, les appels à la pile, et rien d'autre.
 */
import { Buffer } from "buffer";
import { Platform } from "react-native";

import { ErreurImpression, messageDe } from "../../erreurs";
import { classerCaracteristiques, type CaracteristiqueInscriptible } from "./caracteristique";
import { decouper, pause, PAUSE_GATT_MS, tailleDeMorceau } from "./flux";
import type { ImprimanteTrouvee } from "./fusion";

interface Caracteristique extends CaracteristiqueInscriptible {
  uuid: string;
  serviceUUID: string;
}
interface Appareil {
  id: string;
  name: string | null;
  localName?: string | null;
  discoverAllServicesAndCharacteristics(): Promise<Appareil>;
  requestMTU(mtu: number): Promise<{ mtu: number }>;
  requestConnectionPriority(priorite: number): Promise<Appareil>;
  services(): Promise<{ characteristics(): Promise<Caracteristique[]> }[]>;
  writeCharacteristicWithoutResponseForService(s: string, c: string, b64: string): Promise<unknown>;
  writeCharacteristicWithResponseForService(s: string, c: string, b64: string): Promise<unknown>;
  isConnected(): Promise<boolean>;
  cancelConnection(): Promise<unknown>;
}
interface Abonnement {
  remove(): void;
}
interface Gestionnaire {
  state(): Promise<string>;
  onStateChange(ecouteur: (etat: string) => void, emettreEtatCourant: boolean): Abonnement;
  startDeviceScan(
    uuids: string[] | null,
    options: Record<string, unknown> | null,
    ecouteur: (erreur: unknown, appareil: Appareil | null) => void
  ): void;
  stopDeviceScan(): void;
  connectToDevice(id: string): Promise<Appareil>;
  devices(ids: string[]): Promise<Appareil[]>;
}

/** Codes de `react-native-ble-plx`, vérifiés dans ses définitions. */
const CODE_NON_AUTORISE = 101;
const CODE_ETEINT = 102;
const CODE_LOCALISATION_COUPEE = 601;

/** `ConnectionPriority.High` : le défaut met environ cinq secondes à sortir un
 *  ticket de deux kilo-octets, l'intervalle tombant de 50 ms à une dizaine. */
const PRIORITE_HAUTE = 1;

let gestionnaire: Gestionnaire | null | undefined;

function manager(): Gestionnaire | null {
  if (gestionnaire !== undefined) return gestionnaire;
  if (Platform.OS === "web") {
    gestionnaire = null;
    return null;
  }
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

export function disponibleSurCettePlateforme(): boolean {
  return manager() !== null;
}

function codeDe(e: unknown): number | undefined {
  const code = (e as { errorCode?: unknown } | null)?.errorCode;
  return typeof code === "number" ? code : undefined;
}

/** Traduit une panne de la pile en cause NOMMÉE. */
function classer(e: unknown, repli: string): ErreurImpression {
  switch (codeDe(e)) {
    case CODE_NON_AUTORISE:
      return new ErreurImpression("permission", "Le Bluetooth n'est pas autorisé.");
    case CODE_ETEINT:
      return new ErreurImpression("eteint", "Le Bluetooth est éteint.");
    case CODE_LOCALISATION_COUPEE:
      return new ErreurImpression(
        "localisation",
        "La localisation de l'appareil est coupée, et Android l'exige pour chercher une imprimante."
      );
    default:
      return new ErreurImpression("ecriture", messageDe(e, repli));
  }
}

/** Les états sur lesquels il n'y a plus rien à attendre. */
const ETATS_ARRETES = ["PoweredOn", "PoweredOff", "Unauthorized", "Unsupported"];

/**
 * Attend que l'adaptateur se prononce.
 *
 * Juste après le démarrage de l'application il vaut souvent `Unknown` ou
 * `Resetting` : scanner à cet instant échoue avec un code que l'écran rendait
 * jusqu'ici par « Aucune imprimante trouvée ».
 */
function attendreEtat(ble: Gestionnaire, ms = 3000): Promise<string> {
  return new Promise((resolve) => {
    let fini = false;
    let minuteur: ReturnType<typeof setTimeout> | undefined;
    // ⚠ DÉCLARÉ AVANT D'ÊTRE ÉCOUTÉ. `emitCurrentState` peut rendre la main
    // dans la foulée : un `const` assigné après l'abonnement serait lu dans sa
    // zone morte, et l'attente lèverait au lieu de se résoudre.
    let abonnement: Abonnement | undefined;
    const terminer = (etat: string) => {
      if (fini) return;
      fini = true;
      if (minuteur) clearTimeout(minuteur);
      abonnement?.remove();
      resolve(etat);
    };
    abonnement = ble.onStateChange((etat) => {
      if (ETATS_ARRETES.includes(etat)) terminer(etat);
    }, true);
    // Un état émis pendant l'abonnement laisserait sinon l'écouteur en place.
    if (fini) abonnement.remove();
    else minuteur = setTimeout(() => terminer("Unknown"), ms);
  });
}

/** L'état de l'adaptateur, une fois qu'il s'est prononcé. */
export async function etat(): Promise<string> {
  const ble = manager();
  if (!ble) return "Unsupported";
  return attendreEtat(ble);
}

/**
 * Cherche les imprimantes alentour pendant `duree` millisecondes.
 *
 * ⚠ NE REND JAMAIS UNE LISTE VIDE POUR DIRE UNE ERREUR. C'est le défaut qui a
 * caché la cause première pendant des mois : le scan rendait `[]` sur un refus
 * de permission, et l'écran affichait « Aucune imprimante trouvée ».
 */
export function chercher(duree = 8000): Promise<ImprimanteTrouvee[]> {
  const ble = manager();
  if (!ble) return Promise.resolve([]);

  return new Promise((resolve, reject) => {
    const trouves = new Map<string, ImprimanteTrouvee>();
    let fini = false;
    const terminer = (erreur?: unknown) => {
      if (fini) return;
      fini = true;
      clearTimeout(minuteur);
      try {
        ble.stopDeviceScan();
      } catch {
        // Un scan déjà arrêté n'est pas une panne.
      }
      if (erreur) reject(classer(erreur, "La recherche d'imprimantes a échoué."));
      else resolve([...trouves.values()]);
    };
    const minuteur = setTimeout(() => terminer(), duree);

    try {
      ble.startDeviceScan(null, null, (erreur, appareil) => {
        if (erreur) {
          terminer(erreur);
          return;
        }
        const nom = appareil?.name ?? appareil?.localName;
        // Un appareil sans nom ne se choisit pas dans une liste : le caissier
        // n'a qu'une adresse pour distinguer sa caisse d'un casque audio.
        if (appareil && nom) {
          trouves.set(appareil.id, {
            adresse: appareil.id,
            nom,
            lien: "gatt",
            appairee: false,
          });
        }
      });
    } catch (e) {
      terminer(e);
    }
  });
}

async function voieDEcriture(appareil: Appareil): Promise<Caracteristique | null> {
  const toutes: Caracteristique[] = [];
  for (const service of await appareil.services()) {
    toutes.push(...(await service.characteristics()));
  }
  return classerCaracteristiques(toutes)[0] ?? null;
}

/** Envoie le flux ESC/POS, en paquets bornés au MTU accordé. */
export async function envoyer(adresse: string, octets: Uint8Array): Promise<void> {
  const ble = manager();
  if (!ble) throw new ErreurImpression("absente", "Le Bluetooth n'est pas disponible ici.");

  let appareil: Appareil | null = null;
  try {
    const [connu] = await ble.devices([adresse]);
    appareil = connu ?? null;
    if (!appareil || !(await appareil.isConnected())) {
      appareil = await ble.connectToDevice(adresse);
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
    try {
      await appareil.requestConnectionPriority(PRIORITE_HAUTE);
    } catch {
      // iOS ne l'expose pas, et une priorité refusée ne fait que ralentir.
    }

    const cible = await voieDEcriture(appareil);
    if (!cible) {
      throw new ErreurImpression(
        "voie_introuvable",
        "Cet appareil n'expose aucune voie d'écriture : ce n'est pas une imprimante."
      );
    }

    const morceaux = decouper(octets, tailleDeMorceau(mtu));
    for (let i = 0; i < morceaux.length; i++) {
      const b64 = Buffer.from(morceaux[i]).toString("base64");
      if (cible.isWritableWithoutResponse) {
        await appareil.writeCharacteristicWithoutResponseForService(cible.serviceUUID, cible.uuid, b64);
        // Une écriture sans réponse ne fait AUCUNE contre-pression : sans
        // pause, le contrôleur déborde et la queue du ticket est perdue.
        if (i < morceaux.length - 1) await pause(PAUSE_GATT_MS);
      } else {
        // Déjà acquittée : la pause n'apporterait rien.
        await appareil.writeCharacteristicWithResponseForService(cible.serviceUUID, cible.uuid, b64);
      }
    }
  } catch (e) {
    // On ferme la liaison sur l'échec seulement : la garder ouverte après un
    // ticket réussi évite de repayer la connexion au ticket suivant.
    await appareil?.cancelConnection().catch(() => undefined);
    throw e instanceof ErreurImpression ? e : classer(e, "L'impression a échoué.");
  }
}
