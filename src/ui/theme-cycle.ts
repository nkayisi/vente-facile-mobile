/**
 * L'ordre du cycle de thème, et les mots qui nomment chaque état.
 *
 * Module PUR, sans un seul import : `theme.tsx` tire `@/data/reglages`, qui
 * tire `@/db/client`, qui OUVRE la base SQLite au chargement. Une règle écrite
 * là-bas ne serait pas éprouvable sans appareil, et un ordre de cycle faux ne
 * lève rien - il fait simplement tourner le marchand en rond.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ L'ORDRE EST FIXE, ET C'EST UN ARBITRAGE.                                 │
 * │                                                                          │
 * │ « Automatique, puis Clair, puis Sombre » se dit en une phrase et ne      │
 * │ change jamais. Contrepartie assumée : quand « Automatique » résout déjà  │
 * │ vers le clair, le premier appui ne change AUCUNE couleur - seule l'icône │
 * │ passe de l'écran au soleil.                                              │
 * │                                                                          │
 * │ L'alternative - partir de l'opposé de ce qui est affiché, pour qu'un     │
 * │ appui change toujours quelque chose - a été écrite puis retirée :        │
 * │ l'ordre du cycle se serait alors inversé tout seul au coucher du soleil, │
 * │ quand le téléphone bascule. Un geste qui ne donne pas deux fois le même  │
 * │ résultat est pire qu'un geste qui, une fois sur trois, ne repeint rien.  │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/** Les trois modes, dans l'ordre du cycle. Miroir de `ThemePreference`. */
export const ORDRE_THEME = ["system", "light", "dark"] as const;

export type ModeTheme = (typeof ORDRE_THEME)[number];

/**
 * Le mode suivant.
 *
 * Le modulo referme la boucle : depuis n'importe quel état, trois appuis
 * ramènent au point de départ. Un mode inconnu - une valeur rangée par une
 * version antérieure - retombe sur `system`, jamais sur une erreur : le thème
 * est un confort, il ne doit pas pouvoir arrêter le comptoir.
 */
export function themeSuivant(mode: ModeTheme): ModeTheme {
  const i = ORDRE_THEME.indexOf(mode);
  if (i < 0) return "system";
  return ORDRE_THEME[(i + 1) % ORDRE_THEME.length];
}

/**
 * Ce que chaque mode s'appelle, et le glyphe qui le porte.
 *
 * Les trois noms d'icône sont ceux du registre lucide : la bascule se pose à
 * quelques points du `LogOut` du pied de tiroir, et deux familles d'icônes côte
 * à côte feraient changer l'épaisseur de trait au milieu d'une rangée.
 */
export const LIBELLE_THEME: Record<
  ModeTheme,
  { titre: string; aide: string; icon: "Monitor" | "Sun" | "Moon" }
> = {
  system: {
    titre: "Automatique",
    aide: "Suit le réglage du téléphone",
    icon: "Monitor",
  },
  light: { titre: "Clair", aide: "Toujours clair", icon: "Sun" },
  dark: { titre: "Sombre", aide: "Toujours sombre", icon: "Moon" },
};
