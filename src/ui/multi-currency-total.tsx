/**
 * Total ventilé PAR DEVISE.
 *
 * Porté du back-office, dont le commentaire dit l'essentiel : **ne jamais faire
 * un `reduce` sur un montant sans regarder sa devise.** Additionner des dollars
 * et des francs congolais donne un nombre qui n'existe pas, et qui a l'air
 * juste.
 *
 * Une seule devise se rend exactement comme un total simple : le composant ne
 * coûte donc rien à employer par précaution, et c'est précisément ce qu'on
 * attend de lui.
 */
import { View } from "react-native";

import { StatValue } from "./stat-value";
import { Text } from "./text";
import type { Palette } from "./tokens";

export function MultiCurrencyTotal({
  lignes,
  money,
  tone = "foreground",
  vide = "0",
}: {
  lignes: { devise: string; montant: number }[];
  /** `money.money` de `@vente-facile/core` : la devise est OBLIGATOIRE.
   *  C'est ce qui rend impossible d'ecrire un montant sans dire dans quoi. */
  money: (montant: number | string, devise: string) => string;
  tone?: keyof Palette;
  /** Ce qui s'écrit quand il n'y a rien. Jamais une chaîne vide. */
  vide?: string;
}) {
  if (lignes.length === 0) return <StatValue value={vide} tone={tone} />;
  if (lignes.length === 1) {
    return <StatValue value={money(lignes[0].montant, lignes[0].devise)} tone={tone} />;
  }
  return (
    <View className="gap-0.5">
      {lignes.map((l) => (
        <StatValue key={l.devise} value={money(l.montant, l.devise)} tone={tone} />
      ))}
    </View>
  );
}

/** Carte de relevé du hub Ventes : pastille à gauche, valeur puis libellé à droite. */
export function CarteReleve({
  children,
  label,
  icone,
}: {
  children: React.ReactNode;
  label: string;
  icone: React.ReactNode;
}) {
  return (
    <View className="min-w-0 flex-1 basis-[45%] flex-row items-center gap-3 rounded-xl border border-border bg-card p-4">
      {icone}
      <View className="min-w-0 flex-1">
        {children}
        <Text variant="caption" numberOfLines={1}>
          {label}
        </Text>
      </View>
    </View>
  );
}
