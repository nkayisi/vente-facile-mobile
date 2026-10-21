/**
 * Ce qu'on a reçu : ruptures, créances, décisions attendues et prises.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ IL N'Y AVAIT RIEN À OUVRIR.                                             │
 * │                                                                          │
 * │ Six familles d'alertes se créaient sur le serveur sans prévenir          │
 * │ personne, et aucune surface ne savait les lire. Un marchand n'apprenait  │
 * │ une rupture qu'en ouvrant la liste des stocks, c'est-à-dire en la        │
 * │ cherchant déjà.                                                          │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ CET ÉCRAN EXIGE LE RÉSEAU, et le DIT. Une alerte est un fait constaté par
 * le serveur À L'INSTANT où il le constate : descendue puis relue hors ligne,
 * elle annoncerait une rupture déjà réapprovisionnée, ou tairait celle de ce
 * matin. Une liste vide se lirait « rien à signaler », ce qui est le contraire
 * de « je n'ai pas pu regarder ».
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";

import { ApiError } from "@/api/errors";
import { dateHeureCourteFr } from "@/data/dates";
import {
  chargerNotifications,
  marquerLue,
  marquerToutLu,
  type NotificationRecue,
} from "@/data/notifications";
import { useEnLigne } from "@/data/reseau";
import { BandeauPush } from "@/notifications/bandeau-push";
import {
  AppBar, Badge, Banner, Button, DataList, DataRow, Screen, Spinner,
  useToast,
} from "@/ui";

/** Le ton d'une notification. Celui du serveur, pas un jugement d'écran. */
const TON: Record<
  NotificationRecue["genre"],
  "neutral" | "success" | "warning" | "destructive"
> = {
  info: "neutral",
  success: "success",
  warning: "warning",
  error: "destructive",
  alert: "warning",
};

