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
 * **Deux colonnes, jamais plus.** Le web monte à six en `2xl`, mais à 390
 * points il rend lui aussi deux colonnes : c'est donc la parité exacte. À trois
 * colonnes il resterait une centaine de points par cellule, et tout montant en
 * CDF tomberait au plus petit palier de `statValueSize`.
 */
import type { ReactNode } from "react";
import { View } from "react-native";

import { Icon, type IconName } from "./icon";
import { StatValue } from "./stat-value";
import { Text } from "./text";

export function StatStrip({ children }: { children: React.ReactNode }) {
  // Les filets sont le fond qui transparaît dans le `gap-px`, jamais un
  // `divide-x` : celui-ci n'existe pas en React Native, et le motif exige
  // `overflow-hidden` sinon les coins arrondis laissent voir le fond.
  return (
    <View className="flex-row flex-wrap gap-px overflow-hidden rounded-xl border border-border bg-border">
      {children}
    </View>
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
    <View className="min-w-0 flex-1 basis-[45%] bg-card px-4 py-3.5">
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
