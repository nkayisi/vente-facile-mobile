/**
 * État de session, partagé par toute l'application.
 *
 * La règle qui gouverne ce fichier : **le démarrage à froid ne fait AUCUN appel
 * réseau.** Il lit le trousseau, résout un état, et rend la main. Le réseau
 * n'est consulté qu'ensuite, en tâche de fond, et son échec ne change que le
 * bandeau hors ligne.
 *
 * L'ancienne application faisait l'inverse : elle appelait `/users/me/` au
 * montage et traitait l'échec comme un jeton invalide, donc ouvrir
 * l'application sans réseau effaçait le trousseau et enfermait l'utilisateur
 * dehors, avec ses ventes du jour non synchronisées.
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
import { AppState, type AppStateStatus } from "react-native";

import { setOrganizationId, setSessionLostHandler } from "@/api/client";
import { accueilDejaVu, marquerAccueilVu as ecrireAccueilVu } from "@/data/reglages";
import { baseHabitee, purgeInachevee, purgerBaseLocale } from "@/db/purge";
import { nbEnFile } from "./deconnexion-regles";
import { lireEnSouffrance } from "./en-souffrance";
import { ecrireEstampille, lireEstampille } from "./estampille";
import { hasPin } from "./lock";
import {
  comparerProprietaire,
  doitRattraper,
  estampillerDepuis,
  suitePourBase,
  type Estampille,
} from "./proprietaire";
import {
  readSnapshot,
  readTokens,
  writeSnapshot,
} from "./storage";
import {
  enrollDevice as enrollDeviceOp,
  loginWithPassword,
  registerAndEnroll,
  type SaisieCompte,
  type SaisieEtablissement,
  logout as logoutOp,
  refreshSnapshot as refreshSnapshotOp,
  type OrganizationChoice,
} from "./session";
import type { SessionSnapshot, SessionStatus } from "./types";

/** Délai d'inactivité en arrière-plan avant de reverrouiller. */
const LOCK_AFTER_BACKGROUND_MS = 5 * 60 * 1000;

/**
 * Motif porté par `lostReason` quand le démarrage à froid a levé.
 *
 * Il est EXPORTÉ parce que l'écran de connexion le compare : un code recopié
 * des deux côtés finirait par diverger d'une lettre, et le bandeau
 * disparaîtrait sans que rien ne le dise. C'est le seul motif qui ne vienne pas
 * du serveur - les autres sortent de `setSessionLostHandler`.
 */
export const MOTIF_DEMARRAGE = "demarrage";


interface SessionValue {
  status: SessionStatus;
  snapshot: SessionSnapshot | null;
  /** Motif du passage en `needs_password`, pour l'expliquer à l'écran. */
  lostReason: string | null;

  login: (email: string, password: string) => Promise<OrganizationChoice[]>;
  chooseOrganization: (organizationId: string) => Promise<void>;
  /** Inscription complète : compte, établissement, puis enrôlement du terminal. */
  inscrire: (
    compte: SaisieCompte,
    etablissement: SaisieEtablissement
  ) => Promise<void>;
  markUnlocked: () => void;
  lock: () => void;
  logout: () => Promise<void>;
  refresh: () => Promise<SessionSnapshot | null>;

  /**
   * L'ancien propriétaire de la base, quand `status` vaut `base_etrangere`.
   *
   * L'écran de reprise le NOMME : sans lui il dirait « des données d'un autre
   * compte », ce qui n'aide personne à décider et ne permettrait pas de proposer
   * « Se reconnecter en tant que … », la seule issue non destructrice.
   */
  baseEtrangere: Estampille | null;
  /** Efface les données de l'ancien propriétaire, puis entre. Irréversible. */
  effacerBaseEtrangere: () => Promise<void>;

  /**
   * Ce terminal a-t-il déjà vu la présentation ? `null` tant qu'on l'ignore.
   *
   * ⚠ LA GARDE DOIT ATTENDRE `null`, et c'est tout l'intérêt du troisième
   * état. Sans lui, un premier lancement afficherait la connexion pendant une
   * image puis sauterait sur la présentation : le clignotement même contre
   * lequel la garde se protège déjà pour `loading`.
   */
  accueilVu: boolean | null;
  /** Range le drapeau, et le dit tout de suite à la garde. */
  marquerAccueilVu: () => Promise<void>;

