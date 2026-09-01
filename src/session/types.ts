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

/** Ce qui est rangé dans le trousseau et relu au démarrage. */
export interface SessionSnapshot {
  user: SessionUser;
  organization: SessionOrganization;
  membership: SessionMembership;
  settings: SessionSettings | null;
  currencies: OrganizationCurrency[];
  loyalty_program: SessionLoyaltyProgram | null;
  device: SessionDevice | null;
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
  | "needs_password";
