/**
 * Rapports & Statistiques. **Parité stricte avec `app/dashboard/reports/page.tsx`.**
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LES RAPPORTS EXIGENT LE RÉSEAU, et c'est délibéré.                      │
 * │                                                                          │
 * │ Leurs agrégats viennent de `/reports/statistics/*`, dont les définitions │
 * │ sont subtiles : périmètre entrepôt, portée par créateur pour un          │
 * │ caissier, bornes de dates locales, conversions inter-devises. Les        │
 * │ recalculer ici donnerait deux chiffres pour le même établissement.       │
 * │                                                                          │
 * │ Un rapport est un outil d'analyse, pas un geste de comptoir. Ce qui doit │
 * │ marcher hors ligne, c'est vendre et encaisser - et cela marche.          │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CET ÉCRAN DOIT MONTRER EXACTEMENT CE QUE LE BACK-OFFICE MONTRE.         │
 * │                                                                          │
 * │ Un marchand compare les deux surfaces, et une colonne absente d'un côté  │
 * │ se lit comme une donnée perdue. D'où, contre la grammaire habituelle du  │
 * │ terminal : de vrais TABLEAUX à colonnes (voir `ui/tableau.tsx`), les dix │
 * │ relevés GLOBAUX au-dessus des onglets, les commandes propres de deux     │
 * │ onglets, et la pagination par vingt.                                     │
 * │                                                                          │
 * │ Conséquence technique : cet écran n'est PAS une `DataList`. Un tableau à │
 * │ défilement horizontal dans une liste virtualisée donne des hauteurs      │
 * │ fausses et deux gestes qui se disputent. Les tableaux étant paginés par  │
 * │ vingt, `Screen scroll` suffit et ne coûte rien.                          │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { View } from "react-native";

import { dateDepuisJourISO, jourISO } from "@/data/dates";
import { formatDateFr } from "@vente-facile/core";
import { useMonnaie } from "@/data/devises";
import {
  GROUPEMENTS,
  PERIODES_RAPPORT,
  bornesRapport,
  libellePeriode,
  type GroupBy,
  type PeriodeRapport,
} from "@/data/periodes-rapports";
import {
  chargerRapport,
  chargerReleves,
  URL_EXPORT,
  type CarteRapport,
  type GrapheRapport,
  type LigneRapport,
  type OngletRapport,
  type Rapport,
  type RelevesGlobaux,
  type SectionRapport,
} from "@/data/rapports";
import { useEnLigne } from "@/data/reseau";
import { listeMembres, type Membre } from "@/data/administration";
import {
  telechargerDocument,
  type FormatExport,
} from "@/features/export/telecharger";
import { ApiError } from "@/api/errors";
import { useSession } from "@/session/provider";
import {
  AreaChart,
  Badge,
  Banner,
  BarChart,
  BarChartHorizontal,
  Button,
  Card,
  ChampDate,
  Chip,
  ChipRow,
  Divider,
  Icon,
  IconButton,
  PageHeader,
  Rang,
  Screen,
  Segmented,
  Sheet,
  StatStrip,
  StatStripItem,
  StatValue,
  Tableau,
  Text,
  useToast,
} from "@/ui";

const ONGLETS: { valeur: OngletRapport; label: string }[] = [
  { valeur: "overview", label: "Vue d'ensemble" },
  { valeur: "daily-cash", label: "Rapport journalier" },
  { valeur: "sales", label: "Ventes" },
  { valeur: "products", label: "Produits" },
  { valeur: "customers", label: "Clients" },
  { valeur: "stock", label: "Stock" },
  { valeur: "profits", label: "Bénéfices" },
  { valeur: "user-activity", label: "Par utilisateur" },
];

const GRANULARITES: { valeur: "day" | "hour"; label: string }[] = [
  { valeur: "day", label: "Par jour" },
  { valeur: "hour", label: "Par heure" },
];

export default function Rapports() {
  const money = useMonnaie();
  const { snapshot } = useSession();
  // L'état réseau est un HOOK, lu au rendu : l'interroger dans un `catch`
  // ferait un appel de hook conditionnel.
  const enLigne = useEnLigne();
  const toast = useToast();

  const [onglet, setOnglet] = useState<OngletRapport>("overview");
  const [periode, setPeriode] = useState<PeriodeRapport>("last_30_days");
  const [perso, setPerso] = useState({ debut: "", fin: "" });
  const [groupBy, setGroupBy] = useState<GroupBy>("day");
  const [pages, setPages] = useState<Record<string, number>>({});

  const [dateJournaliere, setDateJournaliere] = useState(() =>
    jourISO(new Date()),
  );
  const [utilisateur, setUtilisateur] = useState<string>("");
  const [granularite, setGranularite] = useState<"day" | "hour">("day");
  const [membres, setMembres] = useState<Membre[]>([]);

  const [releves, setReleves] = useState<RelevesGlobaux | null>(null);
  const [rapport, setRapport] = useState<Rapport | null>(null);
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [feuille, setFeuille] = useState<null | "periode" | "utilisateur">(
    null,
  );
  const [envoiExport, setEnvoiExport] = useState(false);

  const organisation = snapshot?.organization.id ?? "";
  const devisePrincipale =
    snapshot?.currencies?.find((d) => d.is_primary)?.currency_code ?? "CDF";

  const bornes = useMemo(
    () => bornesRapport(periode, periode === "custom" ? perso : undefined),
    [periode, perso],
  );

  // Les membres viennent de la base LOCALE (`memberships` × `users`), déjà
  // tirée au lot 10 : le sélecteur s'ouvre sans réseau.
  useEffect(() => {
    void listeMembres()
      .then(setMembres)
      .catch(() => setMembres([]));
  }, []);

  const contexte = useMemo(
    () => ({
      organisation,
      money: money.money,
      devisePrincipale,
      debut: bornes.debut,
      fin: bornes.fin,
      groupBy,
      pages,
      dateJournaliere,
      utilisateur: onglet === "user-activity" ? utilisateur : undefined,
      granularite,
    }),
    [
      organisation,
      money.money,
      devisePrincipale,
      bornes.debut,
      bornes.fin,
      groupBy,
      pages,
      dateJournaliere,
      onglet,
      utilisateur,
      granularite,
    ],
  );

  const charger = useCallback(async () => {
    if (!organisation) return;
    setChargement(true);
    setErreur(null);
    try {
      // Les relevés GLOBAUX et l'onglet partent ensemble : ils ne dépendent
      // pas l'un de l'autre, et les enchaîner doublerait l'attente.
      const [r, o] = await Promise.all([
        chargerReleves(contexte),
        chargerRapport(onglet, contexte),
      ]);
      setReleves(r);
      setRapport(o);
    } catch (e) {
      // Hors ligne, on le DIT plutôt que d'afficher un tableau vide : un
      // rapport vide se lit comme « rien à signaler », ce qui est faux.
      setErreur(
        enLigne
          ? e instanceof Error
            ? e.message
            : "Le rapport n'a pas pu être chargé."
          : "hors-ligne",
      );
      setRapport(null);
    } finally {
      setChargement(false);
    }
  }, [organisation, onglet, contexte, enLigne]);

  useEffect(() => {
    void charger();
  }, [charger]);

  // Changer d'onglet ou de période remet les tableaux à leur première page :
  // rester en page 4 d'un tableau qui n'en a plus que deux afficherait un vide
  // que rien n'explique.
  const changerOnglet = (v: string) => {
    setPages({});
    setOnglet(v as OngletRapport);
  };
  const changerPeriode = (p: PeriodeRapport) => {
    setPages({});
    if (p === "custom") {
      setFeuille("periode");
      return;
    }
    setPeriode(p);
  };

  /**
   * L'export, fabriqué par le SERVEUR.
   *
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ LE TERMINAL NE DÉCRIT PLUS SON DOCUMENT.                             │
   * │                                                                      │
   * │ Il le décrivait à partir de ce qu'il avait à l'écran, c'est-à-dire de │
   * │ la PAGE affichée : vingt lignes, sous un titre qui annonçait          │
   * │ « 347 articles ». Le back-office faisait de même de son côté, avec sa │
   * │ propre mise en page. Un même rapport donnait deux documents, dont     │
   * │ aucun ne couvrait ce qu'il prétendait.                                │
   * │                                                                      │
   * │ Les bornes partent en dates EXPLICITES : la fenêtre ne dépend alors   │
   * │ plus d'un défaut serveur que le terminal ne voit pas.                 │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  const exporter = async (format: FormatExport) => {
    setEnvoiExport(true);
    try {
      await telechargerDocument(
        URL_EXPORT,
        {
          tab: onglet,
          // Les DATES délimitent la fenêtre, `period` la NOMME. Sans elle, le
          // document sortait « Personnalisé » ici et « 30 derniers jours » au
          // back-office, pour exactement la même fenêtre : relevé en comparant
          // les deux fichiers, seule divergence sur quatre-vingt-une lignes.
          period: periode,
          date_from: bornes.debut,
          date_to: bornes.fin,
          group_by: groupBy,
          user: onglet === "user-activity" ? utilisateur : undefined,
          date: onglet === "daily-cash" ? dateJournaliere : undefined,
        },
        format,
        `${ONGLETS.find((o) => o.valeur === onglet)?.label ?? "Rapport"} ${bornes.debut}`
      );
    } catch (erreur) {
      toast.erreur(
        erreur instanceof ApiError
          ? erreur.message
          : "L'export n'a pas pu être produit."
      );
    } finally {
      setEnvoiExport(false);
    }
  };

  /**
   * L'export exige le RÉSEAU, et le bouton le dit avant l'appui.
   *
   * C'est la doctrine déjà posée sur cet écran : un rapport est un outil
   * d'analyse, pas un geste de comptoir. Échouer après coup ferait croire à
   * une panne là où il n'y a qu'une absence de réseau.
   */
  const exportImpossible = !enLigne
    ? "Sans réseau, aucun document ne peut être produit."
    : onglet === "user-activity" && !utilisateur
      ? "Choisissez un utilisateur."
      : null;

  const membreChoisi = membres.find((m) => m.userId === utilisateur);

  return (
    <Screen
      edges={[]}
      padded={false}
      scroll
      onRefresh={() => void charger()}
      refreshing={chargement}
    >
      <View className="gap-4 p-4">
        <PageHeader
          title="Rapports & Statistiques"
          subtitle="Analysez les performances de votre entreprise"
        />

        {/* ── Les filtres, ceux du back-office ────────────────────────────── */}
        <View className="gap-2">
          <ChipRow>
            {PERIODES_RAPPORT.map((p) => (
              <Chip
                key={p.valeur}
                label={p.label}
                actif={periode === p.valeur}
                onPress={() => changerPeriode(p.valeur)}
              />
            ))}
          </ChipRow>
          {/* La fenêtre choisie s'écrit SOUS la rangée, pas dans la puce :
              « 2026-09-01 → 2026-09-02 » y sortait tronqué en « 2026-09-01 →
              20... », c'est-à-dire sans sa borne haute - la seule chose que
              la puce avait à dire de plus que son libellé. */}
          {periode === "custom" && perso.debut && perso.fin ? (
            <Text variant="caption">
              {`Du ${formatDateFr(dateDepuisJourISO(perso.debut)!)} au ${formatDateFr(dateDepuisJourISO(perso.fin)!)}`}
            </Text>
          ) : null}
          <View className="flex-row items-center gap-2">
            <Text variant="caption">Grouper par</Text>
            <View className="min-w-0 flex-1">
              <Segmented
                options={GROUPEMENTS}
                valeur={groupBy}
                onChange={(v) => setGroupBy(v as GroupBy)}
              />
            </View>
          </View>
        </View>

        {erreur === "hors-ligne" ? (
          <Banner
            tone="warning"
            title="Les rapports demandent une connexion"
            message="Leurs chiffres viennent du serveur, pour qu'ils ne diffèrent jamais de ceux du back-office. Vendre et encaisser, eux, marchent hors ligne."
            action={{ label: "Réessayer", onPress: () => void charger() }}
          />
        ) : erreur ? (
          <Banner
            tone="destructive"
            title="Le rapport n'a pas pu être chargé"
            message={erreur}
            action={{ label: "Réessayer", onPress: () => void charger() }}
          />
        ) : null}

        {releves ? <RelevesGlobauxVue r={releves} money={money} /> : null}

        <Segmented
          options={ONGLETS.map((o) => ({ valeur: o.valeur, label: o.label }))}
          valeur={onglet}
          onChange={changerOnglet}
        />

        {/* ── Les commandes propres à un onglet ───────────────────────────── */}
        {onglet === "daily-cash" ? (
          // ┌────────────────────────────────────────────────────────────┐
          // │ LE LIBELLÉ SORT DE LA RANGÉE, SINON RIEN NE S'ALIGNE.      │
          // │                                                            │
          // │ Il vivait DANS la colonne de gauche : la rangée devait     │
          // │ alors aligner un bloc « libellé + champ » de soixante-dix   │
          // │ points contre un bouton de quarante-huit, et aucune         │
          // │ valeur d'`items-*` ne rend ça droit - `items-end` colle le  │
          // │ bouton au bas du champ, `items-center` le remonte au        │
          // │ milieu du libellé. Relevé à l'écran. Le libellé au-dessus   │
          // │ de la rangée, les deux commandes ont la MÊME hauteur et se  │
          // │ posent sur la même ligne de base.                           │
          // └────────────────────────────────────────────────────────────┘
          <View className="gap-1">
            <Text variant="caption">Date du rapport</Text>
            <View className="flex-row items-center gap-2">
              <View className="min-w-0 flex-1">
                <ChampDate
                  valeur={dateJournaliere}
                  onChange={setDateJournaliere}
                  // Un rapport de caisse ne se tire pas pour demain : la
                  // journée n'a pas eu lieu, et le sélecteur ferme la porte
                  // plutôt que de laisser le serveur rendre un état vide.
                  maximum={jourISO(new Date())}
                  accessibilityLabel="Date du rapport"
                />
              </View>
              <Button
                variant="outline"
                leftIcon="RefreshCw"
                onPress={() => void charger()}
              >
                Charger
              </Button>
            </View>
          </View>
        ) : null}

        {onglet === "user-activity" ? (
          <View className="gap-2">
            <Button
              variant="outline"
              fullWidth
              leftIcon="User"
              onPress={() => setFeuille("utilisateur")}
            >
              {membreChoisi ? membreChoisi.nom : "Choisir un utilisateur"}
            </Button>
            <Segmented
              options={GRANULARITES}
              valeur={granularite}
              onChange={(v) => setGranularite(v as "day" | "hour")}
            />
            <Text variant="caption">
              Période : utilise les filtres de date en haut de page.
            </Text>
          </View>
        ) : null}

        {/* ── Les exports, comme chaque onglet du back-office ─────────────── */}
        <View className="flex-row flex-wrap justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            leftIcon="FileText"
            disabled={envoiExport || Boolean(exportImpossible)}
            onPress={() => void exporter("pdf")}
          >
            PDF
          </Button>
          <Button
            variant="outline"
            size="sm"
            leftIcon="FileSpreadsheet"
            disabled={envoiExport || Boolean(exportImpossible)}
            onPress={() => void exporter("xlsx")}
          >
            Excel
          </Button>
          <Button
            variant="outline"
            size="sm"
            leftIcon="Download"
            disabled={envoiExport || Boolean(exportImpossible)}
            onPress={() => void exporter("csv")}
          >
            CSV
          </Button>
        </View>
        {exportImpossible ? (
          <Text variant="caption" className="text-right text-muted-foreground">
            {exportImpossible}
          </Text>
        ) : null}
      </View>

      {/* ── Les sections de l'onglet ──────────────────────────────────────── */}
      {rapport?.sections.map((s) => (
        <SectionVue
          key={s.cle}
          section={s}
          money={money}
          onPage={(p) => setPages((v) => ({ ...v, [s.cle]: p }))}
        />
      ))}

      {chargement && !rapport ? (
        <View className="px-4 py-8">
          <Text variant="bodySmall">Chargement…</Text>
        </View>
      ) : null}

      <Sheet
        ouvert={feuille === "periode"}
        onFermer={() => setFeuille(null)}
        titre="Période personnalisée"
      >
        <View className="gap-3">
          <View>
            <Text variant="caption" className="mb-1">
              Du
            </Text>
            <ChampDate
              valeur={perso.debut}
              onChange={(v) => setPerso((p) => ({ ...p, debut: v }))}
              // Un début après la fin donnerait une fenêtre vide, que le
              // serveur refuse en 400. Le sélecteur l'interdit d'emblée.
              maximum={perso.fin || jourISO(new Date())}
              accessibilityLabel="Début de la période"
            />
          </View>
          <View>
            <Text variant="caption" className="mb-1">
              Au
            </Text>
            <ChampDate
              valeur={perso.fin}
              onChange={(v) => setPerso((p) => ({ ...p, fin: v }))}
              minimum={perso.debut || undefined}
              maximum={jourISO(new Date())}
              accessibilityLabel="Fin de la période"
            />
          </View>
          <Button
            fullWidth
            // Une borne vide donnerait une fenêtre que personne n'a demandée :
            // le bouton reste fermé tant que les deux ne sont pas saisies.
            disabled={
              !/^\d{4}-\d{2}-\d{2}$/.test(perso.debut) ||
              !/^\d{4}-\d{2}-\d{2}$/.test(perso.fin)
            }
            onPress={() => {
              setPages({});
              setPeriode("custom");
              setFeuille(null);
            }}
          >
            Appliquer
          </Button>
        </View>
      </Sheet>

      <Sheet
        ouvert={feuille === "utilisateur"}
        onFermer={() => setFeuille(null)}
        titre="Utilisateur"
      >
        <View>
          {membres.length === 0 ? (
            <Text variant="bodySmall">
              Aucun utilisateur n&apos;est encore descendu sur ce terminal.
            </Text>
          ) : null}
          {membres.map((mb, i) => (
            <View key={mb.id}>
              {i > 0 ? <Divider /> : null}
              <Button
                variant="ghost"
                fullWidth
                onPress={() => {
                  setUtilisateur(mb.userId);
                  setFeuille(null);
                }}
              >
                {`${mb.nom} - ${mb.roleLabel}`}
              </Button>
            </View>
          ))}
        </View>
      </Sheet>
    </Screen>
  );
}

