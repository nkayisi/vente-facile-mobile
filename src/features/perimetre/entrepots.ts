/**
 * Quels entrepôts un membre peut LIRE, et dans lesquels il peut AGIR.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ DEUX NATURES, ET LA RÈGLE VIENT DU NOYAU.                               │
 * │                                                                          │
 * │ Ce module rendait une seule liste, « les accessibles », dont il retirait │
 * │ les entrepôts désactivés - même pour le propriétaire. Deux défauts en    │
 * │ sortaient : un entrepôt désactivé disparaissait des FILTRES, si bien     │
 * │ qu'on ne pouvait plus relire ses ventes passées ; et la case « Consulter │
 * │ tous les entrepôts » n'avait aucun moyen de s'exprimer, puisqu'elle      │
 * │ ouvre la lecture sans ouvrir l'action.                                   │
 * │                                                                          │
 * │ La règle vit désormais dans `@vente-facile/core` (`entrepotsLisibles`,   │
 * │ `entrepotsActionnables`), miroir de `apps/core/warehouse_scope.py`, et   │
 * │ le back-office l'emploie aussi. Ce module ne fait qu'adapter les formes  │
 * │ du terminal : il n'y a pas de seconde copie de la règle à tenir en phase.│
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ L'INSTANTANÉ EST LA SOURCE, LA TABLE LOCALE N'EST QU'UN REPLI.          │
 * │                                                                          │
 * │ Les filtres croisaient le rôle et les affectations (instantané) avec les │
 * │ noms de la table `warehouses` (tirage). Or l'instantané se relit à la    │
 * │ fin de CHAQUE cycle, et la table ne redescend qu'avec un jeton de        │
 * │ périmètre neuf : un entrepôt qu'on vient d'affecter au membre était donc │
 * │ dans ses droits et absent de ses filtres, jusqu'au tirage suivant. Les   │
 * │ affectations portent désormais leur nom et leur état, et l'annuaire de   │
 * │ l'établissement nomme tous les autres : la table locale ne sert plus     │
 * │ qu'à un serveur antérieur, qui n'envoie pas l'annuaire, et à l'entrepôt  │
 * │ PRINCIPAL, que l'annuaire ne dit pas.                                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Module PUR : il décide de ce qu'un écran propose et de ce qui part au
 * serveur. Il doit s'éprouver sans appareil.
 */
import {
  entrepotsActionnables,
  entrepotsLisibles,
  membreDepuisPermissions,
  type MembrePerimetre,
} from "@vente-facile/core";

import { entrepotParDefaut, type EntrepotChoisissable } from "@/data/entrepot-defaut";
import type { EntrepotDeSession, SessionMembership } from "@/session/types";

export type RoleMembre = "owner" | "manager" | "stock_keeper" | "cashier" | null;

export interface EntrepotNomme extends EntrepotChoisissable {
  nom: string;
}

/**
 * Le membre au sens du NOYAU : rôle, case, `sales.view_all`, affectations.
 *
 * Nommé autrement que le `MembrePerimetre` de `filtre-perimetre.ts`, qui est
 * une ligne d'ÉQUIPE : deux types du même nom dans deux modules voisins se
 * confondent à l'import, et le compilateur ne le signale pas toujours.
 */
export type MembreDuTerminal = MembrePerimetre;

/**
 * Le membre tel que l'instantané de session le décrit.
 *
 * `null` (aucune session lisible) rend un membre SANS RÔLE : le noyau n'ouvre
 * alors rien et n'invente aucune borne, le serveur restant seul juge.
 */
export function membreDeLaSession(
  m: Pick<
    SessionMembership,
    "role" | "permissions" | "assigned_warehouses" | "consult_all_warehouses"
  > | null | undefined
): MembreDuTerminal {
  if (!m) return membreDepuisPermissions(null);
  return membreDepuisPermissions({
    // Le type du noyau n'admet pas `null` : un rôle absent se lit comme aucun.
    role: (m.role ?? null) as never,
    permissions: m.permissions ?? [],
    assigned_warehouses: m.assigned_warehouses ?? [],
    consult_all_warehouses: m.consult_all_warehouses ?? false,
  });
}

/** Ce que la table locale `warehouses` sait d'un entrepôt. */
export interface EntrepotLocal {
  id: string;
  nom: string;
  parDefaut: boolean;
  actif: boolean;
}

const actifDe = (e: { is_active?: boolean }) => e.is_active !== false;

