/**
 * Un canal de vente : sa quantité, ses deux prix, sa marge.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN BLOC PAR CANAL, ET NON DEUX ZONES SÉPARÉES.                          │
 * │                                                                          │
 * │ Le magasinier lit « 2 cartons à 6 000 » d'un seul tenant. Ranger les     │
 * │ quantités d'un côté et les prix de l'autre l'obligerait à rapprocher     │
 * │ deux nombres à l'oeil, et c'est ainsi qu'on saisit le prix du carton     │
 * │ dans la case de la bouteille. C'est la disposition du back-office.       │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Les trois champs sont EMPILÉS, pas en grille : sur 390 points, « Prix
 * d'achat d'une bouteille » ne tient pas dans une colonne de 170.
 */
import { View } from "react-native";
import { computeMargin, formatNumberFr } from "@vente-facile/core";

import { FormField, Input, Text } from "@/ui";

export function BlocCanal({
  titre,
  rappel,
  libelleQuantite,
  libelleCout,
  libelleVente,
  symbole,
  quantite,
  onQuantite,
  erreurQuantite,
  cout,
  onCout,
  prix,
  onPrix,
  prixVisibles,
}: {
  titre: string;
  /** « 1 carton = 12 bouteilles ». */
  rappel?: string;
  libelleQuantite: string;
  libelleCout: string;
  libelleVente: string;
  /** Le symbole de la devise PRINCIPALE : un montant sans devise ne dit rien. */
  symbole: string;
  quantite: string;
  onQuantite: (v: string) => void;
  erreurQuantite?: string;
  cout: string;
  onCout: (v: string) => void;
  prix: string;
  onPrix: (v: string) => void;
  /** Faux sur une sortie : elle n'a aucun prix d'achat à déclarer. */
  prixVisibles: boolean;
}) {
  const marge = computeMargin(Number(cout.replace(",", ".")), Number(prix.replace(",", ".")));

  return (
    <View className="gap-3 rounded-lg border border-border p-3">
      <View>
        <Text variant="bodySmall" className="font-sans-semibold">
          {titre}
        </Text>
        {rappel ? <Text variant="caption">{rappel}</Text> : null}
      </View>

      <FormField label={libelleQuantite} error={erreurQuantite}>
        <Input
          value={quantite}
          onChangeText={onQuantite}
          invalid={Boolean(erreurQuantite)}
          keyboardType="decimal-pad"
          placeholder="0"
        />
      </FormField>

      {prixVisibles ? (
        <>
          <FormField label={libelleCout}>
            <Input
              value={cout}
              onChangeText={onCout}
              keyboardType="decimal-pad"
              placeholder="0"
              trailing={<Text variant="caption">{symbole}</Text>}
            />
          </FormField>
          <FormField label={libelleVente}>
            <Input
              value={prix}
              onChangeText={onPrix}
              keyboardType="decimal-pad"
              placeholder="0"
              trailing={<Text variant="caption">{symbole}</Text>}
            />
          </FormField>
          {marge ? (
            <View className="flex-row items-center justify-between">
              <Text variant="caption">Marge sur prix de vente</Text>
              <Text
                variant="caption"
                numeric
                className={
                  marge.isNonPositive
                    ? "font-sans-semibold text-destructive"
                    : "font-sans-semibold text-success"
                }
              >
                {/* `formatNumberFr` et NON `toFixed(1)` : le back-office écrit
                    « 45.0 % » avec un point décimal anglais sous un montant
                    déjà rendu « 6 000,00 ». C'est un défaut de sa lecture, pas
                    une convention à recopier. */}
                {marge.isNonPositive
                  ? "Vous vendez à perte"
                  : `${formatNumberFr(marge.rate, 1)} %`}
              </Text>
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}
