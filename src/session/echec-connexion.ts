/**
 * La phrase qu'un échec de connexion montre au caissier.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ TROIS GESTES DIFFÉRENTS, DONC TROIS PHRASES.                             │
 * │                                                                          │
 * │ Corriger sa saisie, chercher du réseau, ou ATTENDRE. Le troisième est    │
 * │ celui du verrouillage (cinq échecs, quinze minutes, depuis le            │
 * │ 2026-11-13) : un caissier qui lirait « mot de passe incorrect » le       │
 * │ retaperait, et chaque essai pendant le verrou ne fait rien. La phrase    │
 * │ du serveur dit combien de minutes attendre, et c'est elle qu'on montre.  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Module PUR : la règle se teste sans monter l'écran de connexion.
 */
import { ApiError } from "@/api/errors";

export const PHRASE_RESEAU = "Impossible de joindre le serveur. Vérifiez votre connexion.";
export const PHRASE_IDENTIFIANTS = "Adresse ou mot de passe incorrect.";
export const PHRASE_ATTENTE = "Trop de tentatives. Patientez quelques minutes avant de réessayer.";
export const PHRASE_REPLI = "La connexion a échoué.";

export function messageEchecConnexion(erreur: unknown): string {
  if (!(erreur instanceof ApiError)) {
    return erreur instanceof Error && erreur.message ? erreur.message : PHRASE_REPLI;
  }
  switch (erreur.kind) {
    case "network":
      return PHRASE_RESEAU;
    case "auth":
      return PHRASE_IDENTIFIANTS;
    case "throttled":
      // `ApiError.message` porte déjà la phrase du serveur, minutes comprises ;
      // le repli ne sert que si le corps n'en avait pas.
      return erreur.code === "login_locked" && erreur.message ? erreur.message : PHRASE_ATTENTE;
    default:
      return erreur.message || PHRASE_REPLI;
  }
}
