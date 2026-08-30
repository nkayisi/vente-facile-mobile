/**
 * Détail d'une ligne de stock : ce que porte un produit dans un entrepôt.
 *
 * Le back-office n'a pas cette page - il s'arrête à la ligne de tableau. Elle
 * existe ici parce que le pouce ne survole pas : au comptoir, on a besoin de
 * voir le partage scellé/vrac, le réservé et le seuil de réassort sans avoir à
 * lire une rangée de huit colonnes.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE QUI EST VENTILÉ, ET CE QUI NE L'EST PAS.                             │
 * │                                                                          │
 * │ Le rayon et le disponible le sont : leurs deux compteurs sont            │
 * │ enregistrés. Le RÉSERVÉ ne l'est pas - une réservation ne porte pas sur  │
 * │ des contenants précis, et écrire « 1 casier réservé » affirmerait qu'un  │
 * │ scellé est bloqué. Il s'affiche en unités, et le libellé le dit.         │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import { useCallback, useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { formatDateTimeFr, formatPrice, pluralizeUnit } from "@vente-facile/core";

import { useLecture } from "@/data/live";
import { ETAT_STOCK, detailNiveau } from "@/data/stock-niveaux";
import { deconditionner, enAttenteSurStock } from "@/features/stock/actes";
import { useSession } from "@/session/provider";
import {
  AppBar,
  Badge,
  Banner,
  Button,
  Card,
  CardHeader,
  Divider,
  EmptyState,
  FormField,
  Input,
  Screen,
  Sheet,
  Spinner,
  StatValue,
  Text,
  useToast,
} from "@/ui";

const TABLES = ["stocks", "products", "warehouses", "categories", "brands", "units"];

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

export default function DetailRayon() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const toast = useToast();
  const { can } = useSession();

  const [feuille, setFeuille] = useState(false);
  const [contenants, setContenants] = useState("1");
  const [envoi, setEnvoi] = useState(false);

  const charger = useCallback(() => detailNiveau(id), [id]);
  const { donnees: r, chargement } = useLecture(charger, { tables: TABLES, deps: [id] });
  const { donnees: attente } = useLecture(enAttenteSurStock, {
    tables: ["outbox_operations"],
  });

  if (chargement && !r) {
    return (
      <Screen>
        <AppBar title="Stock" />
        <View className="flex-1 items-center justify-center">
          <Spinner />
        </View>
      </Screen>
    );
  }

  if (!r) {
    return (
      <Screen padded={false}>
        <AppBar title="Stock" />
        <EmptyState
          icon="Boxes"
          title="Ligne introuvable"
          message="Elle n'est pas encore descendue sur ce terminal, ou elle a été supprimée."
          action={{ label: "Retour", onPress: () => router.back() }}
        />
      </Screen>
    );
  }

  const e = ETAT_STOCK[r.etat];
  const peutDeconditionner =
    r.facteur != null && r.contenants > 0 && can("stock_movements.create");
  const enFile = attente?.deconditionnements.has(r.id) ?? false;

  const valider = async () => {
    const n = Number(contenants.replace(",", ".")) || 0;
    if (envoi || n < 1) return;
    setEnvoi(true);
    try {
      await deconditionner(r.id, Math.floor(n));
      toast.succes(
        `Ouverture de ${Math.floor(n)} ${pluralizeUnit(r.uniteContenant ?? "contenant", n)} mise en file.`
      );
      setFeuille(false);
    } catch (err) {
      toast.erreur(
        err instanceof Error ? err.message : "Le déconditionnement n'a pas pu être mis en file."
      );
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <Screen scroll padded={false}>
      <AppBar
        title={r.produit}
        subtitle={[r.sku, r.entrepot].filter(Boolean).join(" · ")}
        right={r.etat !== "ok" ? <Badge tone={e.ton}>{e.label}</Badge> : undefined}
      />

      <View className="gap-4 p-4">
        {enFile ? (
          <Banner
            tone="info"
            title="Déconditionnement en attente d'envoi"
            message="Le rayon ci-dessous ne le prendra en compte qu'après synchronisation."
          />
        ) : null}

        <Card>
          <Text variant="caption" className="mb-1">
            En rayon
          </Text>
          <StatValue value={r.quantiteAffichee} />
          <View className="mt-3">
            <Text variant="caption" className="mb-1">
              Disponible à la vente
            </Text>
            <StatValue
              value={r.disponibleAffiche}
              tone={r.etat === "rupture" ? "destructive" : "success"}
            />
          </View>
        </Card>

        {peutDeconditionner ? (
          <Button fullWidth size="lg" leftIcon="PackageX" onPress={() => setFeuille(true)}>
            {/* « des » et non « un » : le GENRE d'un nom de contenant n'est pas
                dérivable sans lexique, et « Ouvrir un BOITE » se lit mal. Le
                pluriel partitif marche pour les deux genres, et le nom vient
                du marchand - il peut être n'importe quoi. */}
            {`Ouvrir des ${pluralizeUnit(r.uniteContenant ?? "contenant", 2)}`}
          </Button>
        ) : null}

        <Card>
          <CardHeader title="Détail" />
          <View>
            <Paire label="Total en unités" valeur={`${r.total} ${pluralizeUnit(r.uniteDetail ?? "unité", r.total)}`} />
            {/* Le réservé n'est PAS ventilé : une réservation ne porte pas sur
                des contenants précis. Le libellé nomme l'unité pour que
                personne n'y lise des casiers. */}
            <Paire
              label="Réservé (unités)"
              valeur={
                r.reserve > 0
                  ? `${r.reserve} ${pluralizeUnit(r.uniteDetail ?? "unité", r.reserve)}`
                  : "Rien"
              }
            />
            {r.facteur ? (
              <Paire
                label="Conditionnement"
                valeur={`${r.facteur} ${pluralizeUnit(r.uniteDetail ?? "unité", r.facteur)} par ${r.uniteContenant ?? "contenant"}`}
              />
            ) : null}
            <Paire
              label="Seuil de réassort"
              valeur={r.seuilReassort > 0 ? String(r.seuilReassort) : "Non défini"}
            />
            <View className="my-2">
              <Divider />
            </View>
            <Paire label="Coût unitaire" valeur={formatPrice(r.coutUnitaire)} />
            <Paire label="Valeur du stock" valeur={formatPrice(r.valeur)} />
          </View>
        </Card>

        <Card>
          <CardHeader title="Produit" />
          <View>
            {r.marque ? <Paire label="Marque" valeur={r.marque} /> : null}
            {r.categorie ? <Paire label="Catégorie" valeur={r.categorie} /> : null}
            {r.codeBarres ? <Paire label="Code-barres" valeur={r.codeBarres} /> : null}
            {r.dernierMouvement ? (
              <Paire label="Dernier mouvement" valeur={formatDateTimeFr(r.dernierMouvement)} />
            ) : null}
            {r.dernierComptage ? (
              <Paire label="Dernier comptage" valeur={formatDateTimeFr(r.dernierComptage)} />
            ) : null}
          </View>
        </Card>
      </View>

      <Sheet
        ouvert={feuille}
        onFermer={() => setFeuille(false)}
        titre={`Ouvrir des ${pluralizeUnit(r.uniteContenant ?? "contenant", 2)}`}
      >
        <Text variant="caption">
          {`${r.contenants} ${pluralizeUnit(r.uniteContenant ?? "contenant", r.contenants)} scellés, ${r.vrac} ${pluralizeUnit(r.uniteDetail ?? "unité", r.vrac)} au détail.`}
        </Text>
        <FormField
          label="Combien en ouvrir ?"
          required
          hint={
            r.facteur
              ? `Chacun libère ${r.facteur} ${pluralizeUnit(r.uniteDetail ?? "unité", r.facteur)}.`
              : undefined
          }
        >
          <Input
            value={contenants}
            onChangeText={setContenants}
            keyboardType="number-pad"
            autoFocus
          />
        </FormField>
        <Button
          fullWidth
          size="lg"
          disabled={envoi || (Number(contenants) || 0) < 1}
          onPress={() => void valider()}
        >
          {envoi ? "Enregistrement…" : "Ouvrir"}
        </Button>
      </Sheet>
    </Screen>
  );
}
