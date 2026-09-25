/**
 * Historique des ventes. Miroir de `app/dashboard/sales/history/page.tsx`.
 *
 * Les filtres sont poussés dans le SQL, jamais appliqués après coup sur une
 * page déjà tronquée : le compteur du sous-titre annonce alors ce que la
 * requête a réellement trouvé, et non ce qui restait des cinquante dernières
 * lignes. C'est le défaut que le back-office a dû corriger sur ses niveaux de
 * stock, où l'export ne couvrait pas le même périmètre que l'écran.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ « MOIS » RENDAIT MOINS DE VENTES QUE « 7 JOURS ».                       │
 * │                                                                          │
 * │ Les périodes de cet écran ne parlaient pas la même langue : « semaine »  │
 * │ était GLISSANTE, « mois » CALENDAIRE. Relevé à l'écran le 1er septembre  │
 * │ 2026 : « 7 jours » rendait huit ventes et « Mois » AUCUNE, sous un       │
 * │ « Essayez une période plus large » - alors que la plus large des deux    │
 * │ était celle qui montrait quelque chose. Le marchand y lit une perte de   │
 * │ données, et le défaut revenait les six premiers jours de CHAQUE mois.    │
 * │                                                                          │
 * │ C'est le défaut déjà corrigé sur le tableau de bord et jamais reporté    │
 * │ ici, parce que la règle existait en DEUX exemplaires. Elle vit désormais │
 * │ dans `data/periodes`, que les deux surfaces lisent, et les libellés      │
 * │ disent la fenêtre réelle : « 7 jours », « 30 jours ».                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ TROIS DÉFAUTS RÉPARÉS ICI, ET AUCUN NE SE VOYAIT.                       │
 * │                                                                          │
 * │ 1. LA LISTE S'ARRÊTAIT À CENT VENTES, EN SILENCE. La limite était en     │
 * │    dur et rien ne la disait : le sous-titre annonçait « 347 ventes »     │
 * │    au-dessus de cent lignes, et les deux cent quarante-sept autres       │
 * │    n'étaient atteignables par aucun geste. Le caissier qui cherche une   │
 * │    vente du mois dernier conclut qu'elle a disparu. Défilement infini.   │
 * │                                                                          │
 * │ 2. UNE VENTE QUI ATTEND SON ENVOI NE LE DISAIT PAS. La lecture rendait   │
 * │    déjà son état ; l'écran ne l'affichait nulle part. Une vente          │
 * │    encaissée hors ligne était donc indistinguable d'une vente acquise,   │
 * │    alors que « attend son envoi » et « attend un droit » n'appellent pas │
 * │    le même geste - le second ne partira jamais tout seul.                │
 * │                                                                          │
 * │ 3. AUCUN CHIFFRE. On descendait cent références sans jamais savoir ce    │
 * │    que la période pesait, qui est la question même qu'on se pose en      │
 * │    ouvrant un historique.                                                │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import { useCallback, useMemo, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { formatTimeFr } from "@vente-facile/core";

import { useMonnaie } from "@/data/devises";
import { libelleEnvoi } from "@/data/envoi";
import { depuisQuand } from "@/data/periodes";
import { useLecture } from "@/data/live";
import { useSession } from "@/session/provider";
import { FeuilleFiltresPerimetre } from "@/features/perimetre/feuille-perimetre";
import {
  entrepotInconnuAdmis,
  nombreDeFiltresPerimetre,
  parametresDePerimetre,
  PERIMETRE_VIDE,
  resumeDuPerimetre,
  sansLeFiltrePerimetre,
  type FiltrePerimetre,
} from "@/features/perimetre/filtre-perimetre";
import { usePerimetre } from "@/features/perimetre/use-perimetre";
import {
  STATUT_VENTE,
  historiqueVentes,
  type Periode,
  type VenteResume,
} from "@/data/ventes";
import { ApiError } from "@/api/errors";
import { jourISO } from "@/data/dates";
import {
  avertissementDeFile,
  compterEnFile,
} from "@/features/export/en-file";
import { FeuilleFormat } from "@/features/export/feuille-format";
import {
  telechargerDocument,
  type FormatExport,
} from "@/features/export/telecharger";
import { grouperParJour, type ElementHistorique } from "@/features/ventes/groupes";
import {
  AppBar,
  Badge,
  BoutonFiltres,
  Chip,
  ChipRow,
  DataList,
  DataRow,
  DataSection,
  IconButton,
  Mesure,
  MultiCurrencyTotal,
  Screen,
  SearchInput,
  Segmented,
  StatStrip,
  StatStripItem,
  Text,
  useToast,
} from "@/ui";

// `outbox_operations` et `print_jobs` en sont : l'historique fusionne les
// ventes encore en file, et leurs montants viennent du ticket rangé. Sans eux,
// une vente encaissée pendant que cet écran est ouvert n'y paraîtrait qu'après
// un aller-retour, et la liste dirait qu'elle n'existe pas.
const TABLES = ["sales", "customers", "outbox_operations", "print_jobs"];

const PERIODES: { valeur: Periode; label: string }[] = [
  { valeur: "jour", label: "Jour" },
  { valeur: "semaine", label: "7 jours" },
  { valeur: "mois", label: "30 jours" },
  { valeur: "tout", label: "Tout" },
];

/** Une page à cinquante : au-delà, le premier rendu se voit ramer au pouce. */
const PAGE = 50;

