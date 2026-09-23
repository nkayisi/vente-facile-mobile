/**
 * La synchronisation : bidirectionnelle, automatique, et lançable à la main.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN FOURNISSEUR PARTAGÉ, PAS UN HOOK À ÉTAT LOCAL.                       │
 * │                                                                          │
 * │ Le corps vivait en closure dans l'écran Synchronisation, seul point de   │
 * │ déclenchement manuel du terminal : tout écran qui annonçait « attend son │
 * │ envoi » devait y renvoyer, et le marchand perdait son filtre et sa       │
 * │ position pour un aller-retour.                                           │
 * │                                                                          │
 * │ L'extraire en hook à état LOCAL aurait été faux, et pour une raison      │
 * │ mesurable : deux cycles concurrents écrivent deux fois les mêmes pages   │
 * │ dans les tables tirées et réveillent deux fois `useLecture` partout. Le  │
 * │ garde-fou « un seul cycle à la fois » ne vaut que s'il y a UN SEUL       │
 * │ verrou - un bandeau avec son propre état ne saurait rien du cycle lancé  │
 * │ depuis l'écran Synchronisation, ni l'inverse.                            │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CINQ DÉCLENCHEURS AUTOMATIQUES, ET UNE SEULE TÊTE QUI DÉCIDE.           │
 * │                                                                          │
 * │ Ce fichier ne contient AUCUNE règle de cadence : il écoute, il verrouille│
 * │ et il exécute. Le « quand » et le « jusqu'où » vivent dans              │
 * │ `planificateur.ts`, module pur et testé, parce qu'une cadence fausse ne  │
 * │ lève rien - elle fait partir des cycles pour rien, ou n'en fait plus     │
 * │ partir du tout, et cela se découvre sur le terminal d'un marchand.       │
 * │                                                                          │
 * │   entree        le groupe (app) vient d'être monté                       │
 * │   reseau        le réseau vient de revenir                               │
 * │   premier-plan  l'application revient devant                             │
 * │   journal       une écriture locale vient d'avoir lieu                   │
 * │   minuteur      une temporisation arrive à échéance                      │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Il ne fait toujours **aucun travail au montage** : la première sollicitation
 * est différée, c'est la condition du démarrage à froid sans réseau.
 */
import { addDatabaseChangeListener } from "expo-sqlite";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AppState } from "react-native";

import { ApiError, type FailureKind } from "@/api/errors";
import { ecrireReglage, lireReglage } from "@/data/reglages";
import { surRetourReseau, useEnLigne } from "@/data/reseau";
import { envoyerPhotosEnAttente } from "@/features/inventaire/photos";
import { jugerAcces } from "@/features/abonnement/porte";
import { useSession } from "@/session/provider";
import {
  estPris,
  etatJournal,
  prendre,
  pullAll,
  pushAll,
  rendre,
  unblockAll,
  type PullProgress,
} from "@/sync";
import { useToast } from "@/ui";

import { BarreProgressionSync } from "./barre-progression";
import { doitNotifier, doitSignaler, type OrigineSync } from "./origines";
import { decider, type Declencheur, type Portee } from "./planificateur";

export type { OrigineSync } from "./origines";
export type { Portee } from "./planificateur";

/**
 * Le dernier tirage complet, retenu d'une session à l'autre.
 *
 * Il vit dans `local_settings` et non dans `sync_state` : ce dernier est par
 * TABLE, et y écrire réveillerait tous les `useLecture` abonnés à `sync_state`
 * à chaque cycle, donc l'écran Synchronisation en entier.
 */
const CLE_DERNIERE_COMPLETE = "sync.derniere_complete_at";

export interface EtatSynchronisation {
  /** Un cycle tourne. Il n'y en a qu'un dans toute l'application. */
  enCours: boolean;
  /** D'où il a été lancé. `null` au repos. */
  origine: OrigineSync | null;
  /** Jusqu'où il va. `null` au repos. */
  portee: Portee | null;
  /** Progression CHIFFRÉE du tirage. `null` pendant l'envoi et au repos. */
  progression: PullProgress | null;
  /** Dernier échec digne d'être montré. Effacé par le premier cycle qui réussit. */
  erreur: string | null;
  /** Fin du dernier tirage COMPLET, retenue d'une session à l'autre. */
  derniereSync: Date | null;
  /**
   * Envoi puis tirage. Ne fait RIEN si un cycle tourne déjà : le second
   * appelant n'obtient pas un second cycle, il regarde le premier.
   */
  lancer: (origine: OrigineSync) => Promise<void>;
  /** Interrompt, mais seulement si le cycle courant vient de cette origine. */
  annuler: (origine: OrigineSync) => void;
}

