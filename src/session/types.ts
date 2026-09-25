/**
 * Forme de la session, telle que le serveur la livre au réveil.
 *
 * C'est exactement ce que renvoie `POST /auth/devices/session/`, et c'est ce
 * qui est mis en cache : rôle, permissions effectives, identité de la boutique,
 * devises, paramètres de reçu, programme de fidélité. Un démarrage à froid sans
 * réseau se sert ici et nulle part ailleurs.
 */
import type { OrganizationCurrency } from "@vente-facile/core";

export interface SessionUser {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  phone: string;
  is_staff: boolean;
}

/** Identité imprimée en tête de chaque ticket. */
export interface SessionOrganization {
  id: string;
  name: string;
  slug?: string;
  currency?: string;
  address?: string;
  city?: string;
  country?: string;
  phone?: string;
  email?: string;
  tax_id?: string;
  rccm?: string;
  id_nat?: string;
  logo?: string | null;
  /**
   * Plafond de remise par ligne et sur le total, RÉSOLU par le serveur.
   *
   * Le comptoir bornait à 100 et le POS web codait 50 en dur, alors que la
   * valeur se règle par organisation. Un marchand qui l'abaisse à 20 voyait
   * donc le terminal accepter 45 %, imprimer, puis le serveur refuser la vente
   * ENTIÈRE : le refus arrivait après le client. Le champ vient du détail
   * d'organisation, donc du snapshot de session, et se rafraîchit avec lui.
   */
  max_sale_discount_percent?: string | number;
}

export interface SessionMembership {
  role: "owner" | "manager" | "stock_keeper" | "cashier" | null;
  /** Permissions effectives : rôle plus permissions individuelles. */
  permissions: string[];
  assigned_warehouses: { id: string; name: string }[];
}

/**
 * L'équipe de l'organisation, pour le filtre « Utilisateur ».
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ELLE DESCEND PAR LA SESSION, ET C'EST LE SEUL CHEMIN POSSIBLE.          │
 * │                                                                          │
 * │ La table locale `memberships` ne porte PAS les affectations d'entrepôt,  │
 * │ et le tirage ne peut pas les descendre : `describe_columns` n'itère que  │
 * │ les champs concrets d'un modèle, un M2M n'y entre pas. Or un filtre      │
 * │ « les utilisateurs de CET entrepôt » a besoin de ce croisement, et il    │
 * │ doit l'avoir HORS LIGNE.                                                 │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export interface SessionTeamMember {
  user_id: string;
  /** Nom complet, ou l'email à défaut : une ligne muette ne désigne personne. */
  name: string;
  role: "owner" | "manager" | "stock_keeper" | "cashier";
  /** Identifiants nus : les noms descendent déjà par la table `warehouses`. */
  warehouses: string[];
}

export interface SessionTeam {
  /**
   * ⚠ EXPLICITE, JAMAIS DÉDUIT D'UNE LISTE VIDE. C'est ce qui distingue
   * « roster fermé » (un caissier, qui n'en a pas l'usage) de « roster vide ».
   */
  visible: boolean;
  /** Le serveur plafonne à 200 membres ; au-delà il le DIT. */
  truncated: boolean;
  members: SessionTeamMember[];
}

export interface SessionSettings {
  receipt_header?: string;
  receipt_footer?: string;
  receipt_paper_width?: number;
  show_loyalty_points_on_receipt?: boolean;
  low_stock_threshold?: number;
}

export interface SessionLoyaltyProgram {
  id: string;
  name: string;
  is_active: boolean;
  points_calculation_type: "fixed_per_amount" | "percentage";
  points_per_unit: number;
  amount_per_unit: string;
  points_percentage: string;
  point_value: string;
  min_points_to_redeem?: number;
  max_redemption_percent?: string;
  /**
   * Borne DURE du plafond de rédemption, décidée par le modèle serveur.
   *
   * Le serveur l'envoie déjà (`LoyaltyProgramSerializer`) et `toSnapshot`
   * recopie le programme entier : la valeur ARRIVE, seule la ligne de type
   * manquait. Elle compte quand même, et pour deux raisons.
   *
   * `maxLoyaltyAmount` s'en sert pour plafonner `max_redemption_percent`, et
   * se replie sur 70 quand le champ manque - jamais sur 100, « ce serait
   * desserrer la garantie au lieu de la maintenir ». Un objet construit à la
   * main, dans un test ou un écran, aurait donc silencieusement changé la
   * règle : le type est ce qui le signale.
   *
   * Et sans elle, tout code qui LIT le champ sur un `SessionLoyaltyProgram`
   * ne compile pas, alors que la donnée est là.
   */
  max_redemption_percent_ceiling?: string | number;
}

export interface SessionDevice {
  id: string;
  device_code: string;
  name: string;
  expires_at: string;
}

