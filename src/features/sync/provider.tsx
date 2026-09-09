/**
 * La synchronisation, lançable depuis n'importe quel écran.
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
 * │ dans trente et une tables tirées et réveillent deux fois `useLecture`    │
 * │ partout. Le garde-fou « un seul cycle à la fois » ne vaut que s'il y a   │
 * │ UN SEUL verrou - un bandeau avec son propre état ne saurait rien du      │
 * │ cycle lancé depuis l'écran Synchronisation, ni l'inverse.                │
 * │                                                                          │
 * │ Le précédent est `ToastProvider`, monté au même endroit et pour la même  │
 * │ raison : il sert les onglets ET les écrans plein écran du comptoir.      │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Comme `PanierProvider`, il ne fait **aucun travail au montage** : c'est la
 * condition du démarrage à froid sans réseau.
 */
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

import { ApiError } from "@/api/errors";
import { useSession } from "@/session/provider";
import { pullAll, pushAll, unblockAll, type PullProgress } from "@/sync";
import { useToast } from "@/ui";

/**
 * Qui a lancé le cycle.
 *
 * Décide de deux choses, et de deux seulement : qui peut l'interrompre (§
 * `annuler`), et si le résultat s'annonce par un toast. L'écran
 * Synchronisation a déjà son propre retour visuel - sa progression chiffrée et
 * ses compteurs par table - et un toast par-dessus serait du bruit.
 */
export type OrigineSync = "ecran" | "bandeau";

export interface EtatSynchronisation {
  /** Un cycle tourne. Il n'y en a qu'un dans toute l'application. */
  enCours: boolean;
  /** D'où il a été lancé. `null` au repos. */
  origine: OrigineSync | null;
  /** Progression CHIFFRÉE du tirage. `null` pendant l'envoi et au repos. */
  progression: PullProgress | null;
  /** Message d'échec du dernier cycle. Effacé au lancement suivant. */
  erreur: string | null;
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

  const abort = useRef<AbortController | null>(null);
  /**
   * Le verrou est une RÉFÉRENCE, pas l'état.
   *
   * `if (enCours) return` lit un état de RENDU : deux appuis dans le même tour
   * de boucle - le bandeau du haut et celui du bas, ou un double-tap - le
   * verraient tous deux à `false` et partiraient ensemble. C'est exactement le
   * défaut que ce fournisseur existe pour fermer.
   */
  const tourne = useRef(false);
  /** Miroir de l'origine, lisible par `annuler` sans le remémoïser. */
  const origineRef = useRef<OrigineSync | null>(null);

  const toast = useToast();
  const { snapshot, refresh: rafraichirSession } = useSession();

  /**
   * L'instantané se lit à l'INSTANT du lancement, jamais capturé au montage.
   *
   * Le fournisseur vit toute la session et `lancer` est mémoïsé : sans ce
   * miroir, il garderait le `snapshot` du rendu où il a été fabriqué et ne
   * verrait pas un `rafraichirSession()` antérieur. Le défaut n'existait pas
   * dans l'écran, où `lancer` était recréé à chaque rendu ; il naîtrait ici.
   */
  const snapshotRef = useRef(snapshot);
  // Écrit dans un effet et non au rendu : `react-hooks/refs` interdit de
  // toucher un ref pendant le rendu, et l'effet a de toute façon couru bien
  // avant qu'un appui ne déclenche `lancer`.
  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  const lancer = useCallback(
    async (depuis: OrigineSync) => {
      if (tourne.current) return;
      tourne.current = true;
      origineRef.current = depuis;
      setOrigine(depuis);
      setErreur(null);
      abort.current = new AbortController();

      try {
        // On ENVOIE d'abord. Ce que le terminal porte est la seule chose que
        // le serveur ne connaît pas ; le tirage qui suit en rapporte le
        // résultat autoritatif.
        //
        // Un instantané absent ne bloque RIEN : le serveur traite le lot sans
        // `device_id` (il ne sert qu'à la numérotation des ventes). Refuser de
        // pousser enfermerait dehors un terminal démarré à froid sans réseau,
        // ce que le lot 1 interdit.
        await pushAll(snapshotRef.current?.device?.id);
        await pullAll({
          signal: abort.current.signal,
          onProgress: setProgression,
        });

        // ┌──────────────────────────────────────────────────────────────────┐
        // │ LE DROIT AUSSI DOIT REDESCENDRE, ET IL NE LE FAISAIT JAMAIS.     │
        // │                                                                  │
        // │ On rafraîchit l'instantané, PUIS on rend leur chance aux         │
        // │ opérations bloquées. Dans cet ordre, sinon elles repartiraient   │
        // │ avec les droits d'hier et se feraient rebloquer. Un échec n'est  │
        // │ pas une erreur de synchronisation : les données sont passées.    │
        // └──────────────────────────────────────────────────────────────────┘
        try {
          await rafraichirSession();
          await unblockAll();
        } catch {
          // Le terminal garde l'instantané qu'il avait : c'est la règle du
          // lot 1, ouvrir l'application sans réseau ne doit jamais enfermer
          // l'utilisateur dehors.
        }

        if (depuis === "bandeau") toast.succes("Synchronisation terminée.");
      } catch (e) {
        const message =
          e instanceof ApiError && e.kind === "network"
            ? "Serveur injoignable. Les données déjà reçues sont conservées, la reprise partira de là."
            : e instanceof Error
              ? e.message
              : "La synchronisation a échoué.";
        setErreur(message);
        // L'écran Synchronisation rend déjà ce message dans son bandeau
        // « Interrompue » : le doubler d'un toast serait du bruit.
        if (depuis === "bandeau") toast.erreur(message);
      } finally {
        tourne.current = false;
        origineRef.current = null;
        setOrigine(null);
        setProgression(null);
      }
    },
    [rafraichirSession, toast]
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
   * │                                                                          │
   * │ D'où l'attribution : l'écran Synchronisation interrompt ce QU'IL a       │
   * │ lancé, et rien d'autre. Quitter cet écran pendant qu'un bandeau          │
   * │ synchronise ne l'interrompt donc plus.                                   │
   * └──────────────────────────────────────────────────────────────────────────┘
   */
  const annuler = useCallback((depuis: OrigineSync) => {
    if (origineRef.current !== depuis) return;
    abort.current?.abort();
  }, []);

  // Le fournisseur n'est démonté qu'avec le groupe `(app)`, c'est-à-dire à la
  // déconnexion : là, interrompre est juste.
  useEffect(() => () => abort.current?.abort(), []);

  const valeur = useMemo<EtatSynchronisation>(
    () => ({ enCours: origine !== null, origine, progression, erreur, lancer, annuler }),
    [origine, progression, erreur, lancer, annuler]
  );

  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>;
}

export function useSynchronisation(): EtatSynchronisation {
  const v = useContext(Contexte);
  if (!v) throw new Error("useSynchronisation hors de SynchronisationProvider");
  return v;
}
