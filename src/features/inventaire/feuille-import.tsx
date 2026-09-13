/**
 * Importer des produits depuis un classeur, sur le terminal.
 *
 * La feuille suit le dialogue du back-office : le modèle d'abord, le fichier
 * ensuite, le rapport à la place du formulaire. Trois registres au rapport, et
 * ils ne se confondent pas - ce qui est passé, ce qui a été refusé, et les
 * codes que le serveur a dû dériver.
 */
import { useState } from "react";
import { ScrollView, View } from "react-native";

import {
  aBesoinDAttention,
  choisirClasseur,
  importerClasseur,
  refusDuFichier,
  telechargerModeleImport,
  titreDuRapport,
  type FichierChoisi,
  type ResultatImport,
} from "./import-articles";
import {
  Banner, Button, Card, Divider, Icon, ListItem, Sheet, Text, useToast,
} from "@/ui";

export function FeuilleImportArticles({
  ouvert,
  onFermer,
  onImporte,
}: {
  ouvert: boolean;
  onFermer: () => void;
  /** Prévient l'écran qu'au moins un article est arrivé : il se relit. */
  onImporte: () => void;
}) {
  const toast = useToast();
  const [fichier, setFichier] = useState<FichierChoisi | null>(null);
  const [rapport, setRapport] = useState<ResultatImport | null>(null);
  const [occupe, setOccupe] = useState(false);

  const refus = fichier ? refusDuFichier(fichier) : null;

  const fermer = () => {
    setFichier(null);
    setRapport(null);
    onFermer();
  };

  const telecharger = async () => {
    setOccupe(true);
    try {
      await telechargerModeleImport();
    } catch (e) {
      toast.erreur(
        e instanceof Error ? e.message : "Le modèle n'a pas pu être téléchargé."
      );
    } finally {
      setOccupe(false);
    }
  };

  const choisir = async () => {
    setOccupe(true);
    try {
      const choisi = await choisirClasseur();
      if (choisi) setFichier(choisi);
    } catch {
      toast.erreur("Le sélecteur de fichiers n'a pas pu s'ouvrir.");
    } finally {
      setOccupe(false);
    }
  };

  const importer = async () => {
    if (!fichier || refus) return;
    setOccupe(true);
    try {
      const r = await importerClasseur(fichier);
      setRapport(r);
      if (r.created > 0) {
        onImporte();
        // Le toast dit la même chose que le panneau : un « importé avec succès »
        // sur un fichier partiellement refusé ferait refermer la feuille avant
        // d'avoir lu les lignes ignorées.
        if (r.skipped > 0 || r.renamed.length > 0) {
          toast.info(`${r.created} article(s) importé(s). Lisez le détail.`);
        } else {
          toast.succes(`${r.created} article(s) importé(s).`);
        }
      } else {
        toast.erreur(titreDuRapport(r));
      }
    } catch (e) {
      toast.erreur(e instanceof Error ? e.message : "L'import a échoué.");
    } finally {
      setOccupe(false);
    }
  };

  return (
    <Sheet ouvert={ouvert} onFermer={fermer} titre="Importer des produits">
      <ScrollView className="max-h-[520px]" showsVerticalScrollIndicator={false}>
        <View className="gap-3 pb-2">
          {rapport ? (
            <RapportImport rapport={rapport} />
          ) : (
            <>
              <Text variant="caption">
                Importez vos produits depuis un fichier Excel basé sur notre modèle.
              </Text>

              {/* L'import exige le RÉSEAU : ses règles vivent sur le serveur, qui
                  seul connaît les codes déjà pris et le plafond du plan. */}
              <Banner
                tone="info"
                title="Une connexion est nécessaire"
                message="Le classeur est lu par le serveur. Pour un gros fichier, le back-office reste plus confortable à relire."
              />

              <Button
                variant="outline"
                fullWidth
                leftIcon="Download"
                disabled={occupe}
                onPress={() => void telecharger()}
              >
                Télécharger le modèle Excel
              </Button>

              <Card className="p-0">
                <ListItem
                  title={fichier ? fichier.nom : "Choisir un fichier"}
                  subtitle={
                    fichier
                      ? poids(fichier.taille)
                      : "Fichier .xlsx basé sur le modèle"
                  }
                  onPress={() => void choisir()}
                  trailing={
                    <Icon
                      name={fichier ? "CheckCircle2" : "Upload"}
                      size={20}
                      color={fichier ? "success" : "mutedForeground"}
                    />
                  }
                />
              </Card>

              {refus ? <Banner tone="destructive" title="Fichier refusé" message={refus} /> : null}

              <Button
                fullWidth
                size="lg"
                disabled={occupe || !fichier || !!refus}
                onPress={() => void importer()}
              >
                {occupe ? "Import en cours…" : "Importer"}
              </Button>
            </>
          )}
        </View>
      </ScrollView>

      {rapport ? (
        <Button variant="outline" fullWidth onPress={fermer}>
          Fermer
        </Button>
      ) : null}
    </Sheet>
  );
}