/**
 * L'abonnement, tel que le terminal doit le comprendre.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ IL DESCEND PAR LA SESSION D'APPAREIL PARCE QU'IL NE PEUT PAS DESCENDRE   │
 * │ AILLEURS.                                                                │
 * │                                                                          │
 * │ `/subscriptions/status/` exige `subscription.view`, accordée au SEUL     │
 * │ propriétaire. Or un terminal est tenu par un CAISSIER : une porte        │
 * │ adossée à cet endpoint ne se fermerait jamais pour la population même    │
 * │ qu'il faut retenir. Le chemin de réveil, lui, sert tous les rôles.       │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export interface SessionSubscription {
  /** Le verdict du SERVEUR au dernier réveil. On le constate, on ne le refait pas. */
  is_blocked: boolean;
  /** `none | trial | active | past_due | expired | cancelled | suspended`. */
  status: string;
  message: string | null;
  /**
   * La date jusqu'à laquelle le serveur laisserait écrire, GRÂCE COMPRISE.
   *
   * C'est la seule chose qui permette de juger hors ligne. Sans elle, le
   * dernier verdict connu resterait « non bloqué » indéfiniment, et un mode
   * avion offrirait des mois gratuits.
   */
  access_until: string | null;
  days_remaining: number | null;
  /** Le plan EN COURS : ce qu'on propose de prolonger, plutôt qu'un autre. */
  plan_id: string | null;
  plan_name: string | null;
  /**
   * Ce compte peut-il régler l'abonnement ?
   *
   * `moko_initiate` est `IsTenantOwner`. La règle appartient au serveur : la
   * recopier ici ferait mentir le bouton le jour où elle s'élargirait.
   */
  can_manage: boolean;
}

/** Ce qui est rangé dans le trousseau et relu au démarrage. */
export interface SessionSnapshot {
  user: SessionUser;
  organization: SessionOrganization;
  membership: SessionMembership;
  settings: SessionSettings | null;
  currencies: OrganizationCurrency[];
  loyalty_program: SessionLoyaltyProgram | null;
  device: SessionDevice | null;
  /**
   * ⚠ FACULTATIF, et c'est la règle 1 de `jugerAcces` exprimée dans le type :
   * un instantané écrit par une version antérieure ne le porte pas. Le rendre
   * obligatoire mettrait tout le parc dehors le jour de la mise à jour.
   */
  subscription?: SessionSubscription | null;
  /**
   * ⚠ FACULTATIF pour la même raison que `subscription` : un instantané mis en
   * cache avant ce lot ne le porte pas. `undefined` veut dire « roster
   * INCONNU » et se lit tout autrement qu'un roster vide - voir
   * `offreDePerimetre`, qui verrouille le filtre plutôt que d'annoncer
   * « aucun collègue » à un propriétaire qui en a cinquante.
   */
  team?: SessionTeam | null;
  /** Date du dernier réveil réussi : sert à dater la fraîcheur des droits. */
  fetched_at: string;
}

/** Réponse brute du serveur, jetons compris. */
export interface SessionResponse extends Omit<SessionSnapshot, "fetched_at"> {
  access: string;
  refresh: string;
  server_time: string;
  /** Présent une seule fois, à l'enrôlement. */
  device_token?: string;
}

export type SessionStatus =
  /** Lecture du trousseau. Aucun appel réseau. */
  | "loading"
  /** Aucune session : écran de connexion. */
  | "anonymous"
  /** Session valide, application verrouillée : code ou biométrie. */
  | "locked"
  /**
   * Terminal enrôlé mais sans code. Un appareil qui porte une session de
   * 30 jours et les ventes du jour ne reste pas sans verrou : le code est exigé
   * à l'enrôlement, il ne se propose pas.
   */
  | "needs_pin"
  /** Utilisable, en ligne comme hors ligne. */
  | "ready"
  /**
   * Le serveur a répondu et refuse à la fois le jeton de rafraîchissement et
   * celui de l'appareil. Distinct de `anonymous` : la base locale et les
   * opérations en attente sont intactes, et l'écran doit le dire.
   */
  | "needs_password"
  /**
   * La base locale porte les données d'un AUTRE compte, et des opérations qui
   * n'ont jamais été envoyées.
   *
   * ⚠ **L'ÉTAT EST LE VERROU, et c'est pour cela qu'il vaut mieux qu'un écran
   * ordinaire.** Le groupe `(app)` n'est pas monté, donc pas de
   * `SynchronisationProvider` ; et même si quelque chose le montait, `executer`
   * sort déjà sur `statusRef.current !== "ready"`. Le journal de l'ancien
   * propriétaire ne peut donc pas partir sous le jeton du nouveau, par
   * construction et non par surveillance.
   */
  | "base_etrangere";
