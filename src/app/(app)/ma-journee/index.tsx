/**
 * Ma journée : ce que J'AI vendu, encaissé et dépensé.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE CLOISONNEMENT AVAIT TOUT RETIRÉ AU CAISSIER, SA PROPRE LECTURE       │
 * │ COMPRISE.                                                                │
 * │                                                                          │
 * │ Les huit onglets de « Rapports & statistiques » sont gardés par          │
 * │ `reports.view`, accordé au seul propriétaire et au gérant : un caissier   │
 * │ qui ouvrait la rubrique recevait 403 sur les huit, et son entrée de      │
 * │ tiroir ne s'affichait même pas. Il n'avait donc AUCUN moyen de savoir ce │
 * │ qu'il avait vendu dans la journée - alors que c'est le chiffre qu'il     │
 * │ compare à son tiroir avant de rentrer.                                   │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ UN ÉCRAN DE PILE, PAS UN ONGLET. Un onglet sans bouton dans la barre est
 * un cul-de-sac : on n'y ARRIVE pas, on y BASCULE, donc la pile ne bouge pas
 * et aucune flèche de retour ne paraît. C'est la leçon qui a fait sortir la
 * liste des mouvements du groupe `(tabs)`.
 *
 * ⚠ CET ÉCRAN EXIGE LE RÉSEAU, comme les rapports, et pour la même raison :
 * ses agrégats viennent du serveur, dont les définitions sont subtiles
 * (portée par créateur, bornes de dates locales, conversions inter-devises).
 * Les recalculer ici donnerait deux chiffres pour la même journée, et le
 * caissier ne saurait pas lequel croire. L'écran le DIT plutôt que d'afficher
 * des zéros, qui se liraient comme une journée sans vente.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";

import { formatNumberFr } from "@vente-facile/core";
import { bornesRapport, type PeriodeRapport } from "@/data/periodes-rapports";
import { chargerMaJournee, type MaJournee } from "@/data/ma-journee";
import { etiquetteJour } from "@/data/rapports";
import { useMonnaie } from "@/data/devises";
import { useEnLigne } from "@/data/reseau";
import { ApiError } from "@/api/errors";
import { useSession } from "@/session/provider";
import {
  AppBar, Banner, BarChart, Card, CardHeader, Divider, EmptyState, ListItem,
  Mesure, Screen, Segmented, Spinner, StatStrip, StatStripItem, Text,
} from "@/ui";

/**
 * Trois fenêtres, et pas les neuf de « Rapports ».
 *
 * C'est un écran de comptoir : on y vient pour la journée qu'on vient de
 * faire, pas pour analyser un trimestre. Les neuf options de la rubrique
 * d'analyse y seraient un ruban à faire défiler pour trouver « Aujourd'hui ».
 */
const FENETRES: { valeur: PeriodeRapport; label: string }[] = [
  { valeur: "today", label: "Aujourd'hui" },
  { valeur: "last_7_days", label: "7 jours" },
  { valeur: "last_30_days", label: "30 jours" },
];

