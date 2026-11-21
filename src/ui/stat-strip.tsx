/**
 * Bandeau de relevés.
 *
 * Porté du back-office (`components/shared/StatStrip.tsx`), c'est le composant
 * dont la mise en page est la plus travaillée et la seule qui protège les
 * montants complets. Deux règles en viennent et ne doivent pas bouger :
 *
 * 1. **Le libellé est AU-DESSUS de la valeur, et l'icône monte dans la ligne du
 *    libellé.** Une icône posée à gauche de la valeur lui dispute la largeur ;
 *    c'était la première cause de montants rognés sur le web.
 * 2. **`warn` et `alert` ne colorent que si la valeur n'est pas « 0 ».** Un
 *    « 0 en rupture » en rouge crie pour rien, et à force on ne voit plus le
 *    vrai rouge.
 *
 * **Autant de colonnes que la largeur le permet, chacune assez large pour un
 * montant CDF écrit en entier.** Le web rend deux colonnes à 390 points et
 * monte à six en `2xl` : c'est la même règle, lue sur la largeur du VOLET et
 * non sur la fenêtre (`ui/grille.tsx`). Sur un téléphone, deux colonnes,
 * comme avant ; à 170 points de cellule, un montant en CDF garde son palier
 * de `statValueSize`.
 */
import type { ReactNode } from "react";
import { View } from "react-native";

import { Grille } from "./grille";
import { Icon, type IconName } from "./icon";
import { StatValue } from "./stat-value";
import { Text } from "./text";

/** La plus petite cellule qui écrit un total CDF à sept chiffres en entier. */
export const LARGEUR_MIN_RELEVE = 170;

export function StatStrip({ children }: { children: React.ReactNode }) {
  // Les filets sont le fond qui transparaît dans l'écart d'un point, jamais un
  // `divide-x` : celui-ci n'existe pas en React Native, et le motif exige
  // `overflow-hidden` sinon les coins arrondis laissent voir le fond.
  return (
    <Grille filets largeurMin={LARGEUR_MIN_RELEVE} min={2} max={6}>
      {children}
    </Grille>
  );
}

export type StatTone = "neutral" | "warn" | "alert" | "accent";

const TONS: Record<StatTone, { valeur: Parameters<typeof StatValue>[0]["tone"]; icone: "mutedForeground" | "warning" | "destructive" | "success" }> = {
  neutral: { valeur: "foreground", icone: "mutedForeground" },
  warn: { valeur: "warning", icone: "warning" },
  alert: { valeur: "destructive", icone: "destructive" },
  accent: { valeur: "foreground", icone: "success" },
};

export function StatStripItem({
  label,
  value,
  children,
  icon,
  tone = "neutral",
}: {
  label: string;
  /** Valeur simple. Omise quand `children` rend la valeur lui-même. */
  value?: string;
  /**
   * Contenu de la valeur, pour ce qu'une chaîne ne peut pas porter : un
   * `MultiCurrencyTotal` rend une LIGNE PAR DEVISE, et les aplatir en une
   * chaîne remettrait une somme inter-devises là où le composant existe
   * précisément pour l'empêcher.
   */
  children?: ReactNode;
  icon?: IconName;
  tone?: StatTone;
}) {
  // Un relevé à zéro reste neutre : voir la règle 2 ci-dessus. Avec `children`,
  // seul l'appelant sait si sa valeur est nulle - c'est lui qui passe `tone`
  // en conséquence.
  const actif =
    tone === "neutral" || tone === "accent" || value === undefined || value !== "0";
  const t = TONS[actif ? tone : "neutral"];

  return (
    <View className="min-w-0 flex-1 bg-card px-4 py-3.5">
      <View className="flex-row items-center gap-1.5">
        {icon ? <Icon name={icon} size={14} color={t.icone} /> : null}
        <Text variant="caption" numberOfLines={1} className="font-sans-medium">
          {label}
        </Text>
      </View>
      <View className="mt-1">
        {children ?? <StatValue value={value ?? "0"} tone={t.valeur} />}
      </View>
    </View>
  );
}
