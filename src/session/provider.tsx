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
import { hasPin } from "./lock";
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
  refresh: () => Promise<void>;

  /** Raccourcis de garde, lus depuis l'instantané mis en cache. */
  can: (permission: string) => boolean;
  canAny: (permissions: string[]) => boolean;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>("loading");
  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(null);
  const [lostReason, setLostReason] = useState<string | null>(null);
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

  /** Démarrage : trousseau seulement. */
  const bootstrap = useCallback(async () => {
    const [cached, tokens, pinSet] = await Promise.all([
      readSnapshot<SessionSnapshot>(),
      readTokens(),
      hasPin(),
    ]);

    if (!cached || !tokens) {
      setStatus("anonymous");
      return;
    }

    setSnapshot(cached);
    setOrganizationId(cached.organization.id);
    // Un terminal enrôlé SANS code repasse par sa définition. Le laisser entrer
    // lui donnerait une session de 30 jours et les ventes du jour sans aucun
    // verrou, ce que le lot 1 s'interdit. Le cas se produit si l'application a
    // été fermée entre l'enrôlement et la saisie du code.
    setStatus(pinSet ? "locked" : "needs_pin");
  }, []);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

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

  const chooseOrganization = useCallback(async (organizationId: string) => {
    const fresh = await enrollDeviceOp(organizationId);
    setSnapshot(fresh);
    setLostReason(null);
    // Le code vient tout de suite : c'est la contrepartie d'une session longue.
    setStatus((await hasPin()) ? "ready" : "needs_pin");
  }, []);

  /**
   * Inscription. Le terminal est enrôlé dans la foulée par `registerAndEnroll`,
   * et on n'arrive ici qu'une fois les DEUX appels passés : l'état de session
   * ne bascule donc jamais sur une organisation sans appareil.
   */
  const inscrire = useCallback(
    async (compte: SaisieCompte, etablissement: SaisieEtablissement) => {
      const fresh = await registerAndEnroll(compte, etablissement);
      setSnapshot(fresh);
      setLostReason(null);
      setStatus((await hasPin()) ? "ready" : "needs_pin");
    },
    []
  );

  const markUnlocked = useCallback(() => setStatus("ready"), []);

  const lock = useCallback(() => {
    void hasPin().then((set) => setStatus(set ? "locked" : "ready"));
  }, []);

  const logout = useCallback(async () => {
    await logoutOp();
    setSnapshot(null);
    setLostReason(null);
    setStatus("anonymous");
  }, []);

  /** Rafraîchit l'identité en tâche de fond. Un échec ne change rien. */
  const refresh = useCallback(async () => {
    const fresh = await refreshSnapshotOp();
    if (fresh) {
      setSnapshot(fresh);
      await writeSnapshot(fresh);
    }
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
      can,
      canAny,
    }),
    [status, snapshot, lostReason, login, chooseOrganization, inscrire, markUnlocked, lock, logout, refresh, can, canAny]
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
