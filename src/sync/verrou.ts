/**
 * Le verrou du cycle de synchronisation, partagé par toute l'application.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ IL N'Y A QU'UN SEUL CYCLE, ET IL FAUT DONC UN SEUL VERROU.              │
 * │                                                                          │
 * │ Il vivait dans un `useRef` de `features/sync/provider.tsx`, monté sous   │
 * │ le groupe `(app)`. Tant que ce fournisseur était le seul à pousser, le   │
 * │ compte y était. La déconnexion propre pousse, elle aussi, et depuis la   │
 * │ RACINE : elle doit envoyer ce qui reste en file avant de vider la base,  │
 * │ et sa surcouche survit au démontage de `(app)`. Un verrou enfermé dans   │
 * │ un composant qu'elle ne voit pas ne la protège de rien.                  │
 * │                                                                          │
 * │ Deux cycles concurrents écriraient deux fois les mêmes pages dans les    │
 * │ trente-huit tables tirées, et pousseraient deux fois le même lot.        │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Module PUR : aucune ouverture de base, aucun rendu. C'est ce qui permet de
 * l'éprouver sans appareil, et un verrou qui fuit ne lève rien - il fait
 * simplement partir deux cycles, ce qui ne se voit qu'au journal du serveur.
 *
 * ⚠ **Une variable de module, pas une référence React.** Les deux mondes qui
 * s'en servent vivent dans des arbres différents : la racine et le groupe
 * `(app)`. Un `useRef` ne peut pas être partagé entre eux, et un contexte
 * ferait dépendre le verrou d'un ordre de montage.
 */

/**
 * Faux au repos.
 *
 * ⚠ **C'est un booléen de MODULE, pas un état de rendu.** `if (enCours) return`
 * lit un état de rendu : deux appuis dans le même tour de boucle - le bandeau
 * du haut et celui du bas, ou un double-tap - le verraient tous deux à faux et
 * partiraient ensemble. Avec cinq déclencheurs automatiques qui peuvent tomber
 * dans le même tour, ce n'est plus un cas d'école.
 */
let pris = false;

/** Un cycle tourne-t-il ? Lecture seule, sans effet. */
export function estPris(): boolean {
  return pris;
}

/**
 * Prend le verrou, ou rend faux s'il est déjà tenu.
 *
 * ⚠ **À poser AVANT le premier `await` de l'appelant.** Posé après, il
 * laisserait passer les trois déclencheurs d'une même rafale : ils
 * franchiraient tous le test pendant que le premier attend sa requête, puis
 * partiraient ensemble.
 */
export function prendre(): boolean {
  if (pris) return false;
  pris = true;
  return true;
}

/** Rend le verrou. Sans effet s'il n'était pas pris. */
export function rendre(): void {
  pris = false;
}

/**
 * Exécute `fn` sous le verrou, ou rend `null` si un cycle tourne déjà.
 *
 * ⚠ **Le `finally` n'est pas décoratif** : sans lui, une exception de `fn`
 * laisserait le verrou tenu pour toujours, et plus aucune synchronisation ne
 * partirait de la session. Aucune erreur ne le dirait - le terminal cesserait
 * simplement de se synchroniser.
 *
 * `null` se distingue de tout bilan légitime : il dit « je n'ai rien fait »,
 * pas « je n'ai rien trouvé ».
 */
export async function avecVerrou<T>(fn: () => Promise<T>): Promise<T | null> {
  if (!prendre()) return null;
  try {
    return await fn();
  } finally {
    rendre();
  }
}

/** Pas de sondage : un cycle dure des secondes, pas des millisecondes. */
const PAS_MS = 200;

/**
 * Attend que le verrou se libère, au plus `msMax`.
 *
 * Rend vrai s'il est libre à la sortie, faux si l'attente a expiré. Sert à la
 * déconnexion : un cycle automatique peut très bien avoir démarré à la seconde
 * où le marchand appuie, et le sien doit attendre son tour plutôt que de
 * renoncer en silence.
 *
 * ⚠ **On rend la main plutôt que d'attendre indéfiniment.** Un cycle bloqué sur
 * une requête qui n'expire jamais retiendrait sinon le marchand devant une
 * roue, sur un écran dont la seule issue est de fermer l'application.
 */
export async function attendreLibre(msMax: number): Promise<boolean> {
  const fin = Date.now() + msMax;
  while (pris && Date.now() < fin) {
    await new Promise((r) => setTimeout(r, PAS_MS));
  }
  return !pris;
}

/**
 * Remet le verrou au repos. RÉSERVÉ AUX TESTS.
 *
 * Une variable de module survit d'un test à l'autre dans un même fichier : un
 * cas qui laisse le verrou pris ferait échouer le suivant pour une raison qui
 * ne lui appartient pas.
 */
export function reinitialiserPourTest(): void {
  pris = false;
}
