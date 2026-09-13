/**
 * Le choix du mode de vente, dans les mots du back-office.
 *
 * Trois tuiles empilées plutôt qu'un `Segmented` : « En gros et au détail »
 * fait vingt signes et ne tient pas dans un tiers de 390 points, et surtout la
 * différence entre les trois modes ne se lit pas dans leur seul titre - le
 * back-office porte un indice sous chacun, et il compte au moins autant.
 */
import { View } from "react-native";

import type { ModeVente } from "@/features/inventaire/actes";
import { Card, CardHeader, Icon, ListItem, Text } from "@/ui";

/** Titres et indices repris MOT POUR MOT du back-office. */
export const MODES_VENTE: { valeur: ModeVente; label: string; hint: string }[] = [
  { valeur: "retail_only", label: "Au détail", hint: "À la pièce uniquement" },
  { valeur: "wholesale_only", label: "En gros", hint: "Par contenant entier uniquement" },
  {
    valeur: "wholesale_and_retail",
    label: "En gros et au détail",
    hint: "Les deux, avec deux prix",
  },
];

export function TuilesModeVente({
  valeur,
  onChange,
}: {
  valeur: ModeVente;
  onChange: (v: ModeVente) => void;
}) {
  return (
    // ⚠ Le titre vit DANS cette carte, et non dans une carte au-dessus : deux
    // cartes dont la première ne porte qu'un intitulé se lisent comme une carte
    // vide suivie d'une liste orpheline. Relevé à l'écran.
    <Card className="p-0">
      <View className="px-4 pt-4">
        <CardHeader title="Vente et prix" />
        <Text variant="label" className="mb-1">
          Type de vente
        </Text>
      </View>
      {MODES_VENTE.map((m, i) => (
        <View key={m.valeur}>
          {i > 0 ? <View className="ml-4 h-px bg-border" /> : null}
          <ListItem
            title={m.label}
            subtitle={m.hint}
            onPress={() => onChange(m.valeur)}
            // La coche, jamais un chevron : l'appui TRANCHE, il ne mène nulle
            // part. C'est la règle déjà posée sur `ListeChoixMultiple`.
            trailing={
              m.valeur === valeur ? (
                <Icon name="Check" size={20} color="primary" />
              ) : undefined
            }
          />
        </View>
      ))}
    </Card>
  );
}
