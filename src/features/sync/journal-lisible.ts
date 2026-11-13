/**
 * Ce que le journal d'opérations dit au marchand : les bandeaux de l'écran
 * Synchronisation et la pastille de l'entrée « Opérations à corriger ». PUR.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UNE OPÉRATION REFUSÉE OU BLOQUÉE NE SE VOYAIT QU'EN ALLANT LA CHERCHER.  │
 * │                                                                          │
 * │ L'entrée du tiroir ne portait aucun nombre : le marchand ne savait pas   │
 * │ qu'il avait quelque chose à corriger avant d'ouvrir l'écran, et il n'y   │
 * │ avait aucune raison de l'ouvrir. Une vente refusée par le serveur        │
 * │ restait ainsi en quarantaine des jours, client parti et ticket remis.    │
 * │ La pastille est la règle déjà posée sur les tuiles du hub Ventes : un    │
 * │ nombre qui appelle une action doit être là où l'on tape.                 │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ Les deux familles ne se confondent pas : une opération REFUSÉE ne
 *   repartira jamais (rouge), une opération BLOQUÉE attend une décision -
 *   abonnement réglé, permission accordée - et repartira seule (ambre).
 */
import { accord, pluriel } from "@/data/accord";

export interface ComptesJournal {
  pending: number;
  quarantined: number;
  blocked: number;
}

export type TonJournal = "destructive" | "warning" | "info";

export interface BandeauJournal {
  cle: "refusees" | "bloquees" | "en_attente";
  ton: TonJournal;
  titre: string;
  message: string;
  /** Le bandeau mène à « Opérations à corriger ». */
  corriger: boolean;
}

/**
 * Les bandeaux de l'écran Synchronisation, du plus grave au moins grave.
 *
 * ⚠ Le message d'une opération BLOQUÉE ne propose ni de synchroniser ni de
 *   réessayer : ni l'un ni l'autre n'y peut quoi que ce soit.
 */
export function bandeauxDuJournal(c: ComptesJournal): BandeauJournal[] {
  const bandeaux: BandeauJournal[] = [];
  if (c.quarantined > 0) {
    const n = c.quarantined;
    bandeaux.push({
      cle: "refusees",
      ton: "destructive",
      titre: pluriel(n, "opération refusée", "opérations refusées"),
      message: accord(n, "Elle ne repartira pas d'elle-même.", "Elles ne repartiront pas d'elles-mêmes."),
      corriger: true,
    });
  }
  if (c.blocked > 0) {
    const n = c.blocked;
    bandeaux.push({
      cle: "bloquees",
      ton: "warning",
      titre: `${pluriel(n, "opération", "opérations")} en attente d'un droit`,
      message: `${accord(n, "Elle repartira", "Elles repartiront")} seule${accord(n, "", "s")} dès que l'abonnement sera réglé ou la permission accordée.`,
      corriger: true,
    });
  }
  if (c.pending > 0) {
    const n = c.pending;
    bandeaux.push({
      cle: "en_attente",
      ton: "info",
      titre: `${pluriel(n, "opération", "opérations")} en attente`,
      message: `${accord(n, "Elle part d'elle-même", "Elles partent d'elles-mêmes")} dès que le réseau le permet.`,
      corriger: false,
    });
  }
  return bandeaux;
}

export interface PastilleOperations {
  texte: string;
  ton: "destructive" | "warning";
  /** Ce que le lecteur d'écran annonce : le nombre seul ne dit pas de quoi. */
  etiquette: string;
}

/**
 * La pastille de l'entrée « Opérations à corriger », ou `null` s'il n'y a
 * rien à corriger - une pastille à zéro apprendrait à ne plus la regarder.
 */
export function pastilleOperations(c: ComptesJournal): PastilleOperations | null {
  const total = c.quarantined + c.blocked;
  if (total === 0) return null;
  const parts: string[] = [];
  if (c.quarantined > 0) parts.push(pluriel(c.quarantined, "refusée", "refusées"));
  if (c.blocked > 0) parts.push(`${c.blocked} en attente d'un droit`);
  return {
    texte: total > 99 ? "99+" : String(total),
    ton: c.quarantined > 0 ? "destructive" : "warning",
    etiquette: `Opérations à corriger : ${parts.join(" et ")}`,
  };
}
