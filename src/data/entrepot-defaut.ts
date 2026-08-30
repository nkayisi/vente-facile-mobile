/**
 * L'entrepôt à proposer par défaut sur un écran de saisie.
 *
 * **Un choix unique n'est pas un choix.** Faire taper sur la seule option
 * possible est une friction sans contrepartie, et la plupart des marchands
 * visés n'ont qu'un dépôt. Le back-office présélectionne d'ailleurs l'entrepôt
 * principal ; ne pas le faire ici serait un écart, pas une simplification.
 *
 * L'ordre de préférence : l'entrepôt marqué PAR DÉFAUT, sinon l'unique s'il
 * n'y en a qu'un, sinon rien - avec plusieurs dépôts et aucun principal,
 * choisir à la place du magasinier ferait sortir du stock du mauvais endroit.
 */
export interface EntrepotChoisissable {
  id: string;
  parDefaut: boolean;
  actif: boolean;
}

export function entrepotParDefaut(
  liste: EntrepotChoisissable[] | null | undefined
): string | null {
  const actifs = (liste ?? []).filter((e) => e.actif);
  const principal = actifs.find((e) => e.parDefaut);
  if (principal) return principal.id;
  return actifs.length === 1 ? actifs[0].id : null;
}
