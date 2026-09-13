/**
 * Le lien Bluetooth CLASSIQUE, dit profil série (SPP).
 *
 * C'est le transport de l'écrasante majorité des imprimantes 58 mm bon marché,
 * celles qu'un marchand achète au marché : elles s'appairent comme un casque,
 * ouvrent un canal série et avalent des octets ESC/POS bruts. Pas de service ni
 * de caractéristique à découvrir, pas de MTU à négocier.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ON APPAIRE DEPUIS L'APPLICATION, ET C'EST UN CHANGEMENT.                │
 * │                                                                          │
 * │ Ce fichier disait l'inverse : l'appairage restait « une affaire du       │
 * │ système », au motif qu'une seconde liste de périphériques divergerait de │
 * │ celle des réglages Android. Le motif ne tient plus.                      │
 * │                                                                          │
 * │ Le marchand achète son imprimante au marché et doit pouvoir s'en servir  │
 * │ sans savoir où sont les réglages Bluetooth d'Android. Et on n'implémente │
 * │ pas un second appairage pour autant : `pairDevice()` DÉCLENCHE la boîte  │
 * │ de dialogue du système, qui garde le code PIN. Quant à la seconde liste, │
 * │ elle n'existe pas non plus : appairées et découvertes sont fondues en    │
 * │ une, avec celles de la basse consommation.                               │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ SUR iOS, CE LIEN N'EXISTE PAS. Le module passe par `ExternalAccessory`, qui
 * n'expose que les accessoires certifiés MFi par Apple, ce que les 58 mm du
 * marché ne sont pas. Aucune configuration n'y changera rien.
 */
import { Buffer } from "buffer";
import { Platform } from "react-native";

import { ErreurImpression, messageDe } from "../../erreurs";
import { decouper, MORCEAU_SPP, pause, PAUSE_SPP_MS } from "./flux";
import type { ImprimanteTrouvee } from "./fusion";

interface AppareilNatif {
  address: string;
  name?: string | null;
  /** `BluetoothDevice.getType()` : tout appairé n'est pas un périphérique série. */
  type?: "CLASSIC" | "LOW_ENERGY" | "DUAL" | "UNKNOWN";
}

interface ModuleBtClassic {
  isBluetoothAvailable(): Promise<boolean>;
  isBluetoothEnabled(): Promise<boolean>;
  requestBluetoothEnabled(): Promise<boolean>;
  openBluetoothSettings(): void;
  getBondedDevices(): Promise<AppareilNatif[]>;
  startDiscovery(): Promise<AppareilNatif[]>;
  cancelDiscovery(): Promise<boolean>;
  pairDevice(address: string): Promise<AppareilNatif | null>;
  connectToDevice(address: string, options?: Record<string, unknown>): Promise<unknown>;
  disconnectFromDevice(address: string): Promise<boolean>;
  isDeviceConnected(address: string): Promise<boolean>;
  writeToDevice(address: string, data: string, encoding?: string): Promise<boolean>;
}

let module: ModuleBtClassic | null | undefined;

/**
 * Chargement paresseux.
 *
 * Le paquet n'expose rien d'utile sur iOS, et l'importer en tête de fichier
 * lèverait au chargement, donc avant le premier écran.
 */
function charger(): ModuleBtClassic | null {
  if (module !== undefined) return module;
  if (Platform.OS !== "android") {
    module = null;
    return null;
  }
  try {
    module = (require("react-native-bluetooth-classic") as { default: ModuleBtClassic }).default;
  } catch {
    module = null;
  }
  return module;
}

export function disponibleSurCettePlateforme(): boolean {
  return charger() !== null;
}

/** La radio est-elle allumée ? Lève si la permission manque : l'appelant classe. */
export async function allume(): Promise<boolean> {
  const natif = charger();
  if (!natif) return false;
  return natif.isBluetoothEnabled();
}

/** Demande au système d'allumer la radio. Exige déjà `BLUETOOTH_CONNECT`. */
export async function activer(): Promise<boolean> {
  const natif = charger();
  if (!natif) return false;
  return natif.requestBluetoothEnabled();
}

export function ouvrirReglagesBluetooth(): void {
  charger()?.openBluetoothSettings();
}

function versImprimante(d: AppareilNatif, appairee: boolean): ImprimanteTrouvee {
  return {
    adresse: d.address,
    nom: d.name || d.address,
    // ⚠ Tout appairé n'est pas un périphérique série : une imprimante en basse
    // consommation s'appaire elle aussi, et la traiter en série la ferait
    // échouer à l'impression sans rien dire.
    lien: d.type === "LOW_ENERGY" ? "gatt" : "spp",
    appairee,
  };
}