/**
 * Tous les entrepôts que ce terminal sait nommer.
 *
 * Trois sources, et chacune dit ce que les autres ne disent pas :
 *
 * - l'ANNUAIRE (instantané) : tous les entrepôts de l'établissement, avec leur
 *   état. `undefined` quand le serveur ne l'envoie pas encore ;
 * - les AFFECTATIONS (instantané) : toujours là, et à jour au dernier réveil ;
 * - la TABLE LOCALE : seule à porter l'entrepôt PRINCIPAL, et le repli d'un
 *   serveur antérieur.
 *
 * L'état « actif » le plus RÉCENT gagne : l'instantané est relu à chaque cycle,
 * la table ne l'est qu'à son tirage. Un entrepôt que l'annuaire connaît mais
 * qu'on a perdu de vue ailleurs n'est jamais retiré : un nom en trop dans une
 * liste coûte moins qu'un entrepôt disparu.
 *
 * Ordre : actifs d'abord, puis par nom, sans tenir compte de la casse - c'est
 * l'ordre de l'annuaire et celui de la table locale (`lower(name)`).
 */
export function entrepotsConnus(e: {
  annuaire: readonly EntrepotDeSession[] | null | undefined;
  affectes: readonly EntrepotDeSession[];
  locaux: readonly EntrepotLocal[];
}): EntrepotNomme[] {
  const parId = new Map<string, EntrepotNomme>();
  const principal = new Set(e.locaux.filter((l) => l.parDefaut).map((l) => l.id));

  // Le repli d'abord : ce qui suit le corrige.
  if (!e.annuaire) {
    for (const l of e.locaux) {
      parId.set(l.id, { id: l.id, nom: l.nom, actif: l.actif, parDefaut: l.parDefaut });
    }
  }
  for (const a of e.annuaire ?? []) {
    parId.set(a.id, {
      id: a.id,
      nom: a.name,
      actif: actifDe(a),
      parDefaut: principal.has(a.id),
    });
  }
  for (const a of e.affectes) {
    parId.set(a.id, {
      id: a.id,
      nom: a.name || parId.get(a.id)?.nom || "Entrepôt",
      actif: actifDe(a),
      parDefaut: principal.has(a.id),
    });
  }

  return [...parId.values()].sort((x, y) => {
    if (x.actif !== y.actif) return x.actif ? -1 : 1;
    const nx = x.nom.toLowerCase();
    const ny = y.nom.toLowerCase();
    return nx < ny ? -1 : nx > ny ? 1 : 0;
  });
}

/**
 * Les entrepôts que le membre peut LIRE : filtres, historiques, rapports.
 *
 * ⚠ LES INACTIFS EN FONT PARTIE. Un entrepôt désactivé est fermé aux
 * opérations, pas effacé : son passé se relit, et son libellé le dit
 * (`libelleEntrepot`).
 */
export function entrepotsLisiblesDuMembre(
  membre: MembreDuTerminal,
  tous: readonly EntrepotNomme[]
): EntrepotNomme[] {
  return entrepotsLisibles(membre, tous);
}

/**
 * Les entrepôts où le membre peut AGIR : vendre, saisir, transférer, compter.
 *
 * Ses affectés ACTIFS ; tous les actifs pour le propriétaire. La case
 * « Consulter tous » n'y change rien : elle ouvre la lecture, jamais l'action.
 */
export function entrepotsActionnablesDuMembre(
  membre: MembreDuTerminal,
  tous: readonly EntrepotNomme[]
): EntrepotNomme[] {
  const ids = new Set(
    entrepotsActionnables(
      membre,
      tous.map((t) => ({ id: t.id, is_active: t.actif }))
    ).map((t) => t.id)
  );
  return tous.filter((t) => ids.has(t.id));
}

/**
 * Le nom d'un entrepôt dans une liste de LECTURE.
 *
 * Un entrepôt désactivé reste choisissable pour relire son passé ; sans la
 * mention, le marchand croirait pouvoir y vendre, et le refus `entrepot_inactif`
 * arriverait après la saisie.
 */
export function libelleEntrepot(e: Pick<EntrepotNomme, "nom" | "actif">): string {
  return e.actif ? e.nom : `${e.nom} (inactif)`;
}

/**
 * Les destinations possibles d'un transfert : TOUT entrepôt actif de
 * l'établissement, sauf la source.
 *
 * C'est la règle du serveur (`exiger_entrepot_de_destination`) : on expédie
 * vers n'importe quel dépôt actif, y compris un dépôt qui ne nous est pas
 * affecté - c'est même le cas ordinaire d'un réassort. La liste vient de
 * l'annuaire ; sans lui (serveur antérieur), elle se réduit à ce que la base
 * locale connaît.
 */
export function destinationsDuTransfert(
  tous: readonly EntrepotNomme[],
  source: string | null
): EntrepotNomme[] {
  return tous.filter((e) => e.actif && e.id !== source);
}

/**
 * Le nom d'un entrepôt, ou une phrase qui dit qu'on ne le connaît pas.
 *
 * ⚠ JAMAIS « ? », JAMAIS L'IDENTIFIANT. Un transfert relie mon dépôt à un
 * autre, que la base locale ne porte pas : « ? → Boutique Nord » ne dit pas
 * d'où vient la marchandise qu'on réceptionne.
 */
export function nomOuInconnu(nom: string | null | undefined): string {
  return nom?.trim() || "Entrepôt hors de votre périmètre";
}

export { entrepotParDefaut };
export type { EntrepotChoisissable };
