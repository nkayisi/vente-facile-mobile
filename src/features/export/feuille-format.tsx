/**
 * Le choix du format d'un document.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ TROIS BOUTONS NE TIENNENT PAS DANS UN EN-TÊTE D'ÉCRAN.                  │
 * │                                                                          │
 * │ La page Rapports a la place de les aligner ; l'historique des ventes et  │
 * │ les créances n'ont qu'une icône dans leur barre. Ils ouvraient donc un   │
 * │ PDF sans rien demander, et les deux autres formats leur étaient          │
 * │ inaccessibles alors que le serveur les rend.                             │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Une seule feuille pour les deux écrans : deux listes de formats finiraient
 * par diverger, et le marchand verrait deux vocabulaires pour un même geste.
 */
import { Fragment } from "react";
import { View } from "react-native";

import type { FormatExport } from "@/features/export/telecharger";
import { Divider } from "@/ui/divider";
import { Banner } from "@/ui/feedback";
import { ListItem } from "@/ui/list-item";
import { Sheet } from "@/ui/sheet";
import type { IconName } from "@/ui/icon";

/**
 * Ce que chaque format donne, dit dans les mots du marchand.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ L'ICÔNE NOMME LE FICHIER, JAMAIS LE GESTE.                              │
 * │                                                                          │
 * │ Le CSV portait une flèche de téléchargement quand ses deux voisins       │
 * │ portaient un document : la rangée se lisait « télécharger » là où les    │
 * │ autres se lisaient « fichier », alors que les TROIS se téléchargent. Ce  │
 * │ qui distingue ces lignes est le FORMAT, et c'est lui que l'icône doit    │
 * │ dire - une page pour ce qui s'imprime, un classeur pour Excel, une       │
 * │ grille nue pour le CSV.                                                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const FORMATS: {
  cle: FormatExport;
  label: string;
  detail: string;
  icone: IconName;
}[] = [
  {
    cle: "pdf",
    label: "PDF",
    detail: "À imprimer ou à envoyer tel quel",
    icone: "FileText",
  },
  {
    cle: "xlsx",
    label: "Excel",
    detail: "Chiffres modifiables, sommables",
    icone: "FileSpreadsheet",
  },
  {
    cle: "csv",
    label: "CSV",
    detail: "S'ouvre dans n'importe quel tableur",
    icone: "Table",
  },
];

export function FeuilleFormat({
  ouvert,
  onFermer,
  onChoisir,
  titre = "Exporter",
  avertissement,
  envoi,
}: {
  ouvert: boolean;
  onFermer: () => void;
  onChoisir: (format: FormatExport) => void;
  titre?: string;
  /**
   * Ce que le document NE DIRA PAS, annoncé avant le choix.
   *
   * L'historique des ventes fusionne les ventes encore dans le journal ; le
   * serveur ne les a pas. Le marchand doit le savoir AVANT d'exporter, pas en
   * comparant deux fichiers après coup.
   */
  avertissement?: string | null;
  envoi?: boolean;
}) {
  return (
    <Sheet ouvert={ouvert} onFermer={onFermer} titre={titre}>
      <View className="gap-3 pb-2">
        {/* `Banner` plutôt qu'un encadré maison : sa version « warning » porte
            son icône, son contraste et ses jetons, tous déjà éprouvés. Le
            premier jet employait `text-warning-foreground` sur un fond à dix
            pour cent, et le texte sortait délavé au point d'être illisible. */}
        {avertissement ? (
          <Banner tone="warning" title="Document incomplet" message={avertissement} />
        ) : null}

        {/* ┌──────────────────────────────────────────────────────────────────┐
            │ UN GROUPE, UN SEUL BORD GAUCHE ET UN SEUL BORD DROIT.            │
            │                                                                  │
            │ C'étaient trois `Button` portant chacun « FORMAT - description » │
            │ en une seule chaîne. Un bouton se dimensionne sur son texte : les │
            │ trois rangées sortaient donc de TROIS largeurs différentes, en    │
            │ escalier, et le nom du format - la seule chose qu'on choisit -    │
            │ avait exactement le poids de sa description.                      │
            │                                                                  │
            │ Une liste de choix se lit en balayant une colonne : le format en  │
            │ tête de ligne, la raison dessous, en sourdine. Les filets sont    │
            │ DÉCALÉS pour que la colonne d'icônes reste continue - un filet    │
            │ pleine largeur la découperait et casserait la lecture verticale.  │
            └──────────────────────────────────────────────────────────────────┘ */}
        <ChoixFormat onChoisir={onChoisir} envoi={envoi} />
      </View>
    </Sheet>
  );
}

/**
 * Les trois formats, à poser dans une feuille - la sienne ou celle d'un autre.
 *
 * Extrait parce qu'une feuille ne s'empile pas sur une feuille : le rapport
 * d'approvisionnement porte ses deux réglages ET le choix du format, dans un
 * seul `Sheet`. Deux listes de formats finiraient par diverger, et le marchand
 * verrait deux vocabulaires pour un même geste.
 */
export function ChoixFormat({
  onChoisir,
  envoi,
}: {
  onChoisir: (format: FormatExport) => void;
  envoi?: boolean;
}) {
  return (
    <View className="overflow-hidden rounded-xl border border-border">
      {FORMATS.map((f, i) => (
        <Fragment key={f.cle}>
          {i > 0 ? <Divider inset /> : null}
          <ListItem
            icon={f.icone}
            title={f.label}
            subtitle={f.detail}
            // Pas de chevron : l'appui n'ouvre pas d'écran, il lance le
            // document. `ListItem` réserve le chevron à une destination.
            onPress={envoi ? undefined : () => onChoisir(f.cle)}
            className={envoi ? "opacity-50" : undefined}
          />
        </Fragment>
      ))}
    </View>
  );
}
