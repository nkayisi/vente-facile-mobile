/**
 * Tableau de bord. Miroir de `app/dashboard/page.tsx`.
 *
 * L'écran reprend les CINQ blocs du back-office, dans son ordre : les quatre
 * relevés, l'évolution des ventes, la répartition des encaissements, les
 * produits les plus vendus, les alertes d'inventaire.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ QUATRE RELEVÉS EN DEUX COLONNES, ET C'EST UN CHOIX DE LECTURE.          │
 * │                                                                          │
 * │ Le back-office rend une seule colonne à 390 points. Deux colonnes tient  │
 * │ les quatre chiffres sur un même écran, sans défiler : c'est le geste du  │
 * │ matin, on ouvre et on voit. La contrepartie est réelle - une cellule ne  │
 * │ fait plus que ~165 points - et c'est `StatValue` qui l'absorbe, en       │
 * │ réduisant la TAILLE DU TEXTE, jamais le nombre de chiffres. Un montant   │
 * │ ne s'abrège nulle part sur cette plateforme.                             │
 * │                                                                          │
 * │ Trois colonnes seraient de trop : `StatStrip` porte déjà la mesure, tout │
 * │ montant en CDF y tomberait au plus petit palier.                         │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ TOUT L'ÉCRAN EST EN DEVISE PRINCIPALE, ET IL N'Y A PLUS DE SÉLECTEUR.   │
 * │                                                                          │
 * │ Il ventilait par devise, avec un sélecteur pour les graphiques. Ce       │
 * │ n'était pas la lecture attendue : les prix d'achat comme les prix de     │
 * │ vente sont tenus en devise principale, et c'est dans cette monnaie que   │
 * │ le marchand juge sa journée. Chaque montant est donc converti au taux    │
 * │ FIGÉ sur sa vente. Le LIVRE DE CAISSE, lui, reste multi-devise : il rend │
 * │ la réalité physique du tiroir, où les liasses ne se mélangent pas.       │
 * │                                                                          │
 * │ Il reste une question de monnaie, et une seule : EN QUELLE DEVISE        │
 * │ L'ARGENT EST ENTRÉ. C'est l'anneau, qui ventile les encaissements par    │
 * │ devise du billet reçu et porte les deux lectures, le montant compté et   │
 * │ son équivalent en principale. Les moyens de paiement passent dessous,    │
 * │ en liste : même contenu qu'avant, rangé au rang qui est le sien.         │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import { useCallback, useMemo, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import {
  formatFixedFr,
  formatNumber,
  formatNumberFr,
  formatPrice,
} from "@vente-facile/core";

import { useMonnaie } from "@/data/devises";
import { useLecture } from "@/data/live";
import { FeuilleFiltresPerimetre } from "@/features/perimetre/feuille-perimetre";
import {
  nombreDeFiltresPerimetre,
  PERIMETRE_VIDE,
  resumeDuPerimetre,
  sansLeFiltrePerimetre,
  type FiltrePerimetre,
  contexteFileDe,
} from "@/features/perimetre/filtre-perimetre";
import { usePerimetre } from "@/features/perimetre/use-perimetre";
import { alertes } from "@/data/tableau-alertes";
import {
  graphesTableauDeBord,
  LABELS_PERIODE,
  releveInventaire,
  relevesTableauDeBord,
  topProduits,
  type Periode,
  type ProduitVendu,
} from "@/data/tableau-de-bord";
import { resteDeLAncienneApp } from "@/session/bascule";
import { useSession } from "@/session/provider";
import {
  AreaChart,
  Badge,
  Banner,
  BoutonFiltres,
  Card,
  CardHeader,
  Chip,
  ChipRow,
  Divider,
  DonutChart,
  EmptyState,
  Icon,
  ListItem,
  PageHeader,
  ProgressBar,
  Pressable,
  Screen,
  StatValue,
  Text,
  type IconName,
  type TrancheDonut,
} from "@/ui";

const PERIODES: Periode[] = ["day", "week", "month", "year"];
// ┌──────────────────────────────────────────────────────────────────────────┐
// │ `outbox_operations` EST SURVEILLÉ, ET IL FAUT QU'IL LE SOIT.             │
// │                                                                          │
// │ Le tableau de bord compte désormais les ventes encore dans le journal.   │
// │ Sans cette table dans la liste, l'écran ne se relirait qu'au prochain    │
// │ TIRAGE : le caissier encaisse, revient à l'accueil, et son chiffre du    │
// │ jour n'a pas bougé - le défaut qu'on vient de refermer, par l'autre bout.│
// └──────────────────────────────────────────────────────────────────────────┘
const TABLES_RELEVES = [
  "sales",
  "sale_items",
  "customers",
  "outbox_operations",
  "print_jobs",
];
const TABLES_GRAPHES = [
  "sales",
  "payments",
  "payment_methods",
  "outbox_operations",
  "print_jobs",
];
// Le journal en est : `topProduits` fusionne désormais les ventes en attente
// d'envoi, et sans ces deux tables la section ne se relirait qu'au prochain
// tirage - donc pas après l'encaissement qui vient de la remplir.
const TABLES_PRODUITS = [
  "sales",
  "sale_items",
  "products",
  "units",
  "outbox_operations",
  "print_jobs",
];
const TABLES_STOCK = ["stocks", "products"];

/**
 * Carte de relevé : libellé et pastille sur une ligne, valeur dessous.
 *
 * **La pastille monte dans la ligne du libellé, elle ne se pose pas à gauche
 * de la valeur.** C'est la règle de `StatStrip`, née sur le web : une icône
 * posée à côté du nombre lui dispute la largeur, et c'était la première cause
 * de montants rognés. Ici la cellule ne fait que 165 points, la règle compte
 * double.
 */
