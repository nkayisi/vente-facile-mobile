/**
 * Les deux barres du système suivent le thème de l'APPLICATION.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ `<StatusBar style="auto" />` SUIT LE SYSTÈME, ET C'EST LE DÉFAUT.       │
 * │                                                                          │
 * │ `auto` décide d'après `useColorScheme()`, c'est-à-dire d'après le thème  │
 * │ du TÉLÉPHONE - jamais d'après celui que `ThemeProvider` a résolu. Un     │
 * │ marchand qui choisit le thème sombre sur un téléphone en clair obtient   │
 * │ donc des icônes de statut sombres sur un fond sombre, et l'inverse en    │
 * │ miroir. Le piège est écrit depuis longtemps dans `screen.tsx` ; il       │
 * │ n'avait jamais été tiré jusqu'au bout.                                   │
 * │                                                                          │
 * │ Même écart en bas : `styles.xml` rend la barre de navigation             │
 * │ transparente et RIEN ne pilotait la teinte de ses boutons.               │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ `style` désigne la couleur de ce qui est DESSINÉ DESSUS - icônes et
 * boutons - et non celle du fond. Sur un fond sombre on veut donc `"light"`.
 * Les deux composants emploient le même mot pour la même chose.
 *
 * ⚠ `NavigationBar.setStyle` n'a d'effet que si le VOILE DE CONTRASTE d'Android
 * est désactivé, d'où `enforceContrast: false` sur le greffon dans
 * `app.config.ts`. Sans ce drapeau, ce composant serait inerte - et on le
 * croirait branché. Le composant rend `null` hors Android : rien à garder.
 *
 * ⚠ La documentation d'Expo prévient qu'un bogue de l'ÉMULATEUR Android 15 peut
 * rendre `setStyle` sans effet. Si la teinte n'y bouge pas, ce n'est pas une
 * preuve : il faut un appareil ou une autre version.
 */
import { NavigationBar } from "expo-navigation-bar";
import { StatusBar } from "expo-status-bar";

import { useTheme } from "./theme";

export function BarresSysteme() {
  const { scheme } = useTheme();
  const style = scheme === "dark" ? "light" : "dark";

  return (
    <>
      <StatusBar style={style} />
      <NavigationBar style={style} />
    </>
  );
}
