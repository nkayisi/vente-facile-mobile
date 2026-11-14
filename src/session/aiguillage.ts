/**
 * La garde est-elle déjà là où l'état de session l'envoie ?
 *
 * Module PUR, extrait de `gate.tsx` : la garde importe le fournisseur de
 * session, qui ouvre SQLite au chargement, et une règle écrite là-bas n'était
 * pas éprouvable sans appareil. Une règle d'aiguillage fausse ne lève rien :
 * elle renvoie l'utilisateur en arrière, et le défaut ne se voit qu'à l'usage.
 */
import type { SessionStatus } from "./types";

/**
 * Les écrans qu'un terminal à la session perdue traverse pour se reconnecter.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ `needs_password` VISAIT LA SEULE CONNEXION, ET LA SUITE EN SORTAIT.      │
 * │                                                                          │
 * │ La connexion pousse le choix de l'établissement (plusieurs boutiques) ou │
 * │ le changement d'un mot de passe posé par l'administration. La garde      │
 * │ constatait que le chemin n'était plus `/(auth)/login` et y renvoyait     │
 * │ aussitôt : un terminal dont on venait de réinitialiser le mot de passe - │
 * │ c'est précisément lui qui passe en `needs_password` - ne pouvait plus    │
 * │ jamais le changer, donc plus jamais s'enrôler.                           │
 * │                                                                          │
 * │ ⚠ Une liste NOMMÉE, pas tout le groupe `(auth)` : l'inscription d'une    │
 * │ nouvelle boutique n'est pas une reconnexion, et ce terminal porte encore │
 * │ les ventes de l'ancienne session.                                        │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export const SUITE_DE_CONNEXION: ReadonlySet<string> = new Set([
  "login",
  "organization",
  "nouveau-mot-de-passe",
]);

export function estDejaSurPlace(
  status: Exclude<SessionStatus, "loading">,
  segments: readonly string[],
  cible: string
): boolean {
  // `(app)` couvre toute une arborescence : une fois dedans, on laisse
  // l'utilisateur naviguer librement.
  if (status === "ready") return segments[0] === "(app)";
  // `anonymous` couvre tout le groupe `(auth)`, inscription comprise.
  if (status === "anonymous") return segments[0] === "(auth)";
  if (status === "needs_password") {
    return segments[0] === "(auth)" && SUITE_DE_CONNEXION.has(segments[1] ?? "");
  }
  // Les autres états visent un écran précis : `locked` doit ramener au
  // déverrouillage, où qu'on aille.
  return `/${segments.join("/")}` === cible;
}
