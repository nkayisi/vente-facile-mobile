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

/**
 * ┌────────────────────────────────────────────────────────────────────────────┐
 * │ LE PROFIL VIENT DE `VF_PROFILE`, PAS DE `EAS_BUILD_PROFILE`.               │
 * │                                                                            │
 * │ Mesuré : `EAS_BUILD_PROFILE` n'apparaît NULLE PART dans eas-cli - seul le  │
 * │ serveur de compilation le pose. Ce fichier est pourtant évalué DEUX fois : │
 * │ par le CLI sur la machine du développeur, pour résoudre l'identité de      │
 * │ l'application et donc ses IDENTIFIANTS DE SIGNATURE, puis par le serveur.  │
 * │ Avec la seule variable d'EAS, `eas build --profile production` demandait   │
 * │ une clé pour `com.ventefacile.app.dev` et livrait un binaire déclarant     │
 * │ `com.ventefacile.app` : un paquet signé de la mauvaise clé, que Google     │
 * │ Play refuse - et rien à l'écran ne l'annonce, la ligne fautive étant un    │
 * │ nom d'application juste.                                                   │
 * │                                                                            │
 * │ `VF_PROFILE` est déclaré dans l'`env` de chaque profil d'`eas.json`, que   │
 * │ le CLI charge AVANT d'évaluer ce fichier et que le serveur repose          │
 * │ ensuite : une seule valeur, lue au même endroit des deux côtés.            │
 * │ `EAS_BUILD_PROFILE` reste en second rang, pour qu'un profil auquel on      │
 * │ aurait oublié la variable ne retombe pas en développement.                 │
 * └────────────────────────────────────────────────────────────────────────────┘
 */
