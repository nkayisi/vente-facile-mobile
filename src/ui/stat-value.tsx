/**
 * Valeur d'un relevé, écrite EN ENTIER.
 *
 * Doctrine reprise du back-office, mot pour mot : un montant s'écrit toujours
 * en entier, « 2 330 813,36 FC » et jamais « 2,33 M FC ». Les commerçants visés
 * ne pratiquent pas forcément l'écriture abrégée, et un chiffre qu'on ne sait
 * pas lire ne renseigne pas. **Quand la place manque, c'est la TAILLE DU TEXTE
 * qui cède, jamais le nombre de chiffres.**
 *
 * Les seuils sont ceux de `frontend/components/shared/StatValue.tsx`, et un
 * test les relit dans le fichier web pour qu'ils ne puissent pas diverger.
 *
 * Sur les trois paliers médians, le web déclare un repli responsive
 * (`text-base md:text-lg`). Le préfixe `md:` vise 768 points, jamais atteints
 * sur un téléphone : **à 390 points le web rend déjà la branche étroite.**
 * Reprendre cette branche seule n'est donc pas une approximation, c'est
 * exactement ce que le marchand voit sur son navigateur mobile.
 */
import { Text } from "./text";
import type { Palette } from "./tokens";

const PALIERS: { max: number; classe: string }[] = [
  { max: 10, classe: "text-2xl" },
  { max: 13, classe: "text-xl" },
  { max: 16, classe: "text-base" },
  { max: 20, classe: "text-sm" },
  { max: 26, classe: "text-xs" },
  { max: Number.POSITIVE_INFINITY, classe: "text-xs" },
];

/** Classe de taille pour une valeur donnée. Exportée pour les tests et `StatStrip`. */
export function statValueSize(valeur: string): string {
  return PALIERS.find((p) => valeur.length <= p.max)?.classe ?? "text-xs";
}

export function StatValue({
  value,
  tone = "foreground",
  className,
}: {
  value: string;
  tone?: keyof Palette;
  /**
   * N'y placez JAMAIS une classe de taille : la dernière classe l'emporte et
   * toute la réduction progressive serait annulée. Le web a payé ce défaut,
   * son commentaire le documente.
   */
  className?: string;
}) {
  return (
    <Text
      numeric
      numberOfLines={1}
      className={`font-sans-bold ${statValueSize(value)} ${TON[tone] ?? "text-foreground"}${
        className ? ` ${className}` : ""
      }`}
    >
      {value}
    </Text>
  );
}

/** NativeWind exige des classes littérales : une classe construite est inerte. */
const TON: Partial<Record<keyof Palette, string>> = {
  foreground: "text-foreground",
  mutedForeground: "text-muted-foreground",
  primary: "text-primary",
  destructive: "text-destructive",
  success: "text-success",
  warning: "text-warning",
  accentForeground: "text-accent-foreground",
};
