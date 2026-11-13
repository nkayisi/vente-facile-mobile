/**
 * La remise sur UNE ligne du panier (lot L12), PURE.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE PLAFOND EST CELUI DU MARCHAND, JAMAIS 100.                            │
 * │                                                                          │
 * │ Le serveur oppose `organization.max_sale_discount_percent` dans          │
 * │ `validate_discount_percentage`, et il refuse alors la vente ENTIÈRE.     │
 * │ Borner à 100 au comptoir laisserait saisir 45 % chez un marchand qui a   │
 * │ fermé à 20 : le ticket sort, le client part, et la vente revient refusée │
 * │ dans « Opérations à corriger ». C'est pour ça que la remise par ligne    │
 * │ avait été retirée du terminal tant qu'aucun écran ne posait ce plafond.  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ UN PLAFOND INCONNU VAUT ZÉRO, pas « sans limite » : un instantané de
 *   session antérieur qui ne porterait pas le champ fermerait la remise plutôt
 *   que de laisser passer ce que le serveur refusera. Le plafond est DU JOUR :
 *   il voyage avec l'action, il ne vit pas dans le panier.
 */

/** Le plafond lu de l'instantané de session, borné à [0, 100]. */
export function plafondRemiseLigne(brut: string | number | null | undefined): number {
  if (brut === null || brut === undefined || brut === "") return 0;
  const n = Number(brut);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(100, n);
}

/** Une remise saisie, ramenée sous le plafond et au centième. Jamais négative. */
export function bornerRemiseLigne(pourcentage: number, plafond: number): number {
  if (!Number.isFinite(pourcentage) || pourcentage <= 0) return 0;
  const borne = Math.min(pourcentage, Math.max(0, plafond));
  return Math.round(borne * 100) / 100;
}

/**
 * Les remises proposées d'un appui : quelques paliers ronds SOUS le plafond,
 * puis le plafond lui-même - il est toujours atteignable, même s'il ne tombe
 * pas sur un palier (un marchand fermé à 12 % doit pouvoir accorder 12 %).
 */
export function paliersRemise(plafond: number): number[] {
  if (plafond <= 0) return [];
  const paliers = [5, 10, 15, 20, 25, 30, 50].filter((p) => p < plafond).slice(0, 4);
  return [...paliers, plafond];
}
