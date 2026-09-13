/**
 * Par où les octets sortent, sur une imprimante en basse consommation.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA CARACTÉRISTIQUE SE DÉCOUVRE, ELLE NE SE DEVINE PAS.                  │
 * │                                                                          │
 * │ Chaque fabricant a la sienne, et coder une liste fermée d'UUID connus    │
 * │ revient à refuser d'imprimer sur le modèle suivant. On parcourt donc les │
 * │ services, et toute caractéristique inscriptible reste un candidat.       │
 * │                                                                          │
 * │ Ce qui change ici est l'ORDRE, pas l'ensemble. Retenir la PREMIÈRE       │
 * │ inscriptible rencontrée marche sur beaucoup d'imprimantes et échoue en   │
 * │ silence sur celles qui exposent d'abord une caractéristique de           │
 * │ configuration : le ticket part dans le vide, sans erreur et sans papier. │
 * │ Les UUID connus passent donc devant, et QUAND AUCUN NE FIGURE, la tête   │
 * │ de liste est exactement l'ancienne « première inscriptible ».            │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Module PUR : c'est un classement, il se teste sans radio.
 */

export interface CaracteristiqueInscriptible {
  uuid: string;
  serviceUUID: string;
  isWritableWithResponse: boolean;
  isWritableWithoutResponse: boolean;
}

/**
 * Les voies d'écriture connues des imprimantes thermiques, dans l'ordre où on
 * les préfère. Ce n'est PAS une liste blanche : rien n'est écarté parce qu'il
 * n'y figure pas.
 */
const CONNUES = [
  // Le module série sur BLE le plus répandu sur les 58 mm chinoises.
  "FFE1",
  // Seconde famille très courante, souvent en regard d'un service FF00.
  "FF02",
  // « Caractéristique d'impression » du profil normalisé.
  "2AF1",
  // Nordic UART, réception côté périphérique : les modèles à base de nRF.
  "6E400002-B5A3-F393-E0A9-E50E24DCCA9E",
];

/**
 * La forme courte d'un UUID posé sur la base Bluetooth, sinon l'UUID entier.
 *
 * `react-native-ble-plx` rend des formes 128 bits en minuscules : comparer sans
 * normaliser ne trouverait jamais `FFE1`.
 */
export function court(uuid: string): string {
  const u = uuid.trim().toUpperCase();
  const base = /^0000([0-9A-F]{4})-0000-1000-8000-00805F9B34FB$/.exec(u);
  return base ? base[1] : u;
}

function rang(c: CaracteristiqueInscriptible): number {
  const i = CONNUES.indexOf(court(c.uuid));
  if (i >= 0) return i;
  // Inconnue : après toutes les connues, mais l'écriture sans réponse d'abord,
  // qui est plus rapide et ce que la plupart des imprimantes attendent.
  return CONNUES.length + (c.isWritableWithoutResponse ? 0 : 1);
}

/**
 * Les caractéristiques inscriptibles, la meilleure en tête.
 *
 * Le tri est STABLE : à rang égal, l'ordre de découverte est conservé, donc le
 * comportement d'avant ce classement.
 */
export function classerCaracteristiques<T extends CaracteristiqueInscriptible>(
  caracteristiques: T[]
): T[] {
  return caracteristiques
    .filter((c) => c.isWritableWithoutResponse || c.isWritableWithResponse)
    .map((c, ordre) => ({ c, ordre }))
    .sort((a, b) => rang(a.c) - rang(b.c) || a.ordre - b.ordre)
    .map(({ c }) => c);
}
