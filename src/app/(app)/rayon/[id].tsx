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
import {
  formatDateTimeFr,
  formatPrice,
  formatUnitQuantity,
  pluralizeUnit,
} from "@vente-facile/core";

import { lireNombre } from "@/data/nombres";

import { useLecture } from "@/data/live";
import { ETAT_STOCK, detailNiveau } from "@/data/stock-niveaux";
import { deconditionner, enAttenteSurStock } from "@/features/stock/actes";
import { BandeauEnvoi } from "@/features/sync/bandeau-envoi";
import { useSession } from "@/session/provider";
import {
  AppBar,
  Badge,
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
  const envoiEnFile = attente?.deconditionnements.get(r.id);

  /**
   * ┌────────────────────────────────────────────────────────────────────────┐
   * │ DEUX LECTURES DIVERGEAIENT, ET LE BOUTON MENTAIT.                      │
   * │                                                                        │
   * │ La validation faisait `replace(",", ".")`, le bouton non : taper       │
   * │ « 1,5 » laissait le bouton FERMÉ (`Number("1,5")` rend `NaN`) alors     │
   * │ que la validation l'aurait accepté. Une seule lecture désormais, et    │
   * │ c'est `lireNombre`, comme les onze autres écrans de quantité.          │
   * │                                                                        │
   * │ ⚠ `Math.floor` RESTE LÉGITIME ici, et c'est le seul endroit du lot où  │
   * │ une quantité reste entière : on ouvre des contenants ENTIERS, un demi- │
   * │ carton ne s'ouvre pas. Mais le refus se DIT au lieu d'arrondir en      │
   * │ silence - arrondir « 2,7 » à 2 sans un mot ferait ouvrir moins que     │
   * │ demandé, et le magasinier ne le verrait qu'au comptage suivant.        │
   * └────────────────────────────────────────────────────────────────────────┘
   */
  const lecture = lireNombre(contenants);
  const nContenants = lecture.ok ? (lecture.valeur ?? 0) : 0;
  const refusSaisie = !lecture.ok
    ? lecture.motif === "negatif"
      ? "On n'ouvre pas un nombre négatif de contenants."
      : "Nombre illisible. Écrivez par exemple 2."
    : nContenants > 0 && nContenants % 1 !== 0
      ? "On ouvre des contenants entiers : un contenant entamé est déjà du vrac."
      : null;

  const valider = async () => {
    if (envoi || refusSaisie || nContenants < 1) return;
    setEnvoi(true);
    try {
      await deconditionner(r.id, nContenants);
      toast.succes(
        `Ouverture de ${formatUnitQuantity(nContenants, r.uniteContenant ?? "contenant")} mise en file.`
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
        <BandeauEnvoi
          envoi={envoiEnFile}
          titre="Un déconditionnement attend son envoi"
          consequence="Le rayon ci-dessous ne le prendra en compte qu'après."
        />

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
            <Paire label="Total en unités" valeur={`${formatUnitQuantity(r.total, r.uniteDetail ?? "unité")}`} />
            {/* Le réservé n'est PAS ventilé : une réservation ne porte pas sur
                des contenants précis. Le libellé nomme l'unité pour que
                personne n'y lise des casiers. */}
            <Paire
              label="Réservé (unités)"
              valeur={
                r.reserve > 0
                  ? `${formatUnitQuantity(r.reserve, r.uniteDetail ?? "unité")}`
                  : "Rien"
              }
            />
            {r.facteur ? (
              <Paire
                label="Conditionnement"
                valeur={`${formatUnitQuantity(r.facteur, r.uniteDetail ?? "unité")} par ${r.uniteContenant ?? "contenant"}`}
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
          {`${formatUnitQuantity(r.contenants, r.uniteContenant ?? "contenant")} scellés, ${formatUnitQuantity(r.vrac, r.uniteDetail ?? "unité")} au détail.`}
        </Text>
        <FormField
          label="Combien en ouvrir ?"
          required
          error={refusSaisie ?? undefined}
          hint={
            r.facteur
              ? `Chacun libère ${formatUnitQuantity(r.facteur, r.uniteDetail ?? "unité")}.`
              : undefined
          }
        >
          <Input
            value={contenants}
            onChangeText={setContenants}
            keyboardType="number-pad"
            invalid={!!refusSaisie}
            autoFocus
          />
        </FormField>
        <Button
          fullWidth
          size="lg"
          disabled={envoi || !!refusSaisie || nContenants < 1}
          onPress={() => void valider()}
        >
          {envoi ? "Enregistrement…" : "Ouvrir"}
        </Button>
      </Sheet>
    </Screen>
  );
}