function CarteKpi({
  label,
  icon,
  fond,
  jeton,
  children,
  pied,
}: {
  label: string;
  icon: IconName;
  fond: string;
  jeton: "success" | "primary" | "chart5" | "chart2";
  children: React.ReactNode;
  pied?: React.ReactNode;
}) {
  return (
    <View className="min-w-0 flex-1 basis-[45%] rounded-xl bg-card p-3.5">
      <View className="flex-row items-start justify-between gap-2">
        <Text
          variant="caption"
          numberOfLines={2}
          className="flex-1 font-sans-medium text-muted-foreground"
        >
          {label}
        </Text>
        {/* Concentrique : carte `rounded-xl` à 14 points de marge, pastille
            `rounded-lg`. Deux rayons égaux imbriqués se voient tout de suite. */}
        <View className={`h-8 w-8 items-center justify-center rounded-lg ${fond}`}>
          <Icon name={icon} size={16} color={jeton} />
        </View>
      </View>
      <View className="mt-2">{children}</View>
      {pied ? <View className="mt-1.5">{pied}</View> : null}
    </View>
  );
}

/**
 * « ↗ 12 % » puis « vs période précédente », comme le web mais sur deux lignes.
 *
 * **À zéro, ni flèche ni couleur.** Le back-office range le zéro du côté
 * positif (`variation >= 0`) et dessine une flèche montante VERTE devant
 * « 0 % » : une journée sans la moindre vente s'annonce alors comme une
 * hausse. C'est la règle déjà posée sur `StatStripItem` - un relevé à zéro
 * reste neutre, sinon on finit par ne plus voir le vrai vert.
 */
function Variation({ valeur }: { valeur: number | null }) {
  if (valeur === null) return null;
  const arrondie = Math.round(valeur);
  const nul = arrondie === 0;
  const positif = valeur >= 0;
  return (
    <View>
      <View className="flex-row items-center gap-0.5">
        {nul ? null : (
          <Icon
            name={positif ? "ArrowUpRight" : "ArrowDownRight"}
            size={13}
            color={positif ? "success" : "destructive"}
          />
        )}
        <Text
          variant="caption"
          numeric
          className={nul ? undefined : positif ? "text-success" : "text-destructive"}
        >
          {`${Math.abs(arrondie)} %`}
        </Text>
      </View>
      {/* Sur une cellule de 165 points, « ↗ 12 % vs période précédente » se
          rognait. La mention passe dessous : elle est la moins urgente des
          deux, et la tronquer effacerait le SENS du pourcentage. */}
      <Text variant="caption" numberOfLines={1}>
        vs période préc.
      </Text>
    </View>
  );
}

