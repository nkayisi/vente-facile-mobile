/**
 * Ventes. Miroir de `app/dashboard/sales/page.tsx`.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ DEUX REGISTRES, DEUX FORMES. UN RELEVÉ NE RESSEMBLE PAS À UN BOUTON.    │
 * │                                                                          │
 * │ L'écran alignait DIX boîtes de même largeur, même rayon, même fond :     │
 * │ quatre relevés et six destinations, rien pour les distinguer. C'est le   │
 * │ défaut exact que le back-office a dû corriger sur « Gestion de stock »   │
 * │ (« neuf boîtes de même taille, dont quatre seulement réagissaient au     │
 * │ clic »), et le dépôt en porte déjà le remède :                           │
 * │                                                                          │
 * │   - `StatStrip` : les relevés vivent dans UN panneau, cellules séparées  │
 * │     par un filet, sans ombre ni coin détaché. Cela se lit comme un       │
 * │     cadran d'instrument, et rien n'y promet un appui.                    │
 * │   - `ActionTile` : ce qui dit « ceci se clique » est le COMPORTEMENT     │
 * │     (soulèvement, mise à l'échelle, retour haptique), pas un trait de    │
 * │     couleur. Elles sont rassemblées sous un titre, à distance du cadran. │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * **Aucun total n'est sommé entre devises** : `MultiCurrencyTotal` rend une
 * ligne par devise, y compris dans une cellule du cadran. Le back-office a dû
 * l'apprendre à ses dépens.
 *
 * **Un seul bouton par destination.** Le bandeau de session portait
 * « Continuer à vendre », qui menait au même endroit que le bouton orange posé
 * quarante points plus haut. Il mène désormais au parc de caisses, seul
 * endroit d'où l'on ouvre ou ferme une session - et la variante « aucune
 * session » n'est plus un cul-de-sac.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA FRONTIÈRE NE TENAIT QU'À UN INTITULÉ DE SECTION.                     │
 * │                                                                          │
 * │ Le remède ci-dessus a été appliqué à moitié : les relevés sont bien      │
 * │ passés dans un cadran, mais les raccourcis sont restés des rectangles à  │
 * │ bordure, fond de carte, icône en pastille et - pour les règlements - un  │
 * │ NOMBRE. C'est-à-dire la grammaire d'une cellule de relevé, reproduite    │
 * │ quarante points sous un panneau de relevés. Seul le titre « Raccourcis » │
 * │ les en distinguait, et un titre se lit APRÈS la forme.                   │
 * │                                                                          │
 * │ Ils passent en `forme="action"` : pastille ronde centrée, libellé d'un   │
 * │ mot, aucun cadre, décompte en pastille de coin. Trois par rangée au lieu │
 * │ de deux, ce qui rend encore une rangée à la liste des ventes.            │
 * │                                                                          │
 * │ L'action primaire, elle, remonte sur la LIGNE DU TITRE : elle occupait   │
 * │ une bande pleine largeur pour mener où mène déjà l'onglet du centre.     │
 * │ Total repris aux blancs : une centaine de points, soit deux ventes de    │
 * │ plus visibles sans défiler.                                              │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { formatPrice, formatTimeFr } from "@vente-facile/core";

import { jourEnLettresFr } from "@/data/dates";
import { useMonnaie } from "@/data/devises";
import { useLecture } from "@/data/live";
import { STATUT_VENTE, depuis, relevesVentes, sessionOuverteResume } from "@/data/ventes";
import { useSession } from "@/session/provider";
import { libelleEnvoi } from "@/data/envoi";
import {
  ActionTile,
  Badge,
  Button,
  Card,
  Divider,
  EmptyState,
  Icon,
  MultiCurrencyTotal,
  PageHeader,
  Pressable,
  Screen,
  SearchInput,
  StatStrip,
  StatStripItem,
  Text,
} from "@/ui";

// `outbox_operations` et `print_jobs` en font partie : une vente encaissée
// hors ligne n'écrit rien dans `sales`, et sans ces deux tables l'écran ne se
// rafraîchirait qu'au retour du réseau.
const TABLES = [
  "sales",
  "sale_items",
  "register_sessions",
  "registers",
  "customers",
  "outbox_operations",
  "print_jobs",
];

/** Au-delà, la liste renvoie à l'historique plutôt que de s'allonger. */
const VISIBLES = 10;

