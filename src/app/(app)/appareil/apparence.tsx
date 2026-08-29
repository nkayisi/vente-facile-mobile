/**
 * Apparence : clair, sombre, ou celui du système.
 *
 * Ajout mobile sans miroir : le back-office a une palette sombre complète mais
 * AUCUN sélecteur, et son habillage est codé en clair. C'est l'erreur à ne pas
 * reproduire sur un terminal utilisé en soirée.
 *
 * De notre côté c'était déjà un défaut et non une divergence : `ThemeProvider`
 * accepte la préférence, la table `local_settings` l'attend, et personne ne la
 * passait. Cet écran ferme la boucle.
 */
import { View } from "react-native";

import { AppBar, Card, Divider, Icon, ListItem, Screen, Section, Text } from "@/ui";
import { useTheme, type ThemePreference } from "@/ui/theme";

const CHOIX: { valeur: ThemePreference; titre: string; aide: string }[] = [
  { valeur: "system", titre: "Automatique", aide: "Suit le réglage du téléphone" },
  { valeur: "light", titre: "Clair", aide: "Toujours clair" },
  { valeur: "dark", titre: "Sombre", aide: "Toujours sombre" },
];

export default function Apparence() {
  const { preference, setPreference, scheme } = useTheme();

  return (
    <Screen edges={["top"]} padded={false}>
      <AppBar title="Apparence" />
      <View className="p-4">
        <Section title="Thème">
          <Card className="overflow-hidden p-0">
            {CHOIX.map((c, i) => (
              <View key={c.valeur}>
                {i > 0 ? <Divider inset /> : null}
                <ListItem
                  title={c.titre}
                  subtitle={c.aide}
                  onPress={() => setPreference(c.valeur)}
                  trailing={
                    preference === c.valeur ? (
                      <Icon name="CheckCircle2" size={20} color="primary" />
                    ) : undefined
                  }
                />
              </View>
            ))}
          </Card>
        </Section>
        <Text variant="caption" className="mt-3">
          {`Thème appliqué : ${scheme === "dark" ? "sombre" : "clair"}.`}
        </Text>
      </View>
    </Screen>
  );
}