/** Une ligne de « Produits les plus vendus », menant à la fiche article. */
function LigneProduit({
  produit,
  rang,
  money,
}: {
  produit: ProduitVendu;
  rang: number;
  /** Formateur déjà lié à la devise principale : cet écran n'en connaît qu'une. */
  money: (m: number) => string;
}) {
  return (
    <Pressable
      onPress={() => router.push(`/article/${produit.id}`)}
      accessibilityRole="button"
      accessibilityLabel={`${produit.nom}, ${produit.rendu}`}
      className="min-h-11 flex-row items-center gap-3 px-4 py-3"
    >
      <View className="h-7 w-7 items-center justify-center rounded-full bg-accent">
        <Text variant="caption" numeric className="font-sans-bold text-accent-foreground">
          {String(rang)}
        </Text>
      </View>
      <View className="min-w-0 flex-1">
        <Text variant="bodySmall" numberOfLines={1} className="font-sans-medium">
          {produit.nom}
        </Text>
        <Text variant="caption" numberOfLines={1}>
          {produit.sku}
        </Text>
      </View>
      <View className="items-end">
        <Text variant="bodySmall" numeric numberOfLines={1} className="font-sans-medium">
          {produit.rendu}
        </Text>
        {/* Le total brut ne s'affiche QUE si le rendu est ventilé : « 24
            bouteilles » suivi de « 24 au total » serait une redite. */}
        {produit.facteur != null ? (
          <Text variant="caption" numeric>
            {`${formatNumberFr(produit.quantite, 3)} au total`}
          </Text>
        ) : null}
        <Text variant="caption" numeric>
          {money(produit.revenus)}
        </Text>
      </View>
    </Pressable>
  );
}

/** Tuile d'alerte d'inventaire. Pressable dès qu'elle mène quelque part. */
function TuileInventaire({
  icon,
  jeton,
  fond,
  titre,
  detail,
  valeur,
  onPress,
}: {
  icon: IconName;
  jeton: "warning" | "chart2";
  fond: string;
  titre: string;
  detail: string;
  valeur: React.ReactNode;
  onPress?: () => void;
}) {
  const contenu = (
    <>
      <View className={`h-9 w-9 items-center justify-center rounded-lg ${fond}`}>
        <Icon name={icon} size={18} color={jeton} />
      </View>
      <View className="min-w-0 flex-1">
        <Text variant="bodySmall" numberOfLines={1} className="font-sans-medium">
          {titre}
        </Text>
        <Text variant="caption" numberOfLines={1}>
          {detail}
        </Text>
      </View>
      {valeur}
      {onPress ? <Icon name="ChevronRight" size={16} color="mutedForeground" /> : null}
    </>
  );

  const classe = `min-h-14 flex-row items-center gap-3 rounded-lg border border-border p-3 ${fond}`;
  if (!onPress) return <View className={classe}>{contenu}</View>;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={titre} className={classe}>
      {contenu}
    </Pressable>
  );
}