  /** Raccourcis de garde, lus depuis l'instantané mis en cache. */
  can: (permission: string) => boolean;
  canAny: (permissions: string[]) => boolean;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>("loading");
  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(null);
  const [lostReason, setLostReason] = useState<string | null>(null);
  const [baseEtrangere, setBaseEtrangere] = useState<Estampille | null>(null);
  const [accueilVu, setAccueilVu] = useState<boolean | null>(null);
  const backgroundedAt = useRef<number | null>(null);

  // Le client HTTP prévient quand le serveur a refusé les DEUX jetons. C'est le
  // seul chemin qui fait sortir de `ready`, et il n'est jamais emprunté sur une
  // panne réseau.
  useEffect(() => {
    setSessionLostHandler((reason) => {
      setLostReason(reason);
      setStatus("needs_password");
    });
    return () => setSessionLostHandler(null);
  }, []);

  /** Combien d'opérations n'ont jamais atteint le serveur. */
  const compterNonEnvoyees = useCallback(async () => {
    // ⚠ `lireEnSouffrance` compte AUSSI les photos, et il le faut : une photo en
    // attente est la seule copie d'un fichier, que la purge détruit. Compter le
    // seul journal ici purgerait en silence ce que la modale, elle, refuse
    // d'effacer - deux décisions contradictoires sur la même donnée.
    //
    // Une base illisible y rend une unité, jamais zéro : on fait arbitrer
    // plutôt que purger.
    return nbEnFile(await lireEnSouffrance());
  }, []);

  /**
   * Le filet : cette base appartient-elle bien à qui se présente ?
   *
   * Rend vrai si l'on peut entrer. Rend faux quand il a posé `base_etrangere` :
   * l'appelant ne doit alors PAS poser d'état à son tour.
   */
  const appliquerVerdictBase = useCallback(
    async (entrant: SessionSnapshot): Promise<boolean> => {
      const estampille = await lireEstampille();
      // `baseHabitee` balaie une cinquantaine de tables ; elle ne sert que
      // lorsqu'il n'y a PAS d'estampille, c'est-à-dire pour distinguer une
      // première installation d'une réinstallation par-dessus. Avec une
      // estampille, la comparaison se suffit - et c'est le cas de loin le plus
      // fréquent, celui de chaque démarrage.
      const verdict = comparerProprietaire(
        estampille,
        { userId: entrant.user.id, organizationId: entrant.organization.id },
        estampille ? false : await baseHabitee()
      );

      if (verdict !== "etrangere") {
        // On (r)estampille à chaque entrée : c'est gratuit, et cela répare une
        // estampille perdue sans attendre le prochain changement de compte.
        await ecrireEstampille(estampillerDepuis(entrant.user, entrant.organization));
        return true;
      }

      if (suitePourBase(verdict, await compterNonEnvoyees()) === "purger") {
        await purgerBaseLocale();
        await ecrireEstampille(estampillerDepuis(entrant.user, entrant.organization));
        return true;
      }

      setBaseEtrangere(estampille);
      setStatus("base_etrangere");
      return false;
    },
    [compterNonEnvoyees]
  );