const Contexte = createContext<EtatSynchronisation | null>(null);

export function SynchronisationProvider({ children }: { children: ReactNode }) {
  const [progression, setProgression] = useState<PullProgress | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [origine, setOrigine] = useState<OrigineSync | null>(null);
  const [portee, setPortee] = useState<Portee | null>(null);
  const [derniereSync, setDerniereSync] = useState<Date | null>(null);

  const abort = useRef<AbortController | null>(null);
  /**
   * ⚠ LE VERROU N'EST PLUS ICI : il vit dans `@/sync/verrou`, en variable de
   * module.
   *
   * Ce n'était pas une référence par hasard - `if (enCours) return` lit un état
   * de RENDU, et deux appuis dans le même tour de boucle le verraient tous deux
   * à faux et partiraient ensemble. Cette raison ne change pas ; ce qui change,
   * c'est la PORTÉE. La déconnexion propre pousse elle aussi, et depuis la
   * RACINE : un verrou enfermé dans ce composant, monté sous `(app)`, ne la
   * protégerait de rien. Les deux mondes partagent désormais le même.
   */
  /** Miroir de l'origine, lisible par `annuler` sans le remémoïser. */
  const origineRef = useRef<OrigineSync | null>(null);

  const toast = useToast();
  const { snapshot, status, refresh: rafraichirSession } = useSession();
  const enLigne = useEnLigne();

  /**
   * L'instantané se lit à l'INSTANT du lancement, jamais capturé au montage.
   *
   * Le fournisseur vit toute la session et `lancer` est mémoïsé : sans ce
   * miroir, il garderait le `snapshot` du rendu où il a été fabriqué et ne
   * verrait pas un `rafraichirSession()` antérieur.
   */
  const snapshotRef = useRef(snapshot);
  const statusRef = useRef(status);
  const enLigneRef = useRef(enLigne);
  // Écrits dans un effet et non au rendu : `react-hooks/refs` interdit de
  // toucher un ref pendant le rendu, et l'effet a de toute façon couru bien
  // avant qu'un déclencheur ne se présente.
  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);
  useEffect(() => {
    enLigneRef.current = enLigne;
  }, [enLigne]);

  /**
   * Les deux fonctions du cycle, relayées par des refs.
   *
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ ELLES SONT DÉCLARÉES ICI, AVANT TOUT CE QUI LES LIT.                │
   * │                                                                      │
   * │ Le relais existe pour que les écouteurs soient posés UNE fois, au    │
   * │ montage : sans lui, chaque rendu les déposerait et les reposerait,   │
   * │ et l'abonnement à la base changerait d'identité à chaque battement.  │
   * │                                                                      │
   * │ Ils partent à `null` et non à la valeur du premier rendu : modifier  │
   * │ ce qu'on a passé à un hook est ce que `react-hooks/immutability`     │
   * │ interdit, et la règle a raison - cette valeur initiale ne serait     │
   * │ jamais relue.                                                        │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  const executerRef = useRef<((p: Portee, o: OrigineSync) => Promise<void>) | null>(null);
  const solliciteRef = useRef<((d: Declencheur) => Promise<void>) | null>(null);

  const vivant = useRef(true);
  const derniereComplete = useRef<Date | null>(null);
  /** UN seul réveil programmé à la fois. Jamais `setInterval` : un intervalle qui
   *  dérive pendant qu'un cycle tourne empile les réveils. */
  const reveil = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Le départ différé : débounce du journal, gigue du retour de réseau. */
  const differe = useRef<{
    timer: ReturnType<typeof setTimeout>;
    echeance: number;
    portee: Portee;
  } | null>(null);

  useEffect(() => {
    void lireReglage<string | null>(CLE_DERNIERE_COMPLETE, null).then((iso) => {
      if (!iso) return;
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return;
      derniereComplete.current = d;
      setDerniereSync(d);
    });
  }, []);

  const executer = useCallback(
    async (jusquOu: Portee, depuis: OrigineSync) => {
      // ┌──────────────────────────────────────────────────────────────────┐
      // │ LE VERROU SE POSE AVANT LE PREMIER `await`, ET C'EST OBLIGÉ.    │
      // │                                                                  │
      // │ Le contrôle du journal ci-dessous est asynchrone. Posé après     │
      // │ lui, le verrou laisserait passer les trois déclencheurs d'une    │
      // │ même rafale : ils franchiraient tous le test pendant que le      │
      // │ premier attend sa requête, puis partiraient ensemble.            │
      // │                                                                  │
      // │ `prendre()` teste ET pose d'un seul geste : personne ne pourra   │
      // │ glisser un `await` entre les deux, ce qu'un `if (estPris())`     │
      // │ suivi d'une pose laisserait faire sans rien signaler.            │
      // └──────────────────────────────────────────────────────────────────┘
      if (!prendre()) return;

      // Un cycle n'a de sens que sur une session prête : pendant un
      // verrouillage ou une expiration, les jetons sont là mais l'utilisateur
      // ne l'est pas.
      if (statusRef.current !== "ready") {
        rendre();
        return;
      }

      // ┌──────────────────────────────────────────────────────────────────┐
      // │ UN ENVOI NE PART JAMAIS À VIDE, ET C'EST LA PIÈCE MAÎTRESSE.    │
      // │                                                                  │
      // │ Une vingtaine d'écrans ferment un bouton ou le passent en        │
      // │ attente quand `enCours` est vrai. Un cycle à vide les ferait     │
      // │ clignoter au hasard, sur l'écran d'un magasinier en train de     │
      // │ valider un inventaire. Le contrôle est ici, AVANT de toucher au  │
      // │ moindre état partagé : le planificateur a déjà tranché, mais le  │
      // │ journal a pu se vider entre sa décision et ce départ différé.    │
      // └──────────────────────────────────────────────────────────────────┘
      if (jusquOu === "envoi") {
        const { nbPret } = await lireJournalSansLever();
        if (nbPret === 0) {
          rendre();
          return;
        }
      }

      origineRef.current = depuis;
      setOrigine(depuis);
      setPortee(jusquOu);
      abort.current = new AbortController();

      let echecs: { table: string; message: string }[] = [];
      let interrompu = false;

      try {
        // On ENVOIE d'abord. Ce que le terminal porte est la seule chose que
        // le serveur ne connaît pas ; le tirage qui suit en rapporte le
        // résultat autoritatif.
        //
        // Un instantané absent ne bloque RIEN : le serveur traite le lot sans
        // `device_id` (il ne sert qu'à la numérotation des ventes). Refuser de
        // pousser enfermerait dehors un terminal démarré à froid sans réseau.
        await pushAll(snapshotRef.current?.device?.id);

        // ┌──────────────────────────────────────────────────────────────────┐
        // │ LES PHOTOS PARTENT APRÈS LA POUSSÉE, ET L'ORDRE EST OBLIGÉ.     │
        // │                                                                  │
        // │ Une photo est un `PATCH` multipart sur un article qui doit       │
        // │ EXISTER : `/sync/operations/` ne transporte que du JSON, elle ne │
        // │ peut donc pas voyager avec sa création. Envoyée avant la         │
        // │ poussée, elle viserait un article que le serveur ne connaît pas. │
        // │                                                                  │
        // │ Un échec ne fait PAS échouer la synchronisation : la photo est   │
        // │ un confort, les ventes sont l'essentiel, et elle repartira au    │
        // │ cycle suivant.                                                   │
        // └──────────────────────────────────────────────────────────────────┘
        try {
          await envoyerPhotosEnAttente();
        } catch {
          // Rien à dire ici : la file des photos garde son compteur d'essais
          // et son dernier refus, que la fiche de l'article affiche.
        }

        if (jusquOu === "complet") {
          const bilan = await pullAll({
            signal: abort.current.signal,
            onProgress: setProgression,
          });
          echecs = bilan.echecs;
          interrompu = bilan.interrupted;

          // ┌──────────────────────────────────────────────────────────────┐
          // │ LE DROIT AUSSI DOIT REDESCENDRE.                            │
          // │                                                              │
          // │ On rafraîchit l'instantané, PUIS on rend leur chance aux     │
          // │ opérations bloquées. Dans cet ordre, sinon elles repartiraient│
          // │ avec les droits d'hier et se feraient rebloquer. Un échec    │
          // │ n'est pas une erreur de synchronisation : les données sont   │
          // │ passées.                                                     │
          // └──────────────────────────────────────────────────────────────┘
          try {
            const frais = await rafraichirSession();
            // ⚠ ON NE DÉBLOQUE QUE SI LA PORTE EST OUVERTE.
            //
            // Depuis qu'un 402 range le lot en `blocked`, un `unblockAll()`
            // inconditionnel ferait tourner en rond : bloquer -> débloquer ->
            // renvoyer -> 402 -> bloquer, à CHAQUE cycle, pour un abonnement
            // qui ne sera réglé que dans trois jours. On juge sur le verdict
            // de CE réveil-ci, d'où le retour de `rafraichirSession`.
            if (jugerAcces(frais?.subscription, frais?.fetched_at, new Date()).ouvert) {
              await unblockAll();
            }
          } catch {
            // Le terminal garde l'instantané qu'il avait : ouvrir
            // l'application sans réseau ne doit jamais enfermer dehors.
          }

          // ⚠ Un tirage INTERROMPU n'est pas un tirage complet. L'inscrire
          // comme tel ferait sauter le prochain tirage de retour au premier
          // plan, qui se croirait à jour.
          if (!interrompu) {
            const fin = new Date();
            derniereComplete.current = fin;
            setDerniereSync(fin);
            void ecrireReglage(CLE_DERNIERE_COMPLETE, fin.toISOString());
          }
        }

        // ┌──────────────────────────────────────────────────────────────────┐
        // │ UNE SYNCHRONISATION QUI A PERDU DES TABLES N'EST PAS « TERMINÉE ».│
        // │                                                                  │
        // │ Depuis que le tirage isole les échecs, il rend la main même      │
        // │ quand une table a répondu 500 : sans ce contrôle, le marchand    │
        // │ lirait « Synchronisation terminée » pendant qu'une table de son  │
        // │ stock ne descend plus. Le détail par table est sur l'écran       │
        // │ Synchronisation, qui rend le `lastError` de chaque ligne.        │
        // └──────────────────────────────────────────────────────────────────┘
        if (echecs.length > 0) {
          const premier = echecs[0]!;
          const message =
            echecs.length === 1
              ? `La table « ${premier.table} » n'a pas pu être tirée : ${premier.message}`
              : `${echecs.length} tables n'ont pas pu être tirées. Voir le détail dans Synchronisation.`;
          setErreur(message);
          if (doitNotifier(depuis)) toast.erreur(message);
        } else if (interrompu) {
          // Interruption volontaire : rien à annoncer, rien à corriger. Ce qui
          // est descendu est conservé, la reprise partira de là.
          setErreur(null);
        } else {
          // Le succès efface le dernier échec : il n'a plus cours.
          setErreur(null);
          if (doitNotifier(depuis)) toast.succes("Synchronisation terminée.");
        }
      } catch (e) {
        // ⚠ Un abandon demandé se propage en `ApiError` de `kind: "network"` :
        // `client.ts` ne distingue pas un `AbortController` d'un câble coupé.
        // Sans ce contrôle, quitter l'écran Synchronisation pendant un cycle
        // afficherait « Serveur injoignable » à qui vient d'appuyer sur
        // « Interrompre ».
        if (abort.current?.signal.aborted) return;

        const kind: FailureKind | null = e instanceof ApiError ? e.kind : null;
        const message =
          kind === "network"
            ? "Serveur injoignable. Les données déjà reçues sont conservées, la reprise partira de là."
            : e instanceof Error
              ? e.message
              : "La synchronisation a échoué.";

        // Un échec RÉSEAU d'un cycle automatique ne s'inscrit nulle part : le
        // témoin de la barre dit déjà « hors ligne », et un bandeau rouge de
        // plus apprendrait à ne plus voir les bandeaux rouges.
        if (doitSignaler(depuis, kind)) setErreur(message);
        if (doitNotifier(depuis)) toast.erreur(message);
      } finally {
        rendre();
        origineRef.current = null;
        setOrigine(null);
        setPortee(null);
        setProgression(null);
        // Le journal a bougé : on redemande au planificateur quand se
        // réveiller. Sans cela, ce qui reste en temporisation ne repartirait
        // qu'au prochain geste humain.
        void solliciteRef.current?.("minuteur");
      }
    },
    [rafraichirSession, toast]
  );

  useEffect(() => {
    executerRef.current = executer;
  }, [executer]);

  const programmerReveil = useCallback((dans: number | null) => {
    if (reveil.current) {
      clearTimeout(reveil.current);
      reveil.current = null;
    }
    if (dans === null || !vivant.current) return;
    reveil.current = setTimeout(() => {
      reveil.current = null;
      void solliciteRef.current?.("minuteur");
    }, dans);
  }, []);

  /**
   * Un départ différé, et un seul.
   *
   * Deux déclencheurs peuvent se présenter dans la même fenêtre : une vente
   * encaissée pendant que le réseau revient. **Le plus TÔT et le plus LARGE
   * l'emportent** - un `complet` fait tout ce que fait un `envoi`, donc
   * retenir la portée la plus large ne perd jamais rien, et retenir l'échéance
   * la plus proche ne fait jamais attendre plus que promis.
   */
  const differer = useCallback((delaiMs: number, jusquOu: Portee) => {
    const echeance = Date.now() + delaiMs;
    const encours = differe.current;

    const porteeFinale: Portee =
      encours && (encours.portee === "complet" || jusquOu === "complet") ? "complet" : jusquOu;
    const echeanceFinale = encours ? Math.min(encours.echeance, echeance) : echeance;

    if (encours) clearTimeout(encours.timer);

    const timer = setTimeout(
      () => {
        differe.current = null;
        void executerRef.current?.(porteeFinale, "auto");
      },
      Math.max(0, echeanceFinale - Date.now())
    );
    differe.current = { timer, echeance: echeanceFinale, portee: porteeFinale };
  }, []);

  const sollicite = useCallback(
    async (declencheur: Declencheur) => {
      if (!vivant.current) return;

      const journal = await lireJournalSansLever();
      const d = decider({
        declencheur,
        enLigne: enLigneRef.current,
        cycleEnCours: estPris(),
        nbPret: journal.nbPret,
        prochaineTentativeAt: journal.prochaineTentativeAt,
        derniereComplete: derniereComplete.current,
        maintenant: new Date(),
        alea: Math.random(),
      });

      programmerReveil(d.reveilDans);
      if (!d.lancer || !d.portee) return;
      differer(d.delaiMs, d.portee);
    },
    [differer, programmerReveil]
  );

  useEffect(() => {
    solliciteRef.current = sollicite;
  }, [sollicite]);

  /** L'entrée dans l'application : connexion, inscription, déverrouillage. */
  useEffect(() => {
    void solliciteRef.current?.("entree");
  }, []);

  /**
   * Le retour du réseau. C'est le déclencheur qui répond au cas d'usage le
   * plus concret : le marchand encaisse en zone morte, ressort, et ses ventes
   * partent sans qu'il ait à y penser.
   */
  useEffect(
    () =>
      surRetourReseau(() => {
        // ┌──────────────────────────────────────────────────────────────┐
        // │ LE REF S'ÉCRIT ICI, ET NON EN ATTENDANT LE RENDU.            │
        // │                                                              │
        // │ `useEnLigne` et cet abonnement sont DEUX écouteurs NetInfo   │
        // │ distincts. Rien ne garantit que le re-rendu du premier ait   │
        // │ eu lieu quand le second appelle : le planificateur lirait    │
        // │ alors « hors ligne » à l'instant même où le réseau revient,  │
        // │ et le cycle ne partirait pas. Le déclencheur DIT que la      │
        // │ liaison est là ; c'est lui qui fait foi.                     │
        // │                                                              │
        // │ Trouvé par le test de rendu, pas à la relecture.             │
        // └──────────────────────────────────────────────────────────────┘
        enLigneRef.current = true;
        void solliciteRef.current?.("reseau");
      }),
    []
  );

  /** Le retour au premier plan. */
  useEffect(() => {
    const sub = AppState.addEventListener("change", (etat) => {
      if (etat === "active") void solliciteRef.current?.("premier-plan");
    });
    return () => sub.remove();
  }, []);

  /**
   * L'écriture locale.
   *
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ `pushOnce` ÉCRIT DANS CETTE TABLE, DONC IL RÉVEILLE CET ÉCOUTEUR.    │
   * │                                                                      │
   * │ `markInflight`, `markDone` et `scheduleRetry` touchent tous          │
   * │ `outbox_operations`. Trois verrous se cumulent pour qu'aucune boucle │
   * │ ne se forme : on sort tout de suite si un cycle tourne, le débounce  │
   * │ du planificateur réunit la rafale, et sa décision est NON dès que le │
   * │ journal n'a plus rien de prêt - ce qui est le cas après un cycle     │
   * │ réussi. Le coût résiduel est un décompte SQL par rafale.             │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  useEffect(() => {
    const abo = addDatabaseChangeListener((ev) => {
      if (ev.tableName !== "outbox_operations") return;
      if (estPris()) return;
      void solliciteRef.current?.("journal");
    });
    return () => abo.remove();
  }, []);

  const lancer = useCallback(
    async (depuis: OrigineSync) => {
      await executerRef.current?.("complet", depuis);
    },
    []
  );

  /**
   * L'abandon est EXPLICITE et ATTRIBUÉ.
   *
   * ┌──────────────────────────────────────────────────────────────────────────┐
   * │ UN BANDEAU NE DOIT PAS POUVOIR ANNULER SA PROPRE SYNCHRONISATION.       │
   * │                                                                          │
   * │ `useLecture` remonte ses données dès que `outbox_operations` change,     │
   * │ donc un bandeau se démonte pendant le cycle qu'il vient de lancer. Un    │
   * │ nettoyage `() => abort()` écrit dans le bandeau couperait le tirage au   │
   * │ PREMIER lot inséré, silencieusement : le point de reprise resterait      │
   * │ juste, rien ne serait sauté, et personne ne saurait pourquoi la base est │
   * │ incomplète.                                                              │
   * └──────────────────────────────────────────────────────────────────────────┘
   */
  const annuler = useCallback((depuis: OrigineSync) => {
    if (origineRef.current !== depuis) return;
    abort.current?.abort();
  }, []);

  /**
   * ⚠ Le fournisseur est démonté À CHAQUE VERROUILLAGE, pas seulement à la
   * déconnexion : `SessionGate` route `locked` vers `/(locked)/unlock`, ce qui
   * démonte le groupe `(app)`. Ce n'est pas un défaut. Les opérations restées
   * « en vol » sont remises en attente par `recoverInflight()` au cycle
   * suivant, le serveur rend `duplicate` sur ce qu'il a déjà appliqué, et le
   * déverrouillage remonte le groupe, donc rejoue le déclencheur d'entrée. Le
   * cycle est auto-réparant.
   */
  useEffect(() => {
    return () => {
      vivant.current = false;
      abort.current?.abort();
      if (reveil.current) clearTimeout(reveil.current);
      if (differe.current) clearTimeout(differe.current.timer);
      reveil.current = null;
      differe.current = null;
    };
  }, []);

  const valeur = useMemo<EtatSynchronisation>(
    () => ({
      enCours: origine !== null,
      origine,
      portee,
      progression,
      erreur,
      derniereSync,
      lancer,
      annuler,
    }),
    [origine, portee, progression, erreur, derniereSync, lancer, annuler]
  );

  return (
    <Contexte.Provider value={valeur}>
      {children}
      {/* Le filet est un FRÈRE du contenu et non une surcouche d'écran : il doit
          se voir sur les onglets comme sur la pile, donc il vit au-dessus de
          toute la navigation. */}
      <BarreProgressionSync enCours={origine !== null} progression={progression} />
    </Contexte.Provider>
  );
}

/**
 * Le journal ne doit JAMAIS faire échouer une sollicitation.
 *
 * Le tout premier déclencheur part peu après le montage, et la base peut
 * encore être en cours de migration. Une exception ici ferait rater le cycle
 * d'entrée, c'est-à-dire précisément celui qui rapporte la journée.
 */
async function lireJournalSansLever(): Promise<{
  nbPret: number;
  prochaineTentativeAt: Date | null;
}> {
  try {
    return await etatJournal();
  } catch {
    return { nbPret: 0, prochaineTentativeAt: null };
  }
}

export function useSynchronisation(): EtatSynchronisation {
  const v = useContext(Contexte);
  if (!v) throw new Error("useSynchronisation hors de SynchronisationProvider");
  return v;
}
