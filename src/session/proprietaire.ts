/**
 * À qui cette base locale appartient-elle ?
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ C'EST LE FILET, ET C'EST LUI QUI DONNE LA GARANTIE.                     │
 * │                                                                          │
 * │ La modale de déconnexion est le confort : elle synchronise puis vide,    │
 * │ pour que le cas nominal ne rencontre jamais ce filet. Mais tous les      │
 * │ changements de compte ne passent PAS par le bouton « Se déconnecter » :  │
 * │                                                                          │
 * │   - `api/client.ts` passe en `needs_password` sans rien effacer quand le │
 * │     serveur refuse les deux jetons ;                                     │
 * │   - `chooseOrganization` fait basculer d'un établissement à l'autre ;    │
 * │   - une réinstallation par-dessus hérite du bac à sable ;                │
 * │   - une purge peut être interrompue.                                     │
 * │                                                                          │
 * │ Écrire la modale seule reviendrait à croire le contraire.                │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Module PUR : aucune base, aucun rendu. Une comparaison fautive ne lève rien -
 * elle laisse simplement deux établissements se mélanger, ce qui ne se découvre
 * qu'en cherchant un article qui ne descend jamais.
 */

/**
 * L'estampille rangée dans `local_settings`.
 *
 * ⚠ **Les libellés ne sont pas décoratifs.** Quand l'écran d'arbitrage
 * s'affiche, `clearSession()` a déjà emporté l'instantané de l'ancien
 * propriétaire. Sans eux, l'écran dirait « des données d'un autre compte », ce
 * qui n'aide personne à décider - et surtout ne permettrait pas de proposer
 * « Se reconnecter en tant que … », qui est la seule issue non destructrice.
 */
export interface Estampille {
  userId: string;
  organizationId: string;
  userLibelle: string;
  userEmail: string;
  organizationLibelle: string;
  estampilleeAt: string;
}

/** Qui cherche à entrer. */
export interface Entrant {
  userId: string;
  organizationId: string;
}

export type VerdictBase =
  /** Rien n'a jamais habité ici : première installation. */
  | "vierge"
  /** Même utilisateur, même établissement : on ouvre sans rien toucher. */
  | "meme"
  /** Les données en place appartiennent à quelqu'un d'autre. */
  | "etrangere";

/**
 * Compare l'estampille à qui se présente.
 *
 * ⚠ **MÊME UTILISATEUR, AUTRE ORGANISATION COMPTE COMME ÉTRANGÈRE.** Aucune
 * table tirée ne porte de colonne de locataire : la base est implicitement
 * mono-organisation, et le serveur l'écrit déjà dans la docstring du modèle
 * `Device` - « changer d'organisation impose de repartir d'une base locale
 * vide ». Un gérant de deux boutiques qui bascule verrait sinon l'union des deux
 * catalogues, et ses curseurs de tirage feraient répondre « rien de neuf » sur
 * les tables de la seconde.
 *
 * ⚠ **Pas d'estampille ET base habitée vaut ÉTRANGÈRE, jamais vierge.** C'est le
 * cas de la réinstallation par-dessus et de la purge interrompue : des données
 * sont là, et personne ne peut dire de qui. Les traiter comme vierges rouvrirait
 * la fusion par le seul chemin que la modale ne couvre pas.
 */
export function comparerProprietaire(
  estampille: Estampille | null,
  entrant: Entrant,
  habitee: boolean
): VerdictBase {
  if (!estampille) return habitee ? "etrangere" : "vierge";
  return estampille.userId === entrant.userId &&
    estampille.organizationId === entrant.organizationId
    ? "meme"
    : "etrangere";
}

export type SuitePourBase =
  /** On entre, on estampille au passage. */
  | "ouvrir"
  /** On vide sans rien demander : il n'y a rien à perdre. */
  | "purger"
  /** Un humain doit trancher : des opérations non envoyées sont en jeu. */
  | "arbitrer";

/**
 * Que faire de ce verdict.
 *
 * ⚠ **JAMAIS `purger` QUAND IL RESTE DES OPÉRATIONS NON ENVOYÉES.** Ce serait
 * détruire en silence des ventes encaissées, dont le client tient le ticket. La
 * doctrine du dépôt est constante là-dessus : un refus se NOMME avant de se
 * subir. Purger sans rien demander n'est licite que sur une base qui ne porte
 * plus rien à envoyer.
 */
export function suitePourBase(
  verdict: VerdictBase,
  nbNonEnvoyees: number
): SuitePourBase {
  if (verdict !== "etrangere") return "ouvrir";
  return nbNonEnvoyees > 0 ? "arbitrer" : "purger";
}

/**
 * Faut-il adopter l'instantané en cache comme propriétaire de cette base ?
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE RATTRAPAGE DU PARC, ET SA BORNE.                                     │
 * │                                                                          │
 * │ Sur tous les terminaux déjà en service, la base est pleine et il n'y a   │
 * │ aucune estampille. Sans rattrapage, le PREMIER lancement après la mise à │
 * │ jour déclarerait chaque terminal étranger et enverrait tout le parc sur  │
 * │ l'écran de reprise.                                                      │
 * │                                                                          │
 * │ ⚠ Mais SEULEMENT si la base est HABITÉE. Sur une base vide il n'y a rien │
 * │ à sauver, et `comparerProprietaire` conclura « vierge » puis on          │
 * │ estampillera de toute façon : même résultat, une surface d'adoption en   │
 * │ moins. Sans cette borne, le rattrapage reste armé indéfiniment, et tout  │
 * │ instantané écrit hors du fournisseur se fait adopter par les données du  │
 * │ compte précédent - les deux établissements fusionnent, en silence.       │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function doitRattraper(estampille: Estampille | null, habitee: boolean): boolean {
  return !estampille && habitee;
}

/** Fabrique l'estampille d'une session qui vient de s'ouvrir. */
export function estampillerDepuis(
  user: { id: string; email: string; full_name: string },
  organization: { id: string; name: string },
  maintenant = new Date()
): Estampille {
  return {
    userId: user.id,
    organizationId: organization.id,
    userLibelle: user.full_name || user.email,
    userEmail: user.email,
    organizationLibelle: organization.name,
    estampilleeAt: maintenant.toISOString(),
  };
}
