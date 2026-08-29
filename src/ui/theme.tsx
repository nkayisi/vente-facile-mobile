/**
 * Thème clair et sombre.
 *
 * Trois modes : `system` (défaut), `light`, `dark`. Le choix est conservé sur
 * l'appareil, pas sur le compte : deux caissiers qui se partagent un terminal
 * ne se volent pas leur réglage, et le réglage doit survivre hors ligne.
 *
 * Les composants n'écrivent jamais `dark:` : ils lisent `bg-card`,
 * `text-muted-foreground`, et c'est ce fournisseur qui décide ce que ces noms
 * valent, en posant les variables sur la vue racine.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { View, useColorScheme as useSystemColorScheme } from "react-native";
import { vars } from "nativewind";

import { CLE_THEME, ecrireReglage, lireReglage } from "@/data/reglages";
import { PALETTES, themeVars, type ColorScheme, type Palette } from "./tokens";

export type ThemePreference = "system" | "light" | "dark";

interface ThemeValue {
  /** Ce qui est réellement affiché, une fois `system` résolu. */
  scheme: ColorScheme;
  /** Le réglage choisi, `system` compris. */
  preference: ThemePreference;
  /** Couleurs en dur, pour les API natives qui n'acceptent pas de classe. */
  colors: Palette;
  /** Change le réglage et le range sur l'appareil. */
  setPreference: (p: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useSystemColorScheme();
  const [preference, setPreferenceEtat] = useState<ThemePreference>("system");

  // Le réglage rangé est relu APRÈS le premier rendu : ce fournisseur est monté
  // au-dessus de la base, volontairement, pour que l'écran d'erreur de
  // migration soit habillé. On démarre donc sur « system » et on corrige d'un
  // rendu. `lireReglage` avale ses erreurs : un thème est un confort, il ne
  // doit pas pouvoir empêcher l'application de démarrer.
  useEffect(() => {
    let vivant = true;
    void lireReglage<ThemePreference>(CLE_THEME, "system").then((p) => {
      if (vivant) setPreferenceEtat(p);
    });
    return () => {
      vivant = false;
    };
  }, []);

  const setPreference = useCallback((p: ThemePreference) => {
    setPreferenceEtat(p);
    void ecrireReglage(CLE_THEME, p);
  }, []);

  const scheme: ColorScheme =
    preference === "system" ? (system === "dark" ? "dark" : "light") : preference;

  const value = useMemo<ThemeValue>(
    () => ({ scheme, preference, colors: PALETTES[scheme], setPreference }),
    [scheme, preference, setPreference]
  );

  // `flex-1` est indispensable : sans lui la vue porteuse des variables se
  // réduit à sa hauteur de contenu et le fond du thème ne couvre pas l'écran.
  return (
    <ThemeContext.Provider value={value}>
      <View style={vars(themeVars(scheme))} className="flex-1 bg-background">
        {children}
      </View>
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeValue {
  const value = useContext(ThemeContext);
  if (!value) {
    throw new Error("useTheme doit être appelé sous <ThemeProvider>.");
  }
  return value;
}

/**
 * Couleur brute d'un jeton.
 *
 * Réservé aux API qui n'acceptent pas de classe : `StatusBar`, la barre de
 * navigation Android, les icônes vectorielles, les graphiques SVG. Partout
 * ailleurs, on écrit une classe.
 */
export function useColor(token: keyof Palette): string {
  return useTheme().colors[token];
}