const profile = (process.env.VF_PROFILE ??
  process.env.EAS_BUILD_PROFILE ??
  "development") as Profile;

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
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ AUCUNE PERMISSION BLUETOOTH ÉCRITE À LA MAIN, ET C'EST VOULU.     │
    // │                                                                    │
    // │ Il y en avait cinq ici. Elles étaient REDONDANTES : les deux       │
    // │ bibliothèques les déclarent dans leur propre manifeste, avec les   │
    // │ nuances qui comptent - `BLUETOOTH` et `BLUETOOTH_ADMIN` plafonnés  │
    // │ à l'API 30, `BLUETOOTH_SCAN` portant `neverForLocation`. Et le     │
    // │ greffon de `react-native-ble-plx` réinjecte de toute façon les     │
    // │ trois premières par `withPermissions`.                             │
    // │                                                                    │
    // │ Surtout, elles étaient NUISIBLES. Expo écrit les entrées de ce     │
    // │ tableau SANS le moindre attribut, et les reconnaît sur le seul nom │
    // │ (`@expo/config-plugins`, `android/Permissions.js`). Or le greffon  │
    // │ BLE n'ajoute son `BLUETOOTH_SCAN` attribué QUE si aucune entrée de │
    // │ ce nom n'existe déjà (`plugin/build/withBLEAndroidManifest.js`).   │
    // │ Le `BLUETOOTH_SCAN` nu écrit ici supprimait donc                   │
    // │ `neverForLocation` - et sans ce drapeau, Android 12+ exige la      │
    // │ LOCALISATION pour chercher une imprimante.                         │
    // │                                                                    │
    // │ Le raisonnement d'origine sur l'API 30 contre l'API 31 reste juste │
    // │ et reste tenu : il l'est par les bibliothèques, pas par cette      │
    // │ liste. ⚠ À RECONTRÔLER dans le manifeste ENGENDRÉ après tout       │
    // │ `expo prebuild`, jamais depuis ce fichier.                         │
    // └────────────────────────────────────────────────────────────────────┘
  },

  plugins: [
    "expo-router",
    [
      // ┌──────────────────────────────────────────────────────────────────┐
      // │ `enforceContrast: false` N'EST PAS UNE COQUETTERIE.              │
      // │                                                                  │
      // │ Android pose un voile de contraste derrière la barre de          │
      // │ navigation, et tant qu'il est là `NavigationBar.setStyle` est    │
      // │ SANS EFFET - la documentation du module le dit en toutes         │
      // │ lettres. Sans ce drapeau, `ui/barres-systeme.tsx` serait inerte, │
      // │ et on le croirait branché.                                       │
      // │                                                                  │
      // │ Le voile n'était de toute façon pas ce qui protégeait le bas :   │
      // │ la place de la barre est RÉSERVÉE par la marge système, pas      │
      // │ masquée par un voile.                                            │
      // └──────────────────────────────────────────────────────────────────┘
      "expo-navigation-bar",
      { enforceContrast: false },
    ],
    [
      "expo-splash-screen",
      {
        // ┌────────────────────────────────────────────────────────────────┐
        // │ LE SPLASH ÉTAIT INVISIBLE EN THÈME CLAIR, À CHAQUE LANCEMENT. │
        // │                                                                │
        // │ `splash-icon.png` était l'asset du gabarit Expo : un dessin    │
        // │ BLANC (240,240,240), posé ici sur un fond `#FFFFFF`. Le thème  │
        // │ sombre le rendait, le thème clair non - et le thème clair est  │
        // │ le défaut. Rien ne pouvait le signaler : un PNG ne lève pas.   │
        // └────────────────────────────────────────────────────────────────┘
        //
        // ┌────────────────────────────────────────────────────────────────┐
        // │ LE FOND RESTE CLAIR EN THÈME SOMBRE, ET C'EST MESURÉ.         │
        // │                                                                │
        // │ Contre `#0f0f11`, le tourbillon orange du logo tient 5,4:1,    │
        // │ mais le bleu du mot « Vente » tombe à 1,6:1 et le contour du   │
        // │ téléphone à ~1:1. Un splash sombre n'afficherait donc que le   │
        // │ tourbillon : un logo amputé, qui se lit comme un défaut        │
        // │ d'affichage plutôt que comme une marque.                       │
        // │                                                                │
        // │ Contrepartie ASSUMÉE : un bref éclair clair le soir, avant que │
        // │ l'application ne peigne son fond sombre. On la paie plutôt que │
        // │ de montrer une marque coupée en deux.                          │
        // │                                                                │
        // │ La clé `dark` reste DÉCLARÉE plutôt que retirée, pour que le   │
        // │ prochain lecteur voie que le cas a été tranché et non oublié.  │
        // │ Le greffon accepte aussi `dark.image` : c'est la porte de      │
        // │ sortie le jour où une variante sombre du logo existera.        │
        // └────────────────────────────────────────────────────────────────┘
        backgroundColor: "#FFFFFF",
        dark: { backgroundColor: "#FFFFFF" },
        // Engendré depuis `logo.png` par `scripts/derive-brand-assets.mjs` :
        // l'encre seule, sans le rembourrage transparent du fichier source.
        // Sans ce recadrage, `imageWidth` piloterait un cadre dont le logo
        // n'occupe que la moitié, et le nombre ne voudrait plus rien dire.
        image: "./assets/images/logo-trim.png",
        imageWidth: 180,
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
        // ⚠ UNE IMPRIMANTE NE DÉRIVE AUCUNE POSITION. Le greffon vaut `false`
        // par défaut : il déclare alors `BLUETOOTH_SCAN` sans
        // `neverForLocation`, et la localisation SANS `maxSdkVersion`, si bien
        // qu'Android 12+ réclame une position pour imprimer un ticket. À vrai,
        // le drapeau est posé et la localisation redevient ce qu'elle est : une
        // exigence des seules versions antérieures à Android 12.
        neverForLocation: true,
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
   * `url` RESTE ABSENT, et c'est un choix : `eas init` a relié le projet (voir
   * `extra.eas.projectId` plus bas), mais `eas update:configure` n'a pas été
   * lancé. Sans URL le mécanisme est inerte - aucune mise à jour n'est
   * cherchée, et rien ne casse.
   *
   * ⚠ LE JOUR OÙ ON L'ARME, UN PIÈGE S'OUVRE. `eas update` ne pose pas
   * `EAS_BUILD_PROFILE` : ce fichier retomberait alors sur `development`, donc
   * un identifiant natif en `.dev` et une empreinte qui ne correspond à AUCUN
   * binaire installé, et `EXPO_PUBLIC_API_URL` serait absent - ce que
   * `src/api/config.ts` refuse désormais au démarrage. Une mise à jour publiée
   * sans son profil bloquerait les terminaux qui la reçoivent. À trancher AVANT
   * `eas update:configure`, pas après.
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

  /**
   * Compte propriétaire du projet EAS (`@nkayisi/vf-marchand`).
   *
   * Explicite plutôt que déduit du compte connecté : une compilation lancée
   * depuis une machine d'intégration, ou par quelqu'un d'autre, viserait sinon
   * un projet homonyme sous SON compte, et les numéros de version distants
   * repartiraient de zéro.
   */
  owner: "nkayisi",

  extra: {
    profile,
    /**
     * ⚠ POSÉ À LA MAIN, ET IL LE RESTERA. `eas init` ne sait pas écrire dans
     * une configuration dynamique : il imprime l'identifiant et s'arrête sur
     * « Cannot automatically write to dynamic config ». Le régénérer par un
     * second `eas init` créerait un SECOND projet plutôt que de retrouver
     * celui-ci.
     */
    eas: { projectId: "d3a6cfce-e612-450e-86ae-f29886206a39" },
  },
};

export default config;