function poids(octets: number | null): string {
  if (octets == null) return "Fichier sélectionné";
  if (octets < 1024) return `${octets} o`;
  if (octets < 1024 * 1024) return `${Math.round(octets / 1024)} Ko`;
  return `${(octets / (1024 * 1024)).toFixed(1).replace(".", ",")} Mo`;
}

/**
 * Le rapport, en trois registres qui ne se confondent pas.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LES CODES DÉRIVÉS NE SONT NI UNE ERREUR NI UN SILENCE.                  │
 * │                                                                          │
 * │ Ces articles SONT au catalogue : les ranger sous « Erreurs » ferait      │
 * │ croire à un échec et le marchand les ressaisirait. Mais son fichier dit  │
 * │ « COCA-33 » et la base dit « COCA-33-2 » : ne rien dire lui ferait       │
 * │ chercher un article qu'il ne retrouverait ni à la recherche, ni à la     │
 * │ douchette. On nomme donc les DEUX codes.                                 │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
function RapportImport({ rapport }: { rapport: ResultatImport }) {
  const alerte = aBesoinDAttention(rapport);

  return (
    <View className="gap-3">
      <Banner
        tone={!rapport.success ? "destructive" : alerte ? "warning" : "success"}
        title={titreDuRapport(rapport)}
        message={
          rapport.error ??
          `${rapport.created} créé(s) · ${rapport.skipped} ignoré(s)` +
            (rapport.updated > 0 ? ` · ${rapport.updated} mis à jour` : "")
        }
      />

      {rapport.skipped > 0 ? (
        <Text variant="caption">
          Un article déjà au catalogue sous le même nom et le même code n&apos;est
          jamais réécrit : modifiez-le depuis sa fiche.
        </Text>
      ) : null}

      {rapport.renamed.length > 0 ? (
        <Card className="p-0">
          <View className="px-4 pt-3">
            <Text variant="bodySmall" className="font-sans-medium">
              Codes SKU modifiés ({rapport.renamed.length})
            </Text>
            <Text variant="caption" className="mt-0.5">
              Ces articles ont été créés, mais leur code était déjà porté par un
              autre. Notez les nouveaux codes.
            </Text>
          </View>
          {rapport.renamed.map((r, i) => (
            <View key={`${r.row}-${i}`}>
              {i > 0 ? <Divider inset /> : <View className="h-2" />}
              <ListItem
                title={`Ligne ${r.row} : ${r.name}`}
                subtitle={`${r.requested_sku} → ${r.assigned_sku}`}
              />
            </View>
          ))}
        </Card>
      ) : null}

      {rapport.errors.length > 0 ? (
        <Card className="p-0">
          <View className="px-4 pt-3">
            <Text variant="bodySmall" className="font-sans-medium">
              Lignes ignorées ({rapport.errors.length})
            </Text>
          </View>
          {rapport.errors.map((e, i) => (
            <View key={`${e.row}-${i}`}>
              {i > 0 ? <Divider inset /> : <View className="h-2" />}
              <ListItem
                title={`Ligne ${e.row} : ${e.name}`}
                subtitle={e.errors.join(" · ")}
              />
            </View>
          ))}
        </Card>
      ) : null}
    </View>
  );
}
