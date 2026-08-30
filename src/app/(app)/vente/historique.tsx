/**
 * Historique des ventes. Miroir de `app/dashboard/sales/history/page.tsx`.
 *
 * Les filtres sont poussés dans le SQL, jamais appliqués après coup sur une
 * page déjà tronquée : le compteur du sous-titre annonce alors ce que la
 * requête a réellement trouvé, et non ce qui restait des cinquante dernières
 * lignes. C'est le défaut que le back-office a dû corriger sur ses niveaux de
 * stock, où l'export ne couvrait pas le même périmètre que l'écran.
 *
 * Les périodes suivent la définition du SERVEUR : « semaine » vaut les sept
 * derniers jours, « mois » du 1er à aujourd'hui. Les recalculer « logiquement »
 * ferait diverger le terminal du back-office sur le même établissement.
 */
import { useCallback, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { formatDateTimeFr } from "@vente-facile/core";

import { useMonnaie } from "@/data/devises";
import { useLecture } from "@/data/live";
import {
  STATUT_VENTE,
  historiqueVentes,
  type Periode,
  type VenteResume,
} from "@/data/ventes";
import {
  AppBar,
  Badge,
  Chip,
  ChipRow,
  DataList,
  DataRow,
  Screen,
  SearchInput,
  Segmented,
  StatValue,
} from "@/ui";

const TABLES = ["sales", "customers"];

const PERIODES: { valeur: Periode; label: string }[] = [
  { valeur: "jour", label: "Jour" },
  { valeur: "semaine", label: "7 jours" },
  { valeur: "mois", label: "Mois" },
  { valeur: "tout", label: "Tout" },
];

export default function Historique() {
  const money = useMonnaie();
  const [recherche, setRecherche] = useState("");
  const [periode, setPeriode] = useState<Periode>("semaine");
  const [statut, setStatut] = useState<string | null>(null);

  const charger = useCallback(
    () => historiqueVentes({ recherche, periode, statut, limite: 100 }),
    [recherche, periode, statut]
  );
  const { donnees, chargement } = useLecture(charger, {
    tables: TABLES,
    deps: [recherche, periode, statut],
  });

  const ventes = donnees?.elements ?? [];
  const total = donnees?.total ?? 0;

  const enTete = (
    <View className="gap-3 px-4 pb-3 pt-2">
      <SearchInput
        valeur={recherche}
        onChange={setRecherche}
        placeholder="Rechercher par référence ou client..."
      />
      <Segmented
        options={PERIODES.map((p) => ({ valeur: p.valeur, label: p.label }))}
        valeur={periode}
        onChange={(v) => setPeriode(v as Periode)}
      />
      {/* Les statuts DÉFILENT au lieu de se replier : sept pastilles sur trois
          lignes mangeraient la moitié de l'écran avant la première vente. */}
      <ChipRow>
        <Chip label="Tous" actif={statut === null} onPress={() => setStatut(null)} />
        {Object.entries(STATUT_VENTE).map(([code, s]) => (
          <Chip
            key={code}
            label={s.label}
            actif={statut === code}
            onPress={() => setStatut(code)}
          />
        ))}
      </ChipRow>
    </View>
  );

  const rendu = (v: VenteResume) => {
    const s = STATUT_VENTE[v.statut];
    return (
      <DataRow
        principal={v.reference}
        secondaire={[
          v.client ?? "Client anonyme",
          v.date ? formatDateTimeFr(v.date) : null,
        ]
          .filter(Boolean)
          .join(" · ")}
        badge={s ? <Badge tone={s.ton}>{s.label}</Badge> : undefined}
        valeur={<StatValue value={money.money(v.total, v.devise)} />}
        // Le restant dû ne s'affiche que s'il y en a un : « 0 FC à payer » sous
        // chaque vente soldée est du bruit qui masque les vraies créances.
        sousValeur={
          v.resteAPayer > 0 ? `Reste ${money.money(v.resteAPayer, v.devise)}` : null
        }
        onPress={() => router.push(`/vente/${v.id}`)}
      />
    );
  };

  return (
    <Screen padded={false}>
      <AppBar
        title="Historique des ventes"
        subtitle={`${total} ${total > 1 ? "ventes" : "vente"}`}
      />
      <DataList
        donnees={ventes}
        cle={(v) => v.id}
        rendu={rendu}
        enTete={enTete}
        chargement={chargement && ventes.length === 0}
        vide={{
          icon: "Receipt",
          titre: "Aucune vente",
          message:
            recherche || statut
              ? "Aucune vente ne correspond à vos critères."
              : "Aucune vente sur cette période.",
        }}
      />
    </Screen>
  );
}
