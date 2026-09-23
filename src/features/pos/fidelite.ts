/**
 * Les points qu'une vente RAPPORTE, et le solde qui en resulte.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE TICKET NE DISAIT RIEN DU CUMUL DU CLIENT.                             │
 * │                                                                          │
 * │ `ContexteTicket` declare `pointsGagnes` et `pointsRestants` depuis        │
 * │ l'origine, et PERSONNE ne les passait : `earned` valait 0 et `balance`   │
 * │ restait `undefined`. Or `showsLoyalty` du noyau exige l'un des trois -   │
 * │ gagnes, utilises ou solde - si bien que le bloc fidelite ne sortait      │
 * │ QUE lorsque des points etaient depenses. Le client qui vient lire son    │
 * │ cumul ne le trouvait nulle part, alors que le back-office l'imprime.     │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * MIROIR de `LoyaltyProgram.calculate_points` et de `LoyaltyService.points_for_sale`.
 * Le back-office, lui, lit la reponse du SERVEUR (`loyalty_points_earned`) : il
 * ne calcule rien. Le comptoir n'a pas ce luxe - il imprime hors ligne, avant
 * toute reponse - d'ou ce miroir, du meme genre que `verrou-inventaire.ts` ou
 * `features/caisse` pour la cloture.
 *
 * ⚠ IL VIT ICI ET NON DANS `@vente-facile/core` parce que le web ne l'applique
 * PAS : il n'y a aucune regle commune a tenir, seulement une regle SERVEUR a
 * reproduire. Le jour ou une seconde surface en aurait besoin, sa place serait
 * le noyau.
 *
 * ⚠ ON IMPLEMENTE LES DEUX MODES. Le back-office a deja paye l'erreur inverse :
 * « le POS rejouait le bareme avec la seule formule pourcentage en dur : sur un
 * programme `fixed_per_amount`, qui est le DEFAUT, le recu annoncait dix fois
 * les points reellement credites. »
 */
import type { SessionLoyaltyProgram } from "@/session/types";

const nb = (v: string | number | null | undefined): number => {
  const n = typeof v === "string" ? parseFloat(v) : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** Deux decimales, au plus proche. Miroir de `quantize(POINT_PRECISION)`. */
function auCentieme(points: number): number {
  return Math.round(points * 100) / 100;
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
   * ⚠ `amount_per_unit` du programme est libelle en devise principale.
   * Comparer directement un total en devise de facture faisait qu'une facture
   * de 50 USD (~140 000 CDF) rapportait ZERO point avec un bareme de 1 point
   * par 1 000 CDF.
   */
  taux: number;
  /**
   * La vente ne laisse rien a devoir.
   *
   * ⚠ LE SERVEUR N'ATTRIBUE QUE SUR UNE VENTE `completed`
   * (`SaleCreateSerializer.create`). Une vente a CREDIT ne rapporte donc AUCUN
   * point a l'emission : ils viennent plus tard, au reglement du solde
   * (`apply_payment_to_sale`, branche `became_complete`). Annoncer un gain sur
   * le ticket d'une vente a credit serait une promesse que le serveur ne tient
   * pas ce jour-la.
   */
  venteSoldee: boolean;
}

/** Points gagnes sur cette vente, tels que le serveur les accordera. */
export function pointsGagnes({
  programme,
  totalFacture,
  taux,
  venteSoldee,
}: GainInput): number {
  if (!programme?.is_active || !venteSoldee) return 0;

  // Un taux nul ou negatif ne peut pas sortir de la table des devises ; s'il en
  // arrive un, multiplier donnerait zero point en silence.
  const montant = totalFacture * (taux > 0 ? taux : 1);
  if (!(montant > 0)) return 0;

  if (programme.points_calculation_type === "fixed_per_amount") {
    const tranche = nb(programme.amount_per_unit);
    if (!(tranche > 0)) return 0;
    // ⚠ UNE TRANCHE ENTAMEE NE COMPTE PAS. « X points pour CHAQUE Y depense »
    // est un bareme par paliers, et c'est ce que le libelle promet au marchand ;
    // arrondir au plus proche releverait tous les baremes existants.
    const unites = Math.floor(montant / tranche);
    return auCentieme(unites * nb(programme.points_per_unit));
  }

  // Le pourcentage est CONTINU par nature : on ne tronque pas. Le serveur a
  // corrige ce defaut precis - « 1 % d'un panier de 58 USD valait 0,58 point,
  // ramene a zero sans le moindre signal ».
  return auCentieme((montant * nb(programme.points_percentage)) / 100);
}

/**
 * Le cumul que le client lira sur son ticket.
 *
 * ⚠ LE SOLDE DE DEPART EST CELUI DU DERNIER TIRAGE, et le comptoir n'a rien de
 * mieux : `customer_loyalty` n'est ecrite que par le tirage. Si le client a
 * achete ailleurs depuis, le chiffre est en retard - de la meme facon que le
 * stock ou la dette le sont entre deux synchronisations. On applique dessus ce
 * que le terminal SAIT : ce qu'il vient de deduire, et ce que la vente rapporte.
 *
 * Jamais negatif : un solde negatif ne veut rien dire, et la deduction est de
 * toute facon bornee par le solde en amont (`maxUsablePoints`).
 */
export function soldeApresVente(
  soldeConnu: number,
  utilises: number,
  gagnes: number
): number {
  return auCentieme(Math.max(0, soldeConnu - utilises + gagnes));
}
