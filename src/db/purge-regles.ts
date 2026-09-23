/**
 * Ce qu'une purge efface, ce qu'elle épargne, et pourquoi.
 *
 * Module PUR : aucun import de `@/db/client`, qui ouvre SQLite au chargement.
 * Les règles se jugent donc sans appareil, et c'est nécessaire - une allowlist
 * fautive ne lève rien. Elle laisse simplement les données d'un marchand sur le
 * terminal du suivant, ou lui fait reperdre l'appairage de son imprimante.
 */

/**
 * Les six tables locales ne se traitent PAS uniformément, d'où ce classement
 * plutôt qu'un balayage.
 *
 * `sync_state` est la plus importante des six, et c'est contre-intuitif :
 * l'oublier ne laisserait aucune donnée derrière, mais garderait les CURSEURS de
 * l'ancien compte. La sonde `pull/changed/` répondrait alors « rien de neuf »
 * sur des tables que le nouveau compte n'a jamais tirées, et son catalogue ne
 * descendrait JAMAIS. Aucune erreur, aucun message : la boutique paraîtrait
 * simplement vide.
 */
export type Traitement = "vider" | "vider_sauf_allowlist" | "vider_avec_fichiers";

export const TRAITEMENT_LOCAL: Record<string, Traitement> = {
  sync_state: "vider",
  outbox_operations: "vider",
  parked_carts: "vider",
  print_jobs: "vider",
  /** Ses lignes portent des FICHIERS copiés dans le dossier de l'application. */
  pending_product_photos: "vider_avec_fichiers",
  local_settings: "vider_sauf_allowlist",
};

/**
 * Ce qui appartient à L'APPAREIL et survit au compte.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UNE ALLOWLIST, JAMAIS UNE BLOCKLIST.                                    │
 * │                                                                          │
 * │ `local_settings` mélange deux portées, et rien dans le nom des clés ne   │
 * │ les distingue. Avec une blocklist, une clé de COMPTE ajoutée demain       │
 * │ serait oubliée et survivrait à la déconnexion : c'est exactement la      │
 * │ fusion qu'on ferme. Avec une allowlist, c'est une clé d'APPAREIL qui     │
 * │ peut être oubliée, et cela ne coûte qu'un réglage à refaire.             │
 * │                                                                          │
 * │ On choisit toujours l'oubli qui ne ment pas.                             │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Le thème et l'imprimante décrivent le MATÉRIEL posé sur le comptoir : le
 * transport, l'adresse Bluetooth, la largeur du rouleau, la densité de chauffe.
 * Deux caissiers qui se partagent un terminal se partagent aussi l'imprimante ;
 * la leur faire reperdre à chaque changement de compte obligerait à réappairer
 * avant de pouvoir imprimer un ticket.
 *
 * ⚠ Les valeurs sont contre-vérifiées en TEXTE contre `data/reglages.ts` et
 * `printing/preferences.ts` : les importer ici tirerait `@/db/client` et ferait
 * de ce module autre chose qu'un module pur.
 */
export const CLES_CONSERVEES = ["theme.preference", "imprimante"] as const;

/**
 * L'estampille : à qui cette base appartient-elle ?
 *
 * Elle vit dans `local_settings` et non dans le trousseau, et c'est délibéré :
 * ce qu'elle qualifie est la BASE, pas la session. `clearSession()` emporte le
 * trousseau à chaque déconnexion ; l'estampille, elle, doit survivre pour que la
 * connexion suivante puisse constater la discordance.
 */
export const CLE_PROPRIETAIRE = "base.proprietaire";

/**
 * Drapeau de purge en cours.
 *
 * Il couvre la seule étape qui ne tienne pas dans la transaction : la
 * suppression des fichiers de photos. Posé avant elle, relu au démarrage, il
 * fait rejouer une purge interrompue - qui est idempotente, n'étant que des
 * `DELETE`.
 */
export const CLE_PURGE_EN_COURS = "base.purge_en_cours";

/**
 * Les clés de `local_settings` que la purge épargne.
 *
 * Le drapeau en fait partie : l'effacer DANS la transaction ferait perdre la
 * trace d'une purge tuée juste après le commit, avant son propre nettoyage.
 */
export function clesEpargnees(): string[] {
  return [...CLES_CONSERVEES, CLE_PURGE_EN_COURS];
}

/**
 * Les tables du schéma que personne n'a classées. Vide, ou c'est une faute.
 *
 * Le contrôle existe au TEST (rapide, il nomme la table) et à l'EXÉCUTION
 * (infaillible, il refuse de purger à moitié). Une table locale ajoutée sans
 * décision ne doit pas être purgée par défaut - elle pourrait porter un réglage
 * d'appareil - ni épargnée par défaut - elle pourrait porter des ventes.
 */
export function tablesNonClassees(nomsDuSchema: string[]): string[] {
  return nomsDuSchema.filter((n) => !(n in TRAITEMENT_LOCAL));
}

/**
 * La seule table que le traitement `vider_sauf_allowlist` sait traiter.
 *
 * Ce traitement est INTRINSÈQUEMENT lié à la forme clé/valeur de
 * `local_settings` : il se rend par un `DELETE … WHERE "key" NOT IN (…)`, qui
 * suppose une colonne `key`. Une boucle générique sur une colonne qui pourrait
 * ne pas exister serait pire que pas de boucle du tout.
 */
export const TABLE_ALLOWLIST = "local_settings";

/**
 * Les tables classées `vider_sauf_allowlist` que la purge ne sait PAS traiter.
 * Vide, ou c'est une faute.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE TROU QUE `tablesNonClassees` NE POUVAIT PAS VOIR.                    │
 * │                                                                          │
 * │ La liste `aVider` de `purge.ts` ne reprenait que `vider` et              │
 * │ `vider_avec_fichiers` ; `local_settings` était couverte à part, par un   │
 * │ ordre ÉCRIT EN DUR. Une table classée `vider_sauf_allowlist` demain      │
 * │ serait donc silencieusement épargnée : `tablesNonClassees` ne la verrait │
 * │ pas - elle EST classée - et aucune boucle ne l'atteindrait. Les données  │
 * │ de l'ancien marchand resteraient sur le terminal du suivant, sans un mot.│
 * │                                                                          │
 * │ On REFUSE plutôt qu'on ne généralise, dans l'esprit du « on refuse de    │
 * │ purger à moitié » qui garde déjà ce fichier.                             │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function tablesAllowlistInattendues(): string[] {
  return localesParTraitement("vider_sauf_allowlist").filter(
    (n) => n !== TABLE_ALLOWLIST
  );
}

/** Les tables locales à vider, par traitement. */
export function localesParTraitement(t: Traitement): string[] {
  return Object.keys(TRAITEMENT_LOCAL)
    .filter((n) => TRAITEMENT_LOCAL[n] === t)
    .sort();
}
