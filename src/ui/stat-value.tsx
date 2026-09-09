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

/**
 * Mesure d'une RANGÉE de liste. Même doctrine que `StatValue`, autre échelle.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN CADRAN ET UNE RANGÉE N'ONT PAS LE MÊME SUJET.                        │
 * │                                                                          │
 * │ Dans une cellule de `StatStrip`, le NOMBRE est le contenu : il porte      │
 * │ toute la cellule, et `text-2xl` gras est sa juste place. Dans une         │
 * │ rangée, le contenu est l'IDENTITÉ - la référence de la vente, le nom du   │
 * │ produit - et le montant en est la mesure. Employer l'échelle du cadran    │
 * │ y écrit « 84 $ » à vingt-quatre points en gras à côté d'une référence à   │
 * │ quatorze : le montant crie, la référence disparaît, et une liste de       │
 * │ vingt lignes devient une colonne de chiffres qu'on ne peut plus relier    │
 * │ à rien.                                                                   │
 * │                                                                          │
 * │ C'était le cas sur SIX écrans-listes, `StatValue` ayant été repris tel    │
 * │ quel là où il n'était pas chez lui.                                       │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * **La règle qui ne change pas : quand la place manque, c'est la TAILLE qui
 * cède, jamais le nombre de chiffres.** Un montant en CDF à sept chiffres tient
 * quinze caractères, et le tronquer en ferait un faux montant - c'est la règle
 * du ticket imprimé, et `DataRow` la porte déjà en laissant l'identité se
 * tronquer plutôt que la mesure. L'échelle est simplement celle d'une rangée :
 * elle part du corps de texte et non d'un titre.
 */
const PALIERS_MESURE: { max: number; classe: string }[] = [
  { max: 12, classe: "text-base" },
  { max: 16, classe: "text-sm" },
  { max: Number.POSITIVE_INFINITY, classe: "text-xs" },
];

/** Classe de taille d'une mesure de rangée. Exportée pour les tests. */
export function mesureSize(valeur: string): string {
  return PALIERS_MESURE.find((p) => valeur.length <= p.max)?.classe ?? "text-xs";
}

export function Mesure({
  value,
  tone = "foreground",
  className,
}: {
  value: string;
  tone?: keyof Palette;
  /** Jamais une classe de TAILLE : elle annulerait la réduction progressive. */
  className?: string;
}) {
  return (
    <Text
      numeric
      numberOfLines={1}
      // `font-sans-medium` et non `bold` : dans une rangée, c'est la référence
      // qui porte déjà une graisse. Deux gras côte à côte n'en font ressortir
      // aucun.
      className={`font-sans-medium ${mesureSize(value)} ${TON[tone] ?? "text-foreground"}${
        className ? ` ${className}` : ""
      }`}
    >
      {value}
    </Text>
  );
}
