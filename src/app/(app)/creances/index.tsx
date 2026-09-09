/**
 * Créances, ventilées par devise ET par ancienneté.
 * Miroir de `app/dashboard/reports/receivables/page.tsx`, plus ce qu'un
 * téléphone permet et qu'un back-office ne permet pas : appeler.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE RAPPORT QUE LE BACK-OFFICE A MIS LE PLUS LONGTEMPS À OBTENIR JUSTE.   │
 * │                                                                          │
 * │ Additionner des dettes en francs et en dollars produit un nombre qui     │
 * │ n'existe pas, et sur lequel un marchand décide pourtant de relancer ou   │
 * │ non. La ventilation par devise n'est donc pas une finesse : c'est la     │
 * │ seule présentation vraie.                                                │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CET ÉCRAN SERT À RELANCER, ET IL NE PORTAIT AUCUN GESTE.                │
 * │                                                                          │
 * │ Il rendait une balance âgée et une liste de noms. Or relancer, c'est     │
 * │ appeler : le marchand lisait un nom, sortait de l'écran, ouvrait la      │
 * │ fiche du client, y cherchait le numéro, revenait. Le numéro vit dans la  │
 * │ base LOCALE (`customers.phone`), il ne coûte rien à joindre, et le       │
 * │ bouton n'apparaît que lorsqu'il y en a un - un bouton qui ouvre un       │
 * │ composeur vide fait chercher la panne du mauvais côté.                   │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ QUATRE DÉFAUTS RÉPARÉS ICI, ET AUCUN NE SE VOYAIT.                      │
 * │                                                                          │
 * │ 1. LES DEUX CHIFFRES QU'ON VIENT CHERCHER ÉTAIENT JETÉS. Le serveur      │
 * │    rend `total_primary` et `overdue_primary`, les deux seules            │
 * │    conversions du rapport ; la lecture ne les prenait pas. Le cadran ne  │
 * │    portait donc que des DÉCOMPTES, et « combien me doit-on » n'avait de  │
 * │    réponse nulle part : il fallait additionner les cartes par devise de  │
 * │    tête, c'est-à-dire faire soi-même l'addition inter-devises que tout   │
 * │    le reste de l'écran interdit.                                         │
 * │                                                                          │
 * │ 2. UN RAFRAÎCHISSEMENT RATÉ EFFAÇAIT L'ÉCRAN. `setCreances(null)` dans   │
 * │    le `catch` : tirer pour rafraîchir dans une zone sans réseau -        │
 * │    c'est-à-dire le geste réflexe quand un écran semble figé - détruisait │
 * │    les chiffres qu'on était en train de lire, et les remplaçait par un   │
 * │    bandeau. On garde le dernier état connu et on DIT qu'il est daté.     │
 * │                                                                          │
 * │ 3. LA LISTE N'ÉTAIT NI CHERCHABLE, NI FILTRABLE, NI VIRTUALISÉE. Un      │
 * │    `.map()` dans un défilement : au-delà de cinquante débiteurs on       │
 * │    parcourt un mur, et retrouver un nom précis demande de tout lire.     │
 * │                                                                          │
 * │ 4. LA DATE D'ARRÊTÉ N'ÉTAIT PAS DITE. Le back-office est en ligne par    │
 * │    construction ; ce terminal ne l'est pas. Sans elle, on relance sur    │
 * │    les chiffres d'avant-hier sans le savoir.                             │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { formatDateFr, formatTimeFr } from "@vente-facile/core";

import { dateDepuisJourISO } from "@/data/dates";
import { telephonesDesClients } from "@/data/contacts";
import { useMonnaie } from "@/data/devises";
import {
  chargerCreances,
  URL_EXPORT,
  type CleTranche,
  type Creances,
  type Debiteur,
} from "@/data/rapports";
import { useEnLigne } from "@/data/reseau";
import { ouvrirComposeur } from "@/data/telephone";

import {
  libelleRetard,
  tonDuRetard,
  vueDebiteurs,
  type ElementCreance,
  type TriCreances,
} from "@/features/creances/tri";
import { FeuilleFormat } from "@/features/export/feuille-format";
import {
  telechargerDocument,
  type FormatExport,
} from "@/features/export/telecharger";
import { ApiError } from "@/api/errors";
import { useSession } from "@/session/provider";
import {
  AppBar, Badge, Banner, BarreEmpilee, Card, Chip, ChipRow, DataList, DataSection,
  HIT, Icon, IconButton, Mesure, Pressable, Screen, SearchInput, Segmented,
  StatStrip, StatStripItem, Text, useToast,
} from "@/ui";

/**
 * L'échelle d'ancienneté, du tiède au grave.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ « PAS ENCORE ÉCHU » N'EST PAS UNE ALERTE.                               │
 * │                                                                          │
 * │ Vendre à crédit est le métier, pas une anomalie : peindre en rouge une   │
 * │ facture qui n'est pas encore due ferait du rouge la couleur normale de   │
 * │ l'écran, et on ne verrait plus les vrais retards. La rampe monte donc du │
 * │ neutre au destructif, en suivant EXACTEMENT les seuils du serveur - une  │
 * │ pastille qui basculerait ailleurs que la balance âgée ferait dire deux   │
 * │ choses différentes au même écran, sur la même créance.                   │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Les classes sont écrites en toutes lettres : NativeWind ne compile que ce
 * qu'il lit dans les sources, une classe assemblée par concaténation n'existe
 * pas dans la feuille produite et ne rend rien, en silence.
 */