export default function TableauDeBord() {
  const { snapshot } = useSession();
  const money = useMonnaie();
  const [periode, setPeriode] = useState<Periode>("month");

  // La devise de lecture de TOUT l'écran. Jamais la chaîne vide : `money(x, "")`
  // rendrait un nombre nu, sans symbole, dans une application multi-devise.
  const principale =
    snapshot?.currencies?.find((d) => d.is_primary)?.currency_code ??
    money.primaryCode;
  const enPrincipale = useCallback(
    (v: number) => money.money(v, principale),
    [money, principale]
  );

  // Le périmètre du tableau de bord. `avecAuteur` est VRAI : une vente a un
  // vendeur, et c'est la première question qu'un propriétaire pose devant ces
  // chiffres. La carte d'inventaire, elle, n'en tiendra pas compte - un stock
  // est un état, pas un acte.
  const [choixPerimetre, setChoixPerimetre] = useState<FiltrePerimetre>(PERIMETRE_VIDE);
  const perimetre = usePerimetre(choixPerimetre, true);
  const applique = perimetre.applique;
  const moi = snapshot?.user.id ?? null;
  // Ce que les ventes ENCORE EN FILE ont besoin qu'on sache d'elles :
  // leur auteur, et si le filtre d'entrepôt courant tolère qu'on ignore
  // le leur - une caisse peut n'avoir aucun dépôt.
  const file = useMemo(() => contexteFileDe(perimetre, moi), [perimetre, moi]);

  const charger = useCallback(
    () => relevesTableauDeBord(periode, applique, file),
    [periode, applique, file]
  );
  const { donnees: r } = useLecture(charger, {
    tables: TABLES_RELEVES,
    deps: [periode, applique, file],
  });

  const chargerGraphes = useCallback(
    () => graphesTableauDeBord(periode, applique, file),
    [periode, applique, file]
  );
  const { donnees: g } = useLecture(chargerGraphes, {
    tables: TABLES_GRAPHES,
    deps: [periode, applique, file],
  });

  const chargerProduits = useCallback(
    () => topProduits(periode, applique, file),
    [periode, applique, file]
  );
  const { donnees: produits } = useLecture(chargerProduits, {
    tables: TABLES_PRODUITS,
    deps: [periode, applique, file],
  });

  const [feuillePerimetre, setFeuillePerimetre] = useState(false);
  const puces = useMemo(() => resumeDuPerimetre(perimetre), [perimetre]);

  const chargerInventaire = useCallback(
    () => releveInventaire(applique),
    [applique]
  );
  const { donnees: inventaire } = useLecture(chargerInventaire, {
    tables: TABLES_STOCK,
    deps: [applique],
  });
  const { donnees: lesAlertes } = useLecture(() => alertes(12), {
    tables: ["stocks", "products", "sales", "customers"],
  });
  const listeAlertes = lesAlertes ?? [];

  // La bascule depuis l'ancienne application. Aucune table ne la change : le
  // fichier hérité est figé, on le lit une fois.
  const { donnees: reste } = useLecture(resteDeLAncienneApp, { tables: [] });

  // L'anneau ventile par DEVISE, et la part se calcule sur le montant converti :
  // 7 728 FC et 132 775 $ ne sont pas comparables tels quels, et un anneau bâti
  // sur les montants natifs donnerait au franc la part du lion.
  const tranches: TrancheDonut[] = (g?.devises ?? []).map((d) => ({
    cle: d.code,
    label: d.code,
    valeur: d.principal,
    // Le montant NATIF est celui que le caissier a compté : c'est lui qu'il
    // retrouve dans son tiroir, et le taire ferait de l'anneau une conversion
    // de plus au lieu d'une lecture de ce qui est entré.
    detail:
      d.code === principale
        ? `${d.nombre} ${d.nombre > 1 ? "règlements" : "règlement"}`
        : `${money.money(d.natif, d.code)} • ${d.nombre} ${d.nombre > 1 ? "règlements" : "règlement"}`,
  }));
  const totalMoyens = (g?.paiements ?? []).reduce((s, p) => s + p.montant, 0);

  return (
    <Screen scroll edges={[]}>
      <PageHeader
        title="Tableau de bord"
        subtitle={`${snapshot?.organization.name ?? ""} • ${LABELS_PERIODE[periode].phrase}`}
      />

      {/* ┌──────────────────────────────────────────────────────────────────┐
          │ EN TÊTE DU TABLEAU DE BORD, ET NON DERRIÈRE UN MENU.            │
          │                                                                  │
          │ Les deux applications portent le même identifiant natif : la     │
          │ nouvelle s'installe PAR-DESSUS l'ancienne et hérite de son bac à │
          │ sable. Les ventes que l'ancienne n'avait pas poussées restent    │
          │ dans un fichier que personne ne lit plus. Un marchand ne va pas  │
          │ chercher cela dans un écran de réglages : ou bien on le lui dit  │
          │ au premier regard, ou bien il ne le saura jamais.                │
          │                                                                  │
          │ On ne BLOQUE pas pour autant : il peut vendre, et l'empêcher     │
          │ coûterait plus cher que le problème.                             │
          └──────────────────────────────────────────────────────────────────┘ */}
      {reste ? (
        <View className="mt-4">
          <Banner
            tone="destructive"
            title="Des ventes de l'ancienne application n'ont jamais été envoyées"
            message={
              reste.total < 0
                ? "Un fichier hérité est présent sur ce terminal mais illisible. Ne désinstallez rien avant de l'avoir fait examiner."
                : reste.total > 1
                  ? `${reste.total} enregistrements attendent encore sur ce terminal, et cette application ne les reprend pas.`
                  : "Un enregistrement attend encore sur ce terminal, et cette application ne le reprend pas."
            }
            action={{
              label: "Voir quoi faire",
              onPress: () => router.push("/appareil/bascule"),
            }}
          />
        </View>
      ) : null}

      {/* Sélecteur de période : les quatre boutons du web, « Mois » par défaut.
          Hauteur 44 points, la cible tactile du produit - le comptoir se tient
          debout, parfois avec un gant. */}
      <View className="mt-4 flex-row gap-2">
        {PERIODES.map((p) => {
          const actif = p === periode;
          return (
            <Pressable
              key={p}
              onPress={() => setPeriode(p)}
              haptic="selection"
              accessibilityRole="button"
              accessibilityState={{ selected: actif }}
              accessibilityLabel={LABELS_PERIODE[p].bouton}
              className={`h-11 flex-1 items-center justify-center rounded-lg border ${
                actif ? "border-primary bg-primary" : "border-border bg-card"
              }`}
            >
              <Text
                variant="bodySmall"
                className={
                  actif
                    ? "font-sans-medium text-primary-foreground"
                    : "font-sans-medium text-foreground"
                }
              >
                {LABELS_PERIODE[p].bouton}
              </Text>
            </Pressable>
          );
        })}
        {/* Le périmètre se pose À CÔTÉ de la période : les deux bornent le même
            écran, et les séparer ferait chercher l'un après avoir trouvé
            l'autre. La pastille ne compte que ce qui est CHOISI : un caissier
            porte deux contraintes qu'il n'a pas posées. */}
        <BoutonFiltres
          actifs={nombreDeFiltresPerimetre(perimetre)}
          onPress={() => setFeuillePerimetre(true)}
        />
      </View>

      {puces.length > 0 ? (
        <ChipRow>
          {puces.map((puce) => (
            <Chip
              key={puce.cle}
              label={puce.label}
              actif
              onPress={() =>
                setChoixPerimetre(sansLeFiltrePerimetre(choixPerimetre, puce.cle))
              }
            />
          ))}
        </ChipRow>
      ) : null}

      {/* Quatre relevés, DEUX COLONNES : voir l'encadré en tête de fichier. */}
      <View className="mt-4 flex-row flex-wrap gap-3">
        <CarteKpi
          label="Ventes totales"
          icon="Banknote"
          fond="bg-success/15"
          jeton="success"
          pied={<Variation valeur={r?.variationVentes ?? null} />}
        >
          <StatValue value={r ? enPrincipale(r.ventes) : formatPrice(0)} />
        </CarteKpi>

        <CarteKpi
          label="Total clients"
          icon="Users"
          fond="bg-primary/10"
          jeton="primary"
          pied={
            <Text variant="caption" numberOfLines={2}>
              <Text variant="caption" className="text-success">
                {`+${r?.nouveauxClients ?? 0} `}
              </Text>
              {/* « +1 nouveaux » ne s'accorde pas, et le web l'écrit ainsi. */}
              {(r?.nouveauxClients ?? 0) > 1 ? "nouveaux" : "nouveau"} cette période
            </Text>
          }
        >
          <StatValue value={formatNumber(r?.clients ?? 0)} />
        </CarteKpi>

        <CarteKpi
          label="Unités vendues"
          icon="Package"
          fond="bg-chart-5/15"
          jeton="chart5"
          pied={<Variation valeur={r?.variationUnites ?? null} />}
        >
          <StatValue value={formatNumber(r?.unitesVendues ?? 0)} />
        </CarteKpi>

        <CarteKpi
          label="Bénéfice brut"
          icon="TrendingUp"
          fond="bg-chart-2/15"
          jeton="chart2"
          pied={
            // La marge est un RAPPORT : sans chiffre d'affaires elle ne se
            // rattache à rien, et un « 0 % » se lirait comme une vente à perte.
            r?.marge !== null && r?.marge !== undefined ? (
              <Badge tone="primary">{`Marge : ${formatFixedFr(r.marge, 1)} %`}</Badge>
            ) : null
          }
        >
          <StatValue value={r ? enPrincipale(r.benefice) : formatPrice(0)} />
        </CarteKpi>
      </View>

      <View className="mt-5">
        <Card>
          <CardHeader
            title="Évolution des ventes"
            subtitle={`Facturé, en ${principale} • ${LABELS_PERIODE[periode].phrase.toLowerCase()}`}
            right={<Icon name="BarChart3" size={18} color="mutedForeground" />}
          />
          {/* ┌────────────────────────────────────────────────────────────┐
              │ UNE SÉRIE ENTIÈREMENT NULLE SE DIT, ELLE NE SE DESSINE PAS.│
              │                                                            │
              │ Les seaux vides sont conservés - c'est la règle, et elle   │
              │ vaut DANS une période qui a vendu. Mais une période entière│
              │ à zéro tracée en trait plein annonce « 0 FC » en tête et se│
              │ lit comme un effondrement, alors qu'il n'y a simplement    │
              │ rien eu à facturer.                                        │
              └────────────────────────────────────────────────────────────┘ */}
          {g && g.totalVendu > 0 ? (
            <AreaChart
              // Remonter le composant remet la lecture à zéro : une valeur
              // touchée sur les trente derniers jours n'a plus aucun sens une
              // fois la période changée.
              key={periode}
              points={g.evolution}
              formater={enPrincipale}
              resume={{ label: "Total de la période", valeur: g.totalVendu }}
            />
          ) : (
            <EmptyState
              variante="carte"
              title="Aucune vente"
              message="Rien n'a été facturé sur cette période."
            />
          )}
        </Card>
      </View>

      <View className="mt-5">
        <Card>
          <CardHeader
            title="Encaissements par devise"
            subtitle={`Converti en ${principale}`}
            right={<Icon name="Banknote" size={18} color="mutedForeground" />}
          />
          {tranches.length > 0 ? (
            <>
              <DonutChart
                key={periode}
                tranches={tranches}
                formater={enPrincipale}
                legendeTotal="Total encaissé"
              />

              {/* ┌──────────────────────────────────────────────────────────┐
                  │ LES MOYENS DE PAIEMENT PASSENT EN SECOND PLAN.          │
                  │                                                          │
                  │ Ils occupaient l'anneau ; sur un écran tout entier       │
                  │ converti, la question première est devenue « en quelle   │
                  │ monnaie l'argent est entré ». Même contenu, sans couleur │
                  │ de série ni légende à croiser : un filet et un montant.  │
                  └──────────────────────────────────────────────────────────┘ */}
              {(g?.paiements.length ?? 0) > 0 ? (
                <View className="mt-5 gap-3 border-t border-border pt-4">
                  <Text variant="caption">Par moyen de paiement</Text>
                  {g!.paiements.map((m) => (
                    <View key={m.nom} className="gap-1.5">
                      <View className="flex-row items-baseline justify-between gap-3">
                        {/* `min-w-0` avec `flex-1`, comme partout ailleurs :
                            sans lui, un libellé long ne se rétrécit pas et
                            pousse le montant hors de l'écran au lieu de se
                            faire tronquer. */}
                        <View className="min-w-0 flex-1">
                          <Text numberOfLines={1}>{m.nom}</Text>
                        </View>
                        <Text numeric className="font-sans-medium">
                          {enPrincipale(m.montant)}
                        </Text>
                      </View>
                      <ProgressBar valeur={m.montant} max={totalMoyens} />
                    </View>
                  ))}
                </View>
              ) : null}
            </>
          ) : (
            <EmptyState
              variante="carte"
              title="Aucun encaissement"
              message="Rien n'a été réglé sur cette période."
            />
          )}
        </Card>
      </View>

      <View className="mt-5">
        <Card className="overflow-hidden p-0">
          <View className="p-4 pb-0">
            <CardHeader
              title="Produits les plus vendus"
              subtitle="Les cinq premiers de la période"
              right={<Icon name="Package" size={18} color="mutedForeground" />}
            />
          </View>
          {produits && produits.length > 0 ? (
            produits.slice(0, 5).map((p, i) => (
              <View key={p.id}>
                {i > 0 ? <Divider /> : null}
                <LigneProduit produit={p} rang={i + 1} money={enPrincipale} />
              </View>
            ))
          ) : (
            // Cette carte est en `p-0` parce que ses RANGÉES sont pleine
            // largeur, filets compris. L'état vide, lui, n'en est pas une :
            // sans ce rembourrage, il se poserait 16 points plus haut que
            // celui des deux cartes voisines, et trois cartes vides à la
            // suite ne se termineraient pas à la même hauteur.
            <View className="pb-4">
              <EmptyState
                variante="carte"
                title="Aucun produit vendu"
                message="Aucune ligne de vente sur cette période."
              />
            </View>
          )}
        </Card>
      </View>

      <View className="mt-5">
        <Card>
          <CardHeader title="Alertes inventaire" subtitle="État du stock" />
          <View className="gap-3">
            <TuileInventaire
              icon="AlertTriangle"
              jeton="warning"
              fond="bg-warning/10"
              titre="Stock bas"
              detail="Produits à réapprovisionner"
              valeur={
                <Text variant="h4" numeric className="text-warning">
                  {formatNumber(inventaire?.stockBas ?? 0)}
                </Text>
              }
              // Un chiffre d'alerte qui ne mène nulle part ne sert à rien : la
              // liste s'ouvre DÉJÀ filtrée sur les rayons concernés.
              onPress={() => router.push("/rayon?etat=bas")}
            />
            <TuileInventaire
              icon="Package"
              jeton="chart2"
              fond="bg-chart-2/10"
              titre="Valeur du stock"
              detail="Au coût moyen, sinon au prix d'achat"
              valeur={
                <Text variant="bodySmall" numeric className="font-sans-bold text-foreground">
                  {money.money(inventaire?.valeurStock ?? 0, money.primaryCode)}
                </Text>
              }
            />
          </View>
        </Card>
      </View>

      {/* Les alertes actionnables : elles n'existent pas au back-office, et
          c'est ce qu'un terminal apporte de plus. Chacune MÈNE quelque part. */}
      <View className="mt-6">
        <Text variant="h4" className="mb-3">
          {`Alertes (${listeAlertes.length})`}
        </Text>
        {listeAlertes.length === 0 ? (
          <Card>
            <Text variant="bodySmall">
              Rien à signaler : aucune rupture, aucun stock bas, aucune facture en
              retard.
            </Text>
          </Card>
        ) : (
          <Card className="overflow-hidden p-0">
            {listeAlertes.map((a, i) => (
              <View key={a.id}>
                {i > 0 ? <Divider /> : null}
                <ListItem
                  title={a.titre}
                  subtitle={a.detail}
                  icon={
                    a.genre === "rupture"
                      ? "PackageX"
                      : a.genre === "stock_bas"
                        ? "TrendingDown"
                        : "Clock"
                  }
                  chevron={Boolean(a.cible)}
                  onPress={a.cible ? () => router.push(a.cible as never) : undefined}
                />
              </View>
            ))}
          </Card>
        )}
      </View>
      <FeuilleFiltresPerimetre
        ouvert={feuillePerimetre}
        onFermer={() => setFeuillePerimetre(false)}
        valeur={choixPerimetre}
        onChanger={setChoixPerimetre}
        offre={perimetre}
        libelleResultats="Voir le tableau de bord"
      />
    </Screen>
  );
}
