/**
 * La porte de mise à jour : ce binaire peut-il encore servir ?
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ MODULE PUR. LA VERSION INSTALLÉE EST INJECTÉE.                          │
 * │                                                                          │
 * │ Une porte qui se ferme de travers met un marchand dehors, sur le terminal│
 * │ avec lequel il gagne sa journée, et pour une raison qu'il ne peut pas    │
 * │ corriger : il n'existe aucune version plus récente à installer. Cela ne  │
 * │ se rattrape pas à l'écran, et une règle fausse ne lève rien - elle       │
 * │ bloque, simplement.                                                      │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ **AUCUNE HORLOGE ICI**, contrairement à `features/abonnement/porte.ts`. Ce
 * verdict compare deux chaînes courtes et ne dépend d'aucune date : le plancher
 * `fetched_at` qui ferme le mode avion là-bas n'aurait ici rien à border, et
 * l'encadré « pas de `useMemo` » de la garde d'abonnement ne s'applique pas
 * davantage. Ne pas le recopier par symétrie.
 *
 * ⚠ **Le parc déjà installé ne sera JAMAIS bloqué.** Un binaire qui ne porte
 * pas ce module ignore l'exigence, quoi que le serveur publie. On livre d'abord
 * la version qui sait se bloquer, on attend qu'elle soit diffusée, et seulement
 * ensuite on pose un seuil.
 */
import type { SessionAppUpdate } from "@/session/types";

/** `-1`, `0`, `1`, ou `null` quand l'une des deux n'est pas LISIBLE. */
export type Comparaison = -1 | 0 | 1 | null;

export type MotifPorteMiseAJour = "version_minimale";

export type VerdictMiseAJour =
  | { ouvert: true }
  | { ouvert: false; motif: MotifPorteMiseAJour };

/**
 * Le préfixe numéro-pointé de tête. Ce qui suit est IGNORÉ (« 1.2.3-rc.1 »,
 * « 1.2.3 (42) ») : on ne publie pas de version candidate au magasin, et
 * ordonner un suffixe qu'on ne sait pas lire reviendrait à trancher sur
 * l'illisible - exactement ce que cette porte ne doit jamais faire.
 */
const PREFIXE_NUMERIQUE = /^\d+(?:\.\d+)*/;

function segments(valeur: string | null | undefined): number[] | null {
  if (!valeur) return null;
  const trouve = PREFIXE_NUMERIQUE.exec(String(valeur).trim());
  if (!trouve) return null;

  const parts = trouve[0].split(".").map((s) => Number(s));
  // ⚠ Au-delà de l'entier sûr, `Number` perd la précision et rendrait un ordre
  // FAUX, en silence. Le miroir serveur (`apps/core/versions.py`) refuse au même
  // seuil, sans quoi les deux pourraient ordonner deux versions différemment.
  if (parts.some((n) => !Number.isSafeInteger(n))) return null;
  return parts;
}

/**
 * Compare deux versions.
 *
 * ⚠ **SEGMENT PAR SEGMENT, EN ENTIERS.** En chaînes, « 1.10.0 » passerait sous
 * « 1.9.0 » et le seuil s'appliquerait à l'envers.
 *
 * La plus courte est complétée par des ZÉROS : « 1.2 » vaut « 1.2.0 ». La
 * compléter autrement, ou tronquer la plus longue, ferait dire à la comparaison
 * autre chose que ce qui a été saisi.
 */
export function comparerVersions(
  a: string | null | undefined,
  b: string | null | undefined,
): Comparaison {
  const gauche = segments(a);
  const droite = segments(b);
  if (gauche === null || droite === null) return null;

  const taille = Math.max(gauche.length, droite.length);
  for (let i = 0; i < taille; i += 1) {
    const x = gauche[i] ?? 0;
    const y = droite[i] ?? 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

/**
 * Ce binaire peut-il encore servir ?
 *
 * Les règles, dans l'ordre, et chacune a son test :
 *
 * 1. **Exigence absente ⇒ OUVERT.** C'est le parc déjà en service, et un
 *    serveur antérieur à ce lot : ni l'un ni l'autre ne porte la clé.
 * 2. **Seuil absent ou vide ⇒ OUVERT.** L'état par DÉFAUT, et la sortie
 *    d'urgence : vider le champ en administration rouvre la porte au réveil
 *    suivant.
 * 3. **Version installée illisible ⇒ OUVERT.** `nativeApplicationVersion` peut
 *    rendre `null` si la lecture native échoue. **On ne ferme jamais sur ce
 *    qu'on n'a pas su lire** : ce serait enfermer un terminal pour un défaut
 *    d'instrument.
 * 4. **Seuil illisible ⇒ OUVERT.** Le serveur valide déjà la forme à la saisie ;
 *    c'est la ceinture, pour ne pas dépendre de lui afin de ne pas fermer.
 * 5. **Installée < seuil ⇒ FERMÉ.**
 */
export function jugerMiseAJour(
  exigence: SessionAppUpdate | null | undefined,
  versionInstallee: string | null,
): VerdictMiseAJour {
  if (!exigence) return { ouvert: true };

  const minimum = exigence.minimum_version;
  if (!minimum) return { ouvert: true };

  const ordre = comparerVersions(versionInstallee, minimum);
  if (ordre === null) return { ouvert: true };

  return ordre < 0 ? { ouvert: false, motif: "version_minimale" } : { ouvert: true };
}
