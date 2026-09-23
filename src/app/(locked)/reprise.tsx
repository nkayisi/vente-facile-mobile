/**
 * Ce terminal porte encore les données d'un autre compte.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ON NE FUSIONNE PAS, ET ON NE DÉTRUIT PAS EN SILENCE.                    │
 * │                                                                          │
 * │ Se connecter par-dessus les données d'un autre marchand mélangeait les   │
 * │ deux établissements dans la même base : les listes affichaient l'union   │
 * │ des deux, et les curseurs de tirage du premier faisaient répondre « rien │
 * │ de neuf » sur des tables que le second n'avait jamais tirées - son       │
 * │ catalogue ne descendait donc JAMAIS, sans le moindre message.            │
 * │                                                                          │
 * │ Mais la base porte ici des opérations qui n'ont jamais atteint le        │
 * │ serveur, et derrière chacune il peut y avoir une vente encaissée dont un │
 * │ client tient le ticket. Alors on NOMME, et on laisse décider.            │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ **« Continuer en gardant les opérations » est délibérément ABSENTE.** C'est
 * exactement la fusion qu'on ferme : les opérations de l'ancien compte
 * partiraient sous le jeton du nouveau, donc dans le mauvais établissement.
 *
 * L'écran vit dans `(locked)` et pas dans `(app)`, et c'est structurel : le
 * groupe `(app)` n'étant pas monté, il n'y a pas de `SynchronisationProvider`,
 * donc rien ne peut pousser le journal de l'ancien propriétaire. Le verrou est
 * l'ÉTAT lui-même, pas une garde qu'on aurait à surveiller.
 */
