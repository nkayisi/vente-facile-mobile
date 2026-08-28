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
import { useRouter, useSegments } from "expo-router";

import { useSession } from "./provider";
import type { SessionStatus } from "./types";

/** Écran attendu pour chaque état. Une seule table, pas de condition éparse. */
const ROUTE_FOR: Record<Exclude<SessionStatus, "loading">, string> = {
  anonymous: "/(auth)/login",
  needs_password: "/(auth)/login",
  needs_pin: "/(auth)/pin",
  locked: "/(locked)/unlock",
  ready: "/(app)",
};

export function SessionGate() {
  const { status } = useSession();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    // Tant que le trousseau n'a pas parlé, on ne déplace rien : rediriger sur
    // un état provisoire ferait clignoter l'écran de connexion à chaque
    // démarrage, y compris pour un utilisateur déjà connecté.
    if (status === "loading") return;

    const target = ROUTE_FOR[status];
    const current = `/${segments.join("/")}`;

    // `(app)` couvre toute une arborescence : une fois dedans, on laisse
    // l'utilisateur naviguer librement. Les autres états visent un écran
    // précis, et on n'y renvoie que si on n'y est pas déjà.
    const alreadyThere =
      status === "ready" ? segments[0] === "(app)" : current === target;

    if (!alreadyThere) router.replace(target as never);
  }, [status, segments, router]);

  return null;
}
