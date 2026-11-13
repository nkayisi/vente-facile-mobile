/**
 * Un établissement suspendu par Vente Facile.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE SERVEUR FERME TOUT, SAUF LA POUSSÉE DU JOURNAL (décision du          │
 * │ 2026-11-13).                                                             │
 * │                                                                          │
 * │ Le réveil du terminal répond encore (200, `organization.is_active` à     │
 * │ faux) : un refus là lui ferait perdre sa session, donc ses ventes en     │
 * │ file. C'est ce champ qui ferme le voile et réduit le cycle à la poussée. │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Module PUR : la règle se teste sans session ni base.
 */
import type { SessionOrganization } from "@/session/types";

/**
 * Vrai seulement sur un `is_active` explicitement FAUX.
 *
 * ⚠ Absent vaut ouvert : un instantané antérieur ne porte pas le champ.
 */
export function etablissementSuspendu(organisation: SessionOrganization | null | undefined): boolean {
  return organisation?.is_active === false;
}
