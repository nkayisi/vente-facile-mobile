/**
 * Retours de vente.
 *
 * **Premier écran de retours de tout le produit** : le backend est complet
 * depuis longtemps, et ni le web ni le mobile ne les affichaient. Un retour se
 * crée depuis la vente concernée, jamais d'ici : il faut savoir CE QUI est
 * rendu, et cela se lit sur la facture.
 */
import { useCallback, useMemo, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { formatDateFr } from "@vente-facile/core";

import { useMonnaie } from "@/data/devises";
import { useLecture } from "@/data/live";
import { STATUT_RETOUR, listeRetours, type RetourResume } from "@/data/retours-devis";
import {
  creationsEnAttente,
  enAttenteRetoursDevis,
} from "@/features/ventes/retours-devis";
import {
  AppBar, Badge, Banner, Chip, ChipRow, DataList, DataRow, Screen,
  SearchInput, Mesure,
} from "@/ui";

const TABLES = ["sale_returns", "sale_return_items", "sales"];

export default function Retours() {
  const money = useMonnaie();
  const [recherche, setRecherche] = useState("");
  const [statut, setStatut] = useState<string | null>(null);

  const charger = useCallback(
    () => listeRetours({ recherche, statut }),
    [recherche, statut]
  );
  const { donnees, chargement, recharger } = useLecture(charger, {
    tables: TABLES,
    deps: [recherche, statut],
  });

  // Le décompte des puces ignore le filtre de STATUT et suit la recherche :
  // c'est ce qui rend « Approuvé (4) » lisible pendant qu'on regarde les
  // brouillons. Calculé AVEC le filtre, tout tomberait à zéro sauf l'actif -
  // et une puce à zéro se lit « il n'y en a pas », pas « vous ne les
  // regardez pas ».
  const chargerTous = useCallback(
    () => listeRetours({ recherche, statut: null }),
    [recherche]
  );
  const { donnees: tous } = useLecture(chargerTous, {
    tables: TABLES,
    deps: [recherche],
  });
  const { donnees: attente } = useLecture(enAttenteRetoursDevis, {
    tables: ["outbox_operations"],
  });
  const { donnees: creations } = useLecture(creationsEnAttente, {
    tables: ["outbox_operations"],
  });

  // ┌──────────────────────────────────────────────────────────────────────┐
  // │ LES RETOURS CRÉÉS ICI NE SONT PAS DANS LA TABLE TIRÉE, et ne doivent │
  // │ pas y être. Sans cette fusion, l'écran annonce « Aucun retour » à la  │
  // │ seconde où le bandeau vert dit « Retour enregistré ».                 │
  // └──────────────────────────────────────────────────────────────────────┘
  // Ils portent une référence en attente : le serveur la leur donnera.
  const terme = recherche.trim().toLowerCase();
  const nonSynchronises: RetourResume[] = (creations?.retours ?? [])
    .filter(() => !terme && !statut)
    .map((c) => ({
      id: c.id,
      reference: "Référence à venir",
      venteReference: null,
      statut: "draft",
      montant: c.montant,
      rembourse: c.montant,
      devise: money.primaryCode,
      motif: c.motif,
      date: c.date,
    }));

  const retours = [...nonSynchronises, ...(donnees ?? [])];

  const decomptes = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of tous ?? []) m.set(r.statut, (m.get(r.statut) ?? 0) + 1);
    return m;
  }, [tous]);
  const totalTousStatuts = (tous?.length ?? 0) + nonSynchronises.length;
  const aDecider = (decomptes.get("draft") ?? 0) + nonSynchronises.length;

  const enTete = (
    <View className="gap-3 px-4 pb-3 pt-2">
      <SearchInput
        valeur={recherche}
        onChange={setRecherche}
        placeholder="Rechercher une référence..."
      />
      <ChipRow>
        <Chip
          label={`Tous (${totalTousStatuts})`}
          actif={statut === null}
          onPress={() => setStatut(null)}
        />
        {Object.entries(STATUT_RETOUR).map(([code, s]) => {
          const n = code === "draft" ? aDecider : (decomptes.get(code) ?? 0);
          // La puce ACTIVE reste, même vidée par la recherche : la faire
          // disparaître sous le doigt laisserait une liste filtrée sans aucun
          // moyen de savoir par quoi.
          if (n === 0 && statut !== code) return null;
          return (
            <Chip
              key={code}
              label={`${s.label} (${n})`}
              actif={statut === code}
              onPress={() => setStatut(code)}
            />
          );
        })}
      </ChipRow>
      {/* ┌──────────────────────────────────────────────────────────────────┐
          │ CE BANDEAU DISAIT OÙ ALLER SANS Y MENER.                        │
          │                                                                  │
          │ « Ouvrez la vente concernée » est le bon conseil, et c'était un  │
          │ cul-de-sac : il n'y a aucun bouton « Nouveau » sur cet écran, et │
          │ pour cause - un retour se crée depuis sa facture. Restait à      │
          │ retrouver la vente à la main, en repassant par le hub. Le        │
          │ bandeau y conduit désormais.                                     │
          └──────────────────────────────────────────────────────────────────┘ */}
      <Banner
        tone="info"
        title="Un retour se crée depuis sa vente"
        message="Il faut savoir ce qui est rendu, et cela se lit sur la facture. Ouvrez la vente concernée, puis « Retour article »."
        action={{
          label: "Chercher une vente",
          onPress: () => router.push("/vente/historique"),
        }}
      />
    </View>
  );

  const rendu = (r: RetourResume) => {
    // La devise de la facture d'origine, ou la principale si la vente n'est
    // pas descendue : un montant sans symbole ne dit pas dans quoi il est.
    const devise = r.devise || money.primaryCode;
    const s = STATUT_RETOUR[r.statut];
    return (
      <DataRow
        principal={r.reference}
        secondaire={[r.venteReference, r.date ? formatDateFr(r.date) : null]
          .filter(Boolean)
          .join(" · ")}
        badge={
          attente?.retours.has(r.id) ? (
            <Badge tone="warning">En attente d&apos;envoi</Badge>
          ) : s ? (
            <Badge tone={s.ton}>{s.label}</Badge>
          ) : undefined
        }
        valeur={<Mesure value={money.money(r.montant, devise)} />}
        // Le REMBOURSÉ n'apparaît que s'il diffère du montant rendu : sur un
        // retour qui a éteint une dette, rien n'est sorti de la caisse.
        sousValeur={
          r.rembourse !== r.montant
            ? `Remboursé ${money.money(r.rembourse, devise)}`
            : null
        }
        onPress={() => router.push(`/retour/${r.id}`)}
      />
    );
  };

  return (
    <Screen padded={false}>
      <AppBar title="Retours" subtitle="Marchandise rendue par les clients" />
      <DataList
        donnees={retours}
        cle={(r) => r.id}
        rendu={rendu}
        enTete={enTete}
        onRefresh={recharger}
        chargement={chargement && retours.length === 0}
        vide={{
          icon: "PackageX",
          titre: "Aucun retour",
          message: recherche
            ? "Aucun retour ne correspond à votre recherche."
            : "Les retours enregistrés apparaîtront ici.",
        }}
      />
    </Screen>
  );
}
