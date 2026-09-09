/**
 * Barre de progression.
 *
 * Miroir de `components/ui/progress.tsx`. Sert la synchronisation progressive
 * (« Produits : 4 200 / 18 000 ») et l'avancement d'un comptage d'inventaire.
 */
import { View } from "react-native";

export function ProgressBar({
  valeur,
  max = 100,
  tone = "primary",
}: {
  valeur: number;
  max?: number;
  tone?: "primary" | "success" | "warning" | "destructive";
}) {
  const pct = max <= 0 ? 0 : Math.max(0, Math.min(100, (valeur / max) * 100));
  const remplissage = {
    primary: "bg-primary",
    success: "bg-success",
    warning: "bg-warning",
    destructive: "bg-destructive",
  }[tone];

  return (
    <View
      className="h-2 overflow-hidden rounded-full bg-muted"
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max, now: valeur }}
    >
      <View className={`h-full rounded-full ${remplissage}`} style={{ width: `${pct}%` }} />
    </View>
  );
}

/**
 * Barre EMPILÉE : plusieurs parts d'un même tout, sur une seule ligne.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CINQ BARRES CÔTE À CÔTE NE DISENT PAS CE QU'UNE BARRE EMPILÉE DIT.      │
 * │                                                                          │
 * │ Une balance âgée se lisait ici en cinq barres indépendantes, chacune     │
 * │ rapportée au total. On y voyait la taille de chaque tranche, jamais la   │
 * │ forme de l'ensemble - or c'est la FORME qui renseigne : une dette saine  │
 * │ est massive à gauche et s'éteint à droite, une dette qui pourrit fait    │
 * │ l'inverse. Empilée, la bascule se voit sans lire un seul chiffre, ce qui │
 * │ est tout ce qu'on demande à un graphique sur un téléphone.               │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UNE PART NON NULLE GARDE UNE LARGEUR VISIBLE.                           │
 * │                                                                          │
 * │ Vingt-trois francs sur dix mille font deux dixièmes de pour cent, soit   │
 * │ moins d'un demi-pixel : la tranche disparaît, et son absence se lit      │
 * │ « rien à plus de quatre-vingt-dix jours » - le contraire de la vérité,   │
 * │ sur la tranche la plus grave. Même règle que le `BarChart`, où une       │
 * │ valeur nulle garde un filet : ce qui existe se voit.                     │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function BarreEmpilee({
  parts,
  hauteur = 10,
}: {
  /** Dans l'ordre d'empilement, de gauche à droite. */
  parts: { cle: string; valeur: number; classe: string }[];
  hauteur?: number;
}) {
  const total = parts.reduce((s, p) => s + Math.max(0, p.valeur), 0);
  const visibles = parts.filter((p) => p.valeur > 0);

  if (total <= 0 || visibles.length === 0) {
    // Un tout à zéro n'est pas une donnée manquante : le rail vide le dit.
    return <View className="rounded-full bg-muted" style={{ height: hauteur }} />;
  }

  const PLANCHER = 3; // pour cent : en deçà, une part ne se voit plus.
  const brut = visibles.map((p) => (p.valeur / total) * 100);
  const majorees = brut.map((p) => Math.max(p, PLANCHER));
  // On renormalise, sinon la somme des parts majorées déborde la barre et la
  // dernière tranche sort du cadre - c'est-à-dire disparaît, ce que le
  // plancher existe précisément pour empêcher.
  const somme = majorees.reduce((s, p) => s + p, 0);

  return (
    <View
      className="flex-row overflow-hidden rounded-full bg-muted"
      style={{ height: hauteur }}
      accessibilityRole="image"
    >
      {visibles.map((p, i) => (
        <View
          key={p.cle}
          className={p.classe}
          style={{ width: `${(majorees[i] / somme) * 100}%` }}
        />
      ))}
    </View>
  );
}
