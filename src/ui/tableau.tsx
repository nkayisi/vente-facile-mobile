/**
 * Tableau à colonnes, défilant horizontalement.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE COMPOSANT CONTREDIT UNE RÈGLE DE CE DÉPÔT, ET C'EST DÉLIBÉRÉ.        │
 * │                                                                          │
 * │ `data-list.tsx` écrit en tête que « un tableau à colonnes est illisible  │
 * │ au pouce, et un défilement horizontal dans une page qui défile déjà      │
 * │ verticalement est un piège ». La règle reste vraie POUR LES LISTES du    │
 * │ terminal - ventes, clients, stock - qui gardent leur grammaire de        │
 * │ rangée à deux colonnes.                                                  │
 * │                                                                          │
 * │ Les RAPPORTS sont l'exception, sur décision explicite : ils doivent      │
 * │ montrer exactement ce que le back-office montre, colonne pour colonne,   │
 * │ parce qu'un marchand compare les deux écrans et qu'une colonne absente   │
 * │ se lit comme une donnée perdue. Un rapport est en outre un outil         │
 * │ d'analyse, pas un geste de comptoir : on l'ouvre assis, on prend le      │
 * │ temps de faire glisser.                                                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ IL NE VA PAS DANS UNE `DataList`.                                       │
 * │                                                                          │
 * │ `FlashList` mesure ses rangées pour les recycler ; un enfant plus large  │
 * │ que le viewport et porteur de son propre défilement lui donne des        │
 * │ hauteurs fausses, et le geste horizontal se dispute avec le vertical.    │
 * │ Les onglets à tableaux vivent donc dans `Screen scroll`. C'est sans      │
 * │ risque ici : les tableaux sont PAGINÉS PAR VINGT, il n'y a jamais assez  │
 * │ de rangées pour qu'une virtualisation serve à quelque chose.             │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * La description d'une colonne est proche de `ReportColumn` du serveur et de
 * `ColonneExport` du terminal : le même descripteur sert l'écran ET l'export,
 * ce qui interdit qu'ils divergent.
 */
import { useState } from "react";
import { ScrollView, View } from "react-native";

import { Divider } from "./divider";
import { Text } from "./text";

export interface ColonneTableau<T> {
  cle: string;
  entete: string;
  /** Largeur en points. Fixe : une colonne qui se redimensionne fait sauter
   *  l'alignement de l'en-tête d'une rangée à l'autre. */
  largeur: number;
  /**
   * Une MESURE se range à droite, en chasse fixe, comme les nombres.
   *
   * Une quantité écrite en mots (« 13 BOITES + 14 AMPOULES ») en est une : le
   * lecteur y compare des grandeurs. C'est `KIND_MEASURE` du serveur, et la
   * même raison - le bloc chiffré du tableau n'a alors qu'un seul bord.
   */
  mesure?: boolean;
  /** La valeur affichée. */
  valeur: (ligne: T) => string;
  /** Sous-ligne facultative, en sourdine : « 1 612 au total ». */
  sousValeur?: (ligne: T) => string | null;
  /** Rendu libre, pour un badge de statut ou une pastille de rang. */
  rendu?: (ligne: T, index: number) => React.ReactNode;
}

export function Tableau<T>({
  colonnes,
  lignes,
  cle,
  vide = "Aucune donnée pour cette période",
}: {
  colonnes: ColonneTableau<T>[];
  lignes: T[];
  cle: (ligne: T, index: number) => string;
  vide?: string;
}) {
  const [largeurVue, setLargeurVue] = useState(0);
  const largeurTotale = colonnes.reduce((s, c) => s + c.largeur, 0);
  // On ne le DIT que si ça déborde vraiment : une invite à faire glisser sur
  // un tableau qui tient en entier apprend au lecteur à ignorer l'invite.
  const deborde = largeurVue > 0 && largeurTotale > largeurVue + 8;

  if (lignes.length === 0) {
    return (
      <View className="items-center bg-card px-4 py-8">
        <Text variant="bodySmall">{vide}</Text>
      </View>
    );
  }

  return (
    <View onLayout={(e) => setLargeurVue(e.nativeEvent.layout.width)}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator
        // Le rembourrage vit dans le CONTENU, jamais sur la vue : posé sur la
        // vue, il rognerait la dernière colonne au lieu de la laisser défiler.
        contentContainerStyle={{ paddingHorizontal: 16 }}
      >
        <View style={{ width: largeurTotale }}>
          {/* L'en-tête SUIT SA COLONNE : un libellé collé à gauche au-dessus
              de montants collés à droite oblige à relire l'en-tête pour savoir
              lequel coiffe quoi. Défaut déjà corrigé sur les exports serveur. */}
          <View className="flex-row border-b border-border pb-2">
            {colonnes.map((c) => (
              <View key={c.cle} style={{ width: c.largeur }} className="pr-3">
                <Text
                  variant="caption"
                  numberOfLines={1}
                  className={`font-sans-medium ${c.mesure ? "text-right" : ""}`}
                >
                  {c.entete}
                </Text>
              </View>
            ))}
          </View>

          {lignes.map((l, i) => (
            <View key={cle(l, i)}>
              {i > 0 ? <Divider /> : null}
              <View className="flex-row py-2.5">
                {colonnes.map((c) => (
                  <View key={c.cle} style={{ width: c.largeur }} className="pr-3">
                    {c.rendu ? (
                      <View className={c.mesure ? "items-end" : "items-start"}>
                        {c.rendu(l, i)}
                      </View>
                    ) : (
                      <>
                        <Text
                          variant="bodySmall"
                          numeric={c.mesure}
                          numberOfLines={2}
                          className={c.mesure ? "text-right" : ""}
                        >
                          {c.valeur(l)}
                        </Text>
                        {c.sousValeur?.(l) ? (
                          <Text
                            variant="caption"
                            numeric={c.mesure}
                            numberOfLines={1}
                            className={c.mesure ? "text-right" : ""}
                          >
                            {c.sousValeur(l)}
                          </Text>
                        ) : null}
                      </>
                    )}
                  </View>
                ))}
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      {deborde ? (
        <View className="px-4 pt-2">
          <Text variant="caption">
            {`Faites glisser le tableau pour voir ses ${colonnes.length} colonnes.`}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/**
 * Pastille de rang (« 1 », « 2 »…), comme les palmarès du back-office.
 *
 * Elle vit ici et non dans l'écran : trois tableaux la portent, et trois
 * copies d'un rond de vingt-quatre points finiraient par ne plus se
 * ressembler.
 */
export function Rang({ n }: { n: number }) {
  return (
    <View className="h-6 w-6 items-center justify-center rounded-full bg-accent">
      <Text variant="caption" className="font-sans-medium text-accent-foreground">
        {String(n)}
      </Text>
    </View>
  );
}
