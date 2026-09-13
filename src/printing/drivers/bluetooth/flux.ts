/**
 * Le découpage du flux ESC/POS, et les pauses qui le rendent sûr.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UNE PROMESSE D'ÉCRITURE NE DIT RIEN DE CE QUI A ÉTÉ IMPRIMÉ.            │
 * │                                                                          │
 * │ En profil série, `writeToDevice` se résout quand la socket a écrit, pas  │
 * │ quand l'imprimante a consommé. Les 58 mm bon marché ont un tampon de     │
 * │ deux cent cinquante à cinq cents octets : un ticket de deux kilo-octets  │
 * │ envoyé d'un bloc voit sa FIN tomber, sans que rien ne lève. Le marchand  │
 * │ découvre un ticket amputé du total.                                      │
 * │                                                                          │
 * │ En basse consommation, une écriture « sans réponse » ne fait aucune      │
 * │ contre-pression : les paquets s'empilent dans la pile du système, le     │
 * │ contrôleur déborde, et la queue est perdue de la même façon.             │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Module PUR : le découpage se teste, les bibliothèques natives se relisent.
 */

/** Sous le plus petit tampon courant, avec de la marge. */
export const MORCEAU_SPP = 512;

/** De quoi laisser la tête chauffer sans allonger le ticket : environ 80 ms
 *  sur un reçu ordinaire, invisible au comptoir. */
export const PAUSE_SPP_MS = 20;

/** Plus court : le MTU borne déjà chaque paquet, la pause ne fait qu'éviter la
 *  rafale. */
export const PAUSE_GATT_MS = 8;

/** Le MTU minimal garanti par le GATT, en-tête compris. */
const MTU_MINIMAL = 23;

/** Ce que l'en-tête ATT prend sur chaque paquet. */
const EN_TETE_ATT = 3;

/**
 * La taille d'un paquet, à partir du MTU RÉELLEMENT accordé.
 *
 * ⚠ JAMAIS CELUI QU'ON A DEMANDÉ. Dépasser le MTU accordé fait silencieusement
 * tomber la fin du ticket : la pile ne lève pas, elle tronque. Une négociation
 * refusée laisse donc au minimum garanti, qui est lent mais entier.
 */
export function tailleDeMorceau(mtu: number): number {
  if (!Number.isFinite(mtu) || mtu < MTU_MINIMAL) return MTU_MINIMAL - EN_TETE_ATT;
  return Math.floor(mtu) - EN_TETE_ATT;
}

/**
 * Le flux, en morceaux d'au plus `taille` octets.
 *
 * Recoller les morceaux doit rendre l'entrée EXACTEMENT : un octet ESC/POS
 * perdu ou dupliqué ne se lit pas comme une erreur, il se lit comme une ligne
 * en gras qui ne s'arrête plus.
 */
export function decouper(octets: Uint8Array, taille: number): Uint8Array[] {
  const pas = Math.max(1, Math.floor(taille));
  const morceaux: Uint8Array[] = [];
  for (let i = 0; i < octets.length; i += pas) {
    morceaux.push(octets.slice(i, i + pas));
  }
  return morceaux;
}

/** Une pause, employée entre deux paquets. */
export function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
