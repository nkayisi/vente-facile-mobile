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
    // Bluetooth CLASSIQUE (profil série), le transport de l'écrasante majorité
    // des imprimantes 58 mm du marché. `react-native-ble-plx` pose lui-même
    // celles du BLE via son greffon ; le paquet Bluetooth classique n'en a pas,
    // d'où cette liste écrite à la main.
    //
    // Les deux familles cohabitent parce qu'Android a CHANGÉ de modèle en 12 :
    // `BLUETOOTH` / `BLUETOOTH_ADMIN` valent jusqu'à l'API 30, `BLUETOOTH_SCAN`
    // et `BLUETOOTH_CONNECT` à partir de 31. N'en garder qu'une moitié
    // exclurait la moitié du parc, et les terminaux POS bon marché tournent
    // souvent sur des versions anciennes.
    permissions: [
      "android.permission.BLUETOOTH",
      "android.permission.BLUETOOTH_ADMIN",
      "android.permission.BLUETOOTH_CONNECT",
      "android.permission.BLUETOOTH_SCAN",
      "android.permission.ACCESS_FINE_LOCATION",
    ],
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
    [
      // Bluetooth basse consommation : les imprimantes plus récentes n'ont plus
      // de profil série. Le greffon pose les clés Info.plist d'iOS et les
      // permissions Android, qu'il faudrait sinon écrire deux fois.
      "react-native-ble-plx",
      {
        isBackgroundEnabled: false,
        modes: ["central"],
        bluetoothAlwaysPermission:
          "Le Bluetooth sert à envoyer les tickets à votre imprimante.",
      },
    ],
    // Sentry pose ses agents natifs (crash Java/Kotlin et ObjC/Swift) : sans
    // le greffon, seules les erreurs JavaScript remonteraient, or un plantage
    // natif est précisément celui qu'on ne peut pas reproduire au bureau.
    "@sentry/react-native",
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

  /**
   * Mises à jour par-dessus l'air.
   *
   * ┌────────────────────────────────────────────────────────────────────────┐
   * │ UNE MISE À JOUR NE DOIT JAMAIS RETARDER L'OUVERTURE DU COMPTOIR.       │
   * │                                                                        │
   * │ `fallbackToCacheTimeout: 0` fait démarrer l'application sur le paquet   │
   * │ déjà présent, SANS attendre le réseau. La recherche continue en fond,   │
   * │ et le nouveau paquet s'applique au lancement suivant. Le réglage par    │
   * │ défaut bloquerait le démarrage le temps d'un aller-retour : sur une 2G  │
   * │ congolaise, cela veut dire un caissier qui attend devant un client.     │
   * └────────────────────────────────────────────────────────────────────────┘
   *
   * `policy: "fingerprint"` et non `"appVersion"` : l'empreinte change dès
   * qu'une dépendance NATIVE bouge. C'est ce qui empêche d'envoyer à un
   * terminal un paquet JavaScript qui appelle un module natif que son binaire
   * n'a pas - l'imprimante Bluetooth, par exemple, qui planterait au premier
   * ticket. Une version applicative, elle, se laisse oublier.
   *
   * `url` et `extra.eas.projectId` restent ABSENTS tant que le projet n'est pas
   * relié à un compte EAS (`eas init` puis `eas update:configure` les posent).
   * Sans eux le mécanisme est inerte : aucune mise à jour n'est cherchée, et
   * rien ne casse. Les inventer ici enverrait les terminaux interroger un
   * identifiant qui n'existe pas.
   */
  updates: {
    enabled: true,
    fallbackToCacheTimeout: 0,
    checkAutomatically: "ON_LOAD",
  },
  runtimeVersion: { policy: "fingerprint" },

  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },

  extra: {
    profile,
  },
};

export default config;