  /**
   * Démarrage : trousseau seulement.
   *
   * ┌──────────────────────────────────────────────────────────────────────────┐
   * │ UN DÉMARRAGE QUI LÈVE NE DOIT JAMAIS LAISSER `loading` EN PLACE.        │
   * │                                                                          │
   * │ `ROUTE_FOR` n'a aucune route pour cet état - la garde sort dessus sans   │
   * │ rien déplacer - et l'appel est un `void` : un rejet part en l'air, le    │
   * │ statut reste `loading`, et l'écran de démarrage ne s'en va PLUS JAMAIS.  │
   * │ Ni à ce lancement ni aux suivants, la cause étant persistante :          │
   * │ `purgerBaseLocale()` lève sur son garde-fou « tables non classées », et  │
   * │ toute la séquence peut lever sur une erreur SQLite.                      │
   * └──────────────────────────────────────────────────────────────────────────┘
   *
   * ⚠ **On retombe sur `anonymous`, et c'est le seul repli tenable.**
   *
   * - Il est SÛR : on n'accorde aucune session sur une base qu'on n'a pas pu
   *   qualifier, donc la fusion reste fermée.
   * - Il se RÉPARE tout seul : le trousseau n'est pas touché, le lancement
   *   suivant réessaie, et une reconnexion repasse par `chooseOrganization`,
   *   dont les appelants attrapent et AFFICHENT l'erreur - ce que `bootstrap`,
   *   lui, ne pouvait pas faire.
   * - `base_etrangere` serait un MENSONGE quand le jet vient d'une erreur
   *   passagère, et son écran de reprise emprunterait de toute façon le même
   *   `purgerBaseLocale()` qui vient d'échouer, sur l'une de ses deux sorties.
   *
   * Le motif se NOMME (`lostReason`) : sans lui, un caissier connecté se
   * retrouve devant l'écran de connexion sans savoir si sa journée a disparu.
   */
  const bootstrap = useCallback(async () => {
    try {
      // Une purge tuée entre la suppression des fichiers et le commit se rejoue
      // ici, AVANT tout le reste : elle est idempotente, n'étant que des `DELETE`.
      try {
        if (await purgeInachevee()) await purgerBaseLocale();
      } catch {
        // Une purge qu'on ne peut pas reprendre ne doit pas empêcher de démarrer.
        // Le filet ci-dessous constatera la discordance et fera arbitrer.
      }

      const [cached, tokens, pinSet] = await Promise.all([
        readSnapshot<SessionSnapshot>(),
        readTokens(),
        hasPin(),
      ]);

      if (!cached || !tokens) {
        setStatus("anonymous");
        return;
      }

      // ┌────────────────────────────────────────────────────────────────────┐
      // │ RATTRAPAGE DU PARC DÉJÀ EN SERVICE, ET IL EST OBLIGATOIRE.        │
      // │                                                                    │
      // │ Sur tous les terminaux déjà installés, la base est pleine et il n'y │
      // │ a aucune estampille. Sans ce rattrapage, le PREMIER lancement après │
      // │ la mise à jour déclarerait CHAQUE terminal étranger, et enverrait   │
      // │ tout le parc sur l'écran de reprise. L'instantané dit à qui la base │
      // │ appartient ; on l'écrit une fois, et le cas ne se représente plus.  │
      // │                                                                    │
      // │ ⚠ SEULEMENT SI LA BASE EST HABITÉE, et ce n'est pas une            │
      // │ optimisation. Sur une base VIDE il n'y a rien à sauver, et          │
      // │ `appliquerVerdictBase` conclura « vierge » puis estampillera de     │
      // │ toute façon : même résultat, une surface d'adoption en moins. Sans  │
      // │ cette borne, tout instantané écrit hors du fournisseur se ferait    │
      // │ adopter par la base du voisin.                                      │
      // └────────────────────────────────────────────────────────────────────┘
      //
      // ⚠ **`baseHabitee` n'est demandée QUE s'il n'y a pas d'estampille.**
      // Elle balaie une cinquantaine de tables, et `doitRattraper` rend faux
      // dès qu'une estampille existe - c'est-à-dire à TOUS les démarrages sauf
      // le tout premier après la mise à jour. Les deux arguments étaient
      // évalués avant l'appel, donc le balayage était payé à chaque lancement
      // pour une réponse connue d'avance. C'est le court-circuit que
      // `appliquerVerdictBase` fait déjà, quarante lignes plus haut.
      const estampille = await lireEstampille();
      if (doitRattraper(estampille, estampille ? false : await baseHabitee())) {
        await ecrireEstampille(estampillerDepuis(cached.user, cached.organization));
      }

      if (!(await appliquerVerdictBase(cached))) return;

      setSnapshot(cached);
      setOrganizationId(cached.organization.id);
      // Un terminal enrôlé SANS code repasse par sa définition. Le laisser entrer
      // lui donnerait une session de 30 jours et les ventes du jour sans aucun
      // verrou, ce que le lot 1 s'interdit. Le cas se produit si l'application a
      // été fermée entre l'enrôlement et la saisie du code.
      setStatus(pinSet ? "locked" : "needs_pin");
    } catch {
      setLostReason(MOTIF_DEMARRAGE);
      setStatus("anonymous");
    }
  }, [appliquerVerdictBase]);

  useEffect(() => {
    // ┌──────────────────────────────────────────────────────────────────────┐
    // │ L'EXCEPTION EST NOMMÉE, ET ELLE TIENT À UNE LIMITE DE L'ANALYSEUR.  │
    // │                                                                      │
    // │ `react-hooks/set-state-in-effect` refuse tout `setState` joignable   │
    // │ depuis un `catch`, quelle que soit la forme : mesuré sur quatre      │
    // │ écritures (repli dans le `catch`, repli hoisté dans un `useCallback`,│
    // │ `.catch()` au point d'appel, drapeau appliqué APRÈS le try), toutes  │
    // │ sont signalées. L'analyseur perd sa trace des `await` en traversant  │
    // │ un bloc gardé ; il ne sait donc pas exprimer « repli terminal ».     │
    // │                                                                      │
    // │ Ce que la règle protège n'est pas en jeu ici : ce chemin court AU    │
    // │ PLUS UNE FOIS par montage et s'arrête sur un état stable, il ne      │
    // │ cascade pas. Et sans lui, `bootstrap` jetterait son rejet dans le    │
    // │ `void` - le statut resterait `loading`, et le terminal ne démarrerait │
    // │ plus jamais.                                                         │
    // └──────────────────────────────────────────────────────────────────────┘
    // eslint-disable-next-line react-hooks/set-state-in-effect -- repli terminal, voir ci-dessus
    void bootstrap();
  }, [bootstrap]);