/**
 * Les dix relevés globaux, au-dessus des onglets.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA VARIATION À ZÉRO RESTE NEUTRE, SANS FLÈCHE.                          │
 * │                                                                          │
 * │ Le tableau de bord rangeait le zéro du côté positif et dessinait une     │
 * │ flèche montante VERTE devant « 0 % » : une période sans la moindre vente │
 * │ s'annonçait comme une hausse. À force de voir du vert qui ne dit rien,   │
 * │ on ne voit plus le vrai.                                                 │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
function RelevesGlobauxVue({
  r,
  money,
}: {
  r: RelevesGlobaux;
  money: ReturnType<typeof useMonnaie>;
}) {
  const m = (v: number) => money.money(v, r.devise);
  const variation =
    r.variation == null
      ? null
      : r.variation > 0
        ? {
            texte: `+${formatPct(r.variation)}`,
            icone: "ArrowUpRight" as const,
            ton: "success" as const,
          }
        : r.variation < 0
          ? {
              texte: formatPct(r.variation),
              icone: "ArrowDownRight" as const,
              ton: "destructive" as const,
            }
          : { texte: "0%", icone: null, ton: "mutedForeground" as const };

  return (
    <View className="gap-3">
      {/* ┌────────────────────────────────────────────────────────────────┐
          │ QUATRE CARTES EN GRILLE, comme le back-office (`lg:grid-cols-4`).│
          │                                                                │
          │ Empilées sur toute la largeur, elles poussaient les onglets     │
          │ sous la ligne de flottaison : on ouvrait la rubrique sans voir  │
          │ qu'elle en avait huit. `basis-[45%]` en donne deux par rangée,  │
          │ le motif déjà employé par `StatStrip`.                          │
          └────────────────────────────────────────────────────────────────┘ */}
      <View className="flex-row flex-wrap justify-between gap-y-2">
        <CarteReleveGlobal
          label="Chiffre d'affaires"
          valeur={m(r.chiffreAffaires)}
          icone="Banknote"
          detail={`${r.nbVentes} ventes`}
          variation={variation}
        />
        <CarteReleveGlobal
          label="Panier moyen"
          valeur={m(r.panierMoyen)}
          icone="ShoppingCart"
          detail={`${r.articlesVendus} articles vendus`}
        />
        <CarteReleveGlobal
          label="Solde caisse"
          valeur={m(r.soldeCaisse)}
          icone="Wallet"
          // Le détail par devise n'apparaît QUE s'il y en a plusieurs, comme le
          // web : « 611 005,90 USD » sous « 611 005,90 $ » est du bruit.
          sousDetail={
            r.soldesParDevise.length > 1
              ? r.soldesParDevise
                  .map(
                    (s) =>
                      `${money.amountOnly(s.montant, s.devise)} ${s.devise}`,
                  )
                  .join(" · ")
              : null
          }
          detail={`Flux net: ${m(r.fluxNet)}`}
        />
        <CarteReleveGlobal
          label="Créances clients"
          valeur={m(r.creances)}
          icone="CreditCard"
          detail={`${r.clientsAvecDette} client${r.clientsAvecDette > 1 ? "s" : ""} avec une dette`}
        />
      </View>

      <StatStrip>
        <StatStripItem
          label="Produits actifs"
          value={String(r.produitsActifs)}
        />
        <StatStripItem label="Valeur stock" value={m(r.valeurStock)} />
        {/* Un zéro reste NEUTRE : « 0 en rupture » en rouge crie pour rien, et
            à force on ne voit plus le vrai rouge. `StatStripItem` le fait déjà. */}
        <StatStripItem
          label="Stock bas"
          value={String(r.stockBas)}
          tone="warn"
        />
        <StatStripItem
          label="Ruptures"
          value={String(r.ruptures)}
          tone="alert"
        />
        <StatStripItem label="Clients" value={String(r.clients)} />
        <StatStripItem
          label="Nouveaux clients"
          value={`+${r.nouveauxClients}`}
          tone={r.nouveauxClients > 0 ? "accent" : "neutral"}
        />
      </StatStrip>
    </View>
  );
}