/**
 * « d'1 j » et non « de 1 j ». Même règle qu'aux règlements : le nombre est
 * petit, la phrase courte, et l'élision s'entend.
 */
function libelleRetard(jours: number): string {
  return jours === 1 ? "En retard d'1 j" : `En retard de ${jours} j`;
}

export default function Historique() {
  const { snapshot } = useSession();
  const money = useMonnaie();
  const toast = useToast();
  const [envoiExport, setEnvoiExport] = useState(false);
  const [feuilleFormat, setFeuilleFormat] = useState(false);
  const [recherche, setRecherche] = useState("");
  const [periode, setPeriode] = useState<Periode>("semaine");
  const [statut, setStatut] = useState<string | null>(null);
  const [pages, setPages] = useState(1);

  // ┌──────────────────────────────────────────────────────────────────────┐
  // │ CES TROIS RAPPELS SONT STABLES, ET CE N'EST PAS DU CONFORT.          │
  // │                                                                      │
  // │ `SearchInput` porte son débounce lui-même et garde `onChange` dans    │
  // │ les DÉPENDANCES de son effet : un rappel fabriqué à chaque rendu y    │
  // │ relance la temporisation à chaque rendu du parent, et la frappe peut  │
  // │ ne jamais remonter. C'est la famille de défaut qui a fait tourner     │
  // │ l'écran d'encaissement en boucle - rien ne se voit, rien ne se        │
  // │ journalise, le téléphone chauffe.                                     │
  // │                                                                      │
  // │ Chacun remet la pagination à la première page : garder trois pages en │
  // │ changeant de période chargerait cent cinquante ventes d'un coup, et   │
  // │ la liste s'ouvrirait sur son milieu.                                 │
  // └──────────────────────────────────────────────────────────────────────┘
  const changerRecherche = useCallback((v: string) => {
    setPages(1);
    setRecherche(v);
  }, []);
  const changerPeriode = useCallback((v: string) => {
    setPages(1);
    setPeriode(v as Periode);
  }, []);
  const changerStatut = useCallback((v: string | null) => {
    setPages(1);
    setStatut(v);
  }, []);

  const [choixPerimetre, setChoixPerimetre] = useState<FiltrePerimetre>(PERIMETRE_VIDE);
  const [feuillePerimetre, setFeuillePerimetre] = useState(false);
  const perimetre = usePerimetre(choixPerimetre, true);
  const applique = perimetre.applique;
  const tolereInconnu = entrepotInconnuAdmis(perimetre);
  const moi = snapshot?.user.id ?? null;

  const charger = useCallback(
    () =>
      historiqueVentes({
        recherche,
        periode,
        statut,
        // Le périmètre APPLIQUÉ, jamais le choix brut : c'est ce qui borne un
        // caissier à ses propres ventes, alors que le tirage lui descend
        // celles de ses collègues du même dépôt.
        entrepot: applique.entrepot,
        utilisateur: applique.utilisateur,
        moi,
        // Sous un VERROU, une vente dont on ignore le dépôt reste à l'écran :
        // une caisse peut n'avoir aucun entrepôt, et la vente qu'on vient
        // d'encaisser disparaissait alors de sa propre liste.
        entrepotInconnuAdmis: tolereInconnu,
        limite: pages * PAGE,
      }),
    [recherche, periode, statut, applique, moi, tolereInconnu, pages]
  );
  const { donnees, chargement, recharger } = useLecture(charger, {
    tables: TABLES,
    deps: [recherche, periode, statut, applique, moi, tolereInconnu, pages],
  });

  const ventes = useMemo(() => donnees?.elements ?? [], [donnees]);
  const total = donnees?.total ?? 0;
  const releves = donnees?.releves;
  const parStatut = donnees?.parStatut ?? {};

  // Le découpage par journée se refait quand la liste change, pas à chaque
  // rendu : cet écran se fait défiler, et le recalculer sous le doigt hache
  // le défilement sans qu'aucune erreur ne le signale.
  const elements = useMemo(() => grouperParJour(ventes), [ventes]);

  const filtreActif = recherche !== "" || statut !== null;

  /**
   * L'export est fabriqué par le SERVEUR, comme tous les autres documents.
   *
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ LE SERVEUR NE CONNAÎT PAS LES VENTES ENCORE EN FILE, ET ON LE DIT.   │
   * │                                                                      │
   * │ Cet écran FUSIONNE les ventes du journal : elles sont à l'écran, mais│
   * │ le serveur ne les a pas encore reçues, et son document ne peut donc  │
   * │ pas les porter. Le rendre localement pour les inclure ferait un      │
   * │ second moteur, donc une seconde mise en page, pour un seul écran.    │
   * │                                                                      │
   * │ On garde donc un tuyau unique, et l'écran ANNONCE l'écart avant le   │
   * │ partage. Après une synchronisation, l'avertissement disparaît et le  │
   * │ document est complet.                                                 │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  const avertissementExport = avertissementDeFile(compterEnFile(ventes));

  const exporter = async (format: FormatExport) => {
    setFeuilleFormat(false);
    setEnvoiExport(true);
    // `depuisQuand` rend `null` pour « tout l'historique » : on n'envoie alors
    // aucune borne, et le serveur couvre tout. Poser une date de début à la
    // place restreindrait un périmètre que l'écran ne restreint pas.
    const debut = depuisQuand(periode);
    try {
      await telechargerDocument(
        "/sales/export/",
        {
          // Les filtres de l'écran partent avec le document : un fichier qui
          // couvrirait un autre périmètre que la liste qui l'a déclenché est
          // le défaut que tous les exports de ce dépôt ont dû corriger.
          date_from: debut ? jourISO(debut) : undefined,
          date_to: jourISO(new Date()),
          status: statut ?? undefined,
          search: recherche || undefined,
          // ⚠ LE PÉRIMÈTRE EN FAIT PARTIE, et il manquait ici seul.
          //
          // La liste lit `applique` (l. 181) ; l'export ne l'envoyait pas, si
          // bien que le fichier couvrait tous les dépôts sous un en-tête qui
          // annonçait le contraire. Et ce n'est pas rattrapé par le serveur :
          // `SaleViewSet` porte `warehouse_scope_include_null = True` quand le
          // TIRAGE, lui, ne tolère pas le nul - sans ce paramètre, le document
          // porterait en plus les ventes anciennes que l'écran n'a jamais eues.
          ...parametresDePerimetre(applique),
        },
        format,
        `Historique des ventes ${jourISO(new Date())}`
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

  const enTete = (
    <View className="gap-3 px-4 pb-3 pt-2">
      {/* ┌──────────────────────────────────────────────────────────────┐
          │ LE CADRAN SUIT TOUS LES FILTRES, Y COMPRIS LE STATUT.        │
          │                                                              │
          │ Il diffère en cela de celui des règlements, où les deux      │
          │ chiffres restent globaux - et c'est délibéré : là-bas TOUT   │
          │ est dû par construction, le cadran est donc une référence à  │
          │ laquelle comparer une puce. Ici la question posée est        │
          │ « combien pèse ce que je regarde », et un total de période   │
          │ affiché au-dessus d'une liste d'annulations ne composerait   │
          │ rien de ce qui est à l'écran.                                │
          │                                                              │
          │ Les deux chiffres viennent du SQL, sur tout le périmètre :   │
          │ les sommer sur la page donnerait le poids des cinquante      │
          │ premières ventes sous un compteur qui en annonce trois cent. │
          └──────────────────────────────────────────────────────────────┘ */}
      <StatStrip>
        <StatStripItem label="Facturé" icon="Receipt">
          <MultiCurrencyTotal
            lignes={releves?.totalParDevise ?? []}
            money={money.money}
          />
        </StatStripItem>
        <StatStripItem
          label="Reste à encaisser"
          icon="Banknote"
          // Orange et non rouge : une facture à crédit n'est pas une anomalie,
          // c'est le métier. Le rouge reste au RETARD, faute de quoi il ne
          // désigne plus rien.
          tone={(releves?.resteParDevise.length ?? 0) > 0 ? "warn" : "neutral"}
        >
          <MultiCurrencyTotal
            lignes={releves?.resteParDevise ?? []}
            money={money.money}
            tone={(releves?.resteParDevise.length ?? 0) > 0 ? "warning" : "foreground"}
          />
        </StatStripItem>
      </StatStrip>

      {/* Le total est INCOMPLET quand un ticket manque, et le taire ferait
          passer un montant partiel pour un montant arrêté. */}
      {releves && releves.sansMontant > 0 ? (
        <Text variant="caption">
          {releves.sansMontant === 1
            ? "1 vente comptée sans montant : son ticket est introuvable."
            : `${releves.sansMontant} ventes comptées sans montant : leurs tickets sont introuvables.`}
        </Text>
      ) : null}

      <SearchInput
        valeur={recherche}
        onChange={changerRecherche}
        placeholder="Rechercher par référence ou client..."
      />
      <View className="flex-row items-center gap-2">
        <View className="flex-1">
          <Segmented
            options={PERIODES.map((p) => ({ valeur: p.valeur, label: p.label }))}
            valeur={periode}
            onChange={changerPeriode}
          />
        </View>
        <BoutonFiltres
          actifs={nombreDeFiltresPerimetre(perimetre)}
          onPress={() => setFeuillePerimetre(true)}
        />
      </View>

      {resumeDuPerimetre(perimetre).length > 0 ? (
        <ChipRow>
          {resumeDuPerimetre(perimetre).map((puce) => {
            // Un SEUL handler pour la croix et pour le corps de la puce : ils ne
            // peuvent donc pas diverger, et l'appui que le `Pressable` imbriqué
            // fait éventuellement remonter est sans conséquence - retirer deux
            // fois le même filtre donne le même état qu'une fois.
            const retirer = () => {
              setPages(1);
              setChoixPerimetre(sansLeFiltrePerimetre(choixPerimetre, puce.cle));
            };
            return (
              <Chip
                key={puce.cle}
                label={puce.label}
                actif
                onPress={retirer}
                onRetirer={retirer}
              />
            );
          })}
        </ChipRow>
      ) : null}
      {/* ┌──────────────────────────────────────────────────────────────┐
          │ LES PUCES PORTENT LEUR DÉCOMPTE, ET LES VIDES DISPARAISSENT. │
          │                                                              │
          │ Sept statuts défilaient sans dire lesquels avaient quoi que  │
          │ ce soit dedans : un terminal ne produit ni brouillon ni      │
          │ remboursement, et taper sur ces puces répondait « aucune      │
          │ vente » à chaque fois. Quatre refus de suite apprennent à ne │
          │ plus lire la rangée, et on n'y voit plus non plus les puces  │
          │ qui comptent.                                                │
          │                                                              │
          │ Le décompte est calculé SANS le filtre de statut, sinon      │
          │ toutes les puces sauf l'active tomberaient à zéro - et une   │
          │ puce à zéro se lit « il n'y en a pas », pas « vous ne les    │
          │ regardez pas ». La puce ACTIVE reste affichée même vidée par │
          │ la recherche : la faire disparaître sous le doigt laisserait │
          │ une liste filtrée sans rien pour dire par quoi.              │
          └──────────────────────────────────────────────────────────────┘ */}
      <ChipRow>
        <Chip
          label={`Tous (${donnees?.totalTousStatuts ?? 0})`}
          actif={statut === null}
          onPress={() => changerStatut(null)}
        />
        {Object.entries(STATUT_VENTE)
          .filter(([code]) => (parStatut[code] ?? 0) > 0 || statut === code)
          .map(([code, s]) => (
            <Chip
              key={code}
              label={`${s.label} (${parStatut[code] ?? 0})`}
              actif={statut === code}
              onPress={() => changerStatut(code)}
            />
          ))}
      </ChipRow>
    </View>
  );

  const renduVente = (v: VenteResume) => {
    const s = STATUT_VENTE[v.statut];
    const envoi = libelleEnvoi(v.envoi);
    const retard = v.joursDeRetard ?? 0;
    return (
      <DataRow
        principal={v.reference}
        // La DATE est passée dans l'en-tête de journée : la ligne ne garde que
        // l'heure, ce qui libère la place du client et du nombre d'articles.
        secondaire={[
          v.client ?? "Client anonyme",
          v.date ? formatTimeFr(v.date) : null,
          v.nbArticles !== undefined
            ? `${v.nbArticles} ${v.nbArticles > 1 ? "articles" : "article"}`
            : null,
        ]
          .filter(Boolean)
          .join(" · ")}
        // Un seul badge, et c'est le plus ACTIONNABLE. Ce qui n'est pas encore
        // parti passe devant tout : le caissier doit savoir qu'une vente qu'il
        // a en main n'existe encore que sur ce terminal. Puis le retard, puis
        // le statut - que le montant dit déjà à demi-mot.
        badge={
          envoi ? (
            <Badge tone={envoi.ton}>{envoi.court}</Badge>
          ) : retard > 0 ? (
            <Badge tone="destructive">{libelleRetard(retard)}</Badge>
          ) : s ? (
            <Badge tone={s.ton}>{s.label}</Badge>
          ) : undefined
        }
        valeur={
          // « Montant inconnu » et JAMAIS « 0 » : le ticket rangé n'a pas été
          // retrouvé, la vente existe et son montant nous échappe. Un zéro
          // fabriqué se lirait comme une vente à zéro franc.
          v.montantConnu === false ? (
            <Text variant="bodySmall">Montant inconnu</Text>
          ) : (
            <Mesure value={money.money(v.total, v.devise)} />
          )
        }
        // Le restant dû ne s'affiche que s'il y en a un : « 0 FC à payer » sous
        // chaque vente soldée est du bruit qui masque les vraies créances.
        sousValeur={
          v.resteAPayer > 0 ? `Reste ${money.money(v.resteAPayer, v.devise)}` : null
        }
        onPress={() => router.push(`/vente/${v.id}`)}
      />
    );
  };

  const rendu = (e: ElementHistorique) => {
    if (e.type === "vente") return renduVente(e.vente);
    const g = e.groupe;
    return (
      <DataSection
        label={g.label}
        meta={[
          `${g.nb} ${g.nb > 1 ? "ventes" : "vente"}`,
          // Le sous-total du jour n'est pas complet, et il faut le dire là où
          // il s'affiche : le signaler seulement en tête de page laisserait
          // croire que c'est une autre journée qui est en cause.
          g.sansMontant > 0 ? `${g.sansMontant} sans montant` : null,
        ]
          .filter(Boolean)
          .join(" · ")}
        valeur={
          <MultiCurrencyTotal
            lignes={g.totalParDevise}
            money={money.money}
            tone="mutedForeground"
            // L'échelle d'une RANGÉE, pas d'un cadran : c'est le libellé du
            // jour qui porte la section, le sous-total l'accompagne.
            taille="mesure"
            vide=""
          />
        }
      />
    );
  };

  return (
    <Screen padded={false}>
      <AppBar
        title="Historique des ventes"
        subtitle={`${total} ${total > 1 ? "ventes" : "vente"}`}
        // L'export n'est pas l'action principale d'un historique - on vient y
        // chercher une vente - donc il vit dans la barre, pas dans un bouton
        // pleine largeur qui se lirait comme le geste attendu.
        right={
          <IconButton
            name="Download"
            label="Exporter l'historique"
            variant="ghost"
            onPress={() => setFeuilleFormat(true)}
            disabled={envoiExport || ventes.length === 0}
          />
        }
      />
      <DataList
        donnees={elements}
        cle={(e) => e.cle}
        rendu={rendu}
        // Sans elle, la virtualisation recycle un en-tête de journée en rangée
        // de vente : les hauteurs sautent au défilement, sans avertissement.
        typeElement={(e) => e.type}
        enTete={enTete}
        chargement={chargement && ventes.length === 0}
        // Les séparateurs sont portés par les rangées elles-mêmes : un filet
        // posé entre chaque élément doublerait la bordure des en-têtes.
        separateur={false}
        onRefresh={recharger}
        // La liste ne s'arrête plus en silence à cent : elle demande la suite
        // à l'approche du bas, et le pied dit où l'on en est.
        onFin={() => {
          if (donnees?.aPlus) setPages((p) => p + 1);
        }}
        pied={
          donnees?.aPlus ? (
            <View className="items-center px-4 py-4">
              <Text variant="caption">
                {ventes.length} sur {total} - chargement de la suite...
              </Text>
            </View>
          ) : undefined
        }
        vide={{
          icon: recherche ? "Search" : filtreActif ? "Filter" : "Receipt",
          titre: recherche
            ? "Aucune vente ne correspond"
            : statut
              ? `Aucune vente ${(STATUT_VENTE[statut]?.label ?? "").toLowerCase()}`
              : "Aucune vente",
          // Un état vide sous un filtre ne dit PAS que la période est vide : il
          // dit que ce filtre-là l'est, et il rend le chemin du retour.
          message: recherche
            ? "Essayez une autre référence ou un autre nom de client."
            : statut
              ? "Aucune vente de ce statut sur la période choisie."
              : periode === "tout"
                ? "Aucune vente n'a encore été encaissée sur ce terminal."
                : "Aucune vente sur cette période. Essayez une période plus large.",
          action: recherche
            ? { label: "Effacer la recherche", onPress: () => changerRecherche("") }
            : statut
              ? { label: "Voir tous les statuts", onPress: () => changerStatut(null) }
              : periode !== "tout"
                ? { label: "Voir tout l'historique", onPress: () => changerPeriode("tout") }
                : undefined,
        }}
      />

      <FeuilleFormat
        ouvert={feuilleFormat}
        onFermer={() => setFeuilleFormat(false)}
        onChoisir={(f) => void exporter(f)}
        titre="Exporter l'historique"
        avertissement={avertissementExport}
        envoi={envoiExport}
      />
      <FeuilleFiltresPerimetre
        ouvert={feuillePerimetre}
        onFermer={() => setFeuillePerimetre(false)}
        valeur={choixPerimetre}
        onChanger={(f) => {
          setPages(1);
          setChoixPerimetre(f);
        }}
        offre={perimetre}
        libelleResultats={
          total === 1 ? "Voir la vente" : `Voir les ${total} ventes`
        }
      />
    </Screen>
  );
}
