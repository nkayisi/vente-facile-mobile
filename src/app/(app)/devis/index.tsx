/**
 * Devis. Premier écran de devis de tout le produit.
 *
 * **Un devis PÉRIMÉ se dit tout de suite.** Le serveur les passe en `expired`
 * par tâche ; entre-temps, la date fait foi. Afficher « valide » un devis que
 * la conversion refusera ferait perdre du temps au comptoir, devant le client.
 *
 * **« Nouveau » ouvre une FEUILLE, pas un écran.** Créer n'est pas naviguer :
 * la liste reste derrière, et l'on referme d'un appui à côté. Voir
 * `features/ventes/feuille-devis.tsx`, qui porte le formulaire et le motif.
 *
 * **Les puces portent leur DÉCOMPTE, et les vides disparaissent.** Un terminal
 * ne produit ni devis refusé ni devis expiré tant que le serveur ne l'a pas
 * décidé : quatre puces qui répondent « aucun devis » apprennent à ne plus
 * lire la rangée, et on n'y voit plus non plus celles qui comptent. Le
 * décompte est calculé SANS le filtre de statut, sinon toutes les puces sauf
 * l'active tomberaient à zéro - et une puce à zéro se lit « il n'y en a pas »,
 * pas « vous ne les regardez pas ».
 */
import { useCallback, useMemo, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { formatDateFr } from "@vente-facile/core";

import { useMonnaie } from "@/data/devises";
import { useLecture } from "@/data/live";
import { STATUT_DEVIS, listeDevis, type DevisResume } from "@/data/retours-devis";
import {
  creationsEnAttente,
  enAttenteRetoursDevis,
} from "@/features/ventes/retours-devis";
import { FeuilleNouveauDevis } from "@/features/ventes/feuille-devis";
import { useSession } from "@/session/provider";
import {
  AppBar, Badge, Chip, ChipRow, DataList, DataRow, Fab, Screen, SearchInput,
  Mesure,
} from "@/ui";

const TABLES = ["quotations", "quotation_items", "customers"];

export default function Devis() {
  const money = useMonnaie();
  const { can } = useSession();
  const [recherche, setRecherche] = useState("");
  const [statut, setStatut] = useState<string | null>(null);
  const [creation, setCreation] = useState(false);

  const charger = useCallback(
    () => listeDevis({ recherche, statut }),
    [recherche, statut]
  );
  const { donnees, chargement, recharger } = useLecture(charger, {
    tables: TABLES,
    deps: [recherche, statut],
  });

  // Le décompte des puces ignore le filtre de STATUT et suit la recherche :
  // c'est ce qui rend « Converti (3) » lisible pendant qu'on regarde les
  // brouillons.
  const chargerTous = useCallback(
    () => listeDevis({ recherche, statut: null }),
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

  // Même règle que partout : un devis créé ici vit dans le JOURNAL, pas dans
  // `quotations`. Sans cette fusion, il disparaîtrait jusqu'à la
  // synchronisation, et le commerçant le referait.
  const nonSynchronises: DevisResume[] = (creations?.devis ?? [])
    .filter(() => !recherche.trim() && !statut)
    .map((c) => ({
      id: c.id,
      reference: "Référence à venir",
      client: null,
      statut: "draft",
      total: c.montant,
      date: c.date,
      valideJusquau: c.valideJusquau ? new Date(c.valideJusquau) : null,
      // Un devis tout juste créé n'est pas périmé : sa validité part
      // d'aujourd'hui. Le calculer ici éviterait tout au plus un cas absurde.
      perime: false,
    }));

  const devis = [...nonSynchronises, ...(donnees ?? [])];

  const decomptes = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of tous ?? []) m.set(d.statut, (m.get(d.statut) ?? 0) + 1);
    return m;
  }, [tous]);
  const totalTousStatuts = (tous?.length ?? 0) + nonSynchronises.length;

  const enTete = (
    <View className="gap-3 px-4 pb-3 pt-2">
      <SearchInput
        valeur={recherche}
        onChange={setRecherche}
        placeholder="Rechercher une référence ou un client..."
      />
      <ChipRow>
        <Chip
          label={`Tous (${totalTousStatuts})`}
          actif={statut === null}
          onPress={() => setStatut(null)}
        />
        {Object.entries(STATUT_DEVIS).map(([code, s]) => {
          const n = decomptes.get(code) ?? 0;
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
    </View>
  );

  const rendu = (d: DevisResume) => {
    const s = STATUT_DEVIS[d.statut];
    return (
      <DataRow
        principal={d.reference}
        secondaire={[d.client ?? "Sans client", d.date ? formatDateFr(d.date) : null]
          .filter(Boolean)
          .join(" · ")}
        badge={
          attente?.devis.has(d.id) ? (
            <Badge tone="warning">En attente d&apos;envoi</Badge>
          ) : d.perime ? (
            <Badge tone="warning">Périmé</Badge>
          ) : s ? (
            <Badge tone={s.ton}>{s.label}</Badge>
          ) : undefined
        }
        valeur={<Mesure value={money.money(d.total, money.primaryCode)} />}
        sousValeur={
          d.valideJusquau ? `Jusqu'au ${formatDateFr(d.valideJusquau)}` : null
        }
        onPress={() => router.push(`/devis/${d.id}`)}
      />
    );
  };

  return (
    <Screen padded={false}>
      <AppBar title="Devis" subtitle="Propositions de prix, converties en vente" />
      <DataList
        donnees={devis}
        cle={(d) => d.id}
        rendu={rendu}
        enTete={enTete}
        onRefresh={recharger}
        chargement={chargement && devis.length === 0}
        vide={{
          icon: "FileText",
          titre: "Aucun devis",
          message: recherche
            ? "Aucun devis ne correspond à votre recherche."
            : "Créez un devis pour proposer un prix sans engager le stock.",
        }}
      />
      {can("sales.create") ? (
        <Fab icon="Plus" label="Nouveau" onPress={() => setCreation(true)} />
      ) : null}

      {/* Rendue CONDITIONNELLEMENT : chaque ouverture est un montage, donc un
          formulaire vierge, sans effet de remise à zéro à tenir en phase avec
          les champs. Voir `features/ventes/feuille-devis.tsx`. */}
      {creation ? (
        <FeuilleNouveauDevis
          onFermer={() => setCreation(false)}
          onCree={(id) => {
            setCreation(false);
            router.push(`/devis/${id}`);
          }}
        />
      ) : null}
    </Screen>
  );
}
