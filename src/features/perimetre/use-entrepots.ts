/**
 * Les entrepôts du membre connecté, pour tous les écrans : ceux qu'il LIT,
 * ceux où il AGIT, et celui qu'on lui propose d'emblée.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN SEUL ENDROIT LIT LE PÉRIMÈTRE, ET CHAQUE ÉCRAN DIT SA NATURE.        │
 * │                                                                          │
 * │ Sept feuilles de saisie proposaient `entrepotParDefaut(depots)` sur      │
 * │ TOUTE la table locale. Tant que celle-ci ne portait que les entrepôts du │
 * │ membre, c'était juste par accident ; depuis que la case « Consulter tous │
 * │ les entrepôts » fait descendre tous les dépôts, une saisie dans un dépôt │
 * │ seulement lisible partait au journal et revenait `consultation_seule`,   │
 * │ en quarantaine. Les feuilles prennent donc `actionnables` ; les filtres, │
 * │ `lisibles`.                                                              │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ IL VIT DANS `features/`, PAS DANS `ui/` : il tire `@/data/stock`, qui ouvre
 * la base SQLite au chargement.
 */
import { useMemo } from "react";
import { verrouEntrepot, type MotifVerrouPerimetre } from "@vente-facile/core";

import { useLecture } from "@/data/live";
import { entrepotsSansValorisation } from "@/data/stock";
import { useSession } from "@/session/provider";

import {
  entrepotParDefaut,
  entrepotsActionnablesDuMembre,
  entrepotsConnus,
  entrepotsLisiblesDuMembre,
  membreDeLaSession,
  type EntrepotNomme,
  type MembreDuTerminal,
} from "./entrepots";

// ⚠ `warehouses` SEULE : `entrepotsSansValorisation` ne touche pas au stock, et
// ce hook ne doit pas se relire à chaque vente pour trois noms de dépôt.
const TABLES = ["warehouses"];

export interface EntrepotsDuMembre {
  membre: MembreDuTerminal;
  /** Tous ceux que le terminal sait nommer : annuaire, affectations, table locale. */
  tous: EntrepotNomme[];
  /** Filtres, historiques, rapports. Inactifs compris. */
  lisibles: EntrepotNomme[];
  /** Saisies : vendre, transférer, compter, dépenser. Actifs seulement. */
  actionnables: EntrepotNomme[];
  /** Le principal (ou l'unique) parmi les actionnables, sinon `null`. */
  parDefaut: string | null;
  /**
   * Pourquoi aucune saisie n'est possible, ou `null`.
   *
   * `aucun-entrepot` et `entrepot-inactif` ne se règlent pas pareil : le
   * premier demande une affectation, le second une autre affectation ou une
   * réactivation. Un gérant au seul entrepôt désactivé lisait un formulaire
   * fermé sans un mot.
   */
  verrouAction: MotifVerrouPerimetre | null;
  /** L'annuaire est-il arrivé ? Faux sur un serveur antérieur. */
  annuaireConnu: boolean;
}

export function useEntrepotsDuMembre(): EntrepotsDuMembre {
  const { snapshot } = useSession();
  const { donnees: locaux } = useLecture(entrepotsSansValorisation, { tables: TABLES });

  const membership = snapshot?.membership;
  const annuaire = snapshot?.warehouse_directory;

  return useMemo(() => {
    const membre = membreDeLaSession(membership);
    const tous = entrepotsConnus({
      annuaire,
      affectes: membership?.assigned_warehouses ?? [],
      locaux: locaux ?? [],
    });
    const actionnables = entrepotsActionnablesDuMembre(membre, tous);
    return {
      membre,
      tous,
      lisibles: entrepotsLisiblesDuMembre(membre, tous),
      actionnables,
      parDefaut: entrepotParDefaut(actionnables),
      verrouAction:
        actionnables.length === 0 ? verrouEntrepot(membre, 0, "action") : null,
      annuaireConnu: Array.isArray(annuaire),
    };
  }, [membership, annuaire, locaux]);
}
