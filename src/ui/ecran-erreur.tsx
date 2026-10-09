/**
 * L'écran qu'on voit quand un rendu lève, à la place d'un écran blanc.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ IL N'EXISTAIT AUCUN GARDE-FOU DE RENDU DANS TOUTE L'APPLICATION.        │
 * │                                                                          │
 * │ Ni `ErrorBoundary`, ni `componentDidCatch`, ni                           │
 * │ `getDerivedStateFromError` : toute exception de rendu démontait l'arbre   │
 * │ ENTIER et laissait un écran blanc, sans message, sans sortie, et sans    │
 * │ journal - Sentry étant inerte faute de DSN.                              │
 * │                                                                          │
 * │ Un marchand ne peut rien en dire : ni ce qu'il faisait, ni ce qui a      │
 * │ manqué. Il ferme et relance, et le défaut revient au même endroit.       │
 * │                                                                          │
 * │ Ce composant est posé à DEUX endroits, et il faut les deux :             │
 * │   - `app/_layout.tsx` par `export function ErrorBoundary`, pour un       │
 * │     plantage de FOURNISSEUR ou de montage ;                              │
 * │   - `app/(app)/_layout.tsx` par `unstable_settings.screenErrorBoundary`, │
 * │     qui installe un garde autour de CHAQUE écran enfant : un écran qui   │
 * │     lève n'emporte alors ni la barre d'onglets ni les fournisseurs.      │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ IL N'EMPLOIE NI LE THÈME NI `@/ui`, ET CE N'EST PAS UNE NÉGLIGENCE.
 *
 * Posé à la racine, il doit rendre alors même que `ThemeProvider` est ce qui a
 * levé : un `useTheme()` y relèverait aussitôt, et React remplacerait l'écran
 * blanc par un écran blanc. Les couleurs sont donc les deux valeurs de
 * `PALETTES` lues à la source, choisies sur le schéma du SYSTÈME, et le texte
 * passe par le `Text` de React Native. C'est la seule exception du dépôt à
 * « aucune couleur en dur », et le garde-fou de doctrine la nomme.
 */
import { Pressable, ScrollView, Text, View, useColorScheme } from "react-native";

import { PALETTES } from "./tokens";

/** La forme qu'expo-router passe à un `ErrorBoundary` de route. */
export interface EcranErreurProps {
  error: Error;
  retry: () => Promise<void>;
}

/**
 * Un message est une PHRASE, jamais une page.
 *
 * C'est la règle que `readableMessage` applique déjà aux réponses du serveur, et
 * elle vaut autant ici : une pile de rendu fait des milliers de signes, et
 * l'afficher en entier donne deux écrans de balises que personne ne lit - donc
 * le même résultat qu'un écran blanc, en plus long.
 */
function phrase(error: Error): string {
  const brut = (error?.message ?? "").trim();
  if (!brut) return "Le détail n'a pas été transmis.";
  const uneLigne = brut.replace(/\s+/g, " ");
  return uneLigne.length > 300 ? `${uneLigne.slice(0, 300)}…` : uneLigne;
}

export function EcranErreur({ error, retry }: EcranErreurProps) {
  // `useColorScheme` de React Native, et non notre `useTheme` : il ne dépend
  // d'aucun fournisseur, donc il répond même quand le nôtre a levé.
  const sombre = useColorScheme() === "dark";
  const c = sombre ? PALETTES.dark : PALETTES.light;

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: "center",
          padding: 24,
          gap: 16,
        }}
      >
        <Text style={{ color: c.foreground, fontSize: 20, fontWeight: "700" }}>
          {"Cet écran n'a pas pu s'afficher"}
        </Text>

        <Text style={{ color: c.mutedForeground, fontSize: 15, lineHeight: 22 }}>
          {"Vos données sont intactes : rien n'a été perdu, et ce qui attend son "}
          {"envoi partira à la prochaine synchronisation."}
        </Text>

        <View
          style={{
            backgroundColor: c.muted,
            borderColor: c.border,
            borderWidth: 1,
            borderRadius: 12,
            padding: 12,
          }}
        >
          <Text
            style={{ color: c.mutedForeground, fontSize: 13, lineHeight: 19 }}
            selectable
          >
            {phrase(error)}
          </Text>
        </View>

        {/*
          DEUX SORTIES, ET IL EN FAUT DEUX.

          `retry` remonte le même écran : il suffit quand la cause était
          passagère (une donnée en cours de chargement, une table qui vient
          d'être tirée). Il ne suffit PAS quand la cause est dans le code de
          l'écran, et c'est le cas le plus fréquent : le marchand resterait
          alors enfermé sur cet écran. D'où la seconde sortie, qui le ramène à
          l'accueil.
        */}
        <View style={{ gap: 12, marginTop: 8 }}>
          <Pressable
            accessibilityRole="button"
            onPress={() => void retry()}
            style={{
              backgroundColor: c.primary,
              borderRadius: 12,
              minHeight: 48,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: c.primaryForeground, fontSize: 16, fontWeight: "600" }}>
              Réessayer
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={() => {
              // L'import est PARESSEUX : `expo-router` au chargement de ce
              // module le ferait entrer dans la chaîne de démarrage, qu'un
              // écran d'erreur ne doit jamais alourdir.
              void (async () => {
                try {
                  const { router } = await import("expo-router");
                  router.replace("/");
                } catch {
                  // Si la navigation elle-même est cassée, « Réessayer » reste.
                }
              })();
            }}
            style={{
              borderColor: c.border,
              borderWidth: 1,
              borderRadius: 12,
              minHeight: 48,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: c.foreground, fontSize: 16, fontWeight: "600" }}>
              {"Revenir à l'accueil"}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}
