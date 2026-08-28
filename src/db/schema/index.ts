/**
 * Schéma local.
 *
 * Trois familles, déclarées explicitement et alignées sur le serveur :
 *
 *   local/    purement locale, jamais synchronisée
 *   pulled/   tirée du serveur, jamais écrite localement       (lot 2)
 *   writable/ écrite localement, poussée par le journal        (lot 2)
 *
 * L'ancienne application laissait cet alignement implicite, et il avait
 * divergé : elle poussait des catégories que le serveur jetait en silence,
 * tout en les marquant « synchronisées ».
 */
export * from "./local";
