/**
 * Garde de navigation.
 *
 * L'aiguillage ne peut pas vivre dans l'écran racine : celui-ci n'est monté
 * qu'à `/`. Une fois l'utilisateur sur l'écran de connexion, changer l'état de
 * session ne déplaçait plus rien, et le passage à l'accueil n'avait lieu qu'au
 * redémarrage suivant de l'application. Défaut vu sur l'émulateur, pas en
 * relisant le code.
 *
 * Ici, la garde est montée SOUS le fournisseur de session et au-dessus de la
 * pile : elle observe l'état à chaque changement, quel que soit l'écran affiché.
 */
import { useEffect } from "react";
import { useRootNavigationState, useRouter, useSegments } from "expo-router";

import { useSession } from "./provider";
import type { SessionStatus } from "./types";

/**
 * Écran attendu pour chaque état. Une seule table, pas de condition éparse.
 *
 * ⚠ `anonymous` a DEUX portes, et la table n'en porte qu'une. Au tout premier
 * lancement, on passe par la présentation ; ensuite, et pour toujours, par la
 * connexion. Le choix se fait plus bas, sur `accueilVu`, parce qu'il dépend
 * d'une lecture de base et non du seul état de session.
 */
const ROUTE_FOR: Record<Exclude<SessionStatus, "loading">, string> = {
  anonymous: "/(auth)/login",
  needs_password: "/(auth)/login",
  // Une base étrangère se tranche AVANT de vendre : l'écran nomme l'ancien
  // propriétaire, ses opérations en attente, et n'offre que deux issues.
  base_etrangere: "/(locked)/reprise",
  locked: "/(locked)/unlock",
  ready: "/(app)",
};

export function SessionGate() {
  const { status, accueilVu } = useSession();
  const segments = useSegments();
  const router = useRouter();
  // La pile est declaree APRES cette garde dans le layout racine, et les effets
  // s'executent dans l'ordre de declaration : sans ce temoin, le premier
  // `router.replace` part alors que le navigateur a ete RENDU mais pas encore
  // MONTE, et React leve « Can't perform a React state update on a component
  // that hasn't mounted yet ». L'avertissement etait la depuis le lot 1.
  const navigation = useRootNavigationState();

  useEffect(() => {
    if (!navigation?.key) return;
    // Tant que le trousseau n'a pas parlé, on ne déplace rien : rediriger sur
    // un état provisoire ferait clignoter l'écran de connexion à chaque
    // démarrage, y compris pour un utilisateur déjà connecté.
    if (status === "loading") return;
    // ┌──────────────────────────────────────────────────────────────────┐
    // │ ON ATTEND AUSSI QUE LE DRAPEAU SOIT LU.                         │
    // │                                                                  │
    // │ Sans cette ligne, un premier lancement affiche la connexion      │
    // │ pendant une image, puis saute sur la présentation quand la base  │
    // │ répond. C'est exactement le clignotement décrit deux lignes plus │
    // │ haut pour `loading`, par une seconde porte - et il ne se voit    │
    // │ qu'au premier lancement, c'est-à-dire jamais en développement,   │
    // │ où la base a déjà son drapeau.                                   │
    // └──────────────────────────────────────────────────────────────────┘
    if (status === "anonymous" && accueilVu === null) return;

    const target =
      status === "anonymous" && !accueilVu ? "/(auth)/bienvenue" : ROUTE_FOR[status];
    const current = `/${segments.join("/")}`;

    // `(app)` couvre toute une arborescence : une fois dedans, on laisse
    // l'utilisateur naviguer librement.
    //
    // `anonymous` couvre tout le groupe `(auth)`, et pas seulement l'écran de
    // connexion. Sans cela l'ASSISTANT D'INSCRIPTION serait inatteignable : on
    // y navigue depuis la connexion, la garde constate que le chemin n'est pas
    // `/(auth)/login`, et renvoie aussitôt en arrière. Le défaut se voit à
    // l'usage - l'écran clignote et revient - jamais en relisant la table.
    //
    // Les autres états visent un écran précis, et on n'y renvoie que si on n'y
    // est pas déjà : `locked` doit ramener au déverrouillage, où qu'on aille.
    const alreadyThere =
      status === "ready"
        ? segments[0] === "(app)"
        : status === "anonymous"
          ? segments[0] === "(auth)"
          : current === target;

    if (!alreadyThere) router.replace(target as never);
  }, [status, accueilVu, segments, router, navigation?.key]);

  return null;
}
