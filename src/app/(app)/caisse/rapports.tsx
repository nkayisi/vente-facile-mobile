/**
 * Rapports de caisse. Miroir de `app/dashboard/cashbook/reports/page.tsx`.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ IL N'EXISTAIT NULLE PART SUR LE TERMINAL.                               │
 * │                                                                          │
 * │ Le back-office porte quatre rapports - journalier, mensuel, annuel,      │
 * │ personnalisé - et le terminal n'en avait aucun : le bouton « Rapports de │
 * │ caisse » n'existait pas sur son livre de caisse, et le rapport           │
 * │ journalier de l'onglet Rapports vient d'un AUTRE endpoint                │
 * │ (`/reports/statistics/daily_cash_report/`), avec d'autres chiffres.      │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE SOLDE D'OUVERTURE VIENT DU SERVEUR, ET NE PEUT PAS EN VENIR AUTREMENT.│
 * │                                                                          │
 * │ Il se relève sur TOUT l'historique des mouvements, que le terminal ne    │
 * │ détient pas : il n'en tire qu'une fenêtre récente. Le recalculer         │
 * │ localement donnerait deux chiffres pour le même tiroir. L'écran dit donc │
 * │ qu'il lui faut du réseau, au lieu d'afficher un tableau vide - qui se    │
 * │ lirait « rien à signaler », ce qui est faux.                             │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ AUCUNE SOMME INTER-DEVISES. Chaque tableau porte sa colonne « Devise » et
 * chaque montant est écrit dans la sienne : un tiroir contient des liasses
 * distinctes, et le back-office ventile de la même façon.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { monthLong } from "@vente-facile/core";

import { jourISO } from "@/data/dates";
import { useMonnaie } from "@/data/devises";
import { useEnLigne } from "@/data/reseau";
import {
  chargerRapportCaisse,
  parametresFenetre,
  PORTEES_CAISSE,
  TITRES_CAISSE,
  type FenetreCaisse,
  type PorteeRapportCaisse,
  type RapportCaisse,
} from "@/data/rapports-caisse";
import { libelleTypeCaisse } from "@/data/types-caisse";
import { FeuilleFormat } from "@/features/export/feuille-format";
import { telechargerDocument, type FormatExport } from "@/features/export/telecharger";
import {
  AppBar, Badge, ChampDate, Chip, ChipRow, ErrorState,
  IconButton, Screen, Section, Segmented, Spinner, StatStrip, StatStripItem,
  Tableau, Text, useToast, type ColonneTableau,
} from "@/ui";

const URL_EXPORT = "/cash-movements/export-report/";

/** Les douze derniers mois et les cinq dernières années : il n'y a pas de sélecteur natif. */
function moisDeLAnnee(): { valeur: string; label: string }[] {
  return Array.from({ length: 12 }, (_, i) => ({
    valeur: String(i + 1),
    // `Intl` est PROSCRIT : Hermes n'embarque pas l'ICU complète et se replie
    // sur l'anglais SANS lever, donc jamais sur la machine du développeur.
    label: monthLong(i),
  }));
}

function anneesRecentes(combien = 5): number[] {
  const a = new Date().getFullYear();
  return Array.from({ length: combien }, (_, i) => a - i);
}