import { useCallback, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";

import { useLecture } from "@/data/live";
import { useSession } from "@/session/provider";
import { nbEnFile } from "@/session/deconnexion-regles";
import { lireEnSouffrance } from "@/session/en-souffrance";
import {
  AlertDialog,
  Banner,
  Button,
  Card,
  CardHeader,
  Divider,
  ListItem,
  Screen,
  Spinner,
  Text,
} from "@/ui";

/**
 * Le vocabulaire est celui d'« Opérations à corriger » et de `data/envoi.ts`.
 *
 * Deux écrans qui nomment différemment le même état font douter qu'il s'agisse
 * du même. `EtatEnvoi` ne couvre pas la quarantaine, d'où la troisième ligne,
 * reprise mot pour mot de l'écran qui la traite.
 */
const LIGNES = [
  {
    cle: "attente" as const,
    titre: "Attendent leur envoi",
    detail: "Elles partiraient à la prochaine synchronisation de ce compte.",
  },
  {
    cle: "bloquees" as const,
    titre: "En attente d'un droit",
    detail: "Un abonnement à régler, ou une permission à accorder.",
  },
  {
    cle: "refusees" as const,
    titre: "Refusées par le serveur",
    detail: "Elles ne repartiront pas d'elles-mêmes.",
  },
  {
    // ⚠ Une photo en attente est la SEULE copie d'un fichier : le serveur ne
    // l'a pas, et l'effacement la détruit. La taire reviendrait à la perdre
    // sans le dire.
    cle: "photos" as const,
    titre: "Photos d'articles",
    detail: "Elles n'existent que sur ce terminal.",
  },
];

export default function Reprise() {
  const { baseEtrangere, effacerBaseEtrangere, logout } = useSession();
  const [dialogue, setDialogue] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async () => {
    const f = await lireEnSouffrance();
    return {
      attente: f.pending + f.inflight,
      bloquees: f.blocked,
      refusees: f.quarantined,
      photos: f.photos,
      total: nbEnFile(f),
    };
  }, []);
  const { donnees: file } = useLecture(charger, {
    tables: ["outbox_operations", "pending_product_photos"],
  });

  const ancien = baseEtrangere;
  const proprietaire = ancien
    ? `${ancien.userLibelle} (${ancien.organizationLibelle})`
    : "un autre compte";

  /**
   * L'issue NON DESTRUCTRICE, et c'est pour cela qu'elle est la première.
   *
   * L'ancien propriétaire revient, l'estampille correspond, l'application
   * s'ouvre normalement et sa file repart d'elle-même. Rien n'est perdu.
   */
  const reprendre = useCallback(async () => {
    setEnCours(true);
    setErreur(null);
    try {
      await logout();
      router.replace("/(auth)/login");
    } catch (e) {
      // Sans ce `catch`, le bouton tournerait indéfiniment sur un trousseau
      // momentanément indisponible, sur l'une des deux seules sorties de
      // l'écran.
      setErreur(
        e instanceof Error ? e.message : "La déconnexion n'a pas abouti. Réessayez."
      );
      setEnCours(false);
    }
  }, [logout]);

  /**
   * ⚠ **UN ÉCHEC DOIT SE VOIR.**
   *
   * `purgerBaseLocale()` peut lever : son garde-fou « tables non classées », une
   * erreur SQL, un disque plein. Sans ce `catch`, l'exception partait en rejet
   * non traité, le dialogue se fermait, le statut restait `base_etrangere` et
   * RIEN ne s'affichait : l'une des deux seules sorties de l'écran ne faisait
   * silencieusement rien, et le marchand appuyait une seconde fois.
   */
  const effacer = useCallback(async () => {
    setEnCours(true);
    setErreur(null);
    try {
      await effacerBaseEtrangere();
    } catch (e) {
      setErreur(
        e instanceof Error
          ? e.message
          : "Les données n'ont pas pu être effacées. Réessayez, ou reconnectez-vous avec le compte précédent."
      );
    } finally {
      setDialogue(false);
      setEnCours(false);
    }
  }, [effacerBaseEtrangere]);

  return (
    <Screen scroll centre>
      <View className="mb-6">
        <Text variant="h2">Ce terminal porte encore des données d&apos;un autre compte</Text>
        <Text variant="muted">
          Les données de {proprietaire} sont toujours en base sur cet appareil, et
          certaines n&apos;ont jamais atteint le serveur.
        </Text>
      </View>

      <Banner
        tone="warning"
        title="Impossible de continuer sans trancher"
        message="Deux établissements ne peuvent pas cohabiter dans la base locale : les listes afficheraient l'union des deux, et le catalogue de ce compte ne descendrait jamais."
      />

      <Card className="mt-4 p-0 overflow-hidden">
        <CardHeader
          title={
            file
              ? `${file.total} élément${file.total > 1 ? "s" : ""} en attente`
              : "Ce qui attend sur ce terminal"
          }
        />
        {!file ? (
          <View className="items-center py-6">
            <Spinner />
          </View>
        ) : (
          LIGNES.filter((l) => file[l.cle] > 0).map((l, i) => (
            <View key={l.cle}>
              {i > 0 ? <Divider /> : null}
              <ListItem title={l.titre} subtitle={l.detail} value={String(file[l.cle])} />
            </View>
          ))
        )}
      </Card>

      {erreur ? (
        <View className="mt-4">
          <Banner tone="destructive" title="L'opération a échoué" message={erreur} />
        </View>
      ) : null}

      <View className="mt-6 gap-2">
        <Button fullWidth size="lg" loading={enCours} onPress={() => void reprendre()}>
          {ancien ? `Se reconnecter en tant que ${ancien.userEmail}` : "Revenir à la connexion"}
        </Button>
        <Button
          fullWidth
          variant="outline"
          disabled={enCours}
          onPress={() => setDialogue(true)}
        >
          Effacer les données de l&apos;ancien compte
        </Button>
      </View>

      <AlertDialog
        ouvert={dialogue}
        titre="Effacer les données de l'ancien compte ?"
        // La même phrase que « Opérations à corriger » quand on abandonne une
        // opération : c'est la même perte, et elle doit se dire pareil.
        message={
          `${file?.total ?? 0} élément${(file?.total ?? 0) > 1 ? "s" : ""} de ${proprietaire} ` +
          "ne partiront jamais. Si c'étaient des ventes encaissées, les " +
          "paiements resteront sans trace au serveur ; les photos d'articles " +
          "n'existent que sur ce terminal.\n\n" +
          "Cette opération ne se défait pas."
        }
        confirmer="Effacer définitivement"
        annuler="Revenir"
        destructif
        enCours={enCours}
        onConfirmer={() => void effacer()}
        onAnnuler={() => setDialogue(false)}
      />
    </Screen>
  );
}
