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
import { formatDateFr } from "@vente-facile/core";

import {
  PERIMETRE_INVENTAIRE,
  STATUT_INVENTAIRE,
  listeSessions,
  relevesInventaire,
  type SessionResume,
} from "@/data/inventaire";
import { libelleEnvoi, pireEnvoi } from "@/data/envoi";
import { useLecture } from "@/data/live";
import { FeuilleFiltresPerimetre } from "@/features/perimetre/feuille-perimetre";
import {
  nombreDeFiltresPerimetre,
  PERIMETRE_VIDE,
  resumeDuPerimetre,
  sansLeFiltrePerimetre,
  type FiltrePerimetre,
} from "@/features/perimetre/filtre-perimetre";
import { usePerimetre } from "@/features/perimetre/use-perimetre";
import { creationsEnAttente, sessionsEnAttente } from "@/features/inventaire/actes";
import { FeuilleNouvelInventaire } from "@/features/inventaire/feuille-session";
import { BandeauEnvoi } from "@/features/sync/bandeau-envoi";
import { useSession } from "@/session/provider";
import {
  Badge, Chip, ChipRow, DataList, DataRow, Fab, PageHeader, Screen,
  BoutonFiltres,
  SearchInput, StatStrip, StatStripItem, Text,
} from "@/ui";

const TABLES = ["inventory_sessions", "inventory_counts", "warehouses"];

export default function Inventaire() {
  const { can } = useSession();
  const [recherche, setRecherche] = useState("");
  const [statut, setStatut] = useState<string | null>(null);
  // La feuille est rendue CONDITIONNELLEMENT : chaque ouverture est un
  // montage, donc un formulaire vierge, sans effet de remise à zéro à tenir en
  // phase avec les champs qu'on ajoutera.
  const [creation, setCreation] = useState(false);

  // ENTREPÔT SEUL : cette donnée n'a pas d'auteur au sens du filtre.
  // `avecAuteur: false` ferme le champ « Utilisateur » AVEC son motif,
  // plutôt que de le retirer - un contrôle absent se lit comme une
  // fonction manquante, un contrôle fermé se lit comme une règle.
  const [choixPerimetre, setChoixPerimetre] = useState<FiltrePerimetre>(PERIMETRE_VIDE);
  const [feuillePerimetre, setFeuillePerimetre] = useState(false);
  const perimetre = usePerimetre(choixPerimetre, false);
  const applique = perimetre.applique;

  const charger = useCallback(
    () => listeSessions({ recherche, statut, entrepot: applique.entrepot }),
    [recherche, statut, applique]
  );
  const { donnees, chargement } = useLecture(charger, {
    tables: TABLES,
    deps: [recherche, statut, applique],
  });
  const { donnees: enFile } = useLecture(sessionsEnAttente, {
    tables: ["outbox_operations"],
  });
  const { donnees: creations } = useLecture(creationsEnAttente, {
    tables: ["outbox_operations"],
  });
  const { donnees: releves } = useLecture(relevesInventaire, {
    tables: ["inventory_sessions"],
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

  /**
   * L'état d'envoi le PIRE de toutes les sessions qui attendent.
   *
   * Un seul bandeau, en tête, et pas un bouton par rangée : vingt boutons
   * « Synchroniser » dans une liste sont vingt fois le même geste. Et c'est le
   * pire qui s'annonce - dire « attend son envoi » sur un lot dont une pièce
   * est bloquée ferait attendre un réseau qui ne débloquera rien.
   */
  const attentes = [...(enFile?.values() ?? [])].map((a) => a.envoi);
  const envoiGlobal = attentes.length > 0 ? pireEnvoi(attentes) : undefined;

  const enTete = (
    <View className="gap-3 px-4 pb-3 pt-2">
      <PageHeader
        title="Inventaire"
        subtitle="Gérez vos sessions d'inventaire et comptages de stock"
      />
      <BandeauEnvoi
        envoi={envoiGlobal}
        titre={
          attentes.length === 1
            ? "Une session attend son envoi"
            : `${attentes.length} sessions attendent leur envoi`
        }
        consequence="Leur statut ne changera qu'après."
      />
      {/* Les quatre relevés du back-office, mais comptés sur TOUTE la table :
          les siens portent sur la page affichée et sont faux dès la page 2. */}
      <StatStrip>
        <StatStripItem
          label="En cours"
          value={String(releves?.enCours ?? 0)}
          icon="Activity"
          tone={releves?.enCours ? "accent" : "neutral"}
        />
        <StatStripItem
          label="En révision"
          value={String(releves?.enRevision ?? 0)}
          icon="Eye"
          tone={releves?.enRevision ? "warn" : "neutral"}
        />
        <StatStripItem
          label="Brouillons"
          value={String(releves?.brouillons ?? 0)}
          icon="Clock"
        />
        <StatStripItem
          label="Validés"
          value={String(releves?.valides ?? 0)}
          icon="CheckCircle2"
        />
      </StatStrip>
      <View className="flex-row items-center gap-2">
        <View className="flex-1">
          <SearchInput
            valeur={recherche}
            onChange={setRecherche}
            placeholder="Rechercher une session..."
          />
        </View>
        <BoutonFiltres
          actifs={nombreDeFiltresPerimetre(perimetre)}
          onPress={() => setFeuillePerimetre(true)}
        />
      </View>

      {resumeDuPerimetre(perimetre).length > 0 ? (
        <ChipRow>
          {resumeDuPerimetre(perimetre).map((puce) => (
            <Chip
              key={puce.cle}
              label={puce.label}
              actif
              onPress={() =>
                setChoixPerimetre(sansLeFiltrePerimetre(choixPerimetre, puce.cle))
              }
            />
          ))}
        </ChipRow>
      ) : null}
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
    // « En attente d'envoi » était écrit en orange EN DUR : sur une opération
    // bloquée, c'était le mot faux dans la couleur fausse. Une file est
    // normale et partira seule ; un blocage attend une décision.
    const envoi = libelleEnvoi(enFile?.get(s.id)?.envoi);
    return (
      <DataRow
        principal={s.nom}
        secondaire={[s.reference, s.entrepot, s.perimetreLabel]
          .filter(Boolean)
          .join(" · ")}
        badge={
          envoi ? (
            <Badge tone={envoi.ton === "warning" ? "warning" : "neutral"}>
              {envoi.court}
            </Badge>
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
        vide={
          recherche || statut
            ? {
                icon: "Filter",
                titre: "Aucun résultat",
                message: recherche
                  ? "Aucun inventaire ne correspond à votre recherche."
                  : "Aucun inventaire dans cet état.",
                action: {
                  label: "Voir tous les inventaires",
                  onPress: () => {
                    setRecherche("");
                    setStatut(null);
                  },
                },
              }
            : {
                icon: "ClipboardList",
                titre: "Aucun inventaire",
                message:
                  "Créez un inventaire pour compter votre stock, rayon par rayon.",
              }
        }
      />
      {can("inventory.create") ? (
        <Fab
          icon="Plus"
          label="Nouvel inventaire"
          onPress={() => setCreation(true)}
        />
      ) : null}

      {creation ? (
        <FeuilleNouvelInventaire
          onFermer={() => setCreation(false)}
          onCree={(id) => {
            setCreation(false);
            router.push(`/comptage/${id}`);
          }}
        />
      ) : null}
      <FeuilleFiltresPerimetre
        ouvert={feuillePerimetre}
        onFermer={() => setFeuillePerimetre(false)}
        valeur={choixPerimetre}
        onChanger={setChoixPerimetre}
        offre={perimetre}
        libelleResultats="Voir les sessions"
      />
    </Screen>
  );
}
