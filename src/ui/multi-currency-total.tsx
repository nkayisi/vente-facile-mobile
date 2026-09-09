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
import { getDefaultCurrency } from "@vente-facile/core";

import { Mesure, StatValue } from "./stat-value";
import { Text } from "./text";
import type { Palette } from "./tokens";

export function MultiCurrencyTotal({
  lignes,
  money,
  tone = "foreground",
  vide,
  taille = "releve",
}: {
  lignes: { devise: string; montant: number }[];
  /** `money.money` de `@vente-facile/core` : la devise est OBLIGATOIRE.
   *  C'est ce qui rend impossible d'ecrire un montant sans dire dans quoi. */
  money: (montant: number | string, devise: string) => string;
  tone?: keyof Palette;
  /**
   * Ce qui s'écrit quand il n'y a rien.
   *
   * ┌────────────────────────────────────────────────────────────────────┐
   * │ PAR DÉFAUT, RIEN VAUT ZÉRO - ET ZÉRO EST UN MONTANT.              │
   * │                                                                    │
   * │ Les relevés écrivaient des PHRASES : « Aucune vente », « Tout est  │
   * │ réglé », « Rien en retard ». Un cadran se lit d'un coup d'oeil, en │
   * │ balayant une colonne de chiffres ; une phrase à la place d'un      │
   * │ montant casse ce balayage, et deux cellules voisines ne se         │
   * │ comparent plus. Elle occupe en outre la largeur d'un long montant  │
   * │ et fait tomber la valeur d'un palier de `statValueSize` dès qu'il  │
   * │ y en a un.                                                         │
   * │                                                                    │
   * │ Le défaut est donc « 0 $ », ou « 0 FC », dans la devise de         │
   * │ l'établissement. Sept écrans l'écrivaient déjà à la main           │
   * │ (`formatPrice(0)`, `money.money(0, money.primaryCode)`) et quatre  │
   * │ non : le rendre par défaut supprime la divergence plutôt que de la │
   * │ corriger site par site.                                            │
   * └────────────────────────────────────────────────────────────────────┘
   *
   * À ne renseigner QUE lorsque l'absence ne veut pas dire zéro. Le
   * sous-total d'une journée dont toutes les ventes ont un montant INCONNU
   * en est le seul cas : y écrire « 0 $ » affirmerait une recette nulle là
   * où l'on ignore la recette.
   */
  vide?: string;
  /**
   * L'échelle du contexte.
   *
   * `releve` pour une cellule de cadran, où le nombre EST le contenu.
   * `mesure` pour une rangée ou un en-tête de section, où il accompagne une
   * identité qui doit rester lisible à côté. Voir `Mesure`.
   */
  taille?: "releve" | "mesure";
}) {
  const Valeur = taille === "mesure" ? Mesure : StatValue;
  if (lignes.length === 0) {
    // La devise de l'établissement, posée au démarrage par `useDeviseParDefaut`.
    // On la lit du noyau plutôt que d'ajouter une dépendance de `ui/` vers
    // `data/` : c'est la même source, celle que `devisePrincipale()` consulte.
    const zero = money(0, getDefaultCurrency().code || "CDF");
    return <Valeur value={vide ?? zero} tone={tone} />;
  }
  if (lignes.length === 1) {
    return <Valeur value={money(lignes[0].montant, lignes[0].devise)} tone={tone} />;
  }
  return (
    <View className="gap-0.5">
      {lignes.map((l) => (
        <Valeur key={l.devise} value={money(l.montant, l.devise)} tone={tone} />
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
