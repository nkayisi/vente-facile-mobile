/**
 * Les règles des imprimantes câblées : laquelle sert, et ce qu'est une adresse
 * réseau lisible.
 *
 * MODULE PUR : `preferences.ts` ouvre la base au chargement, et le module
 * natif n'existe pas sous Jest. Une règle qui décide sur quelle machine part
 * le ticket doit s'éprouver sans appareil.
 */
import type { ReglageImprimante } from "../../reglage";

/** Une imprimante USB vue par le terminal (`ImprimanteCablee.listerUsb`). */
export interface ImprimanteUsb {
  /** « vid:pid » en hexadécimal : stable d'un démarrage à l'autre. */
  cle: string;
  nom: string;
  /**
   * L'appareil se déclare de la classe « imprimante » de la norme USB. Les
   * autres (classe propre au fabricant, port série virtuel) peuvent en être
   * une, ou pas : on ne les prend jamais d'office.
   */
  classeImprimante: boolean;
  /** Android a déjà accordé l'accès. */
  autorisee: boolean;
}

/** L'imprimante USB qui servira, et si elle a été prise d'office. */
export interface UsbRetenue {
  imprimante: ImprimanteUsb;
  automatique: boolean;
}

/**
 * L'imprimante branchée qui tient lieu d'imprimante du terminal : UNE seule
 * imprimante de classe « imprimante ». Deux, et l'on ne choisit pas pour le
 * marchand : envoyer un ticket à la mauvaise machine ne se voit qu'une fois le
 * client parti.
 */
export function imprimanteDetectee(liste: readonly ImprimanteUsb[]): ImprimanteUsb | null {
  const imprimantes = liste.filter((i) => i.classeImprimante);
  return imprimantes.length === 1 ? imprimantes[0] : null;
}

/**
 * L'imprimante USB qui sert, ou `null`.
 *
 * - Le marchand a choisi une imprimante USB : elle, si elle est branchée.
 * - Le réglage est resté sur l'imprimante intégrée : une imprimante détectée
 *   la remplace. ⚠ Cette règle suppose que l'intégrée ne répond PAS, ce que la
 *   cascade garantit (elle passe avant l'USB, `TRANSPORTS`).
 * - Le marchand a choisi le Bluetooth ou le réseau : jamais l'USB d'office. Il
 *   a désigné une autre machine, et le ticket ne doit pas sortir ailleurs sans
 *   qu'il le sache.
 */
export function usbRetenue(
  reglage: ReglageImprimante,
  liste: readonly ImprimanteUsb[]
): UsbRetenue | null {
  if (reglage.transport === "usb") {
    const choisie = reglage.adresse ? liste.find((i) => i.cle === reglage.adresse) : undefined;
    return choisie ? { imprimante: choisie, automatique: false } : null;
  }
  if (reglage.transport === "embedded") {
    const detectee = imprimanteDetectee(liste);
    return detectee ? { imprimante: detectee, automatique: true } : null;
  }
  return null;
}

/** Le port des imprimantes réseau ESC/POS (« raw », JetDirect). */
export const PORT_RESEAU_PAR_DEFAUT = 9100;

export type AdresseReseau =
  | { ok: true; hote: string; port: number }
  | { ok: false; motif: string };

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const NOM_D_HOTE = /^(?=.{1,253}$)[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i;

/**
 * Une adresse réseau saisie au clavier : « 192.168.1.50 » ou
 * « 192.168.1.50:9100 », ou un nom d'hôte.
 *
 * Le refus est NOMMÉ : une adresse fausse ne se voit sinon qu'au premier
 * ticket, qui part en PDF sans que le marchand sache pourquoi.
 */
export function analyserAdresseReseau(saisie: string): AdresseReseau {
  const texte = saisie.trim();
  if (!texte) return { ok: false, motif: "Indiquez l'adresse IP de l'imprimante." };

  const separateur = texte.lastIndexOf(":");
  const hote = separateur >= 0 ? texte.slice(0, separateur) : texte;
  const portTexte = separateur >= 0 ? texte.slice(separateur + 1) : "";

  let port = PORT_RESEAU_PAR_DEFAUT;
  if (separateur >= 0) {
    if (!/^\d{1,5}$/.test(portTexte)) return { ok: false, motif: "Le port s'écrit en chiffres (9100 le plus souvent)." };
    port = Number(portTexte);
    if (port < 1 || port > 65535) return { ok: false, motif: "Le port va de 1 à 65535." };
  }

  const ip = IPV4.exec(hote);
  if (ip) {
    if (ip.slice(1).some((o) => Number(o) > 255)) {
      return { ok: false, motif: "Chaque nombre d'une adresse IP va de 0 à 255." };
    }
    return { ok: true, hote, port };
  }
  // Quatre groupes de chiffres mal formés ne sont pas un nom d'hôte.
  if (/^[\d.]+$/.test(hote)) return { ok: false, motif: "Une adresse IP s'écrit en quatre nombres : 192.168.1.50." };
  if (!NOM_D_HOTE.test(hote)) return { ok: false, motif: "Cette adresse n'est pas lisible." };
  return { ok: true, hote, port };
}

/** L'adresse telle qu'on la range : le port toujours écrit. */
export function adresseReseauRangee(hote: string, port: number): string {
  return `${hote}:${port}`;
}
