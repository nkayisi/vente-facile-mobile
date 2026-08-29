/**
 * Interrupteur.
 *
 * On enveloppe celui de React Native au lieu de le redessiner : c'est le seul
 * contrôle dont le rendu natif vaut mieux que tout ce qu'on écrirait, et son
 * état pressé est géré par le système.
 *
 * `trackColor` et `thumbColor` n'acceptent que des couleurs brutes : c'est un
 * cas légitime d'usage de `useColor`, au même titre que la `StatusBar`.
 */
import { Switch as RNSwitch, View } from "react-native";

import { Text } from "./text";
import { useColor } from "./theme";

export function Switch({
  valeur,
  onChange,
  desactive = false,
  label,
  aide,
}: {
  valeur: boolean;
  onChange: (v: boolean) => void;
  desactive?: boolean;
  /** Rendu à gauche de l'interrupteur, comme sur le web. */
  label?: string;
  aide?: string;
}) {
  const primary = useColor("primary");
  const secondary = useColor("secondary");
  const card = useColor("card");

  const interrupteur = (
    <RNSwitch
      value={valeur}
      onValueChange={onChange}
      disabled={desactive}
      trackColor={{ false: secondary, true: primary }}
      thumbColor={card}
    />
  );

  if (!label) return interrupteur;

  return (
    <View className={`flex-row items-center justify-between gap-4${desactive ? " opacity-50" : ""}`}>
      <View className="min-w-0 flex-1">
        <Text variant="label">{label}</Text>
        {aide ? <Text variant="caption">{aide}</Text> : null}
      </View>
      {interrupteur}
    </View>
  );
}
