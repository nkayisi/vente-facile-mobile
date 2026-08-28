import type { ExpoConfig } from "expo/config";

/**
 * Configuration de l'application, calculée plutôt que figée.
 *
 * `app.json` ne pouvait pas convenir : l'URL de l'API, le nom affiché et
 * l'identifiant natif changent selon le profil de compilation, et un
 * développeur doit pouvoir garder la préproduction et la production installées
 * côte à côte sur le même terminal POS pour les comparer.
 */

type Profile = "development" | "preview" | "production";

const profile = (process.env.EAS_BUILD_PROFILE ?? "development") as Profile;

/** Suffixe d'identifiant natif : deux variantes cohabitent sur un appareil. */
const SUFFIX: Record<Profile, string> = {
  development: ".dev",
  preview: ".preview",
  production: "",
};

/** Nom sous l'icône : le caissier doit voir tout de suite ce qu'il ouvre. */
const NAME: Record<Profile, string> = {
  development: "VF (dev)",
  preview: "VF (préprod)",
  production: "Vente Facile",
};

const BUNDLE = `com.ventefacile.app${SUFFIX[profile]}`;

const config: ExpoConfig = {
  name: NAME[profile],
  slug: "vf-marchand",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: "ventefacile",
  // Le mode sombre est traité dès le premier jour : un terminal POS sert
  // souvent en soirée, et le web a la palette sans le sélecteur.
  userInterfaceStyle: "automatic",
  // `newArchEnabled` n'existe plus dans la configuration : depuis le SDK 57,
  // la nouvelle architecture est la seule.

  ios: {
    bundleIdentifier: BUNDLE,
    supportsTablet: true,
    infoPlist: {
      // Français : les invites système s'affichent dans la langue de l'app.
      NSCameraUsageDescription:
        "L'appareil photo sert à scanner les codes-barres des articles.",
      NSFaceIDUsageDescription:
        "Face ID déverrouille l'application sans saisir votre code.",
      NSPhotoLibraryUsageDescription:
        "Choisissez une image pour illustrer un article.",
    },
  },

  android: {
    package: BUNDLE,
    // `edgeToEdgeEnabled` a disparu de la configuration : depuis le SDK 57,
    // le bord-a-bord est le comportement par defaut d'Android.
    predictiveBackGestureEnabled: false,
    adaptiveIcon: {
      backgroundColor: "#FFF7ED",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
    // Le terminal porte des ventes non synchronisées : une sauvegarde
    // automatique restaurée sur un autre appareil les dupliquerait.
    allowBackup: false,
  },

  plugins: [
    "expo-router",
    [
      "expo-splash-screen",
      {
        backgroundColor: "#FFFFFF",
        dark: { backgroundColor: "#0F0F11" },
        image: "./assets/images/splash-icon.png",
        imageWidth: 160,
      },
    ],
    "expo-sqlite",
    "expo-secure-store",
    "expo-background-task",
    "expo-sharing",
    "@react-native-community/datetimepicker",
    [
      "expo-camera",
      {
        cameraPermission:
          "L'appareil photo sert à scanner les codes-barres des articles.",
      },
    ],
    [
      "expo-local-authentication",
      {
        faceIDPermission:
          "Face ID déverrouille l'application sans saisir votre code.",
      },
    ],
    [
      "expo-image-picker",
      {
        photosPermission: "Choisissez une image pour illustrer un article.",
      },
    ],
  ],

  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },

  extra: {
    profile,
  },
};

export default config;