export default function RapportsCaisse() {
  const money = useMonnaie();
  const toast = useToast();
  const enLigne = useEnLigne();

  /**
   * ⚠ `useState` à initialisation PARESSEUSE, et non `new Date()` en plein
   * rendu : une horloge lue pendant le rendu est une impureté, et React peut
   * rendre deux fois - deux « aujourd'hui » différents à quelques
   * millisecondes d'écart le jour d'un changement de date. La valeur est figée
   * à l'ouverture de l'écran, ce qui est exactement ce qu'on veut d'un rapport.
   */
  const [aujourdhui] = useState(() => new Date());
  const [portee, setPortee] = useState<PorteeRapportCaisse>("daily");
  const [jour, setJour] = useState(jourISO(aujourdhui));
  const [annee, setAnnee] = useState(aujourdhui.getFullYear());
  const [mois, setMois] = useState(aujourdhui.getMonth() + 1);
  const [debut, setDebut] = useState(jourISO(new Date(aujourdhui.getFullYear(), aujourdhui.getMonth(), 1)));
  const [fin, setFin] = useState(jourISO(aujourdhui));

  const [rapport, setRapport] = useState<RapportCaisse | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [feuille, setFeuille] = useState(false);
  const [envoiExport, setEnvoiExport] = useState(false);

  const fenetre: FenetreCaisse = useMemo(
    () => ({ portee, jour, annee, mois, debut, fin }),
    [portee, jour, annee, mois, debut, fin]
  );

  /**
   * Ce que la fenêtre recouvre, en toutes lettres.
   *
   * Le serveur le compose aussi, pour son document ; l'écran a besoin du même
   * mot avant même d'avoir la réponse - un titre qui n'arrive qu'après la
   * requête laisse le lecteur devant une page qui ne dit pas ce qu'elle
   * charge.
   */
  const libelle = useMemo(() => {
    switch (portee) {
      case "daily":
        return `Journée du ${jour}`;
      case "monthly":
        return `${monthLong(mois - 1)} ${annee}`;
      case "annual":
        return `Année ${annee}`;
      default:
        return `Du ${debut} au ${fin}`;
    }
  }, [portee, jour, annee, mois, debut, fin]);

  const charger = useCallback(async () => {
    setChargement(true);
    setErreur(null);
    try {
      setRapport(await chargerRapportCaisse(fenetre, libelle));
    } catch (e) {
      setErreur(
        enLigne
          ? e instanceof Error
            ? e.message
            : "Le rapport n'a pas pu être chargé."
          : "hors-ligne"
      );
      setRapport(null);
    } finally {
      setChargement(false);
    }
  }, [fenetre, libelle, enLigne]);

  useEffect(() => {
    void charger();
  }, [charger]);

  const exporter = async (format: FormatExport) => {
    setFeuille(false);
    setEnvoiExport(true);
    try {
      await telechargerDocument(
        URL_EXPORT,
        // `scope` NOMME le rapport, les autres paramètres le DÉLIMITENT.
        // La même construction que la lecture : le fichier ne peut donc pas
        // couvrir un autre périmètre que l'écran qui l'a déclenché.
        { scope: portee, ...parametresFenetre(fenetre) },
        format,
        // La PÉRIODE nomme le fichier, jamais la date du jour : deux tirages
        // de deux mois s'écraseraient sinon sous un seul nom.
        `${TITRES_CAISSE[portee]} ${libelle}`
      );
    } catch (e) {
      toast.erreur(e instanceof Error ? e.message : "L'export n'a pas pu être produit.");
    } finally {
      setEnvoiExport(false);
    }
  };

  const raisonExport = !enLigne
    ? "L'export est fabriqué par le serveur : il demande une connexion."
    : envoiExport
      ? "Export en cours…"
      : undefined;

  return (
    <Screen scroll padded={false}>
      <AppBar
        title="Rapports de caisse"
        subtitle={libelle}
        right={
          <IconButton
            name="Download"
            label="Exporter le rapport"
            variant="ghost"
            onPress={() => setFeuille(true)}
            disabled={Boolean(raisonExport) || !rapport}
          />
        }
      />

      <View className="gap-4 p-4">
        <Segmented
          options={PORTEES_CAISSE.map((p) => ({ valeur: p.valeur, label: p.label }))}
          valeur={portee}
          onChange={(v) => setPortee(v as PorteeRapportCaisse)}
        />

        <SelecteurFenetre
          demain={jourISO(new Date(aujourdhui.getTime() + 86_400_000))}
          portee={portee}
          jour={jour}
          onJour={setJour}
          annee={annee}
          onAnnee={setAnnee}
          mois={mois}
          onMois={setMois}
          debut={debut}
          onDebut={setDebut}
          fin={fin}
          onFin={setFin}
        />

        {chargement && !rapport ? (
          <View className="items-center py-12">
            <Spinner />
          </View>
        ) : erreur ? (
          <ErrorState
            title={erreur === "hors-ligne" ? "Rapport indisponible hors ligne" : "Rapport indisponible"}
            message={
              erreur === "hors-ligne"
                ? "Le solde d'ouverture se relève sur tout l'historique de la caisse, que ce terminal ne détient pas. Le comptoir, lui, continue de fonctionner sans réseau."
                : erreur
            }
            onRetry={() => void charger()}
          />
        ) : rapport ? (
          <CorpsRapport rapport={rapport} money={money} portee={portee} />
        ) : null}
      </View>

      <FeuilleFormat
        ouvert={feuille}
        onFermer={() => setFeuille(false)}
        onChoisir={(f) => void exporter(f)}
        titre={TITRES_CAISSE[portee]}
        envoi={envoiExport}
      />
    </Screen>
  );
}