  /**
   * Le drapeau de la présentation, lu à la demande.
   *
   * Il ne vit PAS dans `bootstrap` : celui-ci sort tôt sur un terminal enrôlé,
   * et la lecture serait alors payée à chaque démarrage pour un écran qu'on ne
   * verra jamais. Ici, elle n'a lieu que lorsque la garde en a besoin.
   */
  useEffect(() => {
    if (status !== "anonymous" || accueilVu !== null) return;
    let vivant = true;
    void accueilDejaVu().then((vu) => {
      if (vivant) setAccueilVu(vu);
    });
    return () => {
      vivant = false;
    };
  }, [status, accueilVu]);

  /** Reverrouillage après un séjour prolongé en arrière-plan. */
  useEffect(() => {
    const onChange = (next: AppStateStatus) => {
      if (next === "background" || next === "inactive") {
        backgroundedAt.current = Date.now();
        return;
      }
      if (next === "active" && backgroundedAt.current) {
        const away = Date.now() - backgroundedAt.current;
        backgroundedAt.current = null;
        if (away > LOCK_AFTER_BACKGROUND_MS) {
          void hasPin().then((set) => {
            if (set) setStatus((s) => (s === "ready" ? "locked" : s));
          });
        }
      }
    };
    const subscription = AppState.addEventListener("change", onChange);
    return () => subscription.remove();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { organizations } = await loginWithPassword(email, password);
    return organizations;
  }, []);

  const chooseOrganization = useCallback(
    async (organizationId: string) => {
      const fresh = await enrollDeviceOp(organizationId);
      // Le filet AVANT de poser l'état : c'est le seul entonnoir d'entrée, et
      // c'est ici qu'un compte X laisse la place à un compte Y.
      if (!(await appliquerVerdictBase(fresh))) return;
      setSnapshot(fresh);
      setLostReason(null);
      // Le code vient tout de suite : c'est la contrepartie d'une session longue.
      setStatus((await hasPin()) ? "ready" : "needs_pin");
    },
    [appliquerVerdictBase]
  );

  /**
   * Inscription. Le terminal est enrôlé dans la foulée par `registerAndEnroll`,
   * et on n'arrive ici qu'une fois les DEUX appels passés : l'état de session
   * ne bascule donc jamais sur une organisation sans appareil.
   */
  const inscrire = useCallback(
    async (compte: SaisieCompte, etablissement: SaisieEtablissement) => {
      const fresh = await registerAndEnroll(compte, etablissement);
      if (!(await appliquerVerdictBase(fresh))) return;
      setSnapshot(fresh);
      setLostReason(null);
      setStatus((await hasPin()) ? "ready" : "needs_pin");
    },
    [appliquerVerdictBase]
  );

  const markUnlocked = useCallback(() => setStatus("ready"), []);

  const lock = useCallback(() => {
    void hasPin().then((set) => setStatus(set ? "locked" : "ready"));
  }, []);

  /**
   * Abandonne la session. **N'efface PAS la base locale.**
   *
   * C'est `session/deconnexion.tsx` qui décide d'une purge, jamais ce chemin :
   * la purge n'est licite qu'après avoir garanti que la file est vide, ou après
   * qu'un humain a décidé de la perdre. Voir la docstring de `session.ts`.
   */
  const logout = useCallback(async () => {
    await logoutOp();
    setSnapshot(null);
    setLostReason(null);
    setBaseEtrangere(null);
    // ┌──────────────────────────────────────────────────────────────────┐
    // │ LA PRÉSENTATION REVIENT APRÈS UNE DÉCONNEXION, ET C'EST VOULU.  │
    // │                                                                  │
    // │ `accueil.vu` n'est pas dans l'allowlist de `db/purge-regles.ts` :│
    // │ celle-ci ne porte que ce qui décrit le MATÉRIEL du comptoir. Le  │
    // │ nettoyage l'efface donc, et cet état suit.                       │
    // │                                                                  │
    // │ ⚠ Il le suit même quand l'utilisateur choisit « se déconnecter   │
    // │ sans effacer », où le drapeau survit en base : la présentation   │
    // │ reparaît alors une fois de trop, et le lancement suivant la      │
    // │ sautera. C'est l'écart qui coûte le moins - trois vues balayées  │
    // │ contre une lecture de base à un instant où la purge n'a peut-    │
    // │ être pas encore eu lieu.                                         │
    // └──────────────────────────────────────────────────────────────────┘
    setAccueilVu(false);
    setStatus("anonymous");
  }, []);

