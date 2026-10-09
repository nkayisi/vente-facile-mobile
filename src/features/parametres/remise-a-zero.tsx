/**
 * Remettre l'essai à zéro, depuis le terminal.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ T8 DU RETOUR DE TEST, DEMANDÉ DEUX FOIS.                                │
 * │                                                                          │
 * │ Offert depuis le web ET le terminal, sur décision : une démonstration se │
 * │ fait au comptoir, et retourner à l'ordinateur pour repartir à zéro       │
 * │ coûterait le temps où le client regarde.                                 │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ ELLE EXIGE LE RÉSEAU, et ce n'est PAS un acte du journal. Un effacement
 * mis en file partirait des jours plus tard, après que le marchand a recommencé
 * à vendre : il effacerait alors des ventes RÉELLES. Un geste destructeur
 * s'applique à l'instant où on le demande, ou pas du tout.
 *
 * ⚠ LE SERVEUR D'ABORD, LA BASE LOCALE ENSUITE. Purger d'abord laisserait un
 * terminal vide face à un serveur plein, et le prochain tirage ramènerait tout
 * - le marchand croirait la remise à zéro sans effet. Dans cet ordre, un arrêt
 * entre les deux laisse une base périmée que le tirage corrige de lui-même.
 */
import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";

import { api } from "@/api/client";
import { readableMessage } from "@/api/errors";
import { purgerBaseLocale } from "@/db/purge";
import { useEnLigne } from "@/data/reseau";
import { useSession } from "@/session/provider";
import {
  Banner, Button, Card, CardHeader, Dialog, FormField, Input, Text, useToast,
} from "@/ui";

interface Apercu {
  total: number;
  deleted: Record<string, number>;
}

export function CarteRemiseAZero() {
  const { snapshot, refresh } = useSession();
  const enLigne = useEnLigne();
  const toast = useToast();

  const [apercu, setApercu] = useState<Apercu | null>(null);
  const [ouvert, setOuvert] = useState(false);
  const [saisie, setSaisie] = useState("");
  const [envoi, setEnvoi] = useState(false);

  const organisation = snapshot?.organization.id ?? "";
  const nom = (snapshot?.organization.name ?? "").trim();

  // ⚠ `trial`, et non « actif » : un abonnement payant est actif lui aussi, et
  // c'est précisément celui qu'il ne faut pas pouvoir effacer.
  const estUnEssai = snapshot?.subscription?.status === "trial";

  const compter = useCallback(async () => {
    if (!organisation || !enLigne) return;
    try {
      setApercu(
        await api.post<Apercu>(
          `/organizations/${organisation}/reset-trial/`,
          { dry_run: true },
          { headers: { "X-Organization-ID": organisation } }
        )
      );
    } catch {
      // Un échec d'aperçu ne dit rien au marchand : la carte reste, sans
      // chiffre. Le serveur refusera de toute façon si l'essai a expiré.
    }
  }, [organisation, enLigne]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- faux positif : `compter` n'écrit rien avant son premier `await`
    if (estUnEssai) void compter();
  }, [estUnEssai, compter]);

  if (!estUnEssai) return null;

  const effacer = async () => {
    setEnvoi(true);
    try {
      const d = await api.post<Apercu>(
        `/organizations/${organisation}/reset-trial/`,
        { confirmation: saisie },
        { headers: { "X-Organization-ID": organisation } }
      );

      // La base locale APRÈS le serveur. Voir l'encadré en tête du fichier.
      await purgerBaseLocale();
      // L'instantané porte l'abonnement et les réglages : le relire évite que
      // l'écran continue d'annoncer un essai qui vient de changer d'état.
      await refresh();

      setOuvert(false);
      setSaisie("");
      toast.succes(
        `${d.total} enregistrement${d.total > 1 ? "s" : ""} effacé${
          d.total > 1 ? "s" : ""
        }. Votre catalogue et vos réglages sont intacts.`
      );
      void compter();
    } catch (e) {
      // Le message du SERVEUR prime : il nomme le nom à saisir, ou dit
      // pourquoi l'essai est requis.
      toast.erreur(readableMessage(e, "La remise à zéro a échoué."));
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <>
      <Card className="border-destructive">
        <CardHeader title="Remettre l'essai à zéro" />
        <View className="gap-3 px-4 pb-4">
          <Text variant="bodySmall" className="text-muted-foreground">
            Efface les ventes et toutes les opérations de votre période
            d&apos;essai. Votre catalogue, vos entrepôts, vos caisses, vos clients
            et vos réglages sont conservés.
          </Text>

          {!enLigne ? (
            <Banner
              tone="warning"
              title="Cette action demande une connexion"
              message="Un effacement mis en file partirait plus tard, après que vous ayez recommencé à vendre : il effacerait alors des ventes réelles."
            />
          ) : apercu === null ? (
            <Text variant="caption" className="text-muted-foreground">
              Calcul en cours…
            </Text>
          ) : apercu.total === 0 ? (
            <Text variant="caption" className="text-muted-foreground">
              Il n&apos;y a aucune opération à effacer.
            </Text>
          ) : (
            <Button
              variant="destructive"
              leftIcon="Trash2"
              onPress={() => setOuvert(true)}
            >
              {`Remettre à zéro (${apercu.total})`}
            </Button>
          )}
        </View>
      </Card>

      <Dialog
        ouvert={ouvert}
        onFermer={() => !envoi && setOuvert(false)}
        titre="Cette action ne se défait pas"
        description={`${apercu?.total ?? 0} enregistrements seront effacés définitivement : ventes, règlements, mouvements de stock et de caisse, dettes et points de fidélité. Votre catalogue et vos réglages restent.`}
        actions={
          <>
            <Button
              variant="outline"
              onPress={() => setOuvert(false)}
              disabled={envoi}
            >
              Annuler
            </Button>
            <Button
              variant="destructive"
              loading={envoi}
              // Le bouton reste FERMÉ tant que le nom n'est pas exact : le
              // serveur refuserait, mais lui faire faire l'aller-retour pour
              // dire « non » n'apprend rien au marchand.
              disabled={envoi || saisie.trim() !== nom}
              onPress={() => void effacer()}
            >
              Effacer définitivement
            </Button>
          </>
        }
      >
        <FormField label={`Saisissez « ${nom} » pour confirmer`}>
          <Input value={saisie} onChangeText={setSaisie} placeholder={nom} />
        </FormField>
      </Dialog>
    </>
  );
}
