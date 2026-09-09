/**
 * Détail d'un devis, et sa conversion.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CONVERTIR INSCRIT UNE DETTE, et réserve le stock.                       │
 * │                                                                          │
 * │ Un devis converti est une facture émise et non payée, au même titre      │
 * │ qu'une vente à crédit. Quand ce n'était pas le cas, la facture était     │
 * │ retenue comme ouverte sans qu'aucune dette soit inscrite : son règlement │
 * │ décrémentait un solde jamais incrémenté, et rendait le client            │
 * │ artificiellement créditeur. Le dialogue le dit avant.                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import { useCallback, useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { formatDateFr, formatDateTimeFr } from "@vente-facile/core";

import { useMonnaie } from "@/data/devises";
import { useLecture } from "@/data/live";
import {
  STATUT_DEVIS,
  detailDevis,
  type DetailDevis,
} from "@/data/retours-devis";
import { entrepotParDefaut } from "@/data/entrepot-defaut";
import { entrepots } from "@/data/stock";
import { nomsDeProduits } from "@/data/articles";
import {
  convertirDevis,
  detailEnAttente,
  enAttenteRetoursDevis,
} from "@/features/ventes/retours-devis";
import { BandeauEnvoi } from "@/features/sync/bandeau-envoi";
import { useSession } from "@/session/provider";
import {
  AlertDialog, AppBar, Badge, Banner, Button, Card, CardHeader, Divider,
  EmptyState, Screen, Spinner, StatValue, Text, useToast,
} from "@/ui";

const TABLES = ["quotations", "quotation_items", "customers", "sales", "products"];

function Paire({ label, valeur }: { label: string; valeur: string }) {
  return (
    <View className="flex-row items-baseline justify-between gap-3 py-1">
      <Text variant="bodySmall" numberOfLines={1} className="min-w-0 flex-1 text-muted-foreground">
        {label}
      </Text>
      <Text variant="bodySmall" numeric className="shrink-0 font-sans-medium">
        {valeur}
      </Text>
    </View>
  );
}

export default function DetailDevisEcran() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const money = useMonnaie();
  const toast = useToast();
  const { can } = useSession();
  const [confirmation, setConfirmation] = useState(false);
  const [envoi, setEnvoi] = useState(false);

  /**
   * La table tirée d'abord, le JOURNAL ensuite : un devis tout juste créé n'est
   * pas dans `quotations`, et ne doit pas y être.
   */
  const charger = useCallback(async (): Promise<DetailDevis | null> => {
    const tire = await detailDevis(id);
    if (tire) return tire;

    const attente = await detailEnAttente(id);
    if (!attente || attente.kind !== "quotation") return null;

    const noms = await nomsDeProduits(attente.lignes.map((l) => l.produitId));
    return {
      id,
      reference: "Référence à venir",
      client: null,
      clientId: null,
      statut: "draft",
      total: attente.montant,
      sousTotal: attente.montant,
      // Ni taxe ni remise ne sont saisies au terminal : le serveur les
      // arrêtera. Les afficher à zéro serait ici la vérité, pas un repli.
      taxes: 0,
      remise: 0,
      date: attente.date,
      valideJusquau: attente.valideJusquau ? new Date(attente.valideJusquau) : null,
      perime: false,
      notes: "",
      conditions: "",
      venteConvertie: null,
      lignes: attente.lignes.map((l, i) => ({
        id: `${id}-${i}`,
        produit: noms.get(l.produitId) ?? "Article",
        description: "",
        quantite: l.quantite,
        prixUnitaire: l.prixUnitaire,
        total: l.total,
      })),
    };
  }, [id]);
  const { donnees: d, chargement } = useLecture(charger, {
    tables: [...TABLES, "outbox_operations"],
    deps: [id],
  });
  const { donnees: attente } = useLecture(enAttenteRetoursDevis, {
    tables: ["outbox_operations"],
  });
  const { donnees: depots } = useLecture(entrepots, { tables: ["warehouses"] });

  if (chargement && !d) {
    return (
      <Screen>
        <AppBar title="Devis" />
        <View className="flex-1 items-center justify-center">
          <Spinner />
        </View>
      </Screen>
    );
  }

  if (!d) {
    return (
      <Screen padded={false}>
        <AppBar title="Devis" />
        <EmptyState
          icon="FileText"
          title="Devis introuvable"
          message="Il n'est pas encore descendu sur ce terminal, ou il a été supprimé."
          action={{ label: "Retour", onPress: () => router.back() }}
        />
      </Screen>
    );
  }

  const s = STATUT_DEVIS[d.statut];
  const envoiEnFile = attente?.devis.get(d.id);
  const envoiCreation = attente?.creations.get(d.id);
  const enFile = envoiEnFile !== undefined;
  const aCreer = envoiCreation !== undefined;
  // ⚠ `d.perime` N'ENTRE PAS dans cette garde. `convert_quotation` ne refuse
  // que `status == 'expired'`, un statut que RIEN dans le dépôt n'assigne
  // jamais : un devis dont la validité est passée reste `sent` et se convertit
  // sans broncher. Le fermer en annonçant un refus serveur qui n'existe pas
  // faisait d'un devis convertible un cul-de-sac, sans dérogation - le client
  // accepte ce matin un devis valable jusqu'à hier, et il faut tout ressaisir.
  // La péremption s'AFFICHE (pastille, bandeau) et se décide au comptoir.
  const convertible =
    d.statut !== "converted" && can("sales.create") && !enFile;

  const convertir = async () => {
    if (envoi) return;
    setEnvoi(true);
    try {
      await convertirDevis(d.id, entrepotParDefaut(depots));
      setConfirmation(false);
      toast.succes("Conversion mise en file. Elle partira à la prochaine synchronisation.");
    } catch (e) {
      toast.erreur(e instanceof Error ? e.message : "La conversion n'a pas pu être mise en file.");
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <Screen scroll padded={false}>
      <AppBar
        title={d.reference}
        subtitle={d.client ?? "Sans client"}
        right={
          d.perime ? (
            <Badge tone="warning">Périmé</Badge>
          ) : s ? (
            <Badge tone={s.ton}>{s.label}</Badge>
          ) : undefined
        }
      />

      <View className="gap-4 p-4">
        {/* Une CRÉATION et une CONVERSION ne disent pas la même chose : la
            première annonce une pièce qui n'existe pas encore côté serveur, la
            seconde une décision sur une pièce qui existe. */}
        {aCreer ? (
          <BandeauEnvoi
            envoi={envoiCreation}
            titre="Ce devis attend son envoi"
            consequence="Il n'existe encore que sur ce terminal ; sa référence définitive et sa conversion viendront après."
          />
        ) : (
          <BandeauEnvoi
            envoi={envoiEnFile}
            titre="Une conversion attend son envoi"
            consequence="Le devis ne changera d'état qu'après."
          />
        )}

        {d.perime && d.statut !== "converted" ? (
          <Banner
            tone="warning"
            title="Ce devis est périmé"
            message={`Sa validité s'est arrêtée le ${d.valideJusquau ? formatDateFr(d.valideJusquau) : "—"}. Vous pouvez toujours le convertir, aux prix du jour où il a été établi ; sinon, refaites-en un.`}
          />
        ) : null}

        {d.venteConvertie ? (
          <Banner
            tone="success"
            title="Devis converti"
            message={`Il a donné la vente ${d.venteConvertie}.`}
          />
        ) : null}

        <Card>
          <Text variant="caption" className="mb-1">
            Total
          </Text>
          <StatValue value={money.money(d.total, money.primaryCode)} />
        </Card>

        {convertible ? (
          <Button
            fullWidth
            size="lg"
            leftIcon="ShoppingCart"
            onPress={() => setConfirmation(true)}
          >
            Convertir en vente
          </Button>
        ) : null}

        <Card>
          <CardHeader title={`Articles (${d.lignes.length})`} />
          <View>
            {d.lignes.map((l, i) => (
              <View key={l.id}>
                {i > 0 ? <Divider /> : null}
                <View className="flex-row items-start justify-between gap-3 py-3">
                  <View className="min-w-0 flex-1">
                    <Text variant="bodySmall" className="font-sans-medium">
                      {l.produit}
                    </Text>
                    <Text variant="caption">
                      {`${l.quantite} × ${money.money(l.prixUnitaire, money.primaryCode)}`}
                    </Text>
                  </View>
                  <Text variant="bodySmall" numeric className="shrink-0 font-sans-medium">
                    {money.money(l.total, money.primaryCode)}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </Card>

        <Card>
          <CardHeader title="Montants" />
          <View>
            <Paire label="Sous-total" valeur={money.money(d.sousTotal, money.primaryCode)} />
            {d.taxes > 0 ? (
              <Paire label="Taxes" valeur={money.money(d.taxes, money.primaryCode)} />
            ) : null}
            {d.remise > 0 ? (
              <Paire label="Remise" valeur={`-${money.money(d.remise, money.primaryCode)}`} />
            ) : null}
            <View className="my-2">
              <Divider />
            </View>
            <Paire label="Total" valeur={money.money(d.total, money.primaryCode)} />
          </View>
        </Card>

        <Card>
          <CardHeader title="Informations" />
          <View>
            <Paire
              label="Créé le"
              valeur={d.date ? formatDateTimeFr(d.date) : "—"}
            />
            <Paire
              label="Valable jusqu'au"
              valeur={d.valideJusquau ? formatDateFr(d.valideJusquau) : "—"}
            />
          </View>
          {d.notes ? (
            <View className="mt-3">
              <Text variant="caption" className="mb-1">
                Notes
              </Text>
              <Text variant="bodySmall">{d.notes}</Text>
            </View>
          ) : null}
          {d.conditions ? (
            <View className="mt-3">
              <Text variant="caption" className="mb-1">
                Conditions
              </Text>
              <Text variant="bodySmall">{d.conditions}</Text>
            </View>
          ) : null}
        </Card>
      </View>

      <AlertDialog
        ouvert={confirmation}
        titre="Convertir ce devis en vente ?"
        message="Une facture est émise et le stock RÉSERVÉ. Le montant est porté au compte du client, comme une vente à crédit : il devra être réglé. Cette opération ne se défait pas."
        confirmer="Convertir"
        annuler="Revenir"
        enCours={envoi}
        onConfirmer={() => void convertir()}
        onAnnuler={() => setConfirmation(false)}
      />
    </Screen>
  );
}