function SelecteurFenetre({
  demain,
  portee,
  jour,
  onJour,
  annee,
  onAnnee,
  mois,
  onMois,
  debut,
  onDebut,
  fin,
  onFin,
}: {
  /** Figé à l'ouverture de l'écran : voir `aujourdhui` plus haut. */
  demain: string;
  portee: PorteeRapportCaisse;
  jour: string;
  onJour: (v: string) => void;
  annee: number;
  onAnnee: (v: number) => void;
  mois: number;
  onMois: (v: number) => void;
  debut: string;
  onDebut: (v: string) => void;
  fin: string;
  onFin: (v: string) => void;
}) {
  // ⚠ Une date se CHOISIT, elle ne se tape pas : dix caractères dont deux
  // tirets sur un clavier de téléphone, pour une valeur que l'appareil connaît
  // déjà - et « 2026-09-32 » a la bonne FORME, donc passe le contrôle et n'est
  // refusée que par le serveur.

  if (portee === "daily") {
    return (
      <View>
        <Text variant="label" className="mb-1.5">
          Date du rapport
        </Text>
        <ChampDate
          valeur={jour}
          onChange={onJour}
          // Un rapport de caisse ne se tire pas pour demain : le tiroir n'a
          // pas encore bougé.
          maximum={demain}
          accessibilityLabel="Date du rapport"
        />
      </View>
    );
  }

  if (portee === "custom") {
    return (
      <View className="flex-row gap-3">
        <View className="flex-1">
          <Text variant="label" className="mb-1.5">
            Du
          </Text>
          <ChampDate valeur={debut} onChange={onDebut} maximum={fin} accessibilityLabel="Date de début" />
        </View>
        <View className="flex-1">
          <Text variant="label" className="mb-1.5">
            Au
          </Text>
          <ChampDate valeur={fin} onChange={onFin} minimum={debut} maximum={demain} accessibilityLabel="Date de fin" />
        </View>
      </View>
    );
  }

  return (
    <View className="gap-3">
      {portee === "monthly" ? (
        <View>
          <Text variant="label" className="mb-1.5">
            Mois
          </Text>
          <ChipRow>
            {moisDeLAnnee().map((m) => (
              <Chip
                key={m.valeur}
                label={m.label}
                actif={mois === Number(m.valeur)}
                onPress={() => onMois(Number(m.valeur))}
              />
            ))}
          </ChipRow>
        </View>
      ) : null}
      <View>
        <Text variant="label" className="mb-1.5">
          Année
        </Text>
        <ChipRow>
          {anneesRecentes().map((a) => (
            <Chip key={a} label={String(a)} actif={annee === a} onPress={() => onAnnee(a)} />
          ))}
        </ChipRow>
      </View>
    </View>
  );
}

