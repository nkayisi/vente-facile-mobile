/**
 * Les tests portent sur la LOGIQUE, pas sur le rendu : règles de session,
 * classification des échecs, politique d'essais du verrou, lecture des jetons.
 * C'est là que se trouvaient les défauts de l'ancienne application, et c'est ce
 * qu'un appareil ne peut pas vérifier tout seul.
 */
module.exports = {
  preset: "jest-expo",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
  testMatch: ["<rootDir>/src/**/*.test.ts", "<rootDir>/src/**/*.test.tsx"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    // lucide ne publie que de l'ESM `.mjs` sous la condition `react-native`, que
    // Metro sait charger mais que Jest refuse PAR L'EXTENSION, transformation
    // autorisee ou non. On pointe donc les tests sur la construction CJS du meme
    // paquet : meme source, meme tract, deux empaquetages.
    "^lucide-react-native/icons/(.*)$":
      "<rootDir>/node_modules/lucide-react-native/dist/cjs/icons/$1.js",
    "^lucide-react-native$":
      "<rootDir>/node_modules/lucide-react-native/dist/cjs/lucide-react-native.js",
  },
  // Le `/` final serait une faute : `expo(nent)?` doit pouvoir matcher le
  // PREFIXE de `expo-modules-core`, dont le nom continue par un tiret. Avec un
  // `/` exige, la negation echoue, le paquet n'est pas transforme, et jest
  // bute sur son ESM des le fichier de mise en place du preset.
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|nativewind|react-native-css-interop|@vente-facile/.*))",
  ],
};
