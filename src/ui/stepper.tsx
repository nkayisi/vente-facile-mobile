/**
 * Fil d'étapes de l'assistant d'inscription.
 *
 * Miroir du stepper web : deux pastilles rondes numérotées, un connecteur, et
 * les libellés sous elles. L'étape franchie porte une coche à la place de son
 * numéro - c'est ce qui distingue « fait » de « en cours ».
 */
import { View } from "react-native";

import { Icon } from "./icon";
import { Text } from "./text";

export function Stepper({
  etapes,
  courante,
}: {
  etapes: string[];
  /** Index de l'étape en cours, à partir de 0. */
  courante: number;
}) {
  return (
    <View className="items-center">
      <View className="flex-row items-center">
        {etapes.map((_, i) => {
          const atteinte = i <= courante;
          const franchie = i < courante;
          return (
            <View key={i} className="flex-row items-center">
              {i > 0 ? (
                <View
                  className={`h-1 w-16 ${franchie || atteinte ? "bg-primary" : "bg-secondary"}`}
                />
              ) : null}
              <View
                className={`h-10 w-10 items-center justify-center rounded-full ${
                  atteinte ? "bg-primary" : "bg-secondary"
                }`}
                accessibilityRole="text"
                accessibilityLabel={`Étape ${i + 1} sur ${etapes.length}`}
              >
                {franchie ? (
                  <Icon name="Check" size={20} color="primaryForeground" />
                ) : (
                  <Text
                    className={
                      atteinte
                        ? "font-sans-semibold text-primary-foreground"
                        : "font-sans-semibold text-secondary-foreground"
                    }
                  >
                    {String(i + 1)}
                  </Text>
                )}
              </View>
            </View>
          );
        })}
      </View>
      <View className="mt-2 flex-row items-center gap-6">
        {etapes.map((e, i) => (
          <Text
            key={e}
            variant="caption"
            className={i === courante ? "font-sans-medium text-accent-foreground" : undefined}
          >
            {e}
          </Text>
        ))}
      </View>
    </View>
  );
}
