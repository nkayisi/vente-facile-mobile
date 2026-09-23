/**
 * Un montant et sa devise, dans un seul champ.
 *
 * Miroir de `CurrencyAmountInput` du back-office : la devise vit DANS le
 * champ, à droite, et non dans un `FormField` séparé. Deux commandes qui
 * portent la même valeur doivent se toucher.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CHANGER DE DEVISE CONVERTIT LE MONTANT, IL NE L'EFFACE PAS.             │
 * │                                                                          │
 * │ « Changer de devise ne doit pas changer la valeur voulue par le          │
 * │ marchand » - le commentaire du back-office dit tout. La règle vit dans   │
 * │ `features/caisse/montant-devise.ts`, qui est PUR et testé : un écran ne  │
 * │ fait pas d'arithmétique de conversion.                                   │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import { View } from "react-native";

import {
  convertirSaisie,
  montrerConversion,
  type Conversion,
} from "@/features/caisse/montant-devise";

import { Chip, ChipRow } from "./chip";
import { FormField, Input } from "./input";
import { Text } from "./text";

export interface DeviseChoisissable {
  code: string;
  symbole: string;
}

export function ChampMontant({
  label = "Montant",
  valeur,
  onChangeValeur,
  devise,
  onChangeDevise,
  devises,
  conversion,
  principale,
  /** Le repère « = 46 000 FC · 1 USD = 2 300 FC », déjà composé par l'appelant. */
  repere,
  erreur,
  autoFocus,
  requis = true,
}: {
  label?: string;
  valeur: string;
  onChangeValeur: (v: string) => void;
  devise: string;
  onChangeDevise: (code: string, montantConverti: string) => void;
  devises: DeviseChoisissable[];
  conversion: Conversion;
  principale: string;
  repere?: string;
  erreur?: string;
  autoFocus?: boolean;
  /**
   * L'etoile du `FormField`.
   *
   * A `false` pour un ACOMPTE, qui est facultatif par definition : une etoile
   * sur un champ qu'on a le droit de laisser vide fait chercher ce qui manque.
   */
  requis?: boolean;
}) {
  const symbole = devises.find((d) => d.code === devise)?.symbole ?? devise;
  const multi = devises.length > 1;
  const afficheRepere = Boolean(repere) &&
    montrerConversion(valeur, devise, principale, devises.length);

  return (
    <FormField
      // L'étoile est portée par l'appelant via `required` du `FormField` ;
      // le back-office la code en dur DANS son composant, ce qui l'oblige à
      // écrire `label="Montant"` pour obtenir « Montant * ». On ne recopie pas
      // ce détour.
      label={`${label} (${devise})`}
      required={requis}
      error={erreur}
      hint={afficheRepere ? repere : undefined}
    >
      <View className="gap-2">
        <Input
          value={valeur}
          onChangeText={onChangeValeur}
          keyboardType="decimal-pad"
          placeholder="0"
          autoFocus={autoFocus}
          // Le symbole DANS le champ, comme le back-office quand
          // l'établissement est mono-devise.
          leading={<Text variant="bodySmall" className="text-muted-foreground">{symbole}</Text>}
        />
        {/* Un choix unique n'est pas un choix : sur un établissement
            mono-devise, la rangée n'aurait qu'une seule réponse possible. */}
        {multi ? (
          <ChipRow>
            {devises.map((d) => (
              <Chip
                key={d.code}
                label={d.code}
                actif={devise === d.code}
                onPress={() =>
                  onChangeDevise(
                    d.code,
                    convertirSaisie(valeur, devise, d.code, conversion)
                  )
                }
              />
            ))}
          </ChipRow>
        ) : null}
      </View>
    </FormField>
  );
}