  /**
   * Efface les données de l'ancien propriétaire, puis entre.
   *
   * ⚠ Irréversible, et l'écran le DIT avant : ce qui reste en file ne sera
   * jamais envoyé. Si c'étaient des ventes encaissées, les paiements resteront
   * sans trace au serveur.
   */
  const effacerBaseEtrangere = useCallback(async () => {
    const fresh = await readSnapshot<SessionSnapshot>();
    await purgerBaseLocale();
    if (fresh) {
      await ecrireEstampille(estampillerDepuis(fresh.user, fresh.organization));
      setSnapshot(fresh);
      setOrganizationId(fresh.organization.id);
    }
    setBaseEtrangere(null);
    setStatus(fresh ? ((await hasPin()) ? "ready" : "needs_pin") : "anonymous");
  }, []);

  /**
   * ⚠ L'ÉTAT AVANT L'ÉCRITURE, et pas l'inverse.
   *
   * La garde relit `accueilVu` au rendu suivant. L'écriture SQLite prend
   * quelques millisecondes ; attendre qu'elle rende la main laisserait la
   * garde renvoyer une fois de plus vers la présentation qu'on vient de
   * quitter, et l'écran clignoterait sur le chemin de la connexion.
   *
   * ⚠ ET ON NE LE REMET JAMAIS À FAUX EN SE DÉCONNECTANT. La clé est bien
   * PURGÉE de la base avec le reste du compte - c'est la décision écrite dans
   * `data/reglages.ts` - donc la présentation revient au lancement SUIVANT. La
   * remettre à faux ici la ferait surgir dans la seconde qui suit la
   * déconnexion, devant quelqu'un qui vient précisément de se servir de
   * l'application ; et il faudrait pour bien faire attendre que
   * `session/deconnexion.tsx` ait fini sa purge, ce qui couplerait ce
   * fournisseur à une séquence qu'il n'orchestre pas.
   */
  const marquerAccueilVu = useCallback(async () => {
    setAccueilVu(true);
    await ecrireAccueilVu();
  }, []);

  /**
   * Rafraîchit l'identité en tâche de fond. Un échec ne change rien.
   *
   * ⚠ Elle REND l'instantané frais, et l'appelant en a besoin : décider de
   * libérer les opérations bloquées demande le verdict d'abonnement de CE
   * réveil-ci, pas celui que React n'a pas encore rendu.
   */
  const refresh = useCallback(async (): Promise<SessionSnapshot | null> => {
    const fresh = await refreshSnapshotOp();
    if (fresh) {
      setSnapshot(fresh);
      await writeSnapshot(fresh);
    }
    return fresh ?? null;
  }, []);

  const permissions = snapshot?.membership.permissions ?? [];
  const can = useCallback(
    (permission: string) => permissions.includes(permission),
    [permissions]
  );
  const canAny = useCallback(
    (list: string[]) => list.some((p) => permissions.includes(p)),
    [permissions]
  );

  const value = useMemo<SessionValue>(
    () => ({
      status,
      snapshot,
      lostReason,
      login,
      chooseOrganization,
      inscrire,
      markUnlocked,
      lock,
      logout,
      refresh,
      baseEtrangere,
      effacerBaseEtrangere,
      accueilVu,
      marquerAccueilVu,
      can,
      canAny,
    }),
    [
      status,
      snapshot,
      lostReason,
      login,
      chooseOrganization,
      inscrire,
      markUnlocked,
      lock,
      logout,
      refresh,
      baseEtrangere,
      effacerBaseEtrangere,
      accueilVu,
      marquerAccueilVu,
      can,
      canAny,
    ]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession doit être appelé sous <SessionProvider>.");
  return value;
}

/**
 * Garde de permission.
 *
 * Le cache de permissions est un CONFORT D'INTERFACE, jamais une frontière de
 * sécurité : le serveur revérifie chaque opération à la poussée, et un client
 * aux droits périmés ne produit que des opérations qui reviendront refusées.
 */
export function useCan(permission: string): boolean {
  return useSession().can(permission);
}
