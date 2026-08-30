/**
 * Retours de vente.
 *
 * **Premier écran de retours de tout le produit** : le backend est complet
 * depuis longtemps, et ni le web ni le mobile ne les affichaient. Un retour se
 * crée depuis la vente concernée, jamais d'ici : il faut savoir CE QUI est
 * rendu, et cela se lit sur la facture.
 */
import { useCallback, useState } from "react";
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
  SearchInput, StatValue,
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
  const { donnees, chargement } = useLecture(charger, {
    tables: TABLES,
    deps: [recherche, statut],
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
      devise: "",
      motif: c.motif,
      date: c.date,
    }));

  const retours = [...nonSynchronises, ...(donnees ?? [])];

  const enTete = (
    <View className="gap-3 px-4 pb-3 pt-2">
      <SearchInput
        valeur={recherche}
        onChange={setRecherche}
        placeholder="Rechercher une référence..."
      />
      <ChipRow>
        <Chip label="Tous" actif={statut === null} onPress={() => setStatut(null)} />
        {Object.entries(STATUT_RETOUR).map(([code, s]) => (
          <Chip
            key={code}
            label={s.label}
            actif={statut === code}
            onPress={() => setStatut(code)}
          />
        ))}
      </ChipRow>
      <Banner
        tone="info"
        title="Un retour se crée depuis sa vente"
        message="Il faut savoir ce qui est rendu, et cela se lit sur la facture. Ouvrez la vente concernée, puis « Enregistrer un retour »."
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
        valeur={<StatValue value={money.money(r.montant, devise)} />}
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
