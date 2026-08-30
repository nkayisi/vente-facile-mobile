/**
 * Inventaire. Miroir de `app/dashboard/inventory/page.tsx`.
 *
 * C'est le meilleur usage mobile du produit : on compte debout dans le rayon,
 * le terminal à la main. La liste ouvre la feuille de comptage, qui est
 * descendue avec sa session et s'ouvre donc hors ligne.
 */
import { useCallback, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { formatDateFr } from "@vente-facile/core";

import {
  PERIMETRE_INVENTAIRE,
  STATUT_INVENTAIRE,
  listeSessions,
  type SessionResume,
} from "@/data/inventaire";
import { useLecture } from "@/data/live";
import { creationsEnAttente, sessionsEnAttente } from "@/features/inventaire/actes";
import { useSession } from "@/session/provider";
import {
  Badge, Chip, ChipRow, DataList, DataRow, Fab, PageHeader, Screen,
  SearchInput, Text,
} from "@/ui";

const TABLES = ["inventory_sessions", "inventory_counts", "warehouses"];

/** Hauteur de la barre d'onglets, hors zone sûre. Mesurée sur l'émulateur. */
const HAUTEUR_ONGLETS = 56;

export default function Inventaire() {
  const { can } = useSession();
  const insets = useSafeAreaInsets();
  const [recherche, setRecherche] = useState("");
  const [statut, setStatut] = useState<string | null>(null);

  const charger = useCallback(
    () => listeSessions({ recherche, statut }),
    [recherche, statut]
  );
  const { donnees, chargement } = useLecture(charger, {
    tables: TABLES,
    deps: [recherche, statut],
  });
  const { donnees: enFile } = useLecture(sessionsEnAttente, {
    tables: ["outbox_operations"],
  });
  const { donnees: creations } = useLecture(creationsEnAttente, {
    tables: ["outbox_operations"],
  });

  // Les sessions créées ici ne sont PAS dans la table tirée. Sans cette
  // fusion, le magasinier ne retrouverait pas celle qu'il vient de créer.
  const terme = recherche.trim().toLowerCase();
  const nonSynchronisees: SessionResume[] = (creations ?? [])
    .filter((c) => !terme || c.nom.toLowerCase().includes(terme))
    .map((c) => ({
      id: c.id,
      reference: "—",
      nom: c.nom,
      entrepot: null,
      statut: "draft",
      perimetre: c.perimetre,
      perimetreLabel: PERIMETRE_INVENTAIRE[c.perimetre] ?? c.perimetre,
      comptees: 0,
      lignes: 0,
      date: null,
    }));
  const elements = [...nonSynchronisees, ...(donnees?.elements ?? [])];

  const enTete = (
    <View className="gap-3 px-4 pb-3 pt-2">
      <PageHeader
        title="Inventaire"
        subtitle="Gérez vos sessions d'inventaire et comptages de stock"
      />
      <SearchInput
        valeur={recherche}
        onChange={setRecherche}
        placeholder="Rechercher une session..."
      />
      <ChipRow>
        <Chip label="Toutes" actif={statut === null} onPress={() => setStatut(null)} />
        {Object.entries(STATUT_INVENTAIRE).map(([code, s]) => (
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

  const rendu = (s: SessionResume) => {
    const st = STATUT_INVENTAIRE[s.statut];
    return (
      <DataRow
        principal={s.nom}
        secondaire={[s.reference, s.entrepot, s.perimetreLabel]
          .filter(Boolean)
          .join(" · ")}
        badge={
          enFile?.has(s.id) ? (
            <Badge tone="warning">En attente d&apos;envoi</Badge>
          ) : st ? (
            <Badge tone={st.ton}>{st.label}</Badge>
          ) : undefined
        }
        valeur={
          <Text variant="bodySmall" numeric className="font-sans-medium">
            {/* L'avancement, pas un total : c'est ce que le magasinier
                cherche en rouvrant une session. */}
            {s.lignes > 0 ? `${s.comptees} / ${s.lignes}` : "—"}
          </Text>
        }
        sousValeur={s.date ? formatDateFr(s.date) : null}
        onPress={() => router.push(`/comptage/${s.id}`)}
      />
    );
  };

  return (
    <Screen edges={[]} padded={false}>
      <DataList
        donnees={elements}
        cle={(s) => s.id}
        rendu={rendu}
        enTete={enTete}
        chargement={chargement && elements.length === 0}
        vide={{
          icon: "ClipboardList",
          titre: "Aucune session",
          message: recherche
            ? "Aucune session ne correspond à votre recherche."
            : "Créez une session pour compter votre stock, rayon par rayon.",
        }}
      />
      {can("inventory.create") ? (
        <Fab
          icon="Plus"
          label="Nouvelle"
          // La barre d'onglets, plus la zone sûre QU'ELLE PORTE : sur un
          // iPhone, elle s'étire de l'indicateur d'accueil et mesure donc
          // trente-quatre points de plus qu'ici. Poser 56 en dur y placerait
          // le bouton SUR les onglets. `Screen` n'y peut rien : un écran
          // d'onglet passe `edges={[]}`, sans quoi il laisserait une bande
          // vide au-dessus de la barre.
          offsetBas={HAUTEUR_ONGLETS + insets.bottom}
          onPress={() => router.push("/comptage/nouveau")}
        />
      ) : null}
    </Screen>
  );
}
