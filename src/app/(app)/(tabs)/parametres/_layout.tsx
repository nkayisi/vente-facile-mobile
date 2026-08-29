/**
 * Paramètres : trois onglets, miroir exact du back-office.
 *
 * Le web les fait en ONGLETS-ROUTES (`app/dashboard/settings/layout.tsx`), pas
 * en `Tabs` Radix : l'état vit dans l'URL. On garde ce choix, avec `Segmented`
 * qui pilote un `router.replace`.
 *
 * Écart au web assumé : le web colore son titre en orange (`text-orange-600`)
 * sur cette page et sur aucune autre. Ici le titre reste en `foreground` et
 * seule l'icône est colorée. Un titre orange sur une page et gris sur les
 * vingt-neuf autres ne fait pas de Paramètres une page spéciale, cela fait un
 * oubli visible.
 */
import { Slot, router, usePathname } from "expo-router";

import { AppBar, Screen, Segmented } from "@/ui";

const ROUTES = {
  index: "/parametres",
  devises: "/parametres/devises",
  fidelite: "/parametres/fidelite",
} as const;

type Onglet = keyof typeof ROUTES;

export default function ParametresLayout() {
  const chemin = usePathname();
  const courant: Onglet = chemin.includes("/devises")
    ? "devises"
    : chemin.includes("/fidelite")
      ? "fidelite"
      : "index";

  return (
    <Screen edges={[]} padded={false}>
      <AppBar title="Paramètres" subtitle="Configuration de votre établissement" back={false} />
      <Segmented
        options={[
          { valeur: "index", label: "Infos générales", icon: "Settings" },
          { valeur: "devises", label: "Devises", icon: "Coins" },
          { valeur: "fidelite", label: "Fidélité", icon: "Gift" },
        ]}
        valeur={courant}
        onChange={(v) => router.replace(ROUTES[v] as never)}
      />
      <Slot />
    </Screen>
  );
}
