/**
 * Le rapport d'approvisionnement : la valeur d'achat de ce qui est ENTRÉ.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE DOCUMENT VIENT DU SERVEUR, ET IL EST DÉJÀ COMPLET.                   │
 * │                                                                          │
 * │ `build_supplies_report` valorise par produit avec ses sous-totaux par    │
 * │ catégorie, ou déroule le détail chronologique avec le fournisseur résolu │
 * │ depuis les bons de réception. Une entrée sans coût y porte un tiret et   │
 * │ reste HORS des totaux ; deux devises font apparaître un avertissement,   │
 * │ jamais une somme. Le terminal n'a qu'à demander le fichier.              │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ Le périmètre est HÉRITÉ de la liste, mais pas en entier : le type de
 * mouvement et la recherche n'en sont pas (voir `parametresApprovisionnement`).
 * La feuille le DIT plutôt que de le taire.
 *
 * Un seul `Sheet`, sans panneau : les deux réglages n'ont que deux options
 * chacun, et deux groupes posés en ligne se lisent d'un coup d'oeil - un
 * aller-retour de panneau coûterait plus qu'il n'apporte.
 */
import { Fragment } from "react";
import { View } from "react-native";

import { ChoixFormat } from "@/features/export/feuille-format";
import type { FormatExport } from "@/features/export/telecharger";
import { Banner, Card, Divider, Icon, ListItem, Sheet, Text } from "@/ui";

export type SourceEntrees = "all" | "receipts";
export type PresentationAppro = "product" | "movement";

const SOURCES: { cle: SourceEntrees; label: string; detail: string }[] = [
  {
    cle: "all",
    label: "Toutes les entrées de stock",
    detail:
      "Réceptions, stock initial, retours, transferts entrants et ajustements positifs.",
  },
  {
    cle: "receipts",
    label: "Réceptions fournisseur uniquement",
    detail: "Seules les entrées issues d'un bon de réception, avec leur fournisseur.",
  },
];

const PRESENTATIONS: { cle: PresentationAppro; label: string; detail: string }[] = [
  {
    cle: "product",
    label: "Une ligne par produit",
    detail: "Valeur d'achat cumulée, avec un sous-total par catégorie.",
  },
  {
    cle: "movement",
    label: "Détail chronologique",
    detail: "Chaque entrée, avec son fournisseur et son coût unitaire.",
  },
];

/** Un groupe d'options exclusives, avec la seule explication qui compte. */
function GroupeChoix<T extends string>({
  titre,
  options,
  valeur,
  onChoisir,
}: {
  titre: string;
  options: { cle: T; label: string; detail: string }[];
  valeur: T;
  onChoisir: (v: T) => void;
}) {
  const retenue = options.find((o) => o.cle === valeur);
  return (
    <View className="gap-2">
      <Text variant="caption">{titre}</Text>
      <View className="overflow-hidden rounded-xl border border-border">
        {options.map((o, i) => (
          <Fragment key={o.cle}>
            {i > 0 ? <Divider inset /> : null}
            <ListItem
              title={o.label}
              // La coche ne marque QUE l'option retenue, comme `ListeChoix` :
              // en poser une sur chaque rangée dirait que tout est choisi.
              trailing={
                valeur === o.cle ? <Icon name="Check" size={18} color="primary" /> : undefined
              }
              onPress={() => onChoisir(o.cle)}
            />
          </Fragment>
        ))}
      </View>
      {retenue ? <Text variant="caption">{retenue.detail}</Text> : null}
    </View>
  );
}

export function FeuilleApprovisionnement({
  ouvert,
  onFermer,
  libellePeriode,
  source,
  onSource,
  presentation,
  onPresentation,
  avertissement,
  envoi,
  onExporter,
}: {
  ouvert: boolean;
  onFermer: () => void;
  /** La période retenue, en clair : elle vient des filtres de la liste. */
  libellePeriode: string;
  source: SourceEntrees;
  onSource: (v: SourceEntrees) => void;
  presentation: PresentationAppro;
  onPresentation: (v: PresentationAppro) => void;
  avertissement?: string | null;
  envoi?: boolean;
  onExporter: (format: FormatExport) => void;
}) {
  return (
    <Sheet ouvert={ouvert} onFermer={onFermer} titre="Rapport d'approvisionnement">
      <Text variant="caption">
        Valeur d&apos;achat des entrées de stock sur la période retenue.
      </Text>

      {/* La période s'affiche, non modifiable ici : elle vient de la liste, et
          la donner à régler à deux endroits ferait douter de celle qui prime. */}
      <Card>
        <View className="flex-row items-baseline gap-2">
          <Text variant="caption">Période :</Text>
          <Text variant="bodySmall" className="font-sans-semibold">
            {libellePeriode}
          </Text>
        </View>
      </Card>

      {/* ⚠ LA DESCRIPTION VIT SOUS LE GROUPE, PAS DANS LA RANGÉE.
          Le `subtitle` d'un `ListItem` tient sur UNE ligne : « Réceptions,
          stock initial, retours, transferts entrants et ajustements posi… »
          sortait coupé en plein mot, et c'est justement la phrase qui sépare
          les deux options. Le back-office fait de même : il n'explique que le
          choix RETENU, sous le sélecteur. */}
      <GroupeChoix
        titre="Source des entrées"
        options={SOURCES}
        valeur={source}
        onChoisir={onSource}
      />
      <GroupeChoix
        titre="Présentation"
        options={PRESENTATIONS}
        valeur={presentation}
        onChoisir={onPresentation}
      />

      {/* Ce que le document ne dira PAS : le type et la recherche de la liste
          n'y entrent pas, et les saisies encore en file non plus. */}
      <Banner
        tone="info"
        title="Ce rapport porte sur toutes les ENTRÉES de la période"
        message="Le type de mouvement et la recherche de la liste ne s'y appliquent pas."
      />
      {avertissement ? (
        <Banner tone="warning" title="Document incomplet" message={avertissement} />
      ) : null}

      <ChoixFormat onChoisir={onExporter} envoi={envoi} />
    </Sheet>
  );
}
