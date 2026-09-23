/**
 * Jetons de couleur, source unique de l'application.
 *
 * Repris tels quels du back-office (`frontend/app/globals.css`) : la même
 * boutique sur un ordinateur et sur un téléphone doit avoir la même identité.
 * Le primaire orange, le fond gris très clair, la carte blanche.
 *
 * **Le mode sombre est traité dès le premier jour.** Le web a la palette
 * complète mais aucun sélecteur, et son habillage est codé en clair : un
 * caissier qui travaille en soirée sur un terminal POS le paie. Ici, aucun
 * composant ne porte jamais de variante `dark:` ; ils lisent des variables
 * posées sur la vue racine, et un seul endroit décide.
 */

export type ColorScheme = "light" | "dark";

/** Noms de jetons, communs aux deux thèmes. */
export type ColorToken =
  | "background"
  | "foreground"
  | "card"
  | "cardForeground"
  | "popover"
  | "popoverForeground"
  | "primary"
  | "primaryForeground"
  | "secondary"
  | "secondaryForeground"
  | "muted"
  | "mutedForeground"
  | "accent"
  | "accentForeground"
  | "destructive"
  | "destructiveForeground"
  | "success"
  | "successForeground"
  | "warning"
  | "warningForeground"
  | "border"
  | "input"
  | "ring"
  | "splash"
  | "chart1"
  | "chart2"
  | "chart3"
  | "chart4"
  | "chart5";

/**
 * Le fond du splash, CLAIR DANS LES DEUX THÈMES.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE JETON NE SUIT PAS LE THÈME, ET C'EST TOUT SON INTÉRÊT.               │
 * │                                                                          │
 * │ Le logo de la marque porte du bleu sombre et un contour noir : mesuré    │
 * │ contre `#0f0f11`, le tourbillon orange tient 5,4:1 mais le mot « Vente » │
 * │ tombe à 1,6:1 et le téléphone à ~1:1. Sur un fond sombre, il ne reste    │
 * │ que l'orange, ce qui se lit comme un défaut d'affichage.                 │
 * │                                                                          │
 * │ `app.config.ts` a donc tranché : le splash natif reste clair de nuit     │
 * │ comme de jour. Ce jeton est ce qui permet à l'écran de démarrage de le   │
 * │ PROLONGER sans écrire `bg-white`, que le garde-fou des couleurs en dur   │
 * │ interdit à juste titre partout ailleurs.                                 │
 * │                                                                          │
 * │ ⚠ IL NE SERT QU'À CELA : le FOND de l'écran de démarrage.               │
 * │ Il a un temps servi de PLAQUE sous le logo, sur tous les écrans. C'était │
 * │ un carré blanc posé sur le `#f3f4f6` de la page en thème clair et sur le │
 * │ `#0f0f11` en sombre : deux couleurs qui ne sont celles d'aucune des deux │
 * │ pages. Le fond derrière le logo est TOUJOURS celui de la page. Voir      │
 * │ `ui/logo.tsx`, et le garde-fou « aucune plaque d'une autre couleur ne se │
 * │ glisse sous le logo » qui l'interdit désormais.                          │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export type Palette = Record<ColorToken, string>;

const light: Palette = {
  background: "#f3f4f6",
  foreground: "#111827",
  card: "#ffffff",
  cardForeground: "#111827",
  popover: "#ffffff",
  popoverForeground: "#111827",
  primary: "#ea580c",
  primaryForeground: "#ffffff",
  secondary: "#e5e7eb",
  secondaryForeground: "#374151",
  muted: "#f9fafb",
  mutedForeground: "#6b7280",
  accent: "#fff7ed",
  accentForeground: "#c2410c",
  destructive: "#dc2626",
  destructiveForeground: "#ffffff",
  // Ajouts propres au mobile : la monnaie rendue, les avertissements de crédit
  // et l'état de synchronisation ont besoin d'un vert et d'un ambre nommés.
  // Le web les écrit en classes brutes (`text-green-700`, `border-amber-200`),
  // ce qui les rend impossibles à basculer en sombre.
  success: "#15803d",
  successForeground: "#ffffff",
  warning: "#b45309",
  warningForeground: "#ffffff",
  border: "#e5e7eb",
  input: "#e7e7e7",
  ring: "#ea580c",
  splash: "#ffffff",
  chart1: "#ea580c",
  chart2: "#3b82f6",
  chart3: "#22c55e",
  chart4: "#f59e0b",
  chart5: "#8b5cf6",
};

const dark: Palette = {
  background: "#0f0f11",
  foreground: "#f3f4f6",
  card: "#1a1a1d",
  cardForeground: "#f3f4f6",
  popover: "#1a1a1d",
  popoverForeground: "#f3f4f6",
  // Orange plus clair : sur fond sombre, #ea580c descend sous le contraste 4.5.
  primary: "#f97316",
  primaryForeground: "#ffffff",
  secondary: "#27272a",
  secondaryForeground: "#d4d4d8",
  muted: "#27272a",
  mutedForeground: "#a1a1aa",
  accent: "#431407",
  accentForeground: "#fb923c",
  destructive: "#ef4444",
  destructiveForeground: "#ffffff",
  success: "#4ade80",
  successForeground: "#052e16",
  warning: "#fbbf24",
  warningForeground: "#451a03",
  border: "#2d2d30",
  input: "#3f3f46",
  ring: "#f97316",
  // Identique au thème clair : voir la note au-dessus de `Palette`.
  splash: "#ffffff",
  chart1: "#f97316",
  chart2: "#60a5fa",
  chart3: "#4ade80",
  chart4: "#fbbf24",
  chart5: "#a78bfa",
};

export const PALETTES: Record<ColorScheme, Palette> = { light, dark };

/** Nom de la variable CSS d'un jeton : `primaryForeground` → `--color-primary-foreground`. */
export function cssVarName(token: ColorToken): string {
  return `--color-${token.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
}

/**
 * Canaux RVB séparés par des espaces : « 234 88 12 ».
 *
 * Tailwind compose l'opacité avec `rgb(var(--x) / <alpha-value>)`, ce qui exige
 * les canaux nus et non un `#rrggbb`. Sans cela, `bg-primary/10` est inerte.
 */
export function rgbChannels(hex: string): string {
  const clean = hex.replace("#", "");
  const full =
    clean.length === 3
      ? clean.split("").map((c) => c + c).join("")
      : clean;
  const n = parseInt(full, 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

/** Variables à poser sur la vue racine pour un thème donné. */
export function themeVars(scheme: ColorScheme): Record<string, string> {
  const palette = PALETTES[scheme];
  const out: Record<string, string> = {};
  for (const token of Object.keys(palette) as ColorToken[]) {
    out[cssVarName(token)] = rgbChannels(palette[token]);
  }
  return out;
}

/**
 * Rayons, en points. Le web pose `--radius: 0.5rem` et dérive le reste ;
 * 1 rem vaut 16 points sur mobile.
 */
export const RADIUS = { sm: 4, md: 6, lg: 8, xl: 12, "2xl": 16, full: 9999 } as const;

/**
 * Cibles tactiles. 44 points est le plancher partout ; le POS monte à 56, parce
 * qu'on y appuie vite, parfois avec un ongle, parfois avec un gant.
 */
export const HIT = { min: 44, pos: 56 } as const;
