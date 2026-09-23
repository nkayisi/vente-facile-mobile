/**
 * Les quatre aperçus de la présentation.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ON MONTRE LE PRODUIT, PAS UN GLYPHE.                                    │
 * │                                                                          │
 * │ Une grande icône dans un disque teinté est rapide à écrire et ne dit     │
 * │ rien : elle illustre une catégorie, pas une application. Ces aperçus     │
 * │ sont bâtis avec les composants que le comptoir emploie vraiment -        │
 * │ `Card`, `Badge`, `Mesure`, `BarChart` - si bien que le marchand voit     │
 * │ l'écran qu'il aura, à l'échelle près.                                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ⚠ LES MONTANTS SONT DES LIBELLÉS, PAS DES CALCULS.                      │
 * │                                                                          │
 * │ Cet écran précède la connexion : il n'y a ni instantané de session, ni   │
 * │ devise résolue, ni taux. `money()` n'aurait rien à lire, et lui passer   │
 * │ une devise vide est précisément ce qu'un garde-fou interdit. Les         │
 * │ nombres sont donc écrits tels quels, en francs congolais parce que       │
 * │ c'est la devise par défaut du produit et qu'elle n'a pas de décimale.    │
 * │                                                                          │
 * │ Ne PAS les brancher un jour sur de vraies données : une maquette qui     │
 * │ lit la base afficherait une boutique vide au premier lancement, c'est-   │
 * │ à-dire exactement le moment où cet écran existe.                         │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import type { ReactNode } from "react";
import { View } from "react-native";
import { formatNumberFr } from "@vente-facile/core";

import {
  BarChart,
  Card,
  Divider,
  Icon,
  Mesure,
  Text,
  VignetteArticle,
  type PointGraphe,
} from "@/ui";
import type { Vue } from "./vues";

/**
 * Le cadre qui tient la maquette.
 *
 * ⚠ RAYONS CONCENTRIQUES : 32 points dehors, 20 de rembourrage, donc 12
 * dedans - exactement le `rounded-xl` de `Card`. Deux rayons égaux sur des
 * boîtes imbriquées est la chose qui fait « sonner faux » une interface sans
 * qu'on sache la nommer.
 *
 * ⚠ `overflow-hidden` BORNE les éléments posés en absolu : sans lui, une
 * pastille flottante déborderait du cadre et se poserait sur le titre.
 */
function CadreApercu({ children }: { children: ReactNode }) {
  return (
    // ⚠ `justify-center` ET `gap-3` : la maquette est faite de DEUX cartes
    // empilées, comme une tranche d'écran réel. Avec une seule, le cadre
    // restait aux deux tiers vide et la vue paraissait inachevée - relevé à
    // l'écran, la carte occupait 167 points sur 400.
    <View className="w-full flex-1 justify-center gap-3 overflow-hidden rounded-[32px] bg-accent p-5">
      {children}
    </View>
  );
}

/**
 * Une ligne « libellé / valeur » d'une carte secondaire.
 *
 * ⚠ UNE TABLE, JAMAIS `text-${ton}`. NativeWind extrait les classes du CODE à
 * la compilation : une classe fabriquée au vol n'existe dans aucune feuille,
 * et elle est simplement ignorée - pas d'erreur, pas d'avertissement, juste un
 * montant qui reste noir là où il devrait crier en rouge.
 */
const TONS = {
  foreground: "text-foreground",
  destructive: "text-destructive",
  success: "text-success",
} as const;

function LigneSecondaire({
  libelle,
  valeur,
  tonValeur = "foreground",
}: {
  libelle: string;
  valeur: string;
  tonValeur?: keyof typeof TONS;
}) {
  return (
    <View className="flex-row items-center justify-between gap-3">
      <Text variant="caption">{libelle}</Text>
      <Text variant="label" numeric className={TONS[tonValeur]}>
        {valeur}
      </Text>
    </View>
  );
}

/** Une ligne d'articles du ticket : libellé à gauche, montant à droite. */
function LigneTicket({ libelle, montant }: { libelle: string; montant: string }) {
  return (
    <View className="flex-row items-center justify-between gap-3">
      <Text variant="bodySmall" numberOfLines={1} className="flex-1">
        {libelle}
      </Text>
      <Text variant="bodySmall" numeric>
        {montant}
      </Text>
    </View>
  );
}

/**
 * La pastille qui flotte sur la maquette.
 *
 * C'est elle qui porte l'idée de chaque vue - « hors ligne », « stock bas » -
 * et la faire flotter plutôt que l'aligner donne la profondeur qu'une capture
 * d'écran a naturellement.
 */
function Flottante({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <View
      // ⚠ `bottom-5 right-5` ET NON `bottom-0 right-0`. Mesuré à l'écran : en
      // React Native, un enfant absolu se pose sur la boîte de BORDURE du
      // parent, pas sur sa boîte de contenu - le rembourrage du cadre ne le
      // décale donc pas, et la pastille sortait se faire rogner par
      // `overflow-hidden`. Les vingt points reprennent le `p-5` du cadre.
      className={`absolute bottom-5 right-5 flex-row items-center gap-1.5 rounded-full bg-card px-3 py-2 ${className}`}
    >
      {children}
    </View>
  );
}

