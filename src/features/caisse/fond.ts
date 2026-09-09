/**
 * Le FONDS D'OUVERTURE d'un tiroir : ce que le caissier tape, ce que le
 * serveur reçoit.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ « 12 500,50 » PARTAIT TEL QUEL, ET LE SERVEUR LE REFUSAIT.              │
 * │                                                                          │
 * │ L'écran d'ouverture envoyait la chaîne SAISIE, sans la normaliser :      │
 * │ `opening_balance: fond || "0"`. Or un pavé décimal francophone rend une  │
 * │ VIRGULE, et `DecimalField` de DRF refuse « 12,5 ». L'ouverture partait   │
 * │ donc en quarantaine - c'est-à-dire qu'elle ne repartait jamais - et le   │
 * │ caissier passait sa journée à vendre sur une session que le serveur ne   │
 * │ verrait pas. L'écran de clôture, lui, faisait déjà `replace(",", ".")`.  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN CHAMP VIDE N'EST PAS ZÉRO, ET ICI LA DIFFÉRENCE SE COMPTE EN BILLETS.│
 * │                                                                          │
 * │ `open_register_session` HÉRITE le fonds de la dernière clôture, devise   │
 * │ par devise, puis laisse le scalaire `opening_balance` écraser la devise  │
 * │ principale. Envoyer « 0 » parce que le champ est vide écrasait donc      │
 * │ l'héritage - et lui seul : les devises secondaires, elles, restaient     │
 * │ héritées. Le tiroir repartait à zéro en principale, et le Z du soir      │
 * │ annonçait un excédent égal à ce que la veille y avait laissé.            │
 * │                                                                          │
 * │ `null` veut donc dire « je ne me prononce pas, reprends la clôture       │
 * │ précédente », et l'écran le DIT plutôt que de le faire en silence. Un    │
 * │ caissier qui part réellement d'un tiroir vide écrit « 0 » : c'est une    │
 * │ affirmation, et elle doit être tapée.                                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Module PUR : aucune base, aucun composant. Ces règles décident de ce qui
 * arrive au serveur, et elles doivent s'éprouver sans appareil.
 */
import { lireNombre } from "@/data/nombres";

export type ResultatFond =
  /** `montant` à `null` : le caissier n'a rien écrit, le serveur hérite. */
  | { ok: true; montant: number | null }
  | { ok: false; message: string };

/**
 * Lit un fonds de caisse tapé à la main.
 *
 * La LECTURE est celle de `data/nombres.ts`, partagée avec tout ce qui se tape
 * au comptoir ; seules les PHRASES sont d'ici, parce qu'un fonds de caisse
 * négatif ne se dit pas comme une quantité négative.
 */
export function analyserFond(saisie: string): ResultatFond {
  const lu = lireNombre(saisie);
  if (lu.ok) return { ok: true, montant: lu.valeur };
  if (lu.motif === "negatif") {
    return {
      ok: false,
      // Un fonds compte ce qu'il y a DANS le tiroir. Un nombre négatif n'y
      // correspond à aucune liasse, et le serveur l'accepterait sans broncher.
      message: "Un fonds de caisse ne peut pas être négatif.",
    };
  }
  return {
    ok: false,
    message: "Montant illisible. Écrivez par exemple 12 500 ou 12 500,50.",
  };
}
