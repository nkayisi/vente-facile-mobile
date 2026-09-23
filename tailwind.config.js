/**
 * Les couleurs pointent toutes vers une variable posée par `ThemeProvider`.
 * Aucune valeur en dur ici, et aucune variante `dark:` dans les composants :
 * changer de thème remplace les variables sur la vue racine, un seul endroit.
 *
 * La forme `rgb(var(--x) / <alpha-value>)` est ce qui rend `bg-primary/10`
 * possible ; avec un `#rrggbb` dans la variable, l'opacité serait inerte.
 */
const color = (name) => `rgb(var(--color-${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        background: color("background"),
        foreground: color("foreground"),
        card: { DEFAULT: color("card"), foreground: color("card-foreground") },
        popover: { DEFAULT: color("popover"), foreground: color("popover-foreground") },
        primary: { DEFAULT: color("primary"), foreground: color("primary-foreground") },
        secondary: { DEFAULT: color("secondary"), foreground: color("secondary-foreground") },
        muted: { DEFAULT: color("muted"), foreground: color("muted-foreground") },
        accent: { DEFAULT: color("accent"), foreground: color("accent-foreground") },
        destructive: { DEFAULT: color("destructive"), foreground: color("destructive-foreground") },
        success: { DEFAULT: color("success"), foreground: color("success-foreground") },
        warning: { DEFAULT: color("warning"), foreground: color("warning-foreground") },
        border: color("border"),
        input: color("input"),
        ring: color("ring"),
        // Clair dans les deux thèmes : voir `ui/tokens.ts`.
        splash: color("splash"),
        chart: {
          1: color("chart1"),
          2: color("chart2"),
          3: color("chart3"),
          4: color("chart4"),
          5: color("chart5"),
        },
      },
      /**
       * Inter, comme le back-office (`next/font/google`). Deux surfaces de la
       * meme marque avec deux polices, c'est la premiere chose qu'on remarque
       * en passant de l'une a l'autre.
       *
       * UNE FAMILLE PAR GRAISSE, et des noms qui n'entrent PAS en collision
       * avec les utilitaires de graisse de Tailwind (`font-medium` reste un
       * `fontWeight`). C'est obligatoire : sur Android, une famille custom NE
       * SYNTHETISE PAS les graisses. Avec la seule Inter_400Regular chargee,
       * `font-semibold` rendrait du regular, sans erreur ni avertissement, et
       * tous les titres de l'application perdraient leur poids.
       */
      fontFamily: {
        sans: ["Inter_400Regular"],
        "sans-medium": ["Inter_500Medium"],
        "sans-semibold": ["Inter_600SemiBold"],
        "sans-bold": ["Inter_700Bold"],
      },
      borderRadius: {
        sm: "4px",
        DEFAULT: "6px",
        md: "6px",
        lg: "8px",
        xl: "12px",
        "2xl": "16px",
      },
    },
  },
  plugins: [],
};