export default function MaJourneeEcran() {
  const { snapshot } = useSession();
  const money = useMonnaie();
  const enLigne = useEnLigne();

  const [fenetre, setFenetre] = useState<PeriodeRapport>("today");
  const [donnees, setDonnees] = useState<MaJournee | null>(null);
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

  const organisation = snapshot?.organization.id ?? "";

  const charger = useCallback(
    async (mode: "initial" | "rafraichir" = "initial") => {
      if (!organisation) return;
      if (mode === "rafraichir") setRafraichissement(true);

      const { debut, fin } = bornesRapport(fenetre);
      try {
        // La journée en cours se découpe à l'HEURE : c'est la seule maille qui
        // dise à un caissier quand il a vendu. Au-delà, le jour.
        const d = await chargerMaJournee({
          organisation,
          debut,
          fin,
          groupBy: fenetre === "today" ? "hour" : "day",
        });
        if (!vivant.current) return;
        setDonnees(d);
        setErreur(null);
      } catch (e) {
        if (!vivant.current) return;
        setErreur(
          e instanceof ApiError
            ? e.message
            : "Le rapport n'a pas pu être chargé."
        );
      } finally {
        if (vivant.current) {
          setChargement(false);
          setRafraichissement(false);
        }
      }
    },
    [organisation, fenetre]
  );

  /**
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ LE DRAPEAU DE CHARGEMENT APPARTIENT AU GESTE, PAS À L'EFFET.         │
   * │                                                                      │
   * │ `setChargement(true)` dans le corps d'un effet est un `setState`     │
   * │ synchrone, que le lint refuse à raison : il déclenche un rendu en     │
   * │ cascade. Il est donc posé à l'état initial (premier chargement) et    │
   * │ par la puce de période, qui est une PRESSION - un endroit où écrire   │
   * │ dans l'état est parfaitement légitime.                               │
   * │                                                                      │
   * │ L'effet ne fait plus que déclencher la lecture ; `charger` ne LÈVE le │
   * │ drapeau que dans son `finally`.                                       │
   * └──────────────────────────────────────────────────────────────────────┘
   *
   * ⚠ LE SIGNALEMENT RESTANT EST UN FAUX POSITIF, ET IL EST MESURÉ.
   *
   * Sur le chemin « initial », `charger` n'écrit RIEN avant son premier
   * `await` : le seul `setState` qui le précède est gardé par
   * `mode === "rafraichir"`, et tous les autres vivent dans le `try`/`finally`
   * qui suit l'appel réseau. L'analyseur perd la trace des `await` en
   * traversant un bloc gardé - c'est la limite déjà relevée sur
   * `session/provider.tsx`, où quatre écritures différentes du même repli
   * étaient toutes signalées.
   *
   * Trois écrans voisins (`(tabs)/rapports.tsx`, `caisse/rapports.tsx`,
   * `creances/index.tsx`) portent ce signalement sans l'expliquer. Ici il est
   * écarté NOMMÉMENT, parce qu'on a vérifié qu'il ne désigne rien : ne pas
   * retirer ce commentaire sans avoir relu le corps de `charger` ci-dessus.
   */
  useEffect(() => {
    // On ne tente pas l'appel hors ligne : le bandeau est DÉRIVÉ de `enLigne`,
    // et attendre l'expiration d'un délai ne ferait que paraître plus grave.
    // `enLigne` est dans les dépendances de CET effet, donc le retour du réseau
    // relance la lecture de lui-même.
    if (!enLigne) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- faux positif, mesuré ci-dessus
    void charger("initial");
  }, [charger, enLigne]);

  return (
    <Screen scroll padded={false} onRefresh={() => void charger("rafraichir")} refreshing={rafraichissement}>
      <AppBar
        title="Ma journée"
        // Le NOM, parce que l'écran ne peut rendre que le sien : l'endpoint
        // n'accepte aucune cible, et le dire lève le doute sur ce qu'on lit.
        subtitle={donnees?.nom ? `${donnees.nom} · mes seules opérations` : "Mes seules opérations"}
      />

      <View className="gap-4 px-4 pb-6">
        <Segmented
          options={FENETRES}
          valeur={fenetre}
          onChange={(v) => {
            setFenetre(v as PeriodeRapport);
            setChargement(true);
          }}
        />

        {!enLigne ? (
          <Banner
            tone="warning"
            title="Ce rapport demande une connexion"
            message="Ses chiffres viennent du serveur, pour qu'ils ne diffèrent jamais de ceux du back-office. Vendre et encaisser, eux, marchent hors ligne."
          />
        ) : erreur ? (
          <Banner
            tone="destructive"
            title="Le rapport n'a pas pu être chargé"
            message={erreur}
            action={{ label: "Réessayer", onPress: () => void charger("rafraichir") }}
          />
        ) : null}

        {chargement && !donnees && enLigne ? (
          <View className="items-center py-12">
            <Spinner />
          </View>
        ) : donnees ? (
          <Contenu d={donnees} money={money} />
        ) : null}
      </View>
    </Screen>
  );
}

