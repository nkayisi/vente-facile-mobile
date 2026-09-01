/**
 * Règlements en attente. Miroir de `app/dashboard/sales/pending-payments/page.tsx`.
 *
 * **Aucun total n'est sommé entre devises.** Le restant dû est rendu par
 * devise : additionner des francs et des dollars donne un nombre qui ne veut
 * rien dire, et c'est la correction que le back-office a dû s'appliquer.
 *
 * **Une facture déjà réglée hors ligne ne se propose plus.** Le règlement vit
 * dans le journal d'opérations tant que le serveur ne l'a pas confirmé, et la
 * table tirée, elle, ne bouge pas. Sans cette lecture du journal, le caissier
 * verrait la facture inchangée et l'encaisserait une seconde fois - avec deux
 * reçus, deux numéros, et un client qui a payé une fois.
 */
import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { formatDateFr } from "@vente-facile/core";

import { useMonnaie } from "@/data/devises";
import { useLecture } from "@/data/live";
import { STATUT_VENTE, reglementsEnAttente, type VenteResume } from "@/data/ventes";
import { ventesAvecReglementEnAttente } from "@/features/ventes/actes";
import {
  AppBar,
  Badge,
  Card,
  DataList,
  DataRow,
  MultiCurrencyTotal,
  Screen,
  SearchInput,
  StatStrip,
  StatStripItem,
  Text,
} from "@/ui";

const TABLES = ["sales", "customers"];

export default function Reglements() {
  const money = useMonnaie();
  const [recherche, setRecherche] = useState("");

  const { donnees } = useLecture(() => reglementsEnAttente(recherche), {
    tables: TABLES,
    deps: [recherche],
  });
  const { donnees: dejaEnFile } = useLecture(ventesAvecReglementEnAttente, {
    tables: ["outbox_operations"],
  });

  const ventes = donnees?.ventes ?? [];

  const enTete = (
    <View className="gap-4 px-4 pb-3 pt-2">
      {/* L'ARGENT D'ABORD. Cet écran répond à « combien reste-t-il à
          encaisser » ; les quatre décomptes disent ensuite comment ce montant
          se répartit. Le total arrivait TROISIÈME, sous quatre nombres sans
          unité, à l'endroit où l'œil ne cherche pas un montant. */}
      <Card>
        <Text variant="caption" className="mb-1">
          Restant dû
        </Text>
        {/* Neutre, comme au back-office. Ce total n'est pas une anomalie :
            c'est le chiffre d'affaires qui reste à rentrer, sur un écran où
            TOUT est en attente. Peindre en rouge la raison d'être de l'écran
            use le rouge, et il ne reste plus rien pour le vrai retard - qui
            est, lui, compté juste en dessous. */}
        <MultiCurrencyTotal
          lignes={donnees?.duParDevise ?? []}
          money={money.money}
          vide="Rien à encaisser"
        />
      </Card>

      <StatStrip>
        <StatStripItem
          label="Factures"
          value={String(ventes.length)}
          icon="Receipt"
        />
        <StatStripItem
          label="En attente"
          value={String(donnees?.enAttente ?? 0)}
          icon="Clock"
        />
        <StatStripItem
          label="Partielles"
          value={String(donnees?.partiellementPayees ?? 0)}
          icon="Coins"
        />
        <StatStripItem
          label="En retard"
          value={String(donnees?.enRetard ?? 0)}
          icon="AlertTriangle"
          tone={donnees?.enRetard ? "alert" : undefined}
        />
      </StatStrip>

      <SearchInput
        valeur={recherche}
        onChange={setRecherche}
        placeholder="Rechercher par référence ou client..."
      />
    </View>
  );

  const rendu = (v: VenteResume) => {
    const s = STATUT_VENTE[v.statut];
    const enFile = dejaEnFile?.has(v.id) ?? false;
    return (
      <DataRow
        principal={v.reference}
        secondaire={[v.client ?? "Client anonyme", v.date ? formatDateFr(v.date) : null]
          .filter(Boolean)
          .join(" · ")}
        badge={
          enFile ? (
            <Badge tone="warning">Règlement en attente d'envoi</Badge>
          ) : s ? (
            <Badge tone={s.ton}>{s.label}</Badge>
          ) : undefined
        }
        valeur={
          // Orange, comme le « Reste à payer » du back-office et comme la
          // liste du hub. Le rouge y était déclaré depuis toujours et ne
          // s'était jamais VU : `text-destructive` passé en `className`
          // perdait contre la couleur de la variante (voir `ui/classes.ts`).
          <Text numeric variant="body" className="font-sans-medium text-warning">
            {money.money(v.resteAPayer, v.devise)}
          </Text>
        }
        sousValeur={`sur ${money.money(v.total, v.devise)}`}
        onPress={() => router.push(`/vente/${v.id}`)}
      />
    );
  };

  return (
    <Screen padded={false}>
      <AppBar
        title="Règlements en attente"
        subtitle="Factures en attente et partiellement payées"
      />
      <DataList
        donnees={ventes}
        cle={(v) => v.id}
        rendu={rendu}
        enTete={enTete}
        vide={{
          icon: "CheckCircle2",
          titre: "Rien à encaisser",
          message: recherche
            ? "Aucune facture ne correspond à votre recherche."
            : "Toutes les factures sont soldées.",
        }}
      />
    </Screen>
  );
}
