/**
 * La cloche de la barre du haut, et son décompte.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ELLE EST DANS LA BARRE, PAS DANS LE TIROIR.                            │
 * │                                                                          │
 * │ Une notification se lit quand elle arrive, pas quand on pense à aller la │
 * │ chercher. Rangée dans le menu, il faudrait l'ouvrir pour savoir qu'il y  │
 * │ a quelque chose à lire - c'est le raisonnement qui a déjà sorti la       │
 * │ bascule de thème de l'écran « Apparence ».                               │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ ELLE RESTE VISIBLE QUAND IL N'Y A RIEN. Un bouton qui disparaît est un
 * bouton qu'on ne retrouve plus quand il le faut - la règle déjà posée sur le
 * témoin de synchronisation. C'est la PASTILLE qui apparaît, pas la cloche.
 *
 * ⚠ ET ELLE NE SONDE PAS EN BOUCLE. Le décompte se relit à l'arrivée sur un
 * écran et au retour au premier plan, jamais à intervalle : un minuteur qui
 * bat ferait une requête par minute sur une 2G, pour un chiffre qui change
 * quelques fois par jour. Le push est ce qui prévient dans l'instant.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, View } from "react-native";
import { router, usePathname } from "expo-router";

import { compterNonLues } from "@/data/notifications";
import { useEnLigne } from "@/data/reseau";
import { HIT } from "@/ui/tokens";
import { Icon } from "@/ui/icon";
import { Pressable } from "@/ui/pressable";
import { Text } from "@/ui/text";

export function ClocheNotifications() {
  const enLigne = useEnLigne();
  const chemin = usePathname();
  const [nombre, setNombre] = useState(0);

  const vivant = useRef(true);
  useEffect(() => {
    vivant.current = true;
    return () => {
      vivant.current = false;
    };
  }, []);

  const relire = useCallback(async () => {
    if (!enLigne) return;
    try {
      const n = await compterNonLues();
      if (vivant.current) setNombre(n);
    } catch {
      // Un décompte indisponible ne vaut pas un zéro affirmé : on garde le
      // dernier connu plutôt que d'annoncer « rien à lire » sur une panne.
    }
  }, [enLigne]);

  // À chaque changement d'écran : c'est le moment où le marchand regarde la
  // barre, et cela suffit sans minuteur.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- faux positif : `relire` n'écrit RIEN avant son premier `await`, et l'analyseur perd la trace des `await` en traversant un bloc gardé. Même mesure que `ma-journee/index.tsx` et `session/provider.tsx`.
    void relire();
  }, [relire, chemin]);

  // Et au retour au premier plan : les alertes arrivent pendant que le
  // téléphone est dans la poche.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (etat) => {
      if (etat === "active") void relire();
    });
    return () => sub.remove();
  }, [relire]);

  return (
    <Pressable
      onPress={() => router.push("/(app)/notifications" as never)}
      haptic="selection"
      accessibilityRole="button"
      accessibilityLabel={
        nombre > 0
          ? `Notifications, ${nombre} non lue${nombre > 1 ? "s" : ""}`
          : "Notifications"
      }
      // Les cibles de la barre se touchent : le `hitSlop` par défaut les ferait
      // se recouvrir, et un doigt tombé dans la couture ouvrirait le voisin.
      hitSlop={0}
      className="items-center justify-center"
      style={{ width: HIT.min, height: HIT.min }}
    >
      <Icon name="Bell" size={22} />
      {nombre > 0 ? (
        <View
          className="absolute items-center justify-center rounded-full bg-destructive px-1"
          style={{ top: 8, right: 6, minWidth: 16, height: 16 }}
        >
          {/* ⚠ Au-delà de neuf on écrit « 9+ » : trois chiffres déborderaient
              de la pastille, et le nombre exact n'apprend rien de plus - ce
              qu'on lit est « il y en a beaucoup ». */}
          <Text variant="caption" className="text-destructive-foreground" numeric>
            {nombre > 9 ? "9+" : String(nombre)}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}
