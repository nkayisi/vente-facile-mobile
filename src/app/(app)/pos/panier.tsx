/**
 * Le panier en détail : relire, corriger, remiser.
 *
 * Écran séparé de la grille parce qu'un téléphone ne tient pas les deux, et
 * qu'au comptoir ce sont deux moments distincts : on compose, puis on relit
 * avec le client avant d'annoncer le montant.
 */
import { useEffect, useRef, useState } from "react";
import { FlatList, Modal, View } from "react-native";
import { router } from "expo-router";

import { getPackaging, pluralizeUnit } from "@vente-facile/core";
import { lineGross, looseQuantityOf, type Saisie } from "@vente-facile/core/pos";

import { etiquetteParDefaut, mettreEnAttente } from "@/features/pos/attente";
import { sessionOuverte } from "@/features/pos/caisse";
import { SelecteurQuantite } from "@/features/pos/selecteur-quantite";
import { usePanier, type LignePanier } from "@/features/pos/panier";
import {
  Button, Divider, EmptyState, FormField, Icon, Input, Pressable, Screen, Text,
} from "@/ui";

export default function Panier() {
  const panier = usePanier();
  const [enEdition, setEnEdition] = useState<number | null>(null);
  const [remiseOuverte, setRemiseOuverte] = useState(false);
  const [etiquette, setEtiquette] = useState<string | null>(null);
  // Verrou synchrone AVANT tout `setState` : deux appuis rapprochés rangeraient
  // le panier deux fois, et le second appui viderait un panier déjà vide.
  const verrouAttente = useRef(false);

  const lignes = panier.etat.lignes;

  // ┌──────────────────────────────────────────────────────────────────────┐
  // │ LA REMISE SE SAISISSAIT EN DEVISE PRINCIPALE, ET TOUT AUTOUR PARLAIT │
  // │ EN DEVISE DE FACTURE.                                                │
  // │                                                                      │
  // │ `globalDiscountAmount` est en devise PRINCIPALE, comme le noyau le    │
  // │ documente, et le corps de vente la reconvertit. Mais la borne          │
  // │ affichée, la ligne « Remise » et le total sont, eux, en devise de     │
  // │ FACTURE. Relevé à l'écran, facture en CDF sur un établissement dont   │
  // │ la principale est le dollar : « Au plus 2 581 520 FC », le caissier   │
  // │ tape 1 000 000 en croyant offrir un million de francs, et le total    │
  // │ tombe à ZÉRO. Il vient d'offrir la vente entière.                     │
  // │                                                                      │
  // │ Le champ parle donc désormais la même langue que sa propre borne.     │
  // └──────────────────────────────────────────────────────────────────────┘
  const versFacture = (montant: number) =>
    panier.devises.convertMoney(montant, panier.devises.primary, panier.deviseFacture);
  const versPrincipale = (montant: number) =>
    panier.devises.convertMoney(montant, panier.deviseFacture, panier.devises.primary);

  // Le texte tapé vit à part de l'état : une saisie au-delà du plafond est
  // RABAISSÉE par le réducteur, et un champ contrôlé de React Native ne
  // réécrit pas son texte natif quand la valeur bornée ne change plus d'un
  // rendu à l'autre. Sans cet accord explicite, le champ affichait encore
  // « 1000000 » pendant que la vente appliquait le plafond.
  const [texteRemise, setTexteRemise] = useState("");
  const deviseTexte = useRef(panier.deviseFacture);
  useEffect(() => {
    const saisi = Number(texteRemise.replace(",", ".")) || 0;

    // La devise de facture a changé depuis la saisie : le nombre tapé désigne
    // maintenant autre chose que ce que son étiquette annonce. On le réécrit.
    if (deviseTexte.current !== panier.deviseFacture) {
      deviseTexte.current = panier.deviseFacture;
      const applique = versFacture(panier.etat.remiseGlobale);
      setTexteRemise(applique > 0 ? String(applique) : "");
      return;
    }

    // Sinon on ne réécrit QUE si la borne a mordu, et la comparaison se fait en
    // devise PRINCIPALE, là où la remise vit. Comparer en devise de facture
    // ferait passer un aller-retour de conversion pour un plafonnement :
    // 1 000 000 FC valent 434,78 $ arrondis, qui revalent 999 994 FC, et le
    // champ se réécrirait pour six francs sur un million.
    const saisiPrincipale = versPrincipale(saisi);
    if (panier.etat.remiseGlobale < saisiPrincipale - 0.005) {
      setTexteRemise(String(versFacture(panier.etat.remiseGlobale)));
    }
    // `texteRemise` n'entre pas dans les dépendances : c'est lui qu'on corrige,
    // et l'y mettre relancerait l'effet sur sa propre écriture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panier.etat.remiseGlobale, panier.deviseFacture]);

  const ranger = async (label: string) => {
    if (verrouAttente.current) return;
    verrouAttente.current = true;
    try {
      const session = await sessionOuverte();
      await mettreEnAttente({
        etat: panier.etat,
        label,
        registerSessionId: session?.id ?? null,
        // Le montant est rangé TEL QUEL, pour que la liste dise quelque chose.
        // Il est indicatif : la reprise recalcule tout depuis le catalogue du
        // jour, prix compris.
        totalAmount: String(panier.totaux.totalFacture),
        totalCurrency: panier.deviseFacture,
      });
      panier.envoyer({ type: "vider" });
      setEtiquette(null);
      router.replace("/vendre");
    } finally {
      verrouAttente.current = false;
    }
  };

  const ligne = enEdition !== null ? lignes[enEdition] : null;

  return (
    <Screen>
      <View className="flex-row items-center gap-2 pt-2">
        <Pressable
          onPress={() => router.back()}
          className="h-11 w-11 items-center justify-center rounded-full active:bg-muted"
          accessibilityLabel="Retour au comptoir"
        >
          <Icon name="ArrowLeft" size={24} />
        </Pressable>
        <Text variant="h4" className="flex-1">
          Panier
        </Text>
        {lignes.length > 0 ? (
          <Pressable
            onPress={() => panier.envoyer({ type: "vider" })}
            haptic="warning"
            className="h-11 justify-center rounded-full px-3 active:bg-muted"
            accessibilityLabel="Vider le panier"
          >
            <Text variant="bodySmall" className="text-destructive">
              Vider
            </Text>
          </Pressable>
        ) : null}
      </View>

      {lignes.length === 0 ? (
        <EmptyState
          icon="ShoppingCart"
          title="Panier vide"
          message="Choisissez des articles dans la grille du comptoir."
          action={{ label: "Retour au comptoir", onPress: () => router.back() }}
        />
      ) : (
        <>
          <FlatList
            data={lignes}
            keyExtractor={(l, i) => `${l.product.id}-${i}`}
            contentContainerClassName="pb-56 pt-2"
            ItemSeparatorComponent={() => <Divider />}
            renderItem={({ item, index }) => (
              <LigneArticle
                ligne={item}
                montant={panier.argent(
                  panier.devises.convertMoney(
                    lineGross(item), panier.devises.primary, panier.deviseFacture
                  )
                )}
                onPress={() => setEnEdition(index)}
              />
            )}
          />

          <View className="absolute inset-x-0 bottom-0 border-t border-border bg-card px-4 pb-6 pt-3">
            <Recapitulatif />

            <Pressable
              onPress={() => setRemiseOuverte((v) => !v)}
              className="mt-1 flex-row items-center gap-1 py-2"
              accessibilityLabel="Remise sur le total"
            >
              <Icon name={remiseOuverte ? "ChevronUp" : "Tag"} size={15} color="mutedForeground" />
              <Text variant="bodySmall" className="text-muted-foreground">
                Remise sur le total
              </Text>
            </Pressable>

            {remiseOuverte ? (
              <View className="pb-2">
                <FormField
                  label={`Remise (${panier.deviseFacture})`}
                  hint={`Au plus ${panier.argent(versFacture(panier.totaux.remiseGlobaleMax))}`}
                >
                  <Input
                    value={texteRemise}
                    onChangeText={(v) => {
                      setTexteRemise(v);
                      // Saisi en devise de FACTURE, rangé en principale : c'est
                      // dans cette devise que le noyau totalise et que le corps
                      // de vente reconvertit.
                      panier.envoyer({
                        type: "remiseGlobale",
                        montant: versPrincipale(Number(v.replace(",", ".")) || 0),
                      });
                    }}
                    keyboardType="decimal-pad"
                    placeholder="0"
                  />
                </FormField>
              </View>
            ) : null}

            <View className="flex-row gap-3">
              <View className="flex-1">
                <Button
                  variant="secondary"
                  onPress={() => setEtiquette(etiquetteParDefaut(panier.etat))}
                  fullWidth
                >
                  Mettre en attente
                </Button>
              </View>
              <View className="flex-1">
                <Button onPress={() => router.push("/pos/encaissement")} fullWidth>
                  Encaisser
                </Button>
              </View>
            </View>
          </View>
        </>
      )}

      <BoiteEtiquette
        valeur={etiquette}
        onChange={setEtiquette}
        onValider={() => etiquette !== null && void ranger(etiquette)}
        onFermer={() => setEtiquette(null)}
      />

      <SelecteurQuantite
        article={ligne?.product ?? null}
        visible={enEdition !== null}
        onFermer={() => setEnEdition(null)}
        initiale={
          ligne
            ? { packages: ligne.packageQuantity, loose: looseQuantityOf(ligne) }
            : undefined
        }
        scellesDisponibles={ligne?.product.stock_packages}
        vracDisponible={ligne?.product.stock_loose}
        // Un article verrouillé par un inventaire depuis sa mise au panier se
        // dit ICI, pas à l'encaissement. `verifierModification` retire la ligne
        // éditée de son propre contrôle de stock : `verifier` la compterait
        // contre elle-même et refuserait une correction possible.
        verifier={(saisie: Saisie) =>
          enEdition === null ? null : panier.verifierModification(enEdition, saisie)
        }
        libelleValider="Mettre à jour"
        onRetirer={() => {
          if (enEdition === null) return;
          panier.envoyer({ type: "retirer", index: enEdition });
          setEnEdition(null);
        }}
        onValider={(saisie: Saisie) => {
          if (enEdition === null) return;
          panier.envoyer({ type: "modifier", index: enEdition, saisie });
          setEnEdition(null);
        }}
      />
    </Screen>
  );
}

/**
 * Nommer le panier qu'on range.
 *
 * Sans étiquette, une liste de trois paniers ne se distingue que par un montant
 * et une heure, et le caissier doit les ouvrir un par un pour retrouver celui
 * du client qui revient. Le nom du client sert de valeur par défaut ; à défaut,
 * l'heure, qui sépare au moins deux paniers rangés à dix minutes d'intervalle.
 */
function BoiteEtiquette({
  valeur,
  onChange,
  onValider,
  onFermer,
}: {
  valeur: string | null;
  onChange: (v: string) => void;
  onValider: () => void;
  onFermer: () => void;
}) {
  return (
    <Modal
      visible={valeur !== null}
      transparent
      animationType="fade"
      onRequestClose={onFermer}
    >
      <Pressable className="flex-1 justify-center bg-foreground/50 px-6" onPress={onFermer}>
        <Pressable className="rounded-2xl bg-card p-5" onPress={() => {}}>
          <Text variant="h4">Mettre en attente</Text>
          <Text variant="bodySmall" className="mt-1 text-muted-foreground">
            Le panier sera rangé et le comptoir libéré pour le client suivant.
          </Text>

          <View className="mt-4">
            <FormField label="Nom du panier">
              <Input
                value={valeur ?? ""}
                onChangeText={onChange}
                placeholder="Client, table, repère…"
                autoFocus
                returnKeyType="done"
                onSubmitEditing={onValider}
              />
            </FormField>
          </View>

          <View className="mt-4 flex-row gap-3">
            <View className="flex-1">
              <Button variant="ghost" onPress={onFermer} fullWidth>
                Annuler
              </Button>
            </View>
            <View className="flex-1">
              <Button onPress={onValider} fullWidth>
                Ranger
              </Button>
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function LigneArticle({
  ligne,
  montant,
  onPress,
}: {
  ligne: LignePanier;
  montant: string;
  onPress: () => void;
}) {
  const conditionnement = getPackaging(ligne.product);
  const detail = looseQuantityOf(ligne);

  // Ce qui est vendu se lit en CONTENANTS et en unités, jamais par leur somme :
  // « 2 casiers + 3 bouteilles », pas « 27 ». C'est la lecture du rayon.
  const parts: string[] = [];
  if (conditionnement && ligne.packageQuantity > 0) {
    parts.push(
      `${ligne.packageQuantity} ${pluralizeUnit(conditionnement.packageWord, ligne.packageQuantity)}`
    );
  }
  if (detail > 0) {
    const mot = conditionnement?.retailWord ?? ligne.product.unit_name ?? "unité";
    parts.push(`${detail} ${pluralizeUnit(mot, detail)}`);
  }

  return (
    <Pressable onPress={onPress} className="flex-row items-center px-1 py-3 active:bg-muted">
      <View className="flex-1 pr-3">
        <Text variant="body" numberOfLines={2}>
          {ligne.product.name}
        </Text>
        <Text variant="bodySmall" className="mt-0.5 text-muted-foreground">
          {parts.join(" + ") || `${ligne.quantity}`}
          {ligne.discount_percentage > 0 ? `  ·  -${ligne.discount_percentage} %` : ""}
        </Text>
      </View>
      <Text variant="body">{montant}</Text>
      <Icon name="ChevronRight" size={16} color="mutedForeground" />
    </Pressable>
  );
}

function Recapitulatif() {
  const { totaux, argent, devises, deviseFacture } = usePanier();
  const enFacture = (montant: number) =>
    argent(devises.convertMoney(montant, devises.primary, deviseFacture));

  return (
    <View className="gap-1 pb-2">
      <Rang libelle="Sous-total" valeur={enFacture(totaux.sousTotal)} />
      {totaux.remiseLignes > 0 ? (
        <Rang libelle="Remises de ligne" valeur={`- ${enFacture(totaux.remiseLignes)}`} />
      ) : null}
      {totaux.remiseGlobale > 0 ? (
        <Rang libelle="Remise" valeur={`- ${enFacture(totaux.remiseGlobale)}`} />
      ) : null}
      {totaux.taxe > 0 ? <Rang libelle="Taxes" valeur={enFacture(totaux.taxe)} /> : null}
      <View className="mt-1 flex-row items-baseline justify-between">
        <Text variant="body">Total</Text>
        <Text variant="h3">{argent(totaux.totalFacture)}</Text>
      </View>
    </View>
  );
}

function Rang({ libelle, valeur }: { libelle: string; valeur: string }) {
  return (
    <View className="flex-row justify-between">
      <Text variant="bodySmall" className="text-muted-foreground">
        {libelle}
      </Text>
      <Text variant="bodySmall" className="text-muted-foreground">
        {valeur}
      </Text>
    </View>
  );
}
