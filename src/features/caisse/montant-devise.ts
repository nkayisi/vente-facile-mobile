/**
 * Ce qu'un changement de devise fait au montant déjà tapé : la règle vit dans
 * `@vente-facile/core` (« on convertit, on n'efface jamais »).
 */
export { convertirSaisie, montrerConversion, type Conversion } from "@vente-facile/core";