function Vente() {
  return (
    <CadreApercu>
      <Card className="gap-3">
        <View className="items-center gap-0.5">
          <Text variant="label" numeric>
            VT-20260919-K7QM-0042
          </Text>
          <Text variant="caption">Caisse principale</Text>
        </View>
        <Divider />
        <View className="gap-1.5">
          <LigneTicket libelle="2 × Sucre 1 kg" montant="9 000 FC" />
          <LigneTicket libelle="1 casier Boisson" montant="15 500 FC" />
        </View>
        <Divider />
        <View className="flex-row items-center justify-between">
          <Text variant="label">Total</Text>
          <Mesure value="24 500 FC" />
        </View>
      </Card>
      <Card className="gap-1.5">
        <LigneSecondaire libelle="Espèces reçues" valeur="25 000 FC" />
        <LigneSecondaire libelle="Monnaie à rendre" valeur="500 FC" tonValeur="success" />
      </Card>
      <Flottante>
        <Icon name="CloudOff" size={14} color="warning" />
        <Text variant="caption" className="text-warning">
          Hors ligne
        </Text>
      </Flottante>
    </CadreApercu>
  );
}

function Stock() {
  return (
    <CadreApercu>
      <Card className="gap-3">
        <View className="flex-row items-center gap-3">
          <VignetteArticle taille="md" />
          <View className="flex-1">
            <Text variant="label" numberOfLines={1}>
              Boisson sucrée 33 cl
            </Text>
            <Text variant="caption">Dépôt central</Text>
          </View>
        </View>
        <Divider />
        <View className="gap-0.5">
          {/* La lecture en contenants d'abord, le total en unités dessous et en
              sourdine : le premier sert au comptoir, le second au réassort. */}
          <Text variant="h4">3 casiers + 7 bouteilles</Text>
          <Text variant="caption">43 bouteilles au total</Text>
        </View>
      </Card>
      <Card className="gap-1.5">
        <LigneSecondaire libelle="Seuil de réassort" valeur="60 bouteilles" />
        <LigneSecondaire libelle="Réservé" valeur="4 bouteilles" />
      </Card>
      <Flottante>
        <Icon name="AlertTriangle" size={14} color="destructive" />
        <Text variant="caption" className="text-destructive">
          Stock bas
        </Text>
      </Flottante>
    </CadreApercu>
  );
}

function Clients() {
  return (
    <CadreApercu>
      <Card className="gap-3">
        <View className="flex-row items-center gap-3">
          <View className="h-12 w-12 items-center justify-center rounded-full bg-accent">
            <Text variant="label" className="text-accent-foreground">
              NK
            </Text>
          </View>
          <View className="flex-1">
            <Text variant="label" numberOfLines={1}>
              Nelly Kayisi
            </Text>
            <Text variant="caption">+243 997 876 765</Text>
          </View>
        </View>
        <Divider />
        <View className="flex-row justify-between gap-3">
          <View className="flex-1">
            <Text variant="caption">Dette</Text>
            <Mesure value="9 923 FC" tone="destructive" />
          </View>
          <View className="flex-1">
            <Text variant="caption">Points</Text>
            <Mesure value="704" />
          </View>
        </View>
      </Card>
      <Card className="gap-1.5">
        <LigneSecondaire libelle="Dernier achat" valeur="18 400 FC" />
        <LigneSecondaire libelle="Échéance" valeur="12 oct." tonValeur="destructive" />
      </Card>
      <Flottante>
        <Icon name="Star" size={14} color="primary" />
        <Text variant="caption" className="text-primary">
          +45 pts
        </Text>
      </Flottante>
    </CadreApercu>
  );
}

/** Une semaine ordinaire : un samedi fort, un dimanche creux. */
const SEMAINE: PointGraphe[] = [
  { label: "lun.", valeur: 21500 },
  { label: "mar.", valeur: 18200 },
  { label: "mer.", valeur: 26400 },
  { label: "jeu.", valeur: 23100 },
  { label: "ven.", valeur: 31800 },
  { label: "sam.", valeur: 42600 },
  { label: "dim.", valeur: 12900 },
];

function Rapports() {
  return (
    <CadreApercu>
      <Card className="gap-3">
        <Text variant="label">7 derniers jours</Text>
        {/* ⚠ `formatNumberFr`, JAMAIS le nombre nu. `BarChart` écrit aussi un
            « Maximum » avec ce formateur : sans lui, il sortait « 42600 FC »
            juste au-dessus d'un « 176 500 FC » écrit à la française, dans la
            même carte. Et `Intl` est proscrit - Hermes se replierait sur
            l'anglais sans lever. Zéro décimale : le franc n'en a pas. */}
        <BarChart
          points={SEMAINE}
          hauteur={76}
          formater={(v) => `${formatNumberFr(v, 0)} FC`}
        />
        <Divider />
        <View className="flex-row justify-between gap-3">
          <View className="flex-1">
            <Text variant="caption">Encaissé</Text>
            <Mesure value="176 500 FC" />
          </View>
          <View className="flex-1">
            <Text variant="caption">À relancer</Text>
            <Mesure value="24 500 FC" tone="destructive" />
          </View>
        </View>
      </Card>
      <Card className="gap-1.5">
        <LigneSecondaire libelle="Créances à plus de 30 j" valeur="9 923 FC" tonValeur="destructive" />
      </Card>
    </CadreApercu>
  );
}

const APERCUS: Record<Vue["cle"], () => React.ReactElement> = {
  vente: Vente,
  stock: Stock,
  clients: Clients,
  rapports: Rapports,
};

export function Apercu({ cle }: { cle: Vue["cle"] }) {
  const Rendu = APERCUS[cle];
  return <Rendu />;
}
