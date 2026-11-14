/**
 * Ce qui suit une connexion par mot de passe, et la saisie du changement
 * obligatoire.
 *
 * Module PUR : les deux écrans qui y mènent (la connexion, puis le changement
 * d'un mot de passe posé par l'administration) appliquent la MÊME règle, et
 * elle se teste sans monter d'écran. Deux copies de « une seule boutique se
 * choisit d'office » finiraient par diverger, et c'est précisément la règle
 * qui avait fait encaisser un gérant dans la mauvaise boutique.
 */
import type { OrganizationChoice } from "./session";

export const PHRASE_AUCUN_ETABLISSEMENT =
  "Aucun établissement n'est rattaché à ce compte. Créez votre boutique pour commencer.";

export type EtapeApresConnexion =
  /** Le mot de passe a été posé par l'administration : il se change d'abord. */
  | { type: "changer_mot_de_passe" }
  | { type: "aucun_etablissement" }
  /** Une seule boutique : rien à demander. */
  | { type: "choisir_d_office"; organizationId: string }
  /** Plusieurs : on demande, toujours. */
  | { type: "demander" };

export function etapeApresConnexion({
  organizations,
  mustChangePassword,
}: {
  organizations: OrganizationChoice[];
  mustChangePassword: boolean;
}): EtapeApresConnexion {
  // ⚠ AVANT le choix de l'établissement : l'enrôlement d'un terminal est refusé
  // par le serveur tant que le mot de passe n'est pas changé, et le caissier
  // lirait ce refus sans savoir quoi faire.
  if (mustChangePassword) return { type: "changer_mot_de_passe" };
  if (organizations.length === 0) return { type: "aucun_etablissement" };
  if (organizations.length === 1) return { type: "choisir_d_office", organizationId: organizations[0]!.id };
  return { type: "demander" };
}

export interface SaisieChangement {
  actuel: string;
  nouveau: string;
  confirmation: string;
}

export type ErreursChangement = Partial<Record<keyof SaisieChangement, string>>;

/**
 * Ce qui se refuse avant l'envoi, dans les termes du serveur (8 caractères au
 * moins, différent de l'actuel, confirmation identique). Le serveur reste
 * l'autorité : ses validateurs refusent aussi un mot de passe trop courant.
 */
export function verifierSaisie(s: SaisieChangement): ErreursChangement {
  const e: ErreursChangement = {};
  if (!s.actuel) e.actuel = "Saisissez le mot de passe qu'on vous a communiqué.";
  if (s.nouveau.length < 8) e.nouveau = "Au moins 8 caractères.";
  else if (s.nouveau === s.actuel) e.nouveau = "Choisissez un mot de passe différent de celui qu'on vous a communiqué.";
  if (s.confirmation !== s.nouveau) e.confirmation = "Les deux mots de passe ne correspondent pas.";
  return e;
}

/** Les erreurs de champ du serveur, rangées sous les champs de l'écran. */
export function erreursDuServeur(corps: unknown): ErreursChangement {
  if (!corps || typeof corps !== "object") return {};
  const c = corps as Record<string, unknown>;
  const premiere = (v: unknown) => (Array.isArray(v) ? v.map(String).join(" ") : v ? String(v) : undefined);
  const e: ErreursChangement = {};
  const actuel = premiere(c.current_password);
  const nouveau = premiere(c.new_password);
  const confirmation = premiere(c.new_password_confirm);
  if (actuel) e.actuel = actuel;
  if (nouveau) e.nouveau = nouveau;
  if (confirmation) e.confirmation = confirmation;
  return e;
}