/** « 32,2 % » : point décimal FRANÇAIS, et `Intl` est proscrit ici. */
function formatPct(v: number): string {
  const s = Math.abs(v).toFixed(1).replace(".", ",");
  return `${v < 0 ? "-" : ""}${s}%`;
}

function CarteReleveGlobal({
  label,
  valeur,
  icone,
  detail,
  sousDetail,
  variation,
}: {
  label: string;
  valeur: string;
  icone: React.ComponentProps<typeof Icon>["name"];
  detail?: string | null;
  sousDetail?: string | null;
  variation?: {
    texte: string;
    icone: "ArrowUpRight" | "ArrowDownRight" | null;
    ton: "success" | "destructive" | "mutedForeground";
  } | null;
}) {
  // ┌──────────────────────────────────────────────────────────────────────┐
  // │ L'ICÔNE MONTE DANS LA LIGNE DU LIBELLÉ, ELLE NE PREND PAS UNE        │
  // │ COLONNE.                                                             │
  // │                                                                      │
  // │ En pleine largeur, un rond de quarante-huit points à droite était    │
  // │ sans conséquence. Dans une cellule de moitié, il retire un quart de  │
  // │ la place au MONTANT - et un montant en CDF à sept chiffres est       │
  // │ précisément ce que cet écran doit rendre en entier. C'est le remède  │
  // │ déjà écrit pour `StatStrip` : « le libellé passe au-dessus de la     │
  // │ valeur et l'icône monte dans sa ligne, le nombre récupère toute la   │
  // │ largeur de la cellule ».                                             │
  // └──────────────────────────────────────────────────────────────────────┘
  return (
    // ┌──────────────────────────────────────────────────────────────────┐
    // │ LA LARGEUR EST UN STYLE, PAS UNE CLASSE. `flex-1` GAGNE CONTRE    │
    // │ `basis-[45%]`.                                                    │
    // │                                                                   │
    // │ En NativeWind, deux classes qui touchent la même propriété se     │
    // │ départagent par ORDRE ALPHABÉTIQUE dans la feuille compilée, quel │
    // │ que soit l'ordre du `className` : « b » perd contre « f », et     │
    // │ `flex-1` remet la base à zéro. Relevé à l'écran - les QUATRE      │
    // │ cartes tenaient sur une seule ligne, « 560 740,7 $ » sortant en   │
    // │ « 560 7... ». C'est le piège déjà documenté pour `Text` et        │
    // │ `Card` ; ici un style résout la question sans cascade du tout.    │
    // │                                                                   │
    // │ 48 % et non 50 : `justify-between` pose la gouttière entre les    │
    // │ deux colonnes, et deux moitiés pleines ne laisseraient rien.      │
    // └──────────────────────────────────────────────────────────────────┘
    <View style={{ width: "48%" }}>
      <Card>
        <View className="flex-row items-center gap-1.5">
          <Icon name={icone} size={14} color="primary" />
          <Text variant="caption" numberOfLines={1} className="min-w-0 flex-1">
            {label}
          </Text>
        </View>
        <StatValue value={valeur} />
        {sousDetail ? (
          // Deux lignes : « 18 178 626 CDF · 611 005,9 USD » ne tient pas sur
          // une demi-largeur, et le tronquer perdrait une des deux devises.
          <Text variant="caption" numeric numberOfLines={2}>
            {sousDetail}
          </Text>
        ) : null}
        <View className="mt-0.5 flex-row flex-wrap items-center gap-x-2">
          {detail ? (
            <Text variant="caption" numberOfLines={1}>
              {detail}
            </Text>
          ) : null}
          {variation ? (
            <View className="flex-row items-center gap-0.5">
              {variation.icone ? (
                <Icon name={variation.icone} size={14} color={variation.ton} />
              ) : null}
              <Text
                variant="caption"
                numeric
                className={
                  variation.ton === "success"
                    ? "text-success"
                    : variation.ton === "destructive"
                      ? "text-destructive"
                      : ""
                }
              >
                {variation.texte}
              </Text>
            </View>
          ) : null}
        </View>
      </Card>
    </View>
  );
}