export default function Ventes() {
  const { can } = useSession();
  const money = useMonnaie();
  const [recherche, setRecherche] = useState("");
  const { donnees: r } = useLecture(relevesVentes, { tables: TABLES });
  const { donnees: session } = useLecture(sessionOuverteResume, { tables: TABLES });

  const terme = recherche.trim().toLowerCase();
  const ventes = (r?.ventesDuJour ?? []).filter(
    (v) =>
      !terme ||
      v.reference.toLowerCase().includes(terme) ||
      (v.client ?? "").toLowerCase().includes(terme)
  );
  const restantes = Math.max(0, ventes.length - VISIBLES);
  const aEncaisser = r?.nbAEncaisser ?? 0;
  // Une session ouverte hors ligne EST une session : elle se lit dans le
  // journal, le comptoir vend dessus, et le bandeau doit dire où elle en est
  // plutôt que de la peindre en vert comme si le serveur l'avait acceptée.
  const envoiSession = libelleEnvoi(session?.envoi);

  return (
    <Screen scroll edges={[]}>
      {/* ┌────────────────────────────────────────────────────────────────┐
          │ L'ACTION EST SUR LA LIGNE DU TITRE, ET ELLE Y GAGNE UN ÉCRAN. │
          │                                                                │
          │ Elle occupait une bande pleine largeur sous l'en-tête : une    │
          │ soixantaine de points, pour un bouton qui mène là où mène      │
          │ DÉJÀ l'onglet du centre de la barre - c'est-à-dire au point le │
          │ plus sûr du pouce, et il n'a pas bougé. Ces soixante points    │
          │ reviennent à « Ventes du jour », la seule chose de cet écran   │
          │ qu'on vient lire plutôt que traverser.                         │
          │                                                                │
          │ Le libellé se raccourcit à « Vendre » quand une session est    │
          │ ouverte : « Ouvrir le point de vente » et un titre ne tiennent │
          │ pas sur 390 points, et c'est le bouton qui perdrait son mot.   │
          │ Sans session, le libellé reste ENTIER - c'est là qu'il apprend │
          │ quelque chose, et c'est aussi le seul état où il n'y a rien    │
          │ d'autre à faire sur cet écran.                                 │
          └────────────────────────────────────────────────────────────────┘ */}
      <PageHeader
        title="Ventes"
        subtitle={jourEnLettresFr(new Date())}
        action={
          can("sales.create") ? (
            <Button leftIcon="ShoppingCart" onPress={() => router.push("/vendre")}>
              {session ? "Vendre" : "Ouvrir une session"}
            </Button>
          ) : null
        }
      />

      {/* Bandeau d'état : toujours présent, deux variantes, pour que la page ne
          change pas de structure selon qu'une caisse est ouverte ou non. Il
          MÈNE au parc de caisses dans les deux cas - c'est de là qu'on ouvre
          et qu'on clôture. */}
      <View className="mt-3">
        <Pressable
          onPress={() => router.push("/caisses")}
          accessibilityRole="link"
          accessibilityLabel={
            session
              ? `Session ouverte sur ${session.caisse}. Voir les caisses`
              : "Aucune session ouverte. Voir les caisses"
          }
          // ┌──────────────────────────────────────────────────────────────┐
          // │ `border-solid` A L'AIR REDONDANT, ET IL NE L'EST PAS.        │
          // │                                                              │
          // │ MESURÉ sur l'émulateur : sans lui, le bandeau VERT sort en   │
          // │ pointillés au démarrage à froid. La lecture commence à       │
          // │ `null`, donc la variante pointillée est rendue en premier,   │
          // │ et quand la session arrive le style de BORDURE n'est pas     │
          // │ remis à « plein » par le nouveau jeu de classes : le tireté  │
          // │ reste. Un rechargement à chaud, lui, rend le trait plein -   │
          // │ de quoi déclarer l'écran bon et ne jamais revoir le défaut,  │
          // │ puisqu'il ne se montre qu'au premier lancement.              │
          // │                                                              │
          // │ Vérifié EN SENS INVERSE, pour ne pas en tirer une règle      │
          // │ générale : la même bascule sur `opacity` (bouton désactivé   │
          // │ qui redevient actif) se remet correctement. C'est propre au  │
          // │ style de bordure, pas à toute classe conditionnelle.         │
          // └──────────────────────────────────────────────────────────────┘
          className={
            session
              ? envoiSession?.ton === "warning"
                ? "flex-row items-center gap-3 rounded-xl border border-solid border-warning/30 bg-warning/10 p-3.5"
                : "flex-row items-center gap-3 rounded-xl border border-solid border-success/30 bg-success/10 p-3.5"
              : "flex-row items-center gap-3 rounded-xl border border-dashed border-border bg-card p-3.5"
          }
          pressedClassName="active:opacity-90 active:scale-[0.98]"
        >
          <Icon
            name={
              session
                ? envoiSession?.ton === "warning"
                  ? "AlertTriangle"
                  : "CheckCircle2"
                : "Clock"
            }
            size={20}
            color={
              session
                ? envoiSession?.ton === "warning"
                  ? "warning"
                  : "success"
                : "mutedForeground"
            }
          />
          <View className="min-w-0 flex-1">
            <Text variant="label" numberOfLines={1}>
              {session ? `Session ouverte · ${session.caisse}` : "Aucune session ouverte"}
            </Text>
            <Text variant="caption" numberOfLines={1}>
              {session
                ? [
                    // L'état d'envoi passe EN TÊTE : une session que le serveur
                    // n'a pas vue reste une session sur laquelle on vend, mais
                    // « bloquée » et « en file » n'appellent pas le même geste,
                    // et c'est la première chose à savoir avant de la clôturer.
                    envoiSession?.court,
                    depuis(session.ouverteLe),
                    `${session.nbVentes} ${session.nbVentes > 1 ? "ventes" : "vente"}`,
                    session.encaisseParDevise.length > 0
                      ? `${session.encaisseParDevise
                          .map((e) => money.money(e.montant, e.devise))
                          .join(" · ")} encaissés${
                          // Un total présenté comme complet alors qu'un ticket
                          // manque se compare au tiroir et tombe faux.
                          session.sansMontant > 0
                            ? ` (+${session.sansMontant} sans montant)`
                            : ""
                        }`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : "Ouvrez une session de caisse pour encaisser des ventes."}
            </Text>
          </View>
          <Icon name="ChevronRight" size={16} color="mutedForeground" />
        </Pressable>
      </View>

      {/* LE CADRAN. Quatre relevés du jour, dans l'ordre du web, en un seul
          panneau. Aucun n'est pressable : ce sont des lectures, et les rendre
          cliquables reviendrait à effacer la frontière qu'on vient de poser.
          Le nombre de règlements en attente est ACTIONNABLE juste dessous, sur
          la tuile qui y mène. */}
      <View className="mt-4">
        <StatStrip>
          <StatStripItem label="Ventes du jour" icon="Banknote">
            <MultiCurrencyTotal
              lignes={r?.totalParDevise ?? []}
              money={money.money}
              vide={formatPrice(0)}
            />
          </StatStripItem>
          <StatStripItem
            label="Transactions"
            value={String(r?.transactions ?? 0)}
            icon="Receipt"
          />
          <StatStripItem label="Panier moyen" icon="TrendingUp">
            <MultiCurrencyTotal
              lignes={r?.panierMoyenParDevise ?? []}
              money={money.money}
              vide={formatPrice(0)}
            />
          </StatStripItem>
          <StatStripItem
            label={
              aEncaisser > 0
                ? `À encaisser · ${aEncaisser} ${aEncaisser > 1 ? "ventes" : "vente"}`
                : "À encaisser"
            }
            icon="Clock"
            tone={aEncaisser > 0 ? "warn" : "neutral"}
          >
            <MultiCurrencyTotal
              lignes={r?.aEncaisserParDevise ?? []}
              money={money.money}
              tone={aEncaisser > 0 ? "warning" : "foreground"}
              vide={formatPrice(0)}
            />
          </StatStripItem>
        </StatStrip>
      </View>

      {/* LES DESTINATIONS, sous leur titre. Le titre à lui seul sépare les deux
          registres : on ne lit pas un cadran sous un intitulé d'actions. */}
      {/* LES DESTINATIONS. Elles ne portent plus ni cadre, ni fond de carte,
          ni nombre à la place d'une valeur : c'était la grammaire exacte du
          cadran posé au-dessus, et on lit une forme avant de lire un titre.
          Une pastille ronde centrée sous un libellé court ne peut pas se
          confondre avec un relevé, et le décompte des règlements devient une
          pastille de coin - « trois choses à traiter », pas « la valeur est
          trois ». Voir `ui/action-tile.tsx`. */}
      <View className="mt-6">
        <Text variant="h4" className="mb-3">
          Raccourcis
        </Text>
        {/* Le libellé dessiné tient en un mot ; la description n'est PAS
            dessinée à cette largeur, elle complète ce que le lecteur d'écran
            annonce. */}
        <View className="flex-row flex-wrap gap-2">
          <ActionTile
            href="/vente/reglements"
            forme="action"
            title="Règlements"
            description="Factures en attente de paiement"
            icon="Banknote"
            accent="primary"
            badge={aEncaisser}
          />
          <ActionTile
            href="/vente/historique"
            forme="action"
            title="Historique"
            description="Toutes les ventes, toutes périodes"
            icon="Receipt"
            accent="chart2"
          />
          <ActionTile
            href="/caisses"
            forme="action"
            title="Caisses"
            description="Comptoirs, sessions et clôtures"
            icon="Calculator"
            accent="chart3"
          />
          <ActionTile
            href="/devis"
            forme="action"
            title="Devis"
            description="Propositions de prix à convertir"
            icon="FileText"
            accent="primary"
          />
          <ActionTile
            href="/retour"
            forme="action"
            title="Retours"
            description="Marchandise rendue par les clients"
            icon="PackageX"
            accent="chart2"
          />
          <ActionTile
            href="/creances"
            forme="action"
            title="Créances"
            description="Ce que les clients doivent, par ancienneté"
            icon="Clock"
            accent="chart3"
          />
        </View>
      </View>

      <View className="mt-6">
        <View className="mb-3 flex-row items-center justify-between gap-3">
          <Text variant="h4" numberOfLines={1} className="min-w-0 flex-1">
            {`Ventes du jour (${ventes.length})`}
          </Text>
          <Pressable
            onPress={() => router.push("/vente/historique")}
            accessibilityRole="link"
            accessibilityLabel="Voir tout l'historique des ventes"
            className="h-11 flex-row items-center gap-1 pl-2"
          >
            <Text variant="bodySmall" className="font-sans-medium text-primary">
              Voir tout
            </Text>
            <Icon name="ArrowRight" size={14} color="primary" />
          </Pressable>
        </View>
        <View className="mb-3">
          <SearchInput
            valeur={recherche}
            onChange={setRecherche}
            placeholder="Référence ou client..."
            accessibilityLabel="Rechercher une vente du jour"
          />
        </View>

        {ventes.length === 0 ? (
          // L'état vide vit DANS la carte, comme au back-office : posé sur le
          // fond de page, il flotte entre la recherche et rien, et se lit comme
          // un morceau d'écran qui n'a pas fini de charger.
          <Card className="overflow-hidden p-0">
            <EmptyState
              icon="Receipt"
              title={terme ? "Aucune vente ne correspond" : "Aucune vente aujourd'hui"}
              message={
                terme
                  ? "Essayez une autre référence ou un autre nom de client."
                  : session
                    ? "Ouvrez le point de vente pour enregistrer votre première vente."
                    : "Ouvrez d'abord une session de caisse pour commencer à vendre."
              }
              // Un état vide sans issue laisse le caissier chercher ce qu'il
              // doit faire. La destination suit l'ÉTAT RÉEL : proposer le
              // comptoir sans session ouverte menait à une impasse.
              action={
                terme
                  ? { label: "Effacer la recherche", onPress: () => setRecherche("") }
                  : can("sales.create")
                    ? {
                        label: session ? "Ouvrir le point de vente" : "Ouvrir une session",
                        onPress: () => router.push("/vendre"),
                      }
                    : undefined
              }
            />
          </Card>
        ) : (
          <Card className="overflow-hidden p-0">
            {ventes.slice(0, VISIBLES).map((v, i) => {
              const st = STATUT_VENTE[v.statut] ?? { label: v.statut, ton: "neutral" as const };
              return (
                <View key={v.id}>
                  {i > 0 ? <Divider /> : null}
                  <Pressable
                    onPress={() => router.push(`/vente/${v.id}`)}
                    accessibilityRole="button"
                    accessibilityLabel={`Vente ${v.reference}`}
                    className="flex-row items-center gap-3 px-4 py-3"
                  >
                    <View className="h-9 w-9 items-center justify-center rounded-lg bg-muted">
                      <Icon name="Receipt" size={16} color="mutedForeground" />
                    </View>
                    <View className="min-w-0 flex-1">
                      <Text variant="bodySmall" numberOfLines={1} className="font-sans-medium">
                        {v.reference}
                      </Text>
                      <Text variant="caption" numberOfLines={1}>
                        {[
                          v.client ?? "Client anonyme",
                          v.date ? formatTimeFr(v.date) : null,
                          v.nbArticles
                            ? `${v.nbArticles} ${v.nbArticles > 1 ? "articles" : "article"}`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </Text>
                      {/* Le numéro est DÉFINITIF et le papier est sorti, mais
                          le serveur n'a pas encore accepté la vente. Le taire
                          la ferait passer pour arrêtée ; le crier ferait
                          croire à une erreur. On le dit, une fois.

                          Et on distingue les DEUX raisons : « attend son
                          envoi » passera seul à la prochaine synchronisation,
                          « attend un droit » ne partira pas tant que
                          l'abonnement n'est pas réglé. Confondre les deux fait
                          synchroniser en vain, parfois des jours. */}
                      {libelleEnvoi(v.envoi) ? (
                        <View className="mt-0.5 flex-row items-center gap-1">
                          <Icon
                            name={v.envoi === "bloque" ? "AlertTriangle" : "CloudDownload"}
                            size={12}
                            color={v.envoi === "bloque" ? "warning" : "mutedForeground"}
                          />
                          <Text
                            variant="caption"
                            className={v.envoi === "bloque" ? "text-warning" : undefined}
                          >
                            {libelleEnvoi(v.envoi)?.court}
                          </Text>
                        </View>
                      ) : null}
                      {/* Ce qui reste dû se lit SOUS la ligne, jamais à côté du
                          total : deux montants côte à côte sur 390 points se
                          confondent, et confondre « payé » et « reste à payer »
                          est la seule erreur que cet écran ne peut pas se
                          permettre. */}
                      {v.resteAPayer > 0 ? (
                        <Text variant="caption" numeric className="text-warning">
                          {`Reste ${money.money(v.resteAPayer, v.devise)}`}
                        </Text>
                      ) : null}
                    </View>
                    <View className="shrink-0 items-end gap-1">
                      <Badge tone={st.ton}>{st.label}</Badge>
                      {/* Une vente dont le ticket n'a pas été retrouvé n'a pas
                          de montant connu, et `null` ne se lit jamais zéro. */}
                      <Text variant="bodySmall" numeric className="font-sans-semibold">
                        {v.devise ? money.money(v.total, v.devise) : "Montant inconnu"}
                      </Text>
                    </View>
                  </Pressable>
                </View>
              );
            })}
            {/* Tronquer EN SILENCE cache des ventes du jour à celui qui les a
                faites. Le web nomme le reste, et on le nomme aussi. */}
            {restantes > 0 ? (
              <>
                <Divider />
                <Pressable
                  onPress={() => router.push("/vente/historique")}
                  accessibilityRole="link"
                  accessibilityLabel={`Voir les ${restantes} autres ventes du jour`}
                  className="min-h-11 items-center justify-center px-4 py-3"
                >
                  <Text variant="bodySmall" className="font-sans-medium text-primary">
                    {`Voir les ${restantes} autres ventes du jour`}
                  </Text>
                </Pressable>
              </>
            ) : null}
          </Card>
        )}
      </View>
    </Screen>
  );
}