const RAMPE_TRANCHE: Record<CleTranche, { fond: string; texte: string }> = {
  current: { fond: "bg-muted-foreground/40", texte: "text-muted-foreground" },
  d1_30: { fond: "bg-warning/50", texte: "text-foreground" },
  d31_60: { fond: "bg-warning", texte: "text-warning" },
  d61_90: { fond: "bg-destructive/60", texte: "text-warning" },
  d90_plus: { fond: "bg-destructive", texte: "text-destructive" },
};

const TRIS: { valeur: TriCreances; label: string }[] = [
  { valeur: "montant", label: "Montant" },
  { valeur: "retard", label: "Ancienneté" },
];

export default function EcranCreances() {
  const money = useMonnaie();
  const { snapshot } = useSession();
  const enLigne = useEnLigne();
  const toast = useToast();

  const [creances, setCreances] = useState<Creances | null>(null);
  const [chargement, setChargement] = useState(true);
  const [rafraichissement, setRafraichissement] = useState(false);
  const [erreur, setErreur] = useState<"hors-ligne" | string | null>(null);
  const [luA, setLuA] = useState<Date | null>(null);
  const [envoiExport, setEnvoiExport] = useState(false);
  const [feuilleFormat, setFeuilleFormat] = useState(false);

  const [recherche, setRecherche] = useState("");
  const [seulementEchus, setSeulementEchus] = useState(false);
  const [devise, setDevise] = useState<string | null>(null);
  const [tri, setTri] = useState<TriCreances>("montant");

  const vivant = useRef(true);
  useEffect(() => {
    vivant.current = true;
    return () => {
      vivant.current = false;
    };
  }, []);

  const organisation = snapshot?.organization.id ?? "";
  const devisePrincipale =
    snapshot?.currencies?.find((d) => d.is_primary)?.currency_code ?? "CDF";

  /**
   * Le rapport vient du SERVEUR, les numéros de la base LOCALE.
   *
   * Les agrégats ne se recalculent pas ici - deux chiffres pour le même
   * établissement, et le marchand ne saurait pas lequel croire. La jointure
   * des téléphones, elle, est une lecture d'identité : aucun montant n'en
   * sort, et elle réussit même quand le rapport échoue.
   */
  const charger = useCallback(
    async (mode: "initial" | "rafraichir") => {
      if (!organisation) return;
      if (mode === "initial") setChargement(true);
      else setRafraichissement(true);
      try {
        const rapport = await chargerCreances({
          organisation,
          money: money.money,
          devisePrincipale,
        });
        const tels = await telephonesDesClients(rapport.debiteurs.map((d) => d.clientId));
        if (!vivant.current) return;
        setCreances({
          ...rapport,
          debiteurs: rapport.debiteurs.map((d) => ({
            ...d,
            telephone: tels.get(d.clientId) ?? null,
          })),
        });
        setLuA(new Date());
        setErreur(null);
      } catch (e) {
        if (!vivant.current) return;
        // ON NE VIDE PAS L'ÉCRAN. Un rafraîchissement raté n'annule pas ce
        // qu'on avait : il le date. Voir le défaut 2 en tête de fichier.
        setErreur(enLigne ? (e instanceof Error ? e.message : "Échec") : "hors-ligne");
      } finally {
        if (!vivant.current) return;
        setChargement(false);
        setRafraichissement(false);
      }
    },
    [organisation, devisePrincipale, money.money, enLigne]
  );

  useEffect(() => {
    void charger("initial");
  }, [charger]);

  const vue = useMemo(
    () =>
      vueDebiteurs(
        creances?.debiteurs ?? [],
        { recherche, seulementEchus, devise },
        tri
      ),
    [creances, recherche, seulementEchus, devise, tri]
  );

  const arrete = dateDepuisJourISO(creances?.arreteAu);
  // `vue.deviseActive`, et non `devise` : une puce de devise que la recherche
  // a fait disparaître ne filtre plus rien, et laisser l'écran croire le
  // contraire lui ferait afficher un filtre que rien ne permet de retirer.
  const filtreActif = recherche !== "" || seulementEchus || vue.deviseActive !== null;
  const aDesCreances = (creances?.nbFactures ?? 0) > 0;

  const appeler = async (d: Debiteur) => {
    if (!(await ouvrirComposeur(d.telephone))) {
      toast.erreur("Aucune application d'appel sur cet appareil.");
    }
  };

  /**
   * L'export est fabriqué par le SERVEUR, comme les huit rapports.
   *
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ CET ÉCRAN EXIGE DÉJÀ LE RÉSEAU, DONC RIEN N'EST PERDU.               │
   * │                                                                      │
   * │ Les créances viennent de `/reports/statistics/receivables/` : il n'y  │
   * │ a pas de version hors ligne de cette page, et son document n'a donc   │
   * │ aucune raison d'être tracé ici. Le rendre côté serveur lui donne la   │
   * │ marque de tous les autres documents du produit, et le back-office -   │
   * │ qui n'avait AUCUN export de créances - reçoit le même fichier.        │
   * │                                                                      │
   * │ ⚠ Les filtres de l'ÉCRAN (recherche, devise, échus seuls) ne partent  │
   * │ pas : le document porte la balance ENTIÈRE, et son sous-titre le dit. │
   * │ Un fichier qui prétendrait porter un filtre que le serveur ignore     │
   * │ serait pire qu'un fichier complet.                                    │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  const exporter = async (format: FormatExport) => {
    if (!creances) return;
    setFeuilleFormat(false);
    setEnvoiExport(true);
    try {
      await telechargerDocument(
        URL_EXPORT,
        { tab: "receivables" },
        format,
        `Créances ${creances.arreteAu}`
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
    <View className="gap-4 px-4 pb-3 pt-2">
      {erreur === "hors-ligne" ? (
        <Banner
          tone="warning"
          title={creances ? "Chiffres non rafraîchis" : "Les créances demandent une connexion"}
          message={
            creances
              ? "Vous êtes hors ligne : ce que vous lisez date de la dernière mise à jour réussie."
              : "Le calcul de la balance âgée vient du serveur, pour qu'il ne diffère jamais de celui du back-office."
          }
          action={{ label: "Réessayer", onPress: () => void charger("rafraichir") }}
        />
      ) : erreur ? (
        <Banner
          tone="destructive"
          title={creances ? "La mise à jour a échoué" : "Chargement impossible"}
          message={erreur}
          action={{ label: "Réessayer", onPress: () => void charger("rafraichir") }}
        />
      ) : null}

      {creances ? (
        <>
          {/* ┌────────────────────────────────────────────────────────────┐
              │ LES DEUX SEULS CHIFFRES CONVERTIS DE L'ÉCRAN.              │
              │                                                            │
              │ Ils répondent à la question qu'on se pose en ouvrant :     │
              │ combien me doit-on, et combien est déjà en retard. Le      │
              │ reste de l'écran ne somme jamais entre devises ; ces deux  │
              │ chiffres le font, au taux figé sur chaque facture, et la   │
              │ légende sous le cadran le DIT. Une conversion tue est une  │
              │ conversion qu'on prendra pour un montant natif.            │
              │                                                            │
              │ LE CADRAN NE SUIT PAS LES FILTRES, et c'est délibéré. Il   │
              │ diffère en cela de celui de l'historique, qui les suit :   │
              │ là-bas la question est « combien pèse ce que je regarde ». │
              │ Ici tout est dû par construction, le cadran est donc une   │
              │ RÉFÉRENCE à laquelle comparer une puce - s'il bougeait à   │
              │ chaque filtre, on perdrait le chiffre auquel on compare.   │
              │ Et il ne pourrait pas le suivre : la conversion est faite  │
              │ par le serveur, au taux de chaque facture, que le terminal │
              │ n'a pas. Un total refait ici serait un troisième chiffre.  │
              └────────────────────────────────────────────────────────────┘ */}
          <StatStrip>
            <StatStripItem
              label="Total dû"
              icon="CreditCard"
              value={money.money(creances.totalPrincipal, creances.devisePrincipale)}
            />
            <StatStripItem
              label="Déjà échu"
              icon="TrendingDown"
              // Rouge SEULEMENT s'il y a du retard. Un « 0 $ » écarlate crie
              // pour rien, et à force on ne voit plus le vrai rouge.
              tone={creances.echuPrincipal > 0 ? "alert" : "neutral"}
              value={money.money(creances.echuPrincipal, creances.devisePrincipale)}
            />
            <StatStripItem
              label="Clients débiteurs"
              icon="Users"
              value={String(creances.nbDebiteurs)}
            />
            <StatStripItem
              label="Factures ouvertes"
              icon="Receipt"
              value={String(creances.nbFactures)}
            />
          </StatStrip>

          <Text variant="caption">
            {`Les deux premiers chiffres sont convertis en ${creances.devisePrincipale}, au taux figé sur chaque facture. Les montants réellement dus sont ci-dessous, devise par devise.`}
          </Text>
        </>
      ) : null}

      {creances?.parDevise.map((d) => {
        const echu = d.tranches
          .filter((t) => t.cle !== "current")
          .reduce((somme, t) => somme + t.montant, 0);
        return (
          <Card key={d.devise}>
            <View className="flex-row items-baseline justify-between gap-3">
              <Text variant="h4">{d.devise}</Text>
              <Text
                variant="body"
                numeric
                className={`font-sans-semibold ${echu > 0 ? "text-destructive" : ""}`}
              >
                {money.money(d.total, d.devise)}
              </Text>
            </View>

            {/* ┌──────────────────────────────────────────────────────────┐
                │ UNE BARRE EMPILÉE, ET NON CINQ BARRES INDÉPENDANTES.     │
                │                                                          │
                │ Cinq barres rapportées au même total montrent la taille   │
                │ de chaque tranche, jamais la FORME de l'ensemble - or    │
                │ c'est la forme qui renseigne : une dette saine est       │
                │ massive à gauche et s'éteint à droite, une dette qui     │
                │ pourrit fait l'inverse. Empilée, la bascule se voit sans │
                │ lire un seul chiffre.                                    │
                └──────────────────────────────────────────────────────────┘ */}
            <View className="mt-3">
              <BarreEmpilee
                parts={d.tranches.map((t) => ({
                  cle: t.cle,
                  valeur: t.montant,
                  classe: RAMPE_TRANCHE[t.cle].fond,
                }))}
              />
            </View>

            <View className="mt-3 gap-1.5">
              {d.tranches.map((t) => {
                const vide = t.montant <= 0;
                return (
                  <View key={t.cle} className="flex-row items-center gap-2">
                    <View
                      className={`h-2.5 w-2.5 rounded-full ${
                        vide ? "bg-muted" : RAMPE_TRANCHE[t.cle].fond
                      }`}
                    />
                    <Text
                      variant="caption"
                      numberOfLines={1}
                      className="min-w-0 flex-1"
                    >
                      {t.label}
                    </Text>
                    {/* Une tranche à zéro reste AFFICHÉE, en sourdine : c'est
                        l'absence de dette à plus de quatre-vingt-dix jours qui
                        rassure, et une ligne retirée ne rassure personne. */}
                    <Text
                      variant="caption"
                      numeric
                      className={`font-sans-medium ${
                        vide ? "text-muted-foreground" : RAMPE_TRANCHE[t.cle].texte
                      }`}
                    >
                      {money.money(t.montant, d.devise)}
                    </Text>
                  </View>
                );
              })}
            </View>
          </Card>
        );
      })}

      {aDesCreances ? (
        <View className="gap-3">
          <View>
            <Text variant="h4">Qui relancer</Text>
            <Text variant="caption">
              {/* La règle d'ancienneté n'est pas devinable, et elle change le
                  sens de chaque chiffre au-dessus : le back-office l'écrit,
                  le terminal ne le faisait pas. */}
              Ancienneté comptée depuis l&apos;échéance de la facture, ou depuis sa date
              de vente quand aucune échéance n&apos;a été fixée.
            </Text>
          </View>

          <SearchInput
            valeur={recherche}
            onChange={setRecherche}
            placeholder="Rechercher un client ou un numéro..."
          />

          <ChipRow>
            <Chip
              label={`Tous (${vue.nbTous})`}
              actif={!seulementEchus && vue.deviseActive === null}
              onPress={() => {
                setSeulementEchus(false);
                setDevise(null);
              }}
            />
            {/* Le décompte est calculé AVANT les puces : une puce à zéro se lit
                « il n'y en a pas », pas « vous ne les regardez pas ». */}
            <Chip
              label={`En retard (${vue.nbEchus})`}
              actif={seulementEchus}
              onPress={() => setSeulementEchus((v) => !v)}
            />
            {vue.devises.length > 1
              ? vue.devises.map((c) => (
                  <Chip
                    key={c}
                    label={c}
                    actif={vue.deviseActive === c}
                    onPress={() => setDevise((v) => (v === c ? null : c))}
                  />
                ))
              : null}
          </ChipRow>

          <Segmented options={TRIS} valeur={tri} onChange={setTri} />
        </View>
      ) : null}
    </View>
  );

  const rendu = (e: ElementCreance) => {
    if (e.type === "section") {
      return (
        <DataSection
          label={e.devise}
          meta={`${e.nb} ${e.nb > 1 ? "clients" : "client"}`}
          valeur={
            <Mesure value={money.money(e.total, e.devise)} tone="mutedForeground" />
          }
        />
      );
    }
    return <LigneDebiteur d={e.debiteur} money={money} onAppeler={appeler} />;
  };

  return (
    <Screen padded={false}>
      <AppBar
        title="Créances"
        // La DATE D'ARRÊTÉ, et l'heure à laquelle ce terminal l'a lue. Les deux
        // diffèrent dès qu'on est resté un moment sans réseau, et c'est
        // précisément l'écart qu'il faut voir.
        subtitle={
          arrete
            ? `Arrêté au ${formatDateFr(arrete)}${luA ? ` · lu à ${formatTimeFr(luA)}` : ""}`
            : "Balance âgée, par devise"
        }
        right={
          <IconButton
            name="Download"
            label="Exporter les créances"
            variant="ghost"
            onPress={() => setFeuilleFormat(true)}
            disabled={envoiExport || !creances || vue.lignes.length === 0}
          />
        }
      />
      <DataList
        donnees={vue.elements}
        cle={(e) => e.cle}
        rendu={rendu}
        // Sans elle, la virtualisation recycle un en-tête de devise en rangée
        // de client : les hauteurs sautent au défilement, et rien n'avertit.
        typeElement={(e) => e.type}
        enTete={enTete}
        chargement={chargement && !creances}
        separateur={false}
        onRefresh={() => void charger("rafraichir")}
        refreshing={rafraichissement}
        vide={{
          icon: !aDesCreances ? "CheckCircle2" : recherche ? "Search" : "Filter",
          titre: !aDesCreances
            ? "Aucune créance"
            : recherche
              ? "Aucun client ne correspond"
              : "Aucun débiteur sur ce filtre",
          // Un état vide sous un filtre ne dit PAS que tout est soldé : il dit
          // que ce filtre-là l'est, et il rend le chemin du retour.
          message: !aDesCreances
            ? "Toutes les factures sont soldées. Rien à relancer."
            : recherche
              ? "Essayez un autre nom, ou une partie du numéro de téléphone."
              : "Aucun client ne doit dans ce périmètre.",
          action: filtreActif
            ? {
                label: "Voir tous les débiteurs",
                onPress: () => {
                  setRecherche("");
                  setSeulementEchus(false);
                  setDevise(null);
                },
              }
            : undefined,
        }}
      />

      <FeuilleFormat
        ouvert={feuilleFormat}
        onFermer={() => setFeuilleFormat(false)}
        onChoisir={(f) => void exporter(f)}
        titre="Exporter les créances"
        envoi={envoiExport}
      />
    </Screen>
  );
}

