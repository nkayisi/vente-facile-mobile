/**
 * Saisir une quantité DANS LA FORME OÙ LE MARCHAND LA MANIPULE.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ DEUX CANAUX, DEUX CASES, ET LE RAPPEL DU FACTEUR ENTRE LES DEUX.        │
 * │                                                                          │
 * │ Un magasinier voit « 2 casiers et 5 bouteilles » ; il ne voit jamais 29. │
 * │ Lui faire poser la multiplication, c'est lui demander de faire le        │
 * │ travail que le serveur fait déjà, avec le risque d'erreur en prime - et  │
 * │ une erreur de facteur sur un transfert vide un rayon entier.             │
 * │                                                                          │
 * │ Les deux champs sont EMPILÉS, pas en grille : sur 390 points, « Quantité │
 * │ en BOUTEILLES » ne tient pas dans une colonne de 170, et un libellé      │
 * │ tronqué au milieu d'un mot ne désigne plus rien. Même arbitrage que      │
 * │ `BlocCanal`.                                                             │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Les valeurs partent TELLES QUELLES au serveur, qui reste seul à convertir :
 * le total affiché ici n'est qu'un contrôle de relecture.
 */
import { View } from "react-native";
import { type Packaging } from "@vente-facile/core";

import {
  libelleCanal,
  motCanal,
  rappelConditionnement,
  type ErreursQuantite,
} from "@/features/stock/lignes-conditionnees";
import { Banner, FormField, Input, Text } from "@/ui";

export function SaisieQuantiteConditionnee({
  conditionnement,
  contenants,
  onContenants,
  vrac,
  onVrac,
  erreurs,
  libelleSimple,
  recapitulatif,
  alerte,
}: {
  /** `null` : un seul champ, celui de la quantité simple. */
  conditionnement: Packaging | null;
  contenants: string;
  onContenants: (v: string) => void;
  vrac: string;
  onVrac: (v: string) => void;
  erreurs: ErreursQuantite;
  /** « Quantité à transférer », « Quantité comptée »… */
  libelleSimple: string;
  /** « Vous transférez 2 CASIERS + 5 BOUTEILLES = 29 BOUTEILLES. » */
  recapitulatif?: string | null;
  /** Un dépassement du disponible : un AVERTISSEMENT, jamais un refus. */
  alerte?: string | null;
}) {
  if (!conditionnement) {
    return (
      <View>
        <FormField label={libelleSimple} required error={erreurs.vrac}>
          <Input
            value={vrac}
            onChangeText={onVrac}
            invalid={Boolean(erreurs.vrac)}
            keyboardType="decimal-pad"
            placeholder="0"
            autoFocus
          />
        </FormField>
        {alerte ? (
          <Banner tone="warning" title="Plus que le disponible" message={alerte} />
        ) : null}
      </View>
    );
  }

  return (
    <View>
      <View className="mb-4 gap-3 rounded-lg border border-border p-3">
        {/* Le facteur EN TÊTE, pas en pied : il se lit avant de taper, sinon
            il ne sert qu'à constater l'erreur après coup. */}
        <Text variant="caption">{rappelConditionnement(conditionnement)}</Text>

        <FormField
          label={libelleCanal(conditionnement.packageWord)}
          error={erreurs.contenants}
        >
          <Input
            value={contenants}
            onChangeText={onContenants}
            invalid={Boolean(erreurs.contenants)}
            keyboardType="decimal-pad"
            placeholder="0"
            autoFocus
          />
        </FormField>

        {/* Vendu en gros SEUL : le canal de détail n'existe pas, et un
            contenant ne s'y ouvre jamais. Le serveur refuse tout vrac sur un
            tel article ; offrir la case ferait découvrir le refus après coup. */}
        {conditionnement.packageOnly ? (
          <Text variant="caption">
            {/* « en X » et non « des X » : le GENRE d'un nom de contenant n'est
                pas dérivable sans lexique, et le nom vient du marchand. */}
            {`Aucune unité isolée : cet article se manipule uniquement en ${motCanal(
              conditionnement.packageWord
            )}.`}
          </Text>
        ) : (
          <FormField label={libelleCanal(conditionnement.retailWord)} error={erreurs.vrac}>
            <Input
              value={vrac}
              onChangeText={onVrac}
              invalid={Boolean(erreurs.vrac)}
              keyboardType="decimal-pad"
              placeholder="0"
            />
          </FormField>
        )}

        {recapitulatif ? (
          <View className="rounded-md bg-muted px-3 py-2">
            <Text variant="caption">{recapitulatif}</Text>
          </View>
        ) : null}
      </View>

      {alerte ? (
        <Banner tone="warning" title="Plus que le disponible" message={alerte} />
      ) : null}
    </View>
  );
}
