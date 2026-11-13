/**
 * Les fonds d'ouverture d'une caisse, UN CHAMP PAR DEVISE (lot L13).
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE TIROIR CONTIENT PLUSIEURS LIASSES, ET L'ÉCRAN N'EN DEMANDAIT QU'UNE. │
 * │                                                                          │
 * │ Le serveur tient le fonds devise par devise depuis toujours            │
 * │ (`RegisterSessionCurrencyBalance`) ; le terminal ne pouvait saisir que   │
 * │ la principale, et ne pouvait même pas LIRE le fonds hérité d'une devise  │
 * │ secondaire, la table n'étant pas tirée. Le caissier qui ouvrait avec     │
 * │ 20 $ et 50 000 FC n'avait aucun moyen de dire les 20 $.                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Partagé par les DEUX formulaires d'ouverture - le parc de caisses et le
 * comptoir. Deux formulaires pour le même acte doivent lire la saisie de la
 * même façon : c'est `lireFonds` qui la lit, ce composant ne fait que la
 * recueillir.
 *
 * ⚠ Un champ VIDE hérite de la dernière clôture pour SA devise, et l'aide le
 *   dit en donnant le chiffre quand on le connaît.
 */
import { View } from "react-native";

import type { MoneyHelpers } from "@vente-facile/core";

import type { DeviseDuFonds } from "@/features/caisse/fond";
import { FormField, Input, Text } from "@/ui";

export function ChampsFonds({
  devises,
  valeurs,
  erreurs,
  onChange,
  herite,
  money,
  autoFocus = false,
}: {
  /** La principale d'abord ; voir `devisesDuFonds`. */
  devises: DeviseDuFonds[];
  valeurs: Record<string, string>;
  erreurs: Record<string, string>;
  onChange: (devise: string, valeur: string) => void;
  /** Ce que la dernière clôture a compté, par devise ; `null` : non compté. */
  herite?: Map<string, number | null>;
  money: MoneyHelpers;
  autoFocus?: boolean;
}) {
  return (
    <View className="gap-4">
      {devises.map((d, i) => {
        const laisse = herite?.get(d.code);
        const hint =
          laisse != null
            ? `La dernière clôture a laissé ${money.money(laisse, d.code)}. Laissez vide pour le reprendre, ou écrivez 0 si cette liasse est vide.`
            : d.principale
              ? "Ce qui est déjà dans le tiroir. Laissez vide pour reprendre la dernière clôture, ou écrivez 0 si le tiroir est vide."
              : "Laissez vide pour reprendre la dernière clôture dans cette devise.";
        return (
          <FormField
            key={d.code}
            // La DEVISE est nommée : sans elle, « 50 000 » tapé pour des francs
            // ouvrait un tiroir de cinquante mille dollars.
            label={`Fond de caisse (${d.code})`}
            error={erreurs[d.code]}
            hint={hint}
          >
            <Input
              value={valeurs[d.code] ?? ""}
              onChangeText={(v) => onChange(d.code, v)}
              invalid={Boolean(erreurs[d.code])}
              keyboardType="decimal-pad"
              placeholder="0"
              autoFocus={autoFocus && i === 0}
              leading={
                <Text variant="caption" className="font-sans-medium">
                  {money.symbolOf(d.code)}
                </Text>
              }
              accessibilityLabel={`Fond de caisse en ${d.code}`}
            />
          </FormField>
        );
      })}
    </View>
  );
}