function CorpsRapport({
  rapport,
  money,
  portee,
}: {
  rapport: RapportCaisse;
  money: ReturnType<typeof useMonnaie>;
  portee: PorteeRapportCaisse;
}) {
  const r = rapport;
  const m = (montant: number, devise: string) => money.money(montant, devise);

  /**
   * Le cadran porte les QUATRE relevés du back-office, ventilés par devise.
   *
   * ⚠ Une seule devise se rend comme un total simple ; plusieurs se rendent
   * l'une sous l'autre. Les additionner donnerait un nombre qui ne correspond
   * à aucune liasse - et c'est un rapport de CAISSE, donc de billets.
   */
  const cellule = (
    label: string,
    icon: Parameters<typeof StatStripItem>[0]["icon"],
    pick: (l: (typeof r.parDevise)[number]) => number
  ) => (
    <StatStripItem label={label} icon={icon}>
      {r.parDevise.length === 0 ? (
        <Text variant="h4" numeric>
          {m(0, money.primaryCode)}
        </Text>
      ) : (
        <View className="gap-0.5">
          {r.parDevise.map((l) => (
            <Text key={l.devise} variant="h4" numeric>
              {m(pick(l), l.devise)}
            </Text>
          ))}
        </View>
      )}
    </StatStripItem>
  );

  const colonnesDevise: ColonneTableau<(typeof r.parDevise)[number]>[] = [
    { cle: "devise", entete: "Devise", largeur: 80, valeur: (l) => l.devise },
    { cle: "ouv", entete: "Ouverture", largeur: 120, mesure: true, valeur: (l) => m(l.ouverture, l.devise) },
    { cle: "in", entete: "Entrées", largeur: 120, mesure: true, valeur: (l) => m(l.entrees, l.devise) },
    { cle: "out", entete: "Sorties", largeur: 120, mesure: true, valeur: (l) => m(l.sorties, l.devise) },
    { cle: "net", entete: "Net", largeur: 120, mesure: true, valeur: (l) => m(l.net, l.devise) },
    { cle: "clo", entete: "Clôture", largeur: 130, mesure: true, valeur: (l) => m(l.cloture, l.devise) },
  ];

  const colonnesType: ColonneTableau<(typeof r.parType)[number]>[] = [
    { cle: "type", entete: "Type", largeur: 170, valeur: (l) => libelleTypeCaisse(l.type) },
    { cle: "devise", entete: "Devise", largeur: 80, valeur: (l) => l.devise },
    {
      cle: "sens",
      entete: "Sens",
      largeur: 100,
      valeur: (l) => (l.entree ? "Entrée" : "Sortie"),
      rendu: (l) => (
        <Badge tone={l.entree ? "success" : "destructive"}>
          {l.entree ? "Entrée" : "Sortie"}
        </Badge>
      ),
    },
    { cle: "n", entete: "Nombre", largeur: 90, mesure: true, valeur: (l) => String(l.nombre) },
    { cle: "total", entete: "Total", largeur: 130, mesure: true, valeur: (l) => m(l.total, l.devise) },
  ];

  const colonnesSeau: ColonneTableau<(typeof r.seaux)[number]>[] = [
    { cle: "cle", entete: r.libelleSeau, largeur: 130, valeur: (l) => l.cle },
    { cle: "devise", entete: "Devise", largeur: 80, valeur: (l) => l.devise },
    { cle: "in", entete: "Entrées", largeur: 130, mesure: true, valeur: (l) => m(l.entrees, l.devise) },
    { cle: "out", entete: "Sorties", largeur: 130, mesure: true, valeur: (l) => m(l.sorties, l.devise) },
    { cle: "n", entete: "Nombre", largeur: 90, mesure: true, valeur: (l) => String(l.nombre) },
  ];

  const colonnesCategorie: ColonneTableau<(typeof r.depensesParCategorie)[number]>[] = [
    { cle: "cat", entete: "Catégorie", largeur: 180, valeur: (l) => l.categorie },
    { cle: "devise", entete: "Devise", largeur: 80, valeur: (l) => l.devise },
    { cle: "n", entete: "Nombre", largeur: 90, mesure: true, valeur: (l) => String(l.nombre) },
    { cle: "total", entete: "Total", largeur: 140, mesure: true, valeur: (l) => m(l.total, l.devise) },
  ];

  const colonnesMouvement: ColonneTableau<(typeof r.mouvements)[number]>[] = [
    {
      cle: "heure",
      entete: "Heure",
      // 80 points, et non 62 : « 02:58:22 » se coupait en deux lignes, et des
      // hauteurs de rangée inégales rendent un journal illisible.
      largeur: 80,
      valeur: (l) => l.date.slice(11, 19) || "—",
    },
    { cle: "ref", entete: "Référence", largeur: 150, valeur: (l) => l.reference },
    { cle: "type", entete: "Type", largeur: 160, valeur: (l) => libelleTypeCaisse(l.type) },
    { cle: "desc", entete: "Description", largeur: 200, valeur: (l) => l.description || "—" },
    {
      cle: "montant",
      entete: "Montant",
      largeur: 140,
      mesure: true,
      valeur: (l) => `${l.entree ? "+" : "-"}${m(l.montant, l.devise)}`,
    },
    {
      cle: "solde",
      entete: "Solde après",
      largeur: 140,
      mesure: true,
      valeur: (l) => m(l.soldeApres, l.devise),
    },
  ];

  return (
    <View className="gap-4">
      <StatStrip>
        {cellule("Ouverture", "Wallet", (l) => l.ouverture)}
        {cellule("Entrées", "TrendingUp", (l) => l.entrees)}
        {cellule("Sorties", "TrendingDown", (l) => l.sorties)}
        {cellule("Clôture", "ArrowLeftRight", (l) => l.cloture)}
      </StatStrip>

      <Section title="Soldes par devise">
        <Tableau
          colonnes={colonnesDevise}
          lignes={r.parDevise}
          cle={(l) => l.devise}
          messageVide="Aucun mouvement sur cette période."
        />
      </Section>

      <Section title="Résumé par type">
        <Tableau
          colonnes={colonnesType}
          lignes={r.parType}
          cle={(l, i) => `${l.devise}-${l.type}-${i}`}
          messageVide="Aucun mouvement sur cette période."
        />
      </Section>

      {/* Le journalier n'a pas de découpage temporel : il EST une journée. */}
      {portee !== "daily" ? (
        <Section title={`Détail par ${r.libelleSeau.toLowerCase()}`}>
          <Tableau
            colonnes={colonnesSeau}
            lignes={r.seaux}
            cle={(l, i) => `${l.cle}-${l.devise}-${i}`}
            messageVide="Aucun mouvement sur cette période."
          />
        </Section>
      ) : null}

      {/* Les dépenses par catégorie ne sont rendues que hors journalier, comme
          au back-office : sur une seule journée le tableau des mouvements les
          porte déjà, ligne à ligne. */}
      {portee !== "daily" ? (
        <Section title="Dépenses par catégorie">
          <Tableau
            colonnes={colonnesCategorie}
            lignes={r.depensesParCategorie}
            cle={(l, i) => `${l.categorie}-${l.devise}-${i}`}
            messageVide="Aucune dépense sur cette période."
          />
        </Section>
      ) : null}

      {portee === "daily" ? (
        <Section title={`Mouvements (${r.nombreMouvements})`}>
          <Tableau
            colonnes={colonnesMouvement}
            lignes={r.mouvements}
            cle={(l) => l.id}
            messageVide="Aucun mouvement ce jour-là."
          />
          {/* Le serveur pagine sa liste de mouvements : le DIRE plutôt que de
              tronquer en silence, et renvoyer vers le document, qui porte la
              journée ENTIÈRE. */}
          {r.nombreMouvements > r.mouvements.length ? (
            <View className="px-4 py-3">
              <Text variant="caption">
                {`${r.mouvements.length} des ${r.nombreMouvements} mouvements du jour. Le document exporté les porte tous.`}
              </Text>
            </View>
          ) : null}
        </Section>
      ) : null}
    </View>
  );
}