/**
 * Les imprimantes déjà appairées au système.
 *
 * ⚠ NE RATTRAPE RIEN. Un `catch { return [] }` a coûté des mois ici : sans la
 * permission `BLUETOOTH_CONNECT`, cet appel lève une `SecurityException`, et
 * l'écran affichait « Aucune imprimante appairée » - c'est-à-dire un refus
 * système présenté comme une panne de matériel.
 */
export async function appairees(): Promise<ImprimanteTrouvee[]> {
  const natif = charger();
  if (!natif) return [];
  const appareils = await natif.getBondedDevices();
  return appareils.map((d) => versImprimante(d, true));
}

/** Les imprimantes série alentour, appairées ou non. Environ douze secondes. */
export async function decouvrir(): Promise<ImprimanteTrouvee[]> {
  const natif = charger();
  if (!natif) return [];
  // Une découverte déjà en cours fait échouer la suivante : on ferme la
  // précédente plutôt que de rendre une erreur au marchand qui réessaie.
  await natif.cancelDiscovery().catch(() => false);
  const appareils = await natif.startDiscovery();
  return appareils.map((d) => versImprimante(d, false));
}

/** Ferme une découverte en cours : elle mange la radio et la batterie. */
export async function annulerDecouverte(): Promise<void> {
  await charger()?.cancelDiscovery().catch(() => false);
}

/**
 * Appaire une imprimante. La boîte de dialogue du système porte le code PIN.
 */
export async function appairer(adresse: string): Promise<boolean> {
  const natif = charger();
  if (!natif) return false;
  await natif.cancelDiscovery().catch(() => false);
  const appareil = await natif.pairDevice(adresse);
  return appareil !== null;
}

async function connecter(natif: ModuleBtClassic, adresse: string): Promise<void> {
  await natif.connectToDevice(adresse, {
    // Pas de délimiteur : on écrit des octets, pas des lignes de texte. Le
    // délimiteur par défaut couperait le flux au premier saut de ligne.
    delimiter: "",
    charset: "ascii",
  });
}

/**
 * Envoie le flux ESC/POS, en morceaux.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ON NE REJOUE QUE SUR LE PREMIER MORCEAU.                                │
 * │                                                                          │
 * │ Une socket morte après une mise en veille se signale là : `isDeviceConn- │
 * │ ected` rend encore vrai et la première écriture échoue. Rouvrir et       │
 * │ rejouer est alors la bonne réponse, et le marchand ne voit rien.         │
 * │                                                                          │
 * │ Si l'échec tombe EN MILIEU de ticket, on ne rejoue pas : une partie du   │
 * │ papier est déjà sortie, et un demi-ticket suivi d'un ticket entier est   │
 * │ pire au comptoir qu'une erreur claire suivie du repli PDF. Le client     │
 * │ repartirait avec deux morceaux de papier dont un seul porte le total.    │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export async function envoyer(adresse: string, octets: Uint8Array): Promise<void> {
  const natif = charger();
  if (!natif) throw new ErreurImpression("absente", "Le Bluetooth n'est pas disponible ici.");

  try {
    if (!(await natif.isDeviceConnected(adresse))) await connecter(natif, adresse);
  } catch (e) {
    throw new ErreurImpression(
      "ecriture",
      messageDe(e, "La connexion à l'imprimante a échoué.")
    );
  }

  const ecrire = async (morceau: Uint8Array) => {
    // Le pont React Native ne transporte pas d'octets bruts : on passe par du
    // base64, que le module décode côté natif.
    const ok = await natif.writeToDevice(adresse, Buffer.from(morceau).toString("base64"), "base64");
    if (!ok) throw new Error("L'imprimante n'a pas accepté le ticket.");
  };

  const morceaux = decouper(octets, MORCEAU_SPP);
  for (let i = 0; i < morceaux.length; i++) {
    try {
      await ecrire(morceaux[i]);
    } catch (e) {
      if (i > 0) {
        throw new ErreurImpression(
          "ecriture",
          messageDe(e, "L'imprimante s'est interrompue pendant le ticket.")
        );
      }
      try {
        await natif.disconnectFromDevice(adresse).catch(() => false);
        await connecter(natif, adresse);
        await ecrire(morceaux[0]);
      } catch (e2) {
        throw new ErreurImpression(
          "ecriture",
          messageDe(e2, "L'imprimante n'a pas répondu.")
        );
      }
    }
    if (i < morceaux.length - 1) await pause(PAUSE_SPP_MS);
  }
}
