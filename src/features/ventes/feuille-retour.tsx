/**
 * Enregistrer un retour, dans une FEUILLE, depuis la vente concernée.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN RETOUR SE CRÉE DEPUIS SA VENTE, JAMAIS D'UNE LISTE VIDE.             │
 * │                                                                          │
 * │ Il faut savoir CE QUI est rendu, et à quel prix cela avait été vendu :   │
 * │ chaque ligne de retour DÉSIGNE une ligne de facture. Sans ce lien, le    │
 * │ serveur ne saurait ni quoi remettre en stock, ni combien rembourser, et  │
 * │ il refuse l'opération. La feuille reste donc posée SUR la facture, qu'on │
 * │ continue de voir derrière : c'est là qu'on lit ce qui est rendu.         │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * **Le retour naît en BROUILLON.** Ni le stock ni la caisse ne bougent avant
 * l'approbation, qui est un geste distinct et confirmé (`/retour/[id]`).
 *
 * **« Remettre en stock » est coché par défaut, et se décoche.** Un retour rend
 * la marchandise ; l'article cassé ou périmé est le cas particulier.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE PLAFOND EST CE QUI RESTE À RENDRE, PAS CE QUI A ÉTÉ VENDU.           │
 * │                                                                          │
 * │ Le formulaire proposait la quantité vendue, sans regarder les retours    │
 * │ déjà enregistrés : la même marchandise pouvait être rendue deux fois,    │
 * │ revenir deux fois en stock et être remboursée deux fois. Le serveur le   │
 * │ refuse désormais ; ici on refuse AVANT la mise en file, parce qu'un      │
 * │ refus après coup arrive en quarantaine, le client parti et l'argent      │
 * │ rendu. Voir `features/ventes/rendu.ts`.                                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import { useCallback, useState } from "react";
import { View } from "react-native";

import { useMonnaie } from "@/data/devises";
import { useLecture } from "@/data/live";
import { lireNombre } from "@/data/nombres";
import type { DetailVente } from "@/data/vente-detail";
import { creerRetour } from "@/features/ventes/retours-devis";
import { renduDeLaVente, resteARendre } from "@/features/ventes/rendu";
import {
  Banner, Button, Divider, FormField, Input, Sheet, Switch, Text, useToast,
} from "@/ui";

interface LigneRendue {
  quantite: string;
  remisEnStock: boolean;
}

export function FeuilleRetour({
  vente,
  onFermer,
  onCree,
}: {
  vente: DetailVente;
  onFermer: () => void;
  /** Le retour vient d'entrer au journal : à l'appelant d'ouvrir sa fiche. */
  onCree: (id: string) => void;
}) {
  const money = useMonnaie();
  const toast = useToast();

  const [rendues, setRendues] = useState<Record<string, LigneRendue>>({});
  const [motif, setMotif] = useState("");
  const [envoi, setEnvoi] = useState(false);

  const charger = useCallback(() => renduDeLaVente(vente.id), [vente.id]);
  const { donnees: rendu } = useLecture(charger, {
    tables: ["sale_returns", "sale_return_items", "outbox_operations"],
    deps: [vente.id],
  });

  const saisie = (id: string) => rendues[id];
  const quantiteDe = (id: string): number => {
    const lu = lireNombre(rendues[id]?.quantite ?? "");
    return lu.ok ? (lu.valeur ?? 0) : 0;
  };
  const illisible = (id: string): boolean => !lireNombre(rendues[id]?.quantite ?? "").ok;

  // Les lignes dont le produit a été supprimé du catalogue ne peuvent pas être
  // rendues : le serveur exige un produit pour savoir quoi remettre en stock.
  const rendables = vente.lignes.filter((l) => l.produitId !== null);
  const restant = (id: string, vendu: number) =>
    rendu ? resteARendre(rendu, id, vendu) : vendu;

  const lignes = rendables
    .map((ligne) => ({
      ligne,
      quantite: quantiteDe(ligne.id),
      remisEnStock: saisie(ligne.id)?.remisEnStock !== false,
    }))
    .filter((l) => l.quantite > 0);

  const total = lignes.reduce((t, l) => t + l.quantite * l.ligne.prixUnitaire, 0);
  const trop = rendables.some(
    (l) => quantiteDe(l.id) > restant(l.id, l.quantiteTotale)
  );
  const malSaisi = rendables.some((l) => illisible(l.id));
  const bloque =
    envoi || lignes.length === 0 || motif.trim().length === 0 || trop || malSaisi;

  // Tout est déjà rendu : il n'y a plus rien à proposer, et le dire vaut mieux
  // qu'un formulaire dont tous les champs sont plafonnés à zéro.
  const plusRienARendre = rendables.every((l) => restant(l.id, l.quantiteTotale) <= 0);

  const valider = async () => {
    if (bloque || !vente.entrepotId) return;
    setEnvoi(true);
    try {
      const id = await creerRetour({
        vente: vente.id,
        entrepot: vente.entrepotId,
        motif: motif.trim(),
        lignes: lignes.map((l) => ({
          ligneVente: l.ligne.id,
          produit: l.ligne.produitId as string,
          quantite: l.quantite,
          prixUnitaire: l.ligne.prixUnitaire,
          remisEnStock: l.remisEnStock,
        })),
      });
      toast.succes("Retour enregistré en brouillon. Il partira à la prochaine synchronisation.");
      onCree(id);
    } catch (e) {
      toast.erreur(
        e instanceof Error ? e.message : "Le retour n'a pas pu être enregistré."
      );
    } finally {
      setEnvoi(false);
    }
  };

  // Sans entrepôt, la marchandise n'a nulle part où revenir. Le serveur le
  // refuserait ; le dire ici évite une quarantaine pour rien.
  if (!vente.entrepotId) {
    return (
      <Sheet ouvert onFermer={onFermer} titre="Retour article">
        <Banner
          tone="warning"
          title="Cette vente n'a pas d'entrepôt"
          message="La marchandise revient là d'où elle est partie. Sans entrepôt sur la facture, le retour ne peut pas être enregistré depuis le terminal."
        />
        <Button variant="outline" fullWidth onPress={onFermer}>
          Fermer
        </Button>
      </Sheet>
    );
  }

  if (plusRienARendre) {
    return (
      <Sheet ouvert onFermer={onFermer} titre="Retour article">
        <Banner
          tone="info"
          title="Tout a déjà été rendu"
          message="Chaque article de cette facture a été rendu en totalité. Un retour de plus ferait revenir en stock une marchandise vendue une seule fois."
        />
        <Button variant="outline" fullWidth onPress={onFermer}>
          Fermer
        </Button>
      </Sheet>
    );
  }

  return (
    <Sheet ouvert onFermer={onFermer} titre={`Retour sur ${vente.reference}`}>
      <Text variant="bodySmall">
        Indiquez ce que le client rapporte. Laissez à zéro ce qui reste chez lui.
      </Text>

      <View>
        {rendables.map((l, i) => {
          const reste = restant(l.id, l.quantiteTotale);
          const q = quantiteDe(l.id);
          const depasse = q > reste;
          const dejaRendu = l.quantiteTotale - reste;
          return (
            <View key={l.id}>
              {i > 0 ? (
                <View className="my-3">
                  <Divider />
                </View>
              ) : null}
              <Text variant="bodySmall" className="font-sans-medium">
                {l.produit}
              </Text>
              <Text variant="caption" className="mb-2">
                {`Vendu ${l.quantiteAffichee} à ${money.money(l.prixUnitaire, vente.devise)}`}
              </Text>
              {/* CE QUI A DÉJÀ ÉTÉ RENDU se dit, et il se dit ICI : le
                  commerçant a le client devant lui et doit pouvoir expliquer
                  pourquoi il ne peut pas reprendre davantage. */}
              {dejaRendu > 0 ? (
                <Text variant="caption" className="mb-2 text-warning">
                  {reste > 0
                    ? `${dejaRendu} déjà rendu${dejaRendu > 1 ? "s" : ""}, il en reste ${reste} à rendre.`
                    : "Tout a déjà été rendu sur cette ligne."}
                </Text>
              ) : null}
              <FormField
                label="Quantité rendue"
                error={
                  illisible(l.id)
                    ? "Quantité illisible. Écrivez par exemple 2 ou 1,5."
                    : depasse
                      ? `Au plus ${reste}, ce qui reste à rendre.`
                      : undefined
                }
              >
                <Input
                  value={saisie(l.id)?.quantite ?? ""}
                  onChangeText={(t) =>
                    setRendues((r) => ({
                      ...r,
                      [l.id]: {
                        quantite: t,
                        remisEnStock: r[l.id]?.remisEnStock !== false,
                      },
                    }))
                  }
                  keyboardType="decimal-pad"
                  placeholder="0"
                  invalid={depasse || illisible(l.id)}
                  // Une ligne entièrement rendue n'accepte plus rien : un
                  // champ ouvert qui refusera toute valeur est un piège.
                  editable={reste > 0}
                  accessibilityLabel={`Quantité rendue de ${l.produit}`}
                />
              </FormField>
              {q > 0 ? (
                <Switch
                  label="Remettre en stock"
                  aide="Décochez si l'article est cassé, périmé ou invendable."
                  valeur={saisie(l.id)?.remisEnStock !== false}
                  onChange={(val) =>
                    setRendues((r) => ({
                      ...r,
                      [l.id]: { quantite: r[l.id]?.quantite ?? "", remisEnStock: val },
                    }))
                  }
                />
              ) : null}
            </View>
          );
        })}
      </View>

      {rendables.length < vente.lignes.length ? (
        <Text variant="caption">
          Une ligne de cette facture porte un produit supprimé du catalogue :
          elle ne peut pas être rendue depuis le terminal.
        </Text>
      ) : null}

      <FormField
        label="Motif du retour"
        required
        hint="Il figure sur la pièce et dans l'historique."
      >
        <Input
          value={motif}
          onChangeText={setMotif}
          placeholder="Article défectueux, erreur de référence..."
        />
      </FormField>

      {total > 0 ? (
        <View className="flex-row items-baseline justify-between rounded-lg bg-muted/50 px-3 py-2.5">
          <Text variant="label">Valeur rendue</Text>
          <Text variant="body" numeric className="font-sans-medium">
            {money.money(total, vente.devise)}
          </Text>
        </View>
      ) : null}

      <Banner
        tone="info"
        title="Rien ne bouge avant l'approbation"
        message={
          vente.resteAPayer > 0
            ? "À l'approbation, le montant éteindra d'abord la dette du client sur cette facture ; seul le reliquat sortira de la caisse."
            : "À l'approbation, la marchandise reviendra en stock et le montant sortira de la caisse."
        }
      />

      <Button
        fullWidth
        size="lg"
        disabled={bloque}
        loading={envoi}
        onPress={() => void valider()}
      >
        Enregistrer le retour
      </Button>
    </Sheet>
  );
}
