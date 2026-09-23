/**
 * Case a cocher.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UNE CASE N'EST PAS UN INTERRUPTEUR, ET LES DEUX NE DISENT PAS PAREIL.    │
 * │                                                                          │
 * │ `Switch` annonce un reglage qui s'applique A L'INSTANT ou on le bascule  │
 * │ - le theme, une preference. Une case annonce une option qu'on coche      │
 * │ AVANT de valider, et qui ne vaut rien tant qu'on n'a pas valide. Les     │
 * │ confondre fait croire qu'une deduction de points est deja prise en       │
 * │ compte alors que la vente n'est pas encore enregistree.                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ LA CASE EST DESSINEE, elle n'est pas empruntee a une icone : le registre
 * de glyphes est ENGENDRE depuis lucide et ne porte ni `Square` ni
 * `CheckSquare`. Y ajouter deux glyphes pour un rectangle serait payer un
 * telechargement de police pour un trait.
 *
 * ⚠ `rounded-sm`, JAMAIS `rounded` : six pixels sur vingt, soit trente pour
 * cent, se lit comme un bouton RADIO - donc « choisissez-en un » - quand la
 * case dit « cochez si vous voulez ».
 */
import { View } from "react-native";

import { Icon } from "./icon";
import { Pressable } from "./pressable";
import { Text } from "./text";

/** Le carre seul, sans cible tactile : pour une rangee qui porte deja la sienne. */
export function CaseACocher({
  coche,
  disabled = false,
}: {
  coche: boolean;
  disabled?: boolean;
}) {
  return (
    <View
      className={`h-5 w-5 items-center justify-center rounded-sm border ${
        coche ? "border-primary bg-primary" : "border-input"
      } ${disabled ? "opacity-60" : ""}`}
    >
      {coche ? <Icon name="Check" size={14} color="primaryForeground" /> : null}
    </View>
  );
}

/**
 * La case et son libelle, sur une rangee qui se touche en entier.
 *
 * Le libelle EST la cible : viser un carre de vingt points au pouce est un
 * geste rate une fois sur trois, et la rangee monte donc a la hauteur minimale
 * du produit.
 */
export function Checkbox({
  coche,
  onBasculer,
  label,
  disabled = false,
  accessibilityHint,
}: {
  coche: boolean;
  onBasculer: () => void;
  label: string;
  disabled?: boolean;
  accessibilityHint?: string;
}) {
  return (
    <Pressable
      onPress={disabled ? undefined : onBasculer}
      disabled={disabled}
      haptic="selection"
      accessibilityRole="checkbox"
      accessibilityState={{ checked: coche, disabled }}
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      className={`min-h-11 flex-row items-center gap-2.5 ${disabled ? "opacity-60" : ""}`}
    >
      <CaseACocher coche={coche} disabled={disabled} />
      <Text variant="label" className="min-w-0 flex-1">
        {label}
      </Text>
    </Pressable>
  );
}
