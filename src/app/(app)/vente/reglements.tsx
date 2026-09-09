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
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CET ÉCRAN NE SE LIT PAS, IL SE TRAITE.                                   │
 * │                                                                          │
 * │ On y descend la liste et on appelle. Il était présenté comme un rapport :│
 * │ un cadran de QUATRE décomptes dont trois disaient la même chose          │
 * │ (« Factures » = « En attente » + « Partielles »), et un quatrième,       │
 * │ « En retard », qui ne menait NULLE PART - aucune ligne ne portait son    │
 * │ échéance, et la liste était triée par date de vente, donc la facture qui │
 * │ traîne depuis trois semaines se trouvait tout en bas.                    │
 * │                                                                          │
 * │ Les décomptes deviennent des FILTRES : un nombre qui appelle une action  │
 * │ doit être là où l'on tape (c'est la règle déjà posée sur les tuiles du   │
 * │ hub). Le retard passe devant, le plus ancien en tête, et chaque ligne    │
 * │ dit de combien elle est en retard. Reste au-dessus le seul chiffre qui   │
 * │ n'est pas un filtre, parce qu'il n'a pas de liste à ouvrir : l'argent.   │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { formatDateFr } from "@vente-facile/core";

import { useMonnaie } from "@/data/devises";
import { useLecture } from "@/data/live";
import {
  STATUT_VENTE,
  duParDevise,
  reglementsEnAttente,
  type VenteResume,
} from "@/data/ventes";
import { ventesAvecReglementEnAttente } from "@/features/ventes/actes";
import {
  AppBar,
  Badge,
  Chip,
  ChipRow,
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

type Filtre = "toutes" | "attente" | "partielles" | "retard";

/**
 * « d'1 j » et non « de 1 j ».
 *
 * Le nombre est petit et la phrase courte : l'élision s'entend, et une faute
 * sur un écran qu'on lit dix fois par jour finit par être la seule chose qu'on
 * y voit.
 */
function libelleRetard(jours: number): string {
  return jours === 1 ? "En retard d'1 j" : `En retard de ${jours} j`;
}

export default function Reglements() {
  const money = useMonnaie();
  const [recherche, setRecherche] = useState("");
  const [filtre, setFiltre] = useState<Filtre>("toutes");

  const { donnees } = useLecture(() => reglementsEnAttente(recherche), {
    tables: TABLES,
    deps: [recherche],
  });
  const { donnees: dejaEnFile } = useLecture(ventesAvecReglementEnAttente, {
    tables: ["outbox_operations"],
  });

  const toutes = donnees?.ventes ?? [];
  const enRetard = toutes.filter((v) => (v.joursDeRetard ?? 0) > 0);
  const ventes = toutes.filter((v) => {
    if (filtre === "attente") return v.statut === "pending";
    if (filtre === "partielles") return v.statut === "partially_paid";
    if (filtre === "retard") return (v.joursDeRetard ?? 0) > 0;
    return true;
  });

  const enTete = (
    <View className="gap-3 px-4 pb-3 pt-2">
      {/* ┌──────────────────────────────────────────────────────────────┐
          │ DEUX CHIFFRES, ET C'EST TOUT CE QUE CET ÉCRAN A À LIRE.      │
          │                                                              │
          │ Combien reste-t-il, et combien est DÉJÀ EN RETARD. Le second │
          │ est la seule vraie mauvaise nouvelle de la page, et il       │
          │ n'était écrit nulle part - le décompte « En retard » disait  │
          │ un nombre de factures, jamais un montant, alors qu'on décide │
          │ de relancer sur des sommes.                                  │
          │                                                              │
          │ La grammaire est celle du cadran du hub : libellé au-dessus, │
          │ icône DANS la ligne du libellé, valeur en dessous sur toute  │
          │ la largeur de la cellule. C'est ce qui protège les montants  │
          │ longs, et un montant en CDF à sept chiffres l'est.           │
          │                                                              │
          │ Les deux valeurs sont GLOBALES et ne suivent pas les filtres.│
          │ Un cadran est une référence : s'il bougeait à chaque puce,   │
          │ on perdrait le chiffre auquel on compare, et sous « En       │
          │ retard » les deux cellules afficheraient deux fois le même   │
          │ montant. Ce sont les puces qui découpent la LISTE.           │
          └──────────────────────────────────────────────────────────────┘ */}
      <StatStrip>
        <StatStripItem label="Restant dû" icon="Banknote">
          {/* Neutre, comme au back-office. Ce total n'est pas une anomalie :
              c'est le chiffre d'affaires qui reste à rentrer, sur un écran où
              TOUT est en attente. Peindre en rouge la raison d'être de la page
              use le rouge, et il n'en reste plus pour le vrai retard. */}
          <MultiCurrencyTotal
            lignes={duParDevise(toutes)}
            money={money.money}
          />
        </StatStripItem>
        <StatStripItem
          label="Dont en retard"
          icon="AlertTriangle"
          tone={enRetard.length > 0 ? "alert" : "neutral"}
        >
          {/* Un « 0 » en rouge crie pour rien, et à force on ne voit plus le
              vrai rouge : sans retard, la cellule est neutre et le dit. */}
          <MultiCurrencyTotal
            lignes={duParDevise(enRetard)}
            money={money.money}
            tone={enRetard.length > 0 ? "destructive" : "foreground"}
          />
        </StatStripItem>
      </StatStrip>

      <SearchInput
        valeur={recherche}
        onChange={setRecherche}
        placeholder="Rechercher par référence ou client..."
      />

      {/* Les décomptes PORTENT le filtre : on tape sur le nombre qui inquiète.
          « En retard » garde sa place même à zéro - une puce qui disparaît
          quand tout va bien laisse croire que le filtre n'existe pas, et c'est
          celui qu'on cherche en premier le jour où il compte. */}
      <ChipRow>
        <Chip
          label={`Toutes (${toutes.length})`}
          actif={filtre === "toutes"}
          onPress={() => setFiltre("toutes")}
        />
        <Chip
          label={`En attente (${donnees?.enAttente ?? 0})`}
          actif={filtre === "attente"}
          onPress={() => setFiltre("attente")}
        />
        <Chip
          label={`Partielles (${donnees?.partiellementPayees ?? 0})`}
          actif={filtre === "partielles"}
          onPress={() => setFiltre("partielles")}
        />
        <Chip
          label={`En retard (${donnees?.enRetard ?? 0})`}
          icon="AlertTriangle"
          actif={filtre === "retard"}
          onPress={() => setFiltre("retard")}
        />
      </ChipRow>
    </View>
  );

  const rendu = (v: VenteResume) => {
    const s = STATUT_VENTE[v.statut];
    const enFile = dejaEnFile?.has(v.id) ?? false;
    const retard = v.joursDeRetard ?? 0;
    return (
      <DataRow
        principal={v.reference}
        // L'ÉCHÉANCE prime sur la date de vente : c'est elle qui décide s'il
        // faut appeler aujourd'hui. Une facture sans échéance retombe sur sa
        // date de vente, qui est ce que le serveur prend lui aussi pour
        // mesurer l'ancienneté.
        secondaire={[
          v.client ?? "Client anonyme",
          v.echeance
            ? `échéance le ${formatDateFr(v.echeance)}`
            : v.date
              ? formatDateFr(v.date)
              : null,
        ]
          .filter(Boolean)
          .join(" · ")}
        // Un seul badge, et c'est le plus actionnable : ce qui attend son envoi
        // d'abord (le caissier ne doit pas réencaisser), puis le retard, puis
        // le statut - que « sur X » dit déjà à demi-mot.
        badge={
          enFile ? (
            <Badge tone="warning">Règlement en attente d&apos;envoi</Badge>
          ) : retard > 0 ? (
            <Badge tone="destructive">{libelleRetard(retard)}</Badge>
          ) : s ? (
            <Badge tone={s.ton}>{s.label}</Badge>
          ) : undefined
        }
        valeur={
          // Orange, comme le « Reste à payer » du back-office et comme la
          // liste du hub. Le rouge est réservé au retard : tout est dû ici, et
          // un écran entièrement rouge ne désigne plus rien.
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
          // Une coche verte dit « tout est soldé ». C'est vrai sans filtre, et
          // FAUX sous un filtre vide : deux factures attendent toujours, et
          // annoncer le contraire ferait fermer l'écran.
          icon: recherche ? "Search" : filtre === "toutes" ? "CheckCircle2" : "Filter",
          titre:
            recherche
              ? "Aucune facture ne correspond"
              : filtre === "retard"
                ? "Aucune facture en retard"
                : filtre === "attente"
                  ? "Aucune facture entièrement impayée"
                  : filtre === "partielles"
                    ? "Aucune facture partiellement payée"
                    : "Rien à encaisser",
          // Un état vide sous un filtre ne dit PAS que tout est soldé : il dit
          // que ce filtre-là est vide, et il rend le chemin du retour.
          message:
            recherche
              ? "Essayez une autre référence ou un autre nom de client."
              : filtre === "toutes"
                ? "Toutes les factures sont soldées."
                : `Aucune facture dans ce filtre, sur les ${toutes.length} qui restent à encaisser.`,
          action:
            recherche
              ? { label: "Effacer la recherche", onPress: () => setRecherche("") }
              : filtre === "toutes"
                ? undefined
                : { label: "Voir toutes les factures", onPress: () => setFiltre("toutes") },
        }}
      />
    </Screen>
  );
}
