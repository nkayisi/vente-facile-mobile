/**
 * Une session PERDUE n'est pas une session ABSENTE.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ « SESSION EXPIRÉE » APRÈS UNE DÉCONNEXION VOLONTAIRE.                    │
 * │                                                                          │
 * │ Relevé sur l'émulateur : se déconnecter depuis le voile d'abonnement     │
 * │ menait à l'écran de connexion sous le bandeau « Session expirée. Ce      │
 * │ terminal doit être enrôlé à nouveau ». Une requête partie juste avant la │
 * │ déconnexion (le voile, un cycle de synchronisation) revenait APRÈS       │
 * │ l'effacement des jetons : sans jeton ni appareil, le client concluait à  │
 * │ une perte, et le fournisseur repassait la session en `needs_password`.   │
 * │                                                                          │
 * │ On ne perd que ce qu'on avait. Sans jeton au départ ET sans appareil     │
 * │ enrôlé, il n'y a rien à perdre : c'est une absence, pas un refus. Avec   │
 * │ des jetons en main, le même `no_device` reste une perte réelle (un       │
 * │ enrôlement interrompu, une session dont le serveur refuse le jeton).     │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function estUnePerteDeSession(
  avaitDesJetons: boolean,
  code: string | null | undefined
): boolean {
  if (!avaitDesJetons && code === "no_device") return false;
  return true;
}
