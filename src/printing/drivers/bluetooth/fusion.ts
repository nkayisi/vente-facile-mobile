/**
 * Une seule liste d'imprimantes, quel que soit le protocole.
 *
 * Le marchand ne sait pas si l'imprimante qu'il vient d'acheter parle le profil
 * série ou la basse consommation, et il n'a aucun moyen de l'apprendre. Lui
 * faire choisir entre deux options, c'est lui demander une information qu'il
 * n'a pas, sur un écran où se tromper donne exactement le même message que ne
 * pas avoir d'imprimante du tout.
 *
 * On cherche donc des deux côtés et on présente UNE liste. Le protocole est
 * relevé au moment où il désigne sa machine, et plus rien n'est à deviner.
 *
 * Module PUR : la fusion se teste, les deux bibliothèques se relisent.
 */
import type { LienBluetooth } from "../../reglage";

export interface ImprimanteTrouvee {
  /** MAC en profil série, identifiant système en basse consommation. */
  adresse: string;
  nom: string;
  lien: LienBluetooth;
  /** Déjà appairée au système : elle imprimera sans passer par un code PIN. */
  appairee: boolean;
}

/** Deux écritures de la même adresse désignent la même machine. */
function cle(adresse: string): string {
  return adresse.trim().toUpperCase();
}

/**
 * Laquelle des deux garder pour une même machine.
 *
 * ⚠ LE PROFIL SÉRIE L'EMPORTE. Une imprimante bimode se voit des deux côtés, et
 * sur Android l'identifiant d'un périphérique BLE EST sa MAC, donc la collision
 * est certaine. Le série est une vraie socket : pas de MTU à négocier, pas de
 * caractéristique à choisir, pas de paquets de vingt octets. Pour un flux de
 * deux kilo-octets, c'est plus rapide et il y a moins à rater.
 *
 * À lien égal, l'appairée gagne : elle porte le nom que le système connaît, et
 * elle n'aura pas à passer par la boîte de dialogue d'appairage.
 */
function meilleure(a: ImprimanteTrouvee, b: ImprimanteTrouvee): ImprimanteTrouvee {
  if (a.lien !== b.lien) return a.lien === "spp" ? a : b;
  if (a.appairee !== b.appairee) return a.appairee ? a : b;
  return a;
}

/**
 * Comparaison SANS locale.
 *
 * `localeCompare` s'appuie sur des données que Hermes n'embarque pas
 * entièrement, et s'y replie en silence : le même dépôt a déjà payé ce piège
 * avec `Intl`. Un ordre qui change d'un appareil à l'autre ferait sauter la
 * ligne qu'on visait au moment où le doigt descend.
 */
function parNom(a: ImprimanteTrouvee, b: ImprimanteTrouvee): number {
  const x = a.nom.toUpperCase();
  const y = b.nom.toUpperCase();
  if (x === y) return cle(a.adresse) < cle(b.adresse) ? -1 : 1;
  return x < y ? -1 : 1;
}

/**
 * Les deux listes en une, dédoublonnée et rangée.
 *
 * Les appairées passent en tête : ce sont celles qui imprimeront tout de suite,
 * et celle que le marchand cherche est presque toujours l'une d'elles.
 */
export function fusionner(...listes: ImprimanteTrouvee[][]): ImprimanteTrouvee[] {
  const par: Map<string, ImprimanteTrouvee> = new Map();
  for (const liste of listes) {
    for (const trouvee of liste) {
      const k = cle(trouvee.adresse);
      const deja = par.get(k);
      par.set(k, deja ? meilleure(deja, trouvee) : trouvee);
    }
  }
  return [...par.values()].sort(
    (a, b) => Number(b.appairee) - Number(a.appairee) || parNom(a, b)
  );
}

/**
 * La liste, avec l'imprimante CHOISIE dedans quoi qu'il arrive.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UNE IMPRIMANTE CHOISIE NE DISPARAÎT PAS PARCE QU'ELLE EST ÉTEINTE.      │
 * │                                                                          │
 * │ Relevé à l'écran : le terminal imprimait par Bluetooth sur « T58_9345 », │
 * │ et l'écran Imprimante annonçait « Aucune imprimante pour l'instant ».    │
 * │ La liste ne portait que le résultat d'une recherche, et une recherche    │
 * │ qui n'a pas encore tourné - ou qui tourne pendant que l'imprimante est   │
 * │ au repos - ne ramène rien.                                               │
 * │                                                                          │
 * │ Le marchand en conclut que son réglage est perdu, et le refait. C'est    │
 * │ très exactement le vide trompeur que ce lot existe pour supprimer.       │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * `appairee` ne sert ici qu'à la RANGER en tête : l'écran la nomme « Imprimante
 * choisie » de toute façon, et n'affirme donc rien sur son appairage.
 */
export function avecImprimanteChoisie(
  liste: ImprimanteTrouvee[],
  choisie: { adresse?: string; nom?: string; lien?: LienBluetooth }
): ImprimanteTrouvee[] {
  if (!choisie.adresse) return liste;
  const k = cle(choisie.adresse);
  if (liste.some((i) => cle(i.adresse) === k)) return liste;
  return [
    {
      adresse: choisie.adresse,
      nom: choisie.nom || choisie.adresse,
      lien: choisie.lien ?? "spp",
      appairee: true,
    },
    ...liste,
  ];
}
