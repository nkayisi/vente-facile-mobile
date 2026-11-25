/**
 * La feuille « Rapport » de Ma journée : le ticket, puis le document A4.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ DEUX SUPPORTS, DEUX SOURCES, ET LA FEUILLE LE DIT.                      │
 * │                                                                          │
 * │ Le TICKET se rend sur le terminal, depuis les chiffres de l'écran : il   │
 * │ sort hors ligne, ventes en file comprises. Le DOCUMENT (PDF, Excel, CSV) │
 * │ est fabriqué par le serveur, comme tous les documents A4 du produit : il │
 * │ demande le réseau, et il ne connaît pas encore les ventes qui attendent  │
 * │ leur envoi. Les deux se lisent dans la même feuille parce qu'on vient y  │
 * │ chercher la même chose ; ce qui les distingue est écrit à côté.          │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ UNE SEULE FEUILLE : `Sheet` est un `Modal`, on n'en empile pas deux. Le
 * choix du format vit DANS celle-ci (`ChoixFormat`), pas dans `FeuilleFormat`.
 */
import { View } from "react-native";

import { ChoixFormat } from "@/features/export/feuille-format";
import type { FormatExport } from "@/features/export/telecharger";
import { Banner, ListItem, Sheet, Text } from "@/ui";

export function FeuilleRapportJournee({
  ouvert,
  onFermer,
  onImprimer,
  onExporter,
  enLigne,
  avertissement,
  envoi,
}: {
  ouvert: boolean;
  onFermer: () => void;
  onImprimer: () => void;
  onExporter: (format: FormatExport) => void;
  enLigne: boolean;
  /** Ce que le document ne portera pas : les ventes encore en file. */
  avertissement: string | null;
  /** Un ticket ou un document part : les deux gestes se ferment le temps de l'envoi. */
  envoi: boolean;
}) {
  return (
    <Sheet ouvert={ouvert} onFermer={onFermer} titre="Rapport de la journée">
      <View className="gap-4 pb-2">
        <View className="gap-2">
          <Text variant="label">Ticket</Text>
          <View className="overflow-hidden rounded-xl border border-border">
            <ListItem
              icon="Printer"
              title="Imprimer le ticket"
              subtitle="Synthèse et ventes du jour, sur l'imprimante du terminal"
              // Pas de chevron : l'appui lance l'impression, il n'ouvre pas
              // d'écran. `ListItem` réserve le chevron à une destination.
              onPress={envoi ? undefined : onImprimer}
              className={envoi ? "opacity-50" : undefined}
            />
          </View>
        </View>

        <View className="gap-2">
          <Text variant="label">Document</Text>
          {!enLigne ? (
            // Fermé AVEC sa raison : échouer après le choix du format se lirait
            // comme une panne, alors que c'est le réseau.
            <Banner
              tone="info"
              title="Le document demande une connexion"
              message="Il est fabriqué par le serveur, comme au back-office. Le ticket, lui, s'imprime sans réseau."
            />
          ) : (
            <>
              {avertissement ? (
                <Banner tone="warning" title="Document incomplet" message={avertissement} />
              ) : null}
              <ChoixFormat onChoisir={onExporter} envoi={envoi} />
            </>
          )}
        </View>
      </View>
    </Sheet>
  );
}