/**
 * Une rangée de débiteur.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ DEUX CIBLES, PAS UNE PRESSABLE IMBRIQUÉE DANS UNE AUTRE.                │
 * │                                                                          │
 * │ Le corps mène à la fiche, le bouton compose. Les imbriquer laisserait la │
 * │ rangée intercepter le doigt un coup sur deux selon le moteur de gestes,  │
 * │ et « j'ai voulu appeler, ça a ouvert la fiche » est le genre de défaut   │
 * │ qu'on ne reproduit jamais devant l'écran de quelqu'un d'autre. Ce sont   │
 * │ donc deux frères, chacun à quarante-quatre points.                       │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
function LigneDebiteur({
  d,
  money,
  onAppeler,
}: {
  d: Debiteur;
  money: ReturnType<typeof useMonnaie>;
  onAppeler: (d: Debiteur) => void;
}) {
  const retard = d.plusAncienneJours;
  const ton = tonDuRetard(retard);

  return (
    <View className="flex-row items-center bg-card">
      <Pressable
        onPress={() => (d.clientId ? router.push(`/client/${d.clientId}` as never) : undefined)}
        disabled={!d.clientId}
        accessibilityRole="button"
        accessibilityLabel={d.nom}
        className="min-w-0 flex-1 flex-row items-center gap-3 py-3 pl-4"
        style={{ minHeight: HIT.min }}
      >
        <View className="min-w-0 flex-1">
          <View className="flex-row items-center gap-2">
            <Text
              variant="bodySmall"
              numberOfLines={1}
              className="min-w-0 flex-1 font-sans-medium"
            >
              {d.nom}
            </Text>
            {/* Le RETARD passe devant tout : c'est lui qui décide de l'ordre
                des appels, et un montant seul ne dit pas qu'une dette vieillit. */}
            {retard > 0 ? (
              <Badge tone={ton === "destructive" ? "destructive" : "warning"}>
                {libelleRetard(retard)}
              </Badge>
            ) : null}
          </View>
          <Text variant="caption" numberOfLines={1}>
            {[
              `${d.nbFactures} ${d.nbFactures > 1 ? "factures" : "facture"}`,
              // Le numéro se LIT dans la rangée, et pas seulement sous le
              // bouton : on le dicte parfois à quelqu'un d'autre.
              d.telephone,
            ]
              .filter(Boolean)
              .join(" · ")}
          </Text>
        </View>
        <View className="shrink-0 items-end pl-2">
          <Mesure value={money.money(d.montant, d.devise)} />
          {/* Le déjà-échu ne s'affiche que s'il existe : « 0 $ échus » sous
              chaque ligne est du bruit qui masque les vraies alertes. */}
          {d.echu > 0 ? (
            <Text variant="caption" numeric className="text-destructive">
              {`${money.money(d.echu, d.devise)} échus`}
            </Text>
          ) : null}
        </View>
      </Pressable>

      {d.telephone ? (
        <View className="shrink-0 pl-1">
          <IconButton
            name="Phone"
            label={`Appeler ${d.nom}`}
            variant="ghost"
            onPress={() => onAppeler(d)}
          />
        </View>
      ) : null}

      <View className="shrink-0 pr-3 pl-1">
        <Icon name="ChevronRight" size={16} color="mutedForeground" />
      </View>
    </View>
  );
}
