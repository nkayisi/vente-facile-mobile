/**
 * La cagnotte qu'une vente RAPPORTE, et le solde qui en resulte.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE TICKET NE DISAIT RIEN DU CUMUL DU CLIENT.                             │
 * │                                                                          │
 * │ `ContexteTicket` declare `gainFidelite` et `cagnotteRestante` depuis      │
 * │ l'origine, et PERSONNE ne les passait : `earned` valait 0 et `balance`   │
 * │ restait `undefined`. Or `showsLoyalty` du noyau exige l'un des trois -   │
 * │ gagne, utilise ou solde - si bien que le bloc fidelite ne sortait QUE    │
 * │ lorsque de la cagnotte etait depensee. Le client qui vient lire son      │
 * │ cumul ne le trouvait nulle part, alors que le back-office l'imprime.     │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * MIROIR de `LoyaltyProgram.credit_for` et de `LoyaltyService.credit_for_sale`.
 * Le back-office, lui, lit la reponse du SERVEUR (`loyalty_earned`) : il ne
 * calcule rien. Le comptoir n'a pas ce luxe - il imprime hors ligne, avant
 * toute reponse - d'ou ce miroir, du meme genre que `verrou-inventaire.ts` ou
 * `features/caisse` pour la cloture.
 *
 * ⚠ IL VIT ICI ET NON DANS `@vente-facile/core` parce que le web ne l'applique
 * PAS : il n'y a aucune regle commune a tenir, seulement une regle SERVEUR a
 * reproduire. Le jour ou une seconde surface en aurait besoin, sa place serait
 * le noyau.
 *
 * ⚠ IL N'Y A PLUS QU'UN SEUL BAREME, ET C'EST LA MOITIE DE CE LOT. Le programme
 * portait deux modes de calcul, et le back-office avait deja paye leur
 * divergence : « le POS rejouait le bareme avec la seule formule pourcentage en
 * dur : sur un programme `fixed_per_amount`, qui etait le DEFAUT, le recu
 * annoncait dix fois les points reellement credites. » Le mode par tranches est
 * retire du serveur ; la classe d'erreur entiere disparait avec lui.
 */
import type { SessionLoyaltyProgram } from "@/session/types";

const nb = (v: string | number | null | undefined): number => {
  const n = typeof v === "string" ? parseFloat(v) : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** Deux decimales, au plus proche. Miroir de `quantize(Decimal('0.01'))`. */
function auCentieme(montant: number): number {
  return Math.round(montant * 100) / 100;
}

export interface GainInput {
  programme: SessionLoyaltyProgram | null | undefined;
  /**
   * Total de la FACTURE, dans sa devise, remise fidelite comprise.
   *
   * C'est l'assiette du serveur : « le total de la FACTURE, jamais ce qui a ete
   * remis. Le montant percu peut etre encaisse dans une autre devise,
   * fractionne entre plusieurs devises, et la monnaie rendue dans une
   * troisieme : rien de tout cela ne change ce que le client a achete. »
   */
  totalFacture: number;
  /**
   * Unites de devise PRINCIPALE pour une unite de la devise de facture.
   *
   * ⚠ LA CAGNOTTE EST TENUE EN DEVISE PRINCIPALE. Sans cette conversion, une
   * facture de 50 USD crediterait 1 $ la ou le serveur credite 1 400 FC, et le
   * ticket annoncerait une cagnotte deux mille huit cents fois trop petite.
   */
  taux: number;
  /**
   * La vente ne laisse rien a devoir.
   *
   * ⚠ LE SERVEUR NE CREDITE QUE SUR UNE VENTE `completed`
   * (`SaleCreateSerializer.create`). Une vente a CREDIT ne rapporte donc RIEN a
   * l'emission : la cagnotte vient plus tard, au reglement du solde
   * (`apply_payment_to_sale`, branche `became_complete`). Annoncer un gain sur
   * le ticket d'une vente a credit serait une promesse que le serveur ne tient
   * pas ce jour-la.
   */
  venteSoldee: boolean;
}

/** Cagnotte gagnee sur cette vente, telle que le serveur la creditera. */
export function gainFidelite({
  programme,
  totalFacture,
  taux,
  venteSoldee,
}: GainInput): number {
  if (!programme?.is_active || !venteSoldee) return 0;

  // Un taux nul ou negatif ne peut pas sortir de la table des devises ; s'il en
  // arrive un, multiplier donnerait zero en silence.
  const montant = totalFacture * (taux > 0 ? taux : 1);
  if (!(montant > 0)) return 0;

  // Le pourcentage est CONTINU par nature : on ne tronque pas. Le serveur a
  // corrige ce defaut precis - « 1 % d'un panier de 58 USD valait 0,58 point,
  // ramene a zero sans le moindre signal ».
  return auCentieme((montant * nb(programme.earn_percent)) / 100);
}

/**
 * Le cumul que le client lira sur son ticket, en devise PRINCIPALE.
 *
 * ⚠ LA CAGNOTTE DE DEPART EST CELLE DU DERNIER TIRAGE, et le comptoir n'a rien
 * de mieux : `customer_loyalty` n'est ecrite que par le tirage. Si le client a
 * achete ailleurs depuis, le chiffre est en retard - de la meme facon que le
 * stock ou la dette le sont entre deux synchronisations. On applique dessus ce
 * que le terminal SAIT : ce qu'il vient de deduire, et ce que la vente rapporte.
 *
 * Jamais negative : une cagnotte negative ne veut rien dire, et la deduction est
 * de toute facon bornee par le solde en amont (`maxUsableCredit`).
 */
export function cagnotteApresVente(
  soldeConnu: number,
  utilise: number,
  gagne: number
): number {
  return auCentieme(Math.max(0, soldeConnu - utilise + gagne));
}
