/**
 * Réceptionner un transfert, ligne par ligne.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UNE RÉCEPTION PARTIELLE EST LE CAS ORDINAIRE.                           │
 * │                                                                          │
 * │ L'écran réceptionnait TOUJOURS la totalité expédiée : le magasinier qui  │
 * │ ne décharge qu'un casier sur deux ne pouvait pas le dire, et le stock de │
 * │ destination entrait faux. Le serveur accepte pourtant un décompte PAR    │
 * │ LIGNE et PAR CANAL depuis toujours, et `transitionTransfert` savait      │
 * │ déjà le transmettre - `lignesRecues` n'avait simplement AUCUN appelant.  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * **Les champs sont PRÉREMPLIS de l'expédié.** « Laissez vide pour tout
 * réceptionner » était une promesse que le serveur ne tient pas : sa règle est
 * par LIGNE, pas par champ, et remplir un seul canal envoyait l'autre à zéro.
 * Ce qui est à l'écran est désormais ce qui part ; on corrige la ligne venue
 * courte, et le cas ordinaire se valide sans une frappe. Voir
 * `saisiesInitiales` pour le raisonnement complet.
 *
 * **Deux canaux quand le produit est conditionné** : un magasinier compte des
 * casiers et des bouteilles, pas un total. Le seuil est DEUX, comme
 * `getPackaging` du noyau et `PackagingService.factor` du serveur.
 */
import { useMemo, useState } from "react";
import { View } from "react-native";

import type { LigneTransfert } from "@/data/stock-operations";
import {
  lignesDeReception,
  partageExpedie,
  refusDeReception,
  saisiesInitiales,
  type LigneRecue,
  type SaisieReception,
} from "@/features/stock/reception";
import { Button, Divider, FormField, Input, Sheet, Text } from "@/ui";

export type { LigneRecue };

export function FeuilleReception({
  lignes,
  ouvert,
  onFermer,
  onConfirmer,
  enCours,
}: {
  lignes: LigneTransfert[];
  ouvert: boolean;
  onFermer: () => void;
  onConfirmer: (recues: LigneRecue[] | undefined) => void;
  enCours: boolean;
}) {
  // La feuille est rendue CONDITIONNELLEMENT par l'appelant : chaque ouverture
  // est un montage, donc un préremplissage frais. Pas d'effet de remise à zéro
  // à tenir en phase avec les champs.
  const [saisies, setSaisies] = useState<Record<string, SaisieReception>>(() =>
    saisiesInitiales(lignes)
  );

  const maj = (id: string, patch: Partial<SaisieReception>) =>
    setSaisies((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? { contenants: "", vrac: "" }), ...patch },
    }));

  const refus = useMemo(() => refusDeReception(lignes, saisies), [lignes, saisies]);

  return (
    <Sheet ouvert={ouvert} onFermer={onFermer} titre="Réceptionner le transfert">
      <View className="gap-4">
        <Text variant="caption" className="text-muted-foreground">
          Les quantités sont celles qui ont été expédiées. Corrigez seulement
          les lignes reçues en partie.
        </Text>

        {lignes.map((ligne, i) => {
          const p = partageExpedie(ligne);
          const s = saisies[ligne.id];
          return (
            <View key={ligne.id} className="gap-2">
              {i > 0 ? <Divider /> : null}
              <Text variant="body" className="font-sans-medium">
                {ligne.produit}
              </Text>
              <Text variant="caption" className="text-muted-foreground">
                Expédié : {ligne.demandeAffiche}
              </Text>
              <View className="flex-row gap-3">
                {/* Les deux canaux ne sont offerts que si l'envoi porte un
                    partage ENREGISTRÉ : sans lui, il n'y a rien à proposer par
                    canal, et le déduire redécouperait un total au facteur du
                    jour. */}
                {p.canaux ? (
                  <View className="flex-1">
                    <FormField label="Contenants reçus">
                      <Input
                        keyboardType="numeric"
                        value={s?.contenants ?? ""}
                        onChangeText={(v) => maj(ligne.id, { contenants: v })}
                      />
                    </FormField>
                  </View>
                ) : null}
                <View className="flex-1">
                  <FormField label={p.canaux ? "Unités reçues" : "Quantité reçue"}>
                    <Input
                      keyboardType="numeric"
                      value={s?.vrac ?? ""}
                      onChangeText={(v) => maj(ligne.id, { vrac: v })}
                    />
                  </FormField>
                </View>
              </View>
            </View>
          );
        })}

        {refus ? (
          <Text variant="caption" className="text-destructive">
            {refus}
          </Text>
        ) : null}

        <Button
          fullWidth
          size="lg"
          leftIcon="Boxes"
          loading={enCours}
          disabled={enCours || refus !== null}
          onPress={() => onConfirmer(lignesDeReception(lignes, saisies))}
        >
          Confirmer la réception
        </Button>
      </View>
    </Sheet>
  );
}