export default function Notifications() {
  const enLigne = useEnLigne();
  const toast = useToast();

  const [elements, setElements] = useState<NotificationRecue[]>([]);
  const [chargement, setChargement] = useState(true);
  const [rafraichissement, setRafraichissement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const vivant = useRef(true);
  useEffect(() => {
    vivant.current = true;
    return () => {
      vivant.current = false;
    };
  }, []);

  const charger = useCallback(async (mode: "initial" | "rafraichir" = "initial") => {
    if (mode === "rafraichir") setRafraichissement(true);
    try {
      const d = await chargerNotifications();
      if (!vivant.current) return;
      setElements(d.elements);
      setErreur(null);
    } catch (e) {
      if (!vivant.current) return;
      setErreur(
        e instanceof ApiError ? e.message : "Les notifications n'ont pas pu être chargées."
      );
    } finally {
      if (vivant.current) {
        setChargement(false);
        setRafraichissement(false);
      }
    }
  }, []);

  useEffect(() => {
    // On ne tente pas l'appel hors ligne : le bandeau est DÉRIVÉ de `enLigne`,
    // et attendre l'expiration d'un délai ne ferait que paraître plus grave.
    // `enLigne` est dans les dépendances, donc le retour du réseau relance la
    // lecture de lui-même.
    if (!enLigne) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- aucun `setState` avant le premier `await` ; même faux positif que `ma-journee`, mesuré.
    void charger("initial");
  }, [charger, enLigne]);

  const ouvrir = useCallback(
    async (n: NotificationRecue) => {
      // ⚠ ON MARQUE LUE AVANT DE NAVIGUER, et l'échec ne retient pas :
      // le marchand a VU la notification, c'est le fait qui compte. Bloquer la
      // navigation sur un aller-retour réseau ferait d'un appui un délai.
      if (!n.lue) {
        setElements((avant) =>
          avant.map((x) => (x.id === n.id ? { ...x, lue: true } : x))
        );
        void marquerLue(n.id).catch(() => undefined);
      }
      if (n.destination) {
        // Le serveur rend un chemin de BACK-OFFICE (`/dashboard/...`) : il
        // sert les deux surfaces. Le terminal n'en garde que la rubrique.
        const cible = chemintDuTerminal(n.destination);
        if (cible) router.push(cible as never);
      }
    },
    []
  );

  const toutLire = useCallback(async () => {
    try {
      const n = await marquerToutLu();
      setElements((avant) => avant.map((x) => ({ ...x, lue: true })));
      toast.succes(
        n === 0
          ? "Tout était déjà lu."
          : `${n} notification${n > 1 ? "s" : ""} marquée${n > 1 ? "s" : ""} comme lue${n > 1 ? "s" : ""}.`
      );
    } catch {
      toast.erreur("Les notifications n'ont pas pu être marquées comme lues.");
    }
  }, [toast]);

  const nonLues = elements.filter((n) => !n.lue).length;

  const rendu = (n: NotificationRecue) => (
    <DataRow
      principal={n.titre}
      secondaire={n.message}
      badge={
        n.lue ? undefined : <Badge tone={TON[n.genre] ?? "neutral"}>Nouveau</Badge>
      }
      sousValeur={dateHeureCourteFr(new Date(n.le))}
      onPress={() => void ouvrir(n)}
    />
  );

  return (
    <Screen padded={false}>
      <AppBar
        title="Notifications"
        subtitle={
          nonLues > 0
            ? `${nonLues} non lue${nonLues > 1 ? "s" : ""}`
            : "Tout est lu"
        }
        right={
          nonLues > 0 ? (
            <Button size="sm" variant="ghost" onPress={() => void toutLire()}>
              Tout lire
            </Button>
          ) : undefined
        }
      />

      {/*
        ⚠ AU-DESSUS DES DEUX AUTRES, et l'ordre dit quelque chose : celui-ci
        parle de la LIVRAISON (être prévenu sans ouvrir), les deux suivants de
        la LECTURE (pouvoir consulter la liste). Un marchand hors ligne doit
        pouvoir accorder la permission : elle est locale, et c'est précisément
        pour ne plus dépendre de l'ouverture de l'écran qu'elle sert.
      */}
      <BandeauPush />

      {!enLigne ? (
        <View className="px-4 pb-3 pt-2">
          <Banner
            tone="warning"
            title="Les notifications demandent une connexion"
            message="Une alerte est un fait constaté par le serveur à l'instant où il le constate. Vendre et encaisser, eux, marchent hors ligne."
          />
        </View>
      ) : erreur ? (
        <View className="px-4 pb-3 pt-2">
          <Banner
            tone="destructive"
            title="Les notifications n'ont pas pu être chargées"
            message={erreur}
            action={{ label: "Réessayer", onPress: () => void charger("rafraichir") }}
          />
        </View>
      ) : null}

      {chargement && enLigne && elements.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <Spinner />
        </View>
      ) : (
        <DataList
          donnees={elements}
          cle={(n) => n.id}
          rendu={rendu}
          onRefresh={enLigne ? () => void charger("rafraichir") : undefined}
          refreshing={rafraichissement}
          vide={{
            icon: "Bell",
            titre: enLigne ? "Aucune notification" : "Rien à afficher",
            message: enLigne
              ? "Vous serez prévenu des ruptures, des créances et des décisions attendues."
              : "Reconnectez-vous pour voir vos notifications.",
          }}
        />
      )}
    </Screen>
  );
}

/**
 * Traduit la destination du serveur en route du terminal.
 *
 * ⚠ LE SERVEUR REND UN CHEMIN DE BACK-OFFICE, et c'est voulu : une alerte sert
 * les DEUX surfaces, et lui faire porter deux destinations ferait diverger
 * l'une des deux au premier écran renommé. On traduit ici, et une destination
 * inconnue ne mène NULLE PART plutôt que vers un écran au hasard.
 */
function chemintDuTerminal(destination: string): string | null {
  const table: Record<string, string> = {
    "/dashboard/stock/stock-levels": "/rayon",
    "/dashboard/stock/movements": "/mouvement",
    "/dashboard/stock/transfers": "/transfert",
    "/dashboard/stock/adjustments": "/ajustement",
    "/dashboard/stock/requisitions": "/requisition",
    "/dashboard/cashbook/expenses": "/depense",
    "/dashboard/subscription": "/abonnement",
  };
  return table[destination] ?? null;
}
