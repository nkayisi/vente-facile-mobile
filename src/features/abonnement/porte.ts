/**
 * La porte d'abonnement : ouvre-t-on l'application, ou non ?
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ MODULE PUR, SANS BASE NI HORLOGE. L'INSTANT EST INJECTÉ.                 │
 * │                                                                          │
 * │ Une porte qui se ferme de travers met un marchand dehors, sur le terminal│
 * │ avec lequel il gagne sa journée. Cela ne se rattrape pas à l'écran, et    │
 * │ une règle fausse ne lève rien : elle bloque, simplement. D'où un module   │
 * │ que l'on peut éprouver sans appareil, cas par cas.                       │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * **Le serveur reste l'autorité.** Il refuse déjà l'écriture d'une organisation
 * échue (402, `code: subscription_required`). Ce module ne fait que porter ce
 * verdict jusqu'à l'écran, et le prolonger hors ligne - c'est-à-dire là où le
 * serveur ne peut plus rien dire.
 */
import type { SessionSubscription } from "@/session/types";

export type MotifPorteFermee =
  /** Le serveur a tranché au dernier réveil. */
  | "serveur"
  /** La date payée est passée, et le terminal n'a pas revu le serveur depuis. */
  | "echeance";

export type VerdictPorte =
  | { ouvert: true }
  | { ouvert: false; motif: MotifPorteFermee };

/** Lit une date ISO, ou rend `null` plutôt qu'une date inventée. */
function dateOuNull(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * L'instant à opposer à l'échéance.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE PLANCHER EST CE QUI FERME LE MODE AVION.                             │
 * │                                                                          │
 * │ `fetched_at` vient de `server_time` : c'est l'HEURE DU SERVEUR au dernier│
 * │ réveil. Reculer l'horloge du terminal ne la fait pas reculer, et le      │
 * │ marchand ne peut donc pas s'offrir des mois gratuits en changeant la     │
 * │ date de son téléphone.                                                   │
 * │                                                                          │
 * │ Avancer l'horloge ne peut que fermer PLUS TÔT. On ne s'en protège pas :  │
 * │ ce serait se protéger contre l'utilisateur à son propre détriment, et la │
 * │ synchronisation suivante rétablit la vérité.                             │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
function instantEffectif(maintenant: Date, dernierReveil: Date | null): Date {
  if (!dernierReveil) return maintenant;
  return maintenant.getTime() > dernierReveil.getTime() ? maintenant : dernierReveil;
}

/**
 * Le terminal doit-il s'ouvrir ?
 *
 * Les règles, dans l'ordre, et chacune a son test :
 *
 * 1. **Verdict absent ⇒ OUVERT.** C'est le parc déjà en service : un
 *    instantané écrit avant ce lot ne porte pas le champ. Fermer ici mettrait
 *    dehors, le jour de la mise à jour, des marchands parfaitement à jour de
 *    paiement, jusqu'à leur prochaine synchronisation. Et le client n'a jamais
 *    à INVENTER un blocage : le serveur refuse déjà les écritures.
 * 2. **`is_blocked` ⇒ FERMÉ.** Le serveur vient de trancher, quelle que soit
 *    la date.
 * 3. **`access_until` absente ou illisible ⇒ OUVERT.** On ne ferme pas sur une
 *    donnée manquante ; on ne fabrique pas d'échéance.
 * 4. **`access_until` dépassée ⇒ FERMÉ**, même si le verdict lu disait
 *    « ouvert ». C'est toute la réponse au mode avion : un verdict ne vaut que
 *    jusqu'à la date payée.
 * 5. Sinon **OUVERT**.
 */
export function jugerAcces(
  abonnement: SessionSubscription | null | undefined,
  dernierReveil: string | null | undefined,
  maintenant: Date,
): VerdictPorte {
  if (!abonnement) return { ouvert: true };
  if (abonnement.is_blocked) return { ouvert: false, motif: "serveur" };

  const echeance = dateOuNull(abonnement.access_until);
  if (!echeance) return { ouvert: true };

  const instant = instantEffectif(maintenant, dateOuNull(dernierReveil));
  if (instant.getTime() > echeance.getTime()) {
    return { ouvert: false, motif: "echeance" };
  }
  return { ouvert: true };
}

/**
 * L'avertissement à afficher AVANT la fermeture, ou `null`.
 *
 * Mêmes seuils que le bandeau du back-office : la période de grâce, et les
 * cinq derniers jours. Prévenir tard revient à ne pas prévenir - le marchand
 * découvrirait la porte fermée un matin, devant ses clients.
 */
export function avertissementAbonnement(
  abonnement: SessionSubscription | null | undefined,
): { titre: string; message: string } | null {
  if (!abonnement || abonnement.is_blocked) return null;

  const jours = abonnement.days_remaining;

  if (abonnement.status === "past_due") {
    return {
      titre: "Abonnement échu",
      message:
        "Vous êtes en période de grâce. Réglez votre abonnement pour continuer à travailler.",
    };
  }

  if (jours === null || jours === undefined || jours > 5) return null;

  const pluriel = jours > 1 ? "jours" : "jour";
  return abonnement.status === "trial"
    ? {
        titre: "Essai gratuit",
        message: `Il reste ${jours} ${pluriel}. Choisissez un plan pour ne pas être interrompu.`,
      }
    : {
        titre: "Abonnement bientôt échu",
        message: `Il reste ${jours} ${pluriel}. Réglez-le pour ne pas être interrompu.`,
      };
}
