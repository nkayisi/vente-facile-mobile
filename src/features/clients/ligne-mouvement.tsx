/**
 * Une écriture au compte d'un client : ce qui creuse la dette, ce qui la réduit.
 *
 * Extraite de la fiche, qui la rendait en bas de dix sections. Elle vit
 * désormais dans la sous-page « Historique » ; l'extraction la rend partageable
 * sans qu'une seconde écriture puisse diverger sur le signe ou la couleur.
 *
 * ⚠ CHAQUE MONTANT DANS LA DEVISE DE SON ÉCRITURE : une dette se tient devise
 * par devise, et rendre une ligne en francs sous le symbole du dollar donnerait
 * un chiffre qui n'existe pas.
 */
import { View } from "react-native";

import { formatDateFr } from "@vente-facile/core";

import { useMonnaie } from "@/data/devises";
import type { MouvementCompte } from "@/data/contact-detail";
import { Icon, Text } from "@/ui";

export function LigneMouvement({ m }: { m: MouvementCompte }) {
  const money = useMonnaie();
  return (
    <View className="flex-row items-center gap-3 py-3">
      <View
        className={`h-9 w-9 items-center justify-center rounded-lg ${
          m.augmente ? "bg-destructive/10" : "bg-success/10"
        }`}
      >
        <Icon
          name={m.augmente ? "ArrowUpRight" : "ArrowDownRight"}
          size={16}
          color={m.augmente ? "destructive" : "success"}
        />
      </View>
      <View className="min-w-0 flex-1">
        <Text variant="bodySmall" className="font-sans-medium">
          {m.typeLabel}
        </Text>
        <Text variant="caption" numberOfLines={1}>
          {[m.numeroRecu, m.date ? formatDateFr(m.date) : null, m.notes || null]
            .filter(Boolean)
            .join(" · ")}
        </Text>
      </View>
      <View className="shrink-0 items-end">
        <Text
          variant="bodySmall"
          numeric
          className={`font-sans-medium ${
            m.augmente ? "text-destructive" : "text-success"
          }`}
        >
          {`${m.augmente ? "+" : "-"}${money.money(Math.abs(m.montant), m.devise)}`}
        </Text>
        <Text numeric variant="caption">
          {`solde ${money.money(m.soldeApres, m.devise)}`}
        </Text>
      </View>
    </View>
  );
}
