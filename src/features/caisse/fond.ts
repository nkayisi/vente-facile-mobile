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

/**
 * Le fonds d'ouverture d'une session, PAR DEVISE.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE FONDS SCALAIRE ALLAIT À LA PREMIÈRE DEVISE RENCONTRÉE.               │
 * │                                                                          │
 * │ L'attendu de clôture prenait `[...devises][0]` pour la devise principale │
 * │ - c'est-à-dire la devise du PREMIER règlement de la session. Un tiroir   │
 * │ en francs dont la première vente était réglée en dollars recevait son    │
 * │ fonds de 50 000 en dollars : l'attendu annonçait 50 000 $ de trop, et    │
 * │ les francs partaient de zéro. Et les devises secondaires partaient       │
 * │ TOUJOURS de zéro, leur fonds n'étant pas tiré : le Z annonçait un écart  │
 * │ égal au fonds, chaque soir.                                              │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Les lignes par devise (`register_session_currency_balances`, tirées avec
 * leur session depuis le lot L13) font foi. Sans elles - une session ouverte
 * par un serveur antérieur, ou pas encore re-tirée - le scalaire va à la
 * devise PRINCIPALE, celle que le serveur lui attribue.
 */
export function fondsParDevise(
  lignes: { devise: string; ouverture: number }[],
  scalaire: number,
  principale: string
): Map<string, number> {
  const fonds = new Map<string, number>();
  if (lignes.length > 0) {
    for (const l of lignes) fonds.set(l.devise, (fonds.get(l.devise) ?? 0) + l.ouverture);
    return fonds;
  }
  if (scalaire !== 0) fonds.set(principale, scalaire);
  return fonds;
}

/** Un fonds saisi pour une devise SECONDAIRE. */
export interface FondSaisi {
  devise: string;
  montant: number;
}

export type ResultatFonds =
  | {
      ok: true;
      /** La devise principale : `null` = rien écrit, le serveur hérite. */
      principal: number | null;
      /** Les devises secondaires RENSEIGNÉES ; une devise vide hérite. */
      autres: FondSaisi[];
    }
  | { ok: false; erreurs: Record<string, string> };

/**
 * Lit les fonds tapés, une saisie par devise.
 *
 * ⚠ UNE DEVISE VIDE N'EST PAS UNE DEVISE À ZÉRO. Le serveur hérite le fonds de
 *   la dernière clôture devise par devise, puis laisse ce qui est envoyé
 *   l'écraser : n'envoyer que les devises écrites, c'est garder l'héritage des
 *   autres. Envoyer « 0 » pour une devise laissée vide viderait un tiroir de
 *   dollars que personne n'a compté.
 *
 * Toutes les erreurs sont rendues à la fois : corriger une devise pour en
 * découvrir une seconde fautive ferait faire deux allers-retours au caissier.
 */
export function lireFonds(saisies: Record<string, string>, principale: string): ResultatFonds {
  const erreurs: Record<string, string> = {};
  let principal: number | null = null;
  const autres: FondSaisi[] = [];
  for (const [devise, saisie] of Object.entries(saisies)) {
    const lu = analyserFond(saisie);
    if (!lu.ok) {
      erreurs[devise] = lu.message;
      continue;
    }
    if (lu.montant === null) continue;
    if (devise === principale) principal = lu.montant;
    else autres.push({ devise, montant: lu.montant });
  }
  if (Object.keys(erreurs).length > 0) return { ok: false, erreurs };
  autres.sort((a, b) => a.devise.localeCompare(b.devise));
  return { ok: true, principal, autres };
}

export interface DeviseDuFonds {
  code: string;
  principale: boolean;
}

/**
 * Les devises du fonds : les devises ACTIVES de l'établissement, la principale
 * d'abord. Une devise désactivée n'a pas de liasse à compter.
 */
export function devisesDuFonds(
  devises: { currency_code: string; is_primary: boolean; is_active?: boolean }[],
  principale: string
): DeviseDuFonds[] {
  const actives = devises.filter((d) => d.is_active !== false || d.is_primary);
  const codes = [...new Set(actives.map((d) => d.currency_code))];
  if (!codes.includes(principale)) codes.unshift(principale);
  return codes
    .sort((a, b) => (a === principale ? -1 : b === principale ? 1 : a.localeCompare(b)))
    .map((code) => ({ code, principale: code === principale }));
}