function Contenu({ d, money }: { d: MaJournee; money: ReturnType<typeof useMonnaie> }) {
  const m = (v: number) => money.money(v, money.primaryCode);

  return (
    <View className="gap-4">
      {/*
        QUATRE RELEVÉS, dans l'ordre des trois choses que le retour de test
        nomme : vendu, encaissé, dépensé. Un cadran, pas quatre cartes : une
        carte se lit comme une destination, et aucune de ces quatre n'en est.
      */}
      <StatStrip>
        <StatStripItem label="Mes ventes" value={m(d.ventes.total)} icon="ShoppingCart" />
        <StatStripItem
          label="Transactions"
          value={formatNumberFr(d.ventes.nombre, 0)}
          icon="Receipt"
        />
        <StatStripItem
          label="Entrées caisse"
          value={m(d.caisse.entrees)}
          icon="ArrowDownRight"
        />
        <StatStripItem
          label="Sorties caisse"
          value={m(d.caisse.sorties)}
          icon="ArrowUpRight"
          // Le ton ne colore que si la valeur est non nulle : un « 0 sortie »
          // en rouge crie pour rien, et à force on ne voit plus le vrai rouge.
          tone={d.caisse.sorties > 0 ? "warn" : "neutral"}
        />
      </StatStrip>

      <Card>
        <CardHeader title="Mes dépenses" />
        <View className="px-4 pb-4">
          <Mesure value={m(d.depenses.total)} />
          <Text variant="caption" className="text-muted-foreground">
            {d.depenses.nombre === 1
              ? "1 dépense enregistrée"
              : `${formatNumberFr(d.depenses.nombre, 0)} dépenses enregistrées`}
          </Text>
        </View>
      </Card>

      <Card className="overflow-hidden p-0">
        <CardHeader title="Encaissé par moyen de paiement" />
        {d.parMoyen.length === 0 ? (
          <View className="pb-4">
            <EmptyState
              variante="carte"
              title="Aucun encaissement"
              message="Rien n'est entré sur cette période."
            />
          </View>
        ) : (
          d.parMoyen.map((p, i) => (
            <View key={p.moyen}>
              {i > 0 ? <Divider inset /> : null}
              <ListItem title={p.moyen} value={m(p.total)} />
            </View>
          ))
        )}
      </Card>

      <Card>
        <CardHeader
          title={d.parHeure ? "Mes ventes, heure par heure" : "Mes ventes, jour par jour"}
        />
        <View className="px-4 pb-4">
          {d.detail.length < 2 ? (
            // ⚠ Un graphique de comparaison exige DEUX choses à comparer : une
            // barre unique remplit toute la largeur et toute la hauteur, ce qui
            // se lit comme un défaut d'affichage.
            <EmptyState
              variante="carte"
              title={d.detail.length === 0 ? "Aucune vente" : "Une seule période vendue"}
              message={
                d.detail.length === 0
                  ? "Rien n'a été vendu sur cette période."
                  : `${m(d.detail[0].total)} au total.`
              }
            />
          ) : (
            <BarChart
              points={d.detail.map((b) => ({
                label: d.parHeure ? etiquetteHeure(b.bucket) : etiquetteJour(b.bucket),
                valeur: b.total,
              }))}
              formater={m}
            />
          )}
        </View>
      </Card>
    </View>
  );
}

/** « 2026-10-09 14:00 » rendu « 14h ». L'axe n'a pas la place de la date. */
function etiquetteHeure(bucket: string): string {
  const heure = bucket.slice(11, 13);
  return heure ? `${Number(heure)}h` : bucket;
}