function SectionVue({
  section,
  money,
  onPage,
}: {
  section: SectionRapport;
  money: ReturnType<typeof useMonnaie>;
  onPage: (page: number) => void;
}) {
  const t = section.tableau;
  const vide =
    !section.cartes?.length &&
    !section.tuiles?.length &&
    !section.graphe?.points.length &&
    !section.lignes?.length &&
    (t?.lignes.length ?? 0) === 0;

  return (
    <View className="mb-4">
      <View className="flex-row items-center gap-2 border-b border-border bg-muted px-4 py-2">
        <View className="min-w-0 flex-1">
          <Text
            variant="caption"
            numberOfLines={2}
            className="font-sans-medium text-foreground"
          >
            {section.titre}
          </Text>
          {section.sousTitre ? (
            <Text variant="caption">{section.sousTitre}</Text>
          ) : null}
        </View>
        {section.badges?.map((b) => (
          <Badge key={b.texte} tone={b.ton}>
            {b.texte}
          </Badge>
        ))}
      </View>

      {vide ? (
        <View className="items-center bg-card px-4 py-8">
          <Text variant="bodySmall">{section.vide}</Text>
        </View>
      ) : null}

      {section.cartes?.length ? (
        <View className="flex-row flex-wrap gap-px bg-border">
          {section.cartes.map((c) => (
            <CarteVue key={c.cle} c={c} />
          ))}
        </View>
      ) : null}

      {section.tuiles?.length ? (
        <View className="flex-row flex-wrap gap-2 bg-card p-4">
          {section.tuiles.map((tu) => (
            <View
              key={tu.cle}
              className={`min-w-0 flex-1 basis-[44%] items-center rounded-lg p-3 ${FOND_TON[tu.ton]}`}
            >
              <Text variant="caption" numberOfLines={1}>
                {tu.label}
              </Text>
              <Text
                variant="body"
                numeric
                numberOfLines={1}
                className={`font-sans-semibold ${TEXTE_TON[tu.ton]}`}
              >
                {tu.valeur}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {section.graphe && section.graphe.points.length > 0 ? (
        <View className="bg-card px-4 py-3">
          <Graphe graphe={section.graphe} money={money} />
        </View>
      ) : null}

      {t && t.lignes.length > 0 ? (
        <View className="bg-card py-3">
          <Tableau
            colonnes={t.colonnes
              .map((c) => ({
                cle: c.cle,
                entete: c.entete,
                largeur: c.largeur,
                mesure: c.mesure,
                valeur: (l: (typeof t.lignes)[number]) =>
                  l.cellules[t.colonnes.findIndex((x) => x.cle === c.cle)]
                    ?.texte ?? "",
                sousValeur: (l: (typeof t.lignes)[number]) =>
                  l.cellules[t.colonnes.findIndex((x) => x.cle === c.cle)]
                    ?.sous ?? null,
                rendu: (l: (typeof t.lignes)[number]) => {
                  const cell =
                    l.cellules[t.colonnes.findIndex((x) => x.cle === c.cle)];
                  if (cell?.badge)
                    return (
                      <Badge tone={cell.badge.ton}>{cell.badge.texte}</Badge>
                    );
                  if (cell?.rang !== undefined) return <Rang n={cell.rang} />;
                  return undefined;
                },
              }))
              .map((c) => ({
                ...c,
                // `rendu` ne doit exister que pour les cellules qui en ont une :
                // sinon toute colonne perdrait sa sous-ligne et sa chasse fixe.
                rendu: t.lignes.some(
                  (l) =>
                    l.cellules[t.colonnes.findIndex((x) => x.cle === c.cle)]
                      ?.badge ||
                    l.cellules[t.colonnes.findIndex((x) => x.cle === c.cle)]
                      ?.rang !== undefined,
                )
                  ? c.rendu
                  : undefined,
              }))}
            lignes={t.lignes}
            cle={(l) => l.cle}
            messageVide={section.vide}
          />
          {t.total > t.taille ? (
            <Pagination
              page={t.page}
              total={t.total}
              taille={t.taille}
              onPage={onPage}
            />
          ) : null}
        </View>
      ) : null}

      {section.lignes?.length ? (
        <View className="bg-card">
          {section.lignes.map((l, i) => (
            <View key={l.cle}>
              {i > 0 ? <Divider /> : null}
              <LigneVue l={l} />
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const FOND_TON: Record<string, string> = {
  success: "bg-success/10",
  destructive: "bg-destructive/10",
  warning: "bg-warning/10",
  primary: "bg-accent",
  neutral: "bg-muted",
};

const TEXTE_TON: Record<string, string> = {
  success: "text-success",
  destructive: "text-destructive",
  warning: "text-warning",
  primary: "text-accent-foreground",
  neutral: "text-foreground",
};

function CarteVue({ c }: { c: CarteRapport }) {
  return (
    <View className="min-w-0 flex-1 basis-[45%] bg-card px-4 py-3">
      <Text variant="caption" numberOfLines={1}>
        {c.label}
      </Text>
      <Text
        variant="body"
        numeric
        numberOfLines={1}
        className={`font-sans-semibold ${c.ton ? TEXTE_TON[c.ton] : ""}`}
      >
        {c.valeur}
      </Text>
      {c.detail ? (
        <Text variant="caption" numberOfLines={1}>
          {c.detail}
        </Text>
      ) : null}
    </View>
  );
}

function LigneVue({ l }: { l: LigneRapport }) {
  return (
    <View className="flex-row items-center gap-3 px-4 py-3">
      {l.rang !== undefined ? <Rang n={l.rang} /> : null}
      <View className="min-w-0 flex-1">
        <Text
          variant="bodySmall"
          numberOfLines={1}
          className="font-sans-medium"
        >
          {l.titre}
        </Text>
        {l.detail ? (
          <Text variant="caption" numberOfLines={1}>
            {l.detail}
          </Text>
        ) : null}
      </View>
      <View className="shrink-0 items-end">
        <Text variant="bodySmall" numeric className="font-sans-semibold">
          {l.valeur}
        </Text>
        {l.sousValeur ? (
          <Text
            variant="caption"
            numeric
            className={
              l.tonSousValeur === "destructive" ? "text-destructive" : ""
            }
          >
            {l.sousValeur}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/** « Affichage 1 - 20 sur 347 », et ses deux boutons. Comme le back-office. */
function Pagination({
  page,
  total,
  taille,
  onPage,
}: {
  page: number;
  total: number;
  taille: number;
  onPage: (p: number) => void;
}) {
  const premier = (page - 1) * taille + 1;
  const dernier = Math.min(page * taille, total);
  return (
    <View className="mt-3 flex-row items-center justify-between gap-2 border-t border-border px-4 pt-3">
      <Text variant="caption" numberOfLines={1} className="min-w-0 flex-1">
        {`Affichage ${premier} - ${dernier} sur ${total}`}
      </Text>
      <View className="flex-row gap-2">
        <IconButton
          name="ChevronLeft"
          label="Page précédente"
          variant="outline"
          disabled={page === 1}
          onPress={() => onPage(Math.max(1, page - 1))}
        />
        <IconButton
          name="ChevronRight"
          label="Page suivante"
          variant="outline"
          disabled={page * taille >= total}
          onPress={() => onPage(page + 1)}
        />
      </View>
    </View>
  );
}

/** Le graphique d'une section, choisi par sa forme. */
function Graphe({
  graphe,
  money,
}: {
  graphe: GrapheRapport;
  money: ReturnType<typeof useMonnaie>;
}) {
  // Le formateur porte la devise de la SECTION : un graphique ne mêle jamais
  // deux monnaies, et c'est la section qui sait laquelle.
  const formater = (v: number) => money.money(v, graphe.devise);
  const points = graphe.points.map((p) => ({
    label: p.label,
    valeur: p.valeur,
    valeurSecondaire: p.valeurSecondaire,
  }));

  if (graphe.type === "aire") {
    return <AreaChart points={points} formater={formater} />;
  }
  if (graphe.type === "barres-horizontales") {
    return <BarChartHorizontal points={points} formater={formater} />;
  }
  return (
    <BarChart points={points} formater={formater} legende={graphe.legende} />
  );
}
