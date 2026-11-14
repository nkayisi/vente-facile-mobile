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
 * croirait branché. Hors Android, le module n'existe pas : rien à appeler.
 *
 * ⚠ La documentation d'Expo prévient qu'un bogue de l'ÉMULATEUR Android 15 peut
 * rendre `setStyle` sans effet. Si la teinte n'y bouge pas, ce n'est pas une
 * preuve : il faut un appareil ou une autre version.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ON N'EMPLOIE PAS LE COMPOSANT `<NavigationBar>` DE LA BIBLIOTHÈQUE.     │
 * │                                                                          │
 * │ Il appelle `setStyle` et `setHidden` du module natif SANS rattraper      │
 * │ leur promesse, y compris à son démontage. Or ces fonctions lèvent quand  │
 * │ l'activité a disparu (`throwingActivity`) : fermeture de l'application,  │
 * │ rechargement. Chaque fermeture laissait une promesse rejetée et non      │
 * │ rattrapée, qui remontait en bruit dans le rapport de plantage. Relevé    │
 * │ le 2026-11-14.                                                           │
 * │                                                                          │
 * │ On appelle donc le module natif nous-mêmes, une fois par changement de   │
 * │ thème, et on rattrape. Rien au démontage : l'activité qui disparaît      │
 * │ emporte sa barre avec elle, il n'y a rien à rétablir.                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import { useEffect } from "react";
import { Platform } from "react-native";
import { StatusBar } from "expo-status-bar";

import { useTheme } from "./theme";

interface ModuleBarre {
  setStyle(style: "light" | "dark"): Promise<void>;
}

let module: ModuleBarre | null | undefined;

function charger(): ModuleBarre | null {
  if (module !== undefined) return module;
  if (Platform.OS !== "android") {
    module = null;
    return null;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- module natif optionnel
    const expo = require("expo") as {
      requireOptionalNativeModule<T>(name: string): T | null;
    };
    module = expo.requireOptionalNativeModule<ModuleBarre>("ExpoNavigationBar");
  } catch {
    module = null;
  }
  return module;
}

export function BarresSysteme() {
  const { scheme } = useTheme();
  const style = scheme === "dark" ? "light" : "dark";

  useEffect(() => {
    const barre = charger();
    if (!barre) return;
    // Une teinte qui ne s'applique pas n'est pas une panne : la barre garde la
    // précédente, et l'écran reste utilisable.
    barre.setStyle(style).catch(() => undefined);
  }, [style]);

  return <StatusBar style={style} />;
}
