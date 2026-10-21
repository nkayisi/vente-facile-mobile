/**
 * L'accumulateur du pavé de quantité, et ses bornes.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CES BORNES SONT CELLES DU SERVEUR, ET ELLES DISENT POURQUOI.             │
 * │                                                                          │
 * │ Le pavé bornait à cinq caractères (99 999) par un `return` NU : au-delà, │
 * │ la touche ne faisait rien, sans un mot. Le caissier appuie, le chiffre    │
 * │ n'apparaît pas, et il ne peut pas savoir si l'écran a gelé.              │
 * │                                                                          │
 * │ Tout champ de quantité du projet est un                                  │
 * │ `DecimalField(max_digits=15, decimal_places=3)` : douze chiffres entiers │
 * │ et trois décimales. Refuser avant, c'est refuser ce que le serveur       │
 * │ accepte ; refuser après, c'est un 400 sur une vente déjà annoncée au     │
 * │ client, dont le message parle de `max_digits`.                           │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Module PUR : l'accumulateur vivait dans le composant, donc il n'était
 * éprouvable qu'en rendant une modale. Une règle de saisie fausse ne lève
 * rien - elle refuse une vente, ou en accepte une que le serveur rejettera.
 */
import { QUANTITY_DECIMALS, QUANTITY_INTEGER_DIGITS } from "@vente-facile/core";

/**
 * La VIRGULE, et pas le point : c'est ce qu'un marchand congolais écrit, et
 * `lireNombre` accepte les deux de toute façon. Un pavé qui afficherait un
 * point ferait douter qu'il s'agisse bien du séparateur décimal.
 */
export const SEPARATEUR = ",";

export type Frappe =
  /** La touche porte : voici la nouvelle valeur du champ. */
  | { ok: true; valeur: string }
  /** La touche ne porte pas, et le caissier doit savoir pourquoi. */
  | { ok: false; motif: string }
  /**
   * La touche est sans objet - une seconde virgule - et il n'y a RIEN à dire.
   * Expliquer « il y a déjà une virgule » à qui le voit à l'écran est du bruit,
   * et ce bruit chasserait un refus qui compte.
   */
  | { ok: false; motif: null };

/** Ce qu'une touche fait de la valeur courante. */
export function frapper(courant: string, touche: string): Frappe {
  if (touche === SEPARATEUR) {
    if (courant.includes(SEPARATEUR)) return { ok: false, motif: null };
    // « ,5 » n'est pas un nombre, « 0,5 » en est un : le zéro se pose seul.
    return { ok: true, valeur: courant === "" ? `0${SEPARATEUR}` : courant + SEPARATEUR };
  }

  // Les zéros de tête partent, mais « 0, » les garde : la garde exige un
  // CHIFFRE derrière, et une virgule n'en est pas un.
  const suivant = (courant + touche).replace(/^0+(?=\d)/, "");
  const [entier = "", decimales] = suivant.split(SEPARATEUR);

  if (entier.length > QUANTITY_INTEGER_DIGITS) {
    return {
      ok: false,
      motif: `Au plus ${QUANTITY_INTEGER_DIGITS} chiffres avant la virgule.`,
    };
  }
  if (decimales !== undefined && decimales.length > QUANTITY_DECIMALS) {
    return {
      ok: false,
      motif: `Au plus ${QUANTITY_DECIMALS} décimales : c'est ce que le serveur enregistre.`,
    };
  }
  return { ok: true, valeur: suivant };
}
