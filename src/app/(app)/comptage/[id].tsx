/**
 * Feuille de comptage. Miroir de `app/dashboard/inventory/[id]/page.tsx`.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ C'EST L'ÉCRAN QUI JUSTIFIE LE MOBILE. On compte DEBOUT, dans le rayon,   │
 * │ souvent au fond d'un dépôt sans réseau.                                  │
 * │                                                                          │
 * │ Trois conséquences, et aucune n'est négociable :                         │
 * │  - la feuille est descendue AVEC sa session, elle s'ouvre hors ligne ;   │
 * │  - le comptage part au journal, pas dans la table tirée ;                │
 * │  - ce qui vient d'être saisi se lit sur la ligne, marqué « à envoyer ».  │
 * │    Sans cela, le magasinier recompterait ce qu'il vient de compter.      │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * **On compte en CONTENANTS + UNITÉS**, parce que c'est ainsi qu'on compte un
 * rayon : trois casiers et sept bouteilles, pas quarante-trois.
 */
import { useCallback, useMemo, useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import {
  formatDateTimeFr,
  formatPackagedSplit,
  formatPrice,
  getPackaging,
  pluralizeUnit,
  toBaseQuantity,
} from "@vente-facile/core";

import { useLecture } from "@/data/live";
import { lireNombre } from "@/data/nombres";
import { ecartDuComptage } from "@/features/stock/lignes-conditionnees";
import {
  STATUT_INVENTAIRE,
  detailSession,
  type LigneComptage,
} from "@/data/inventaire";
import {
  comptagesEnAttente,
  creationsEnAttente,
  enregistrerComptages,
  sessionsEnAttente,
  transitionSession,
} from "@/features/inventaire/actes";
import {
  ACTIONS,
  motifSoumissionFermee,
  motifTransitionEnFile,
  type TransitionSession,
} from "@/features/inventaire/apparence";
import { BandeauEnvoi } from "@/features/sync/bandeau-envoi";
import { useSynchronisation } from "@/features/sync/provider";
import { libelleEnvoi } from "@/data/envoi";
import { useSession } from "@/session/provider";
import {
  AlertDialog, AppBar, Badge, Banner, Button, Card, CardHeader, Chip, ChipRow,
  DataList, DataRow, EmptyState, FormField, Input, Mesure, ProgressBar, Screen,
  SearchInput, Sheet, Spinner, StatStrip, StatStripItem, Text, useToast,
} from "@/ui";

/**
 * Lire une quantité comptée, et la phrase à écrire si elle ne vaut rien.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ `Number(x.replace(",", ".")) || 0` ENREGISTRAIT UN ZÉRO EN SILENCE.     │
 * │                                                                          │
 * │ Un comptage tapé « 12 500 », avec le séparateur de milliers, donne       │
 * │ `NaN`, que `|| 0` transforme en ZÉRO. Et sur une feuille d'inventaire,   │
 * │ zéro n'est pas une absence de saisie : c'est le constat d'un rayon vide, │
 * │ qui déclenche un écart de tout le stock et sort la marchandise à         │
 * │ l'approbation. `lireNombre` rend un MOTIF, et l'écran la phrase.         │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
function lire(saisie: string): { valeur: number | null; erreur?: string } {
  if (!saisie.trim()) return { valeur: null };
  const l = lireNombre(saisie);
  if (l.ok) return { valeur: l.valeur ?? null };
  return {
    valeur: null,
    erreur:
      l.motif === "negatif"
        ? "Un comptage négatif ne se relève pas : on compte ce qu'on voit."
        : "Comptage illisible. Écrivez par exemple 12 ou 1,5.",
  };
}

const TABLES = ["inventory_sessions", "inventory_counts", "products", "warehouses", "units"];

export default function FeuilleComptage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const toast = useToast();
  const { can } = useSession();
  const { enCours: syncEnCours } = useSynchronisation();

  const [ligneOuverte, setLigneOuverte] = useState<LigneComptage | null>(null);
  const [contenants, setContenants] = useState("");
  const [vrac, setVrac] = useState("");
  const [confirmation, setConfirmation] = useState<TransitionSession | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [erreursSaisie, setErreursSaisie] = useState<{
    contenants?: string;
    vrac?: string;
  }>({});
  const [recherche, setRecherche] = useState("");
  const [filtre, setFiltre] = useState<"tous" | "restants" | "comptes" | "ecarts">("tous");

  const charger = useCallback(() => detailSession(id), [id]);
  const { donnees: s, chargement } = useLecture(charger, { tables: TABLES, deps: [id] });
  const chargerAttente = useCallback(() => comptagesEnAttente(id), [id]);
  const { donnees: attente } = useLecture(chargerAttente, {
    tables: ["outbox_operations"],
    deps: [id],
  });
  const { donnees: sessionsFile } = useLecture(sessionsEnAttente, {
    tables: ["outbox_operations"],
  });
  // Une session tout juste créée n'est PAS dans la table tirée, et ne doit pas
  // y être. Sans cette lecture, sa propre fiche la déclarerait introuvable
  // trois secondes après l'avoir créée.
  const { donnees: creations } = useLecture(creationsEnAttente, {
    tables: ["outbox_operations"],
  });

  /**
   * La feuille FUSIONNE la table tirée et le journal.
   *
   * La table dit ce que le serveur sait ; le journal, ce que le magasinier
   * vient de saisir. Sans cette fusion, il recompterait ce qu'il vient de
   * compter - c'est la contrepartie directe de « on n'écrit rien dans une
   * table tirée ».
   */
  const lignes = useMemo(() => {
    if (!s) return [];
    return s.lignes.map((l) => {
      const saisi = attente?.get(l.id);
      if (!saisi) return { ...l, enAttente: false, envoi: undefined };
      const compte = saisi.total;
      const contenants = saisi.contenants ?? 0;
      const vracSaisi = saisi.vrac ?? compte;
      const mot = (n: number) => pluralizeUnit(l.uniteDetail ?? "unité", n);

      // ┌────────────────────────────────────────────────────────────────────┐
      // │ LA LIGNE EN ATTENTE SE LIT COMME SA VOISINE SYNCHRONISÉE.         │
      // │                                                                    │
      // │ Cette fusion réécrivait son propre formatage et perdait la         │
      // │ VENTILATION PAR CANAL : « +5 » là où la ligne tirée annonce        │
      // │ « -2 casiers, +5 bouteilles ». Deux lectures du même écart sur le  │
      // │ même écran, et c'est celle qui vient d'être saisie qui en disait   │
      // │ le moins. Le noyau rend les deux, et il est déjà la source des     │
      // │ lignes tirées (`data/inventaire.ts`).                              │
      // └────────────────────────────────────────────────────────────────────┘
      const cond = l.facteur
        ? getPackaging({
            selling_mode: "wholesale_and_retail",
            units_per_package: l.facteur,
            unit_name: l.uniteDetail,
            packaging_unit_name: l.uniteContenant,
          })
        : null;
      const ecart = compte - l.attendu;

      return {
        ...l,
        estCompte: true,
        enAttente: true,
        // Un comptage BLOQUÉ s'affiche compté - c'est du travail fait dans le
        // rayon - mais il n'ouvrira pas la soumission : il n'arrivera pas au
        // serveur, qui verrait une feuille incomplète.
        envoi: saisi.envoi,
        compte,
        compteContenants: contenants,
        compteVrac: vracSaisi,
        compteAffiche: cond
          ? formatPackagedSplit(cond, contenants, vracSaisi)
          : `${compte} ${mot(compte)}`,
        ecart,
        // `ecartDuComptage` porte déjà la normalisation de l'attendu que le
        // serveur applique (`split`) : la refaire ici en serait une seconde
        // copie, et c'est exactement ce que ce module existe pour empêcher.
        ecartAffiche: ecartDuComptage(
          cond,
          { contenants: 0, vrac: l.attenduVrac, total: l.attendu },
          { conditionnement: cond, contenants, vrac: vracSaisi }
        ).texte,
      };
    });
  }, [s, attente]);

  const comptees = lignes.filter((l) => l.estCompte).length;
  const avecEcart = lignes.filter((l) => l.estCompte && l.ecart !== 0).length;
  const bloquees = lignes.filter((l) => l.envoi === "bloque").length;
  /**
   * Ce qui ouvre la soumission, et qui n'est PAS ce qui s'affiche.
   *
   * Une ligne dont le comptage attend un droit se lit comptée, et elle l'est ;
   * mais elle n'arrivera pas au serveur, qui refuserait une feuille
   * incomplète. Le refus viendrait alors en quarantaine, le lendemain, loin du
   * rayon.
   */
  const motifSoumission = motifSoumissionFermee({
    lignes: lignes.length,
    comptees: lignes.filter((l) => l.estCompte && l.envoi !== "bloque").length,
    bloquees,
  });

  /**
   * Les quatre puces, avec leur DÉCOMPTE.
   *
   * Il est calculé sur toute la feuille et SANS le filtre actif : une puce à
   * zéro se lit « il n'y en a pas », jamais « vous ne les regardez pas ». Les
   * vides disparaissent, sauf l'active - quatre refus de suite apprennent à ne
   * plus lire la rangée.
   */
  const PUCES = [
    { cle: "tous" as const, label: "Toutes", n: lignes.length },
    { cle: "restants" as const, label: "À compter", n: lignes.length - comptees },
    { cle: "comptes" as const, label: "Comptées", n: comptees },
    { cle: "ecarts" as const, label: "Avec écart", n: avecEcart },
  ];

  const terme = recherche.trim().toLowerCase();
  const lignesVisibles = lignes.filter((l) => {
    if (terme && !`${l.produit} ${l.sku ?? ""}`.toLowerCase().includes(terme)) return false;
    if (filtre === "restants") return !l.estCompte;
    if (filtre === "comptes") return l.estCompte;
    if (filtre === "ecarts") return l.estCompte && l.ecart !== 0;
    return true;
  });

  if (chargement && !s) {
    return (
      <Screen>
        <AppBar title="Inventaire" />
        <View className="flex-1 items-center justify-center">
          <Spinner />
        </View>
      </Screen>
    );
  }

  if (!s) {
    const creee = creations?.find((c) => c.id === id);
    if (creee) {
      const envoiCreation = libelleEnvoi(creee.envoi);
      return (
        <Screen
          scroll
          padded={false}
          // La sortie descend sous le pouce, comme partout ailleurs : le haut
          // d'un téléphone de six pouces se rattrape à deux mains.
          pied={
            <Button
              variant="outline"
              fullWidth
              leftIcon="ArrowLeft"
              onPress={() => router.back()}
            >
              Revenir aux sessions
            </Button>
          }
        >
          <AppBar
            title={creee.nom}
            right={
              envoiCreation ? (
                // Le badge disait « En attente d'envoi » en orange EN DUR :
                // sur une création bloquée, il écrivait le mot faux dans la
                // couleur fausse.
                <Badge tone={envoiCreation.ton === "warning" ? "warning" : "neutral"}>
                  {envoiCreation.court}
                </Badge>
              ) : undefined
            }
          />
          <View className="gap-4 p-4">
            <BandeauEnvoi
              envoi={creee.envoi}
              titre="Session créée, pas encore envoyée"
              consequence="Elle n'existe que sur ce terminal."
            />
            {/*
              LA FEUILLE EST ENGENDRÉE PAR LE SERVEUR, au démarrage. C'est une
              vraie limite du hors-ligne, et la dire vaut mieux que d'afficher
              une feuille vide : le magasinier saurait sinon qu'il peut compter,
              et son travail n'aurait nulle part où aller.
            */}
            <Card>
              <CardHeader title="Le comptage attend la synchronisation" />
              <Text variant="bodySmall">
                La feuille de comptage est engendrée par le serveur au
                démarrage de la session, avec le stock théorique du moment.
                Tant que la session n&apos;est pas partie, il n&apos;y a rien à
                compter.
              </Text>
            </Card>
          </View>
        </Screen>
      );
    }
    return (
      <Screen padded={false}>
        <AppBar title="Inventaire" />
        <EmptyState
          icon="ClipboardList"
          title="Session introuvable"
          message="Elle n'est pas encore descendue sur ce terminal, ou elle a été supprimée."
          action={{ label: "Retour", onPress: () => router.back() }}
        />
      </Screen>
    );
  }

  const st = STATUT_INVENTAIRE[s.statut];
  const attenteSession = sessionsFile?.get(s.id) ?? null;
  const enFile = attenteSession !== null;
  const motifFile = attenteSession
    ? motifTransitionEnFile(attenteSession.acte, attenteSession.envoi)
    : "";
  const possibles = (Object.keys(ACTIONS) as TransitionSession[]).filter(
    (a) => ACTIONS[a].depuis.includes(s.statut) && can(ACTIONS[a].permission)
  );
  const peutCompter = s.statut === "in_progress" && can("inventory.count");

  const ouvrir = (l: LigneComptage) => {
    setLigneOuverte(l);
    setContenants(l.estCompte ? String(l.compteContenants) : "");
    setVrac(l.estCompte ? String(l.compteVrac) : "");
    setErreursSaisie({});
  };

  const enregistrer = async () => {
    if (!ligneOuverte || envoi) return;

    const lc = lire(contenants);
    const lv = lire(vrac);
    const mauvais = { contenants: lc.erreur, vrac: lv.erreur };
    // ZÉRO EST UNE VALEUR ICI : un rayon vide face à un théorique de dix est
    // précisément l'écart qu'un inventaire existe pour constater. C'est la
    // saisie VIDE des deux champs qui ne dit rien.
    if (!mauvais.contenants && !mauvais.vrac && lc.valeur == null && lv.valeur == null) {
      mauvais.vrac = "Indiquez ce que vous avez compté, même si c'est zéro.";
    }
    setErreursSaisie(mauvais);
    if (mauvais.contenants || mauvais.vrac) return;

    const nc = lc.valeur ?? 0;
    const nv = lv.valeur ?? 0;
    // `toBaseQuantity` du noyau, jamais un `nc * facteur + nv` écrit ici : une
    // seconde arithmétique du conditionnement finirait par diverger de celle du
    // serveur. Il l'ignore d'ailleurs dès qu'une ligne porte un facteur (il
    // repose les deux compteurs), mais il EXIGE la clé - `quantity_counted`
    // absent fait sauter la ligne en silence (`if compte is None: continue`).
    const conditionnement = ligneOuverte.facteur
      ? getPackaging({
          selling_mode: "wholesale_and_retail",
          units_per_package: ligneOuverte.facteur,
          unit_name: ligneOuverte.uniteDetail,
          packaging_unit_name: ligneOuverte.uniteContenant,
        })
      : null;
    const total = conditionnement ? toBaseQuantity(conditionnement, nc, nv) : nv;
    setEnvoi(true);
    try {
      await enregistrerComptages(s.id, [
        {
          ligne: ligneOuverte.id,
          total,
          ...(ligneOuverte.facteur ? { contenants: nc, vrac: nv } : {}),
        },
      ]);
      setLigneOuverte(null);
      setErreursSaisie({});
    } catch (e) {
      toast.erreur(e instanceof Error ? e.message : "Le comptage n'a pas pu être enregistré.");
    } finally {
      setEnvoi(false);
    }
  };

  const executer = async (transition: TransitionSession) => {
    if (envoi) return;
    setEnvoi(true);
    try {
      await transitionSession(s.id, transition);
      setConfirmation(null);
      // ┌──────────────────────────────────────────────────────────────────┐
      // │ PAS DE TOAST : L'ÉCRAN LE DIT DÉJÀ, ET MIEUX.                    │
      // │                                                                  │
      // │ Il en émettait un, « Opération mise en file… », du temps où les  │
      // │ boutons DISPARAISSAIENT : c'était le seul retour possible. La    │
      // │ page porte maintenant l'état en permanence - bandeau avec son    │
      // │ issue, boutons grisés, motif sous eux - et le toast, posé à      │
      // │ quatre-vingt-cinq points du bas, RECOUVRE ce motif pendant les   │
      // │ trois secondes et demie où on le lit. Mesuré à l'écran.          │
      // └──────────────────────────────────────────────────────────────────┘
    } catch (e) {
      toast.erreur(e instanceof Error ? e.message : "L'opération n'a pas pu être mise en file.");
    } finally {
      setEnvoi(false);
    }
  };

  const enTete = (
    <View className="gap-4 px-4 pb-3 pt-2">
      {attenteSession ? (
        <BandeauEnvoi
          envoi={attenteSession.envoi}
          titre="Une opération attend son envoi"
          consequence="Le statut ne changera qu'après."
        />
      ) : null}

      {/* CE QUI EST DÉJÀ ARRIVÉ, dit une fois pour toutes en tête. Sans cela,
          une session close ressemble à une session en cours à qui manqueraient
          ses boutons - le défaut déjà corrigé sur la fiche d'un retour. */}
      {s.statut === "validated" ? (
        <Banner
          tone="success"
          title="Inventaire validé"
          message={[
            s.valide ? `Le ${formatDateTimeFr(s.valide)}` : null,
            avecEcart > 0
              ? `${avecEcart} écart${avecEcart > 1 ? "s" : ""} appliqué${avecEcart > 1 ? "s" : ""} au stock, pour ${formatPrice(s.valeurEcart)}`
              : "Aucun écart : le stock n'a pas bougé",
            "Le stock est déverrouillé",
          ]
            .filter(Boolean)
            .join(" · ")}
        />
      ) : null}

      {s.statut === "cancelled" ? (
        <Banner
          tone="info"
          title="Session annulée"
          message="Le stock s'est déverrouillé et n'a pas bougé. Cette feuille reste consultable ; créez une nouvelle session pour recompter."
        />
      ) : null}

      {s.lignes.length > 0 ? (
        <>
          <Card>
            <View className="flex-row items-baseline justify-between gap-3">
              <Text variant="caption">Avancement du comptage</Text>
              <Text variant="bodySmall" numeric className="font-sans-medium">
                {`${comptees} / ${s.lignes.length}`}
              </Text>
            </View>
            <View className="mt-2">
              <ProgressBar valeur={comptees} max={s.lignes.length || 1} />
            </View>
          </Card>

          {/* Le cadran du back-office, mais sommé sur TOUTE la feuille : le
              sien mêle des totaux de session et des sommes calculées sur les
              vingt lignes de la page affichée, dans la même rangée. */}
          <StatStrip>
            <StatStripItem label="Produits" value={String(s.lignes.length)} icon="Boxes" />
            <StatStripItem label="Comptés" value={String(comptees)} icon="CheckCircle2" />
            <StatStripItem
              label="Écarts"
              value={String(avecEcart)}
              icon="AlertTriangle"
              tone={avecEcart > 0 ? "warn" : "neutral"}
            />
            <StatStripItem
              label="Valeur de l'écart"
              value={formatPrice(s.valeurEcart)}
              icon="TrendingUp"
              tone={s.valeurEcart < 0 ? "alert" : "neutral"}
            />
          </StatStrip>
        </>
      ) : null}

      {s.lignes.length > 0 ? (
        <View className="gap-3">
          <SearchInput
            valeur={recherche}
            onChange={setRecherche}
            placeholder="Rechercher un article..."
          />
          <ChipRow>
            {PUCES.filter((p) => p.n > 0 || p.cle === filtre).map((p) => (
              <Chip
                key={p.cle}
                label={`${p.label} (${p.n})`}
                actif={filtre === p.cle}
                onPress={() => setFiltre(p.cle)}
              />
            ))}
          </ChipRow>
        </View>
      ) : null}

      {s.statut === "draft" ? (
        <Banner
          tone="info"
          title="La feuille n'existe pas encore"
          message="Elle est engendrée au démarrage, avec le stock théorique du moment. C'est cet instantané qui sert de référence à l'écart."
        />
      ) : null}
    </View>
  );

  /**
   * La barre d'actions, sous le pouce.
   *
   * ┌──────────────────────────────────────────────────────────────────────────┐
   * │ LES DÉCISIONS DÉFILAIENT HORS DE L'ÉCRAN.                               │
   * │                                                                          │
   * │ Elles vivaient dans l'en-tête de la liste : sur une feuille de deux      │
   * │ cents lignes, le magasinier qui descend LIRE ce qu'il valide perd le     │
   * │ bouton qui valide. `Screen pied` est un frère du défilement, sous la     │
   * │ zone sûre, dans l'évitement du clavier - c'est déjà ce que font la fiche │
   * │ d'un retour, celle d'une vente et le journal des mouvements.             │
   * └──────────────────────────────────────────────────────────────────────────┘
   *
   * **`enFile` ne MASQUE plus rien.** Il grisait tout le bloc, et la page
   * n'avait alors plus aucune issue sous un bandeau muet. Un bouton fermé qui
   * DIT pourquoi n'est pas un cul-de-sac ; un bouton absent en est un.
   */
  const progressif = possibles.find((a) => a !== "cancel");
  /**
   * ┌──────────────────────────────────────────────────────────────────────────┐
   * │ PENDANT UN CYCLE, L'ÉTAT EST EN TRANSIT : ON FERME.                     │
   * │                                                                          │
   * │ Vu à l'écran. Une fois la transition ENVOYÉE, elle quitte le journal ;   │
   * │ mais la table tirée ne porte le nouveau statut qu'à la fin du tirage.    │
   * │ Entre les deux, la page rendait « Brouillon » avec un « Démarrer » ACTIF │
   * │ sur une session que le serveur venait de démarrer. Deux appuis, deux     │
   * │ démarrages, et le second finit en quarantaine.                           │
   * │                                                                          │
   * │ La fenêtre existait avant ce lot, invisible : les boutons disparaissaient│
   * │ pendant l'attente puis revenaient au même moment. Le fournisseur partagé │
   * │ est ce qui permet enfin de la nommer.                                    │
   * └──────────────────────────────────────────────────────────────────────────┘
   */
  const motifSync = syncEnCours
    ? "Synchronisation en cours : l'état de la session est en train d'arriver."
    : "";
  // `motifFile` PRIME : quand une transition est déjà partie, c'est cela qu'il
  // faut dire, pas qu'il reste des lignes à compter.
  const motifBarre =
    motifFile || motifSync || (progressif === "submit" ? motifSoumission : "");
  const barreActions =
    possibles.length === 0 ? undefined : (
      <View className="gap-2.5">
        {/* CE QUI EXPLIQUE LE BOUTON, juste au-dessus de lui. En cours, c'est
            l'avancement, qui décide si « Soumettre » s'ouvre ; en révision,
            c'est l'écart, parce que le valider ne se défait pas. */}
        {s.statut === "in_progress" && lignes.length > 0 ? (
          <View className="flex-row items-baseline justify-between gap-3">
            <Text variant="bodySmall" className="text-muted-foreground">
              Comptage
            </Text>
            <Mesure value={`${comptees} / ${lignes.length}`} />
          </View>
        ) : null}
        {s.statut === "review" ? (
          <View className="flex-row items-baseline justify-between gap-3">
            <Text variant="bodySmall" className="text-muted-foreground">
              {avecEcart === 1 ? "1 écart à appliquer" : `${avecEcart} écarts à appliquer`}
            </Text>
            <Mesure value={formatPrice(s.valeurEcart)} />
          </View>
        ) : null}

        {motifBarre ? <Text variant="caption">{motifBarre}</Text> : null}

        {/* Le destructif à GAUCHE, le progressif à droite, où tombe le pouce.
            Empilés, les deux boutons prendraient cent douze points, soit un
            cinquième de l'écran retiré à une liste qu'on parcourt debout. */}
        <View className="flex-row gap-2">
          {possibles.includes("cancel") ? (
            <Button
              variant="destructive"
              className="flex-1"
              leftIcon={ACTIONS.cancel.icone}
              disabled={enFile || envoi || syncEnCours}
              onPress={() => setConfirmation("cancel")}
            >
              {ACTIONS.cancel.labelCourt}
            </Button>
          ) : null}
          {progressif ? (
            <Button
              className="flex-1"
              leftIcon={ACTIONS[progressif].icone}
              disabled={
                enFile ||
                envoi ||
                syncEnCours ||
                (progressif === "submit" && motifSoumission !== "")
              }
              onPress={() => setConfirmation(progressif)}
            >
              {ACTIONS[progressif].labelCourt}
            </Button>
          ) : null}
        </View>
      </View>
    );

  return (
    <Screen padded={false} pied={barreActions}>
      <AppBar
        title={s.nom}
        subtitle={[s.reference, s.entrepot].filter(Boolean).join(" · ")}
        right={st ? <Badge tone={st.ton}>{st.label}</Badge> : undefined}
      />
      <DataList
        donnees={lignesVisibles}
        cle={(l) => l.id}
        enTete={enTete}
        // La barre fixe remplace le `Fab` : les quatre-vingt-seize points par
        // défaut deviendraient un vide au-dessus d'elle.
        basDeListe={16}
        // L'état vide DISTINGUE le filtre du vide réel, et rend le chemin du
        // retour : « aucune ligne » sur une feuille pleine mais filtrée se lit
        // comme une perte de données.
        vide={
          lignes.length > 0
            ? {
                icon: "Filter",
                titre: "Aucun résultat",
                message: terme
                  ? "Aucun article ne correspond à votre recherche."
                  : "Aucune ligne dans cet état.",
                action: {
                  label: "Voir toute la feuille",
                  onPress: () => {
                    setRecherche("");
                    setFiltre("tous");
                  },
                },
              }
            : {
                icon: "ClipboardList",
                titre: s.statut === "draft" ? "Comptage pas encore démarré" : "Aucune ligne",
                message:
                  s.statut === "draft"
                    ? "Démarrez la session pour engendrer la feuille."
                    : "Cette session ne vise aucun produit en stock.",
              }
        }
        rendu={(l) => (
          <DataRow
            principal={l.produit}
            secondaire={`Théorique ${l.attenduAffiche}`}
            badge={
              // « À envoyer » sur un comptage BLOQUÉ ferait chercher du
              // réseau : il attend un droit, et il ne partira pas seul.
              l.envoi === "bloque" ? (
                <Badge tone="warning">Attend un droit</Badge>
              ) : l.enAttente ? (
                <Badge tone="neutral">À envoyer</Badge>
              ) : l.estCompte ? (
                <Badge tone="success">Compté</Badge>
              ) : undefined
            }
            valeur={
              <Text
                variant="bodySmall"
                numeric
                className={`font-sans-medium ${
                  !l.estCompte
                    ? "text-muted-foreground"
                    : l.ecart < 0
                      ? "text-destructive"
                      : l.ecart > 0
                        ? "text-success"
                        : ""
                }`}
              >
                {l.estCompte ? l.compteAffiche : "À compter"}
              </Text>
            }
            sousValeur={l.estCompte && l.ecart !== 0 ? l.ecartAffiche : null}
            onPress={peutCompter ? () => ouvrir(l) : undefined}
          />
        )}
      />

      <Sheet
        ouvert={ligneOuverte !== null}
        onFermer={() => setLigneOuverte(null)}
        titre={ligneOuverte?.produit}
      >
        {ligneOuverte ? (
          <>
            <Text variant="caption">
              {`Théorique : ${ligneOuverte.attenduAffiche}`}
            </Text>
            {ligneOuverte.facteur ? (
              <FormField
                label={`Contenants (${pluralizeUnit(ligneOuverte.uniteContenant ?? "contenant", 2)})`}
                hint={`Chacun vaut ${ligneOuverte.facteur} ${pluralizeUnit(ligneOuverte.uniteDetail ?? "unité", ligneOuverte.facteur)}.`}
                error={erreursSaisie.contenants}
              >
                <Input
                  value={contenants}
                  onChangeText={(v) => {
                    setContenants(v);
                    if (erreursSaisie.contenants) {
                      setErreursSaisie({ ...erreursSaisie, contenants: undefined });
                    }
                  }}
                  invalid={Boolean(erreursSaisie.contenants)}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  autoFocus
                />
              </FormField>
            ) : null}
            <FormField
              label={
                ligneOuverte.facteur
                  ? `Unités isolées (${pluralizeUnit(ligneOuverte.uniteDetail ?? "unité", 2)})`
                  : `Quantité comptée (${pluralizeUnit(ligneOuverte.uniteDetail ?? "unité", 2)})`
              }
              required
              error={erreursSaisie.vrac}
            >
              <Input
                value={vrac}
                onChangeText={(v) => {
                  setVrac(v);
                  if (erreursSaisie.vrac) {
                    setErreursSaisie({ ...erreursSaisie, vrac: undefined });
                  }
                }}
                invalid={Boolean(erreursSaisie.vrac)}
                keyboardType="decimal-pad"
                placeholder="0"
                autoFocus={!ligneOuverte.facteur}
              />
            </FormField>
            <Button fullWidth size="lg" disabled={envoi} onPress={() => void enregistrer()}>
              {envoi ? "Enregistrement…" : "Enregistrer le comptage"}
            </Button>
          </>
        ) : null}
      </Sheet>

      <AlertDialog
        ouvert={confirmation !== null}
        titre={confirmation ? ACTIONS[confirmation].label + " ?" : ""}
        message={confirmation ? ACTIONS[confirmation].question : undefined}
        confirmer={confirmation ? ACTIONS[confirmation].label : ""}
        annuler="Revenir"
        destructif={confirmation ? Boolean(ACTIONS[confirmation].destructif) : false}
        enCours={envoi}
        onConfirmer={() => confirmation && void executer(confirmation)}
        onAnnuler={() => setConfirmation(null)}
      />
    </Screen>
  );
}
