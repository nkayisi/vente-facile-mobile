/**
 * Le bandeau qui propose d'autoriser les notifications poussées.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ IL EST ICI, ET C'EST LE SEUL ENDROIT TENABLE.                           │
 * │                                                                          │
 * │ `demanderPush` ne peut partir que d'un GESTE : une invite posée au       │
 * │ démarrage arrive avant que le marchand ait compris ce que l'application  │
 * │ fait, il refuse, et Android ne redemande PLUS JAMAIS. Et l'écran des     │
 * │ notifications est précisément celui qu'il ouvre quand il se demande      │
 * │ pourquoi il n'est pas prévenu.                                           │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ SANS CE BANDEAU, TOUT LE CANAL POUSSÉ EST INERTE. `demanderPush` et
 * `preparerCanal` n'avaient AUCUN appelant : sur Android 13+ la permission
 * restait `undetermined`, `champsPush()` rendait `{}`, `Device.push_token`
 * n'était jamais écrit, et aucune alerte n'atteignait un téléphone. Le
 * garde-fou qui veillait sur ce module ne vérifiait que l'inverse - que rien
 * d'autre ne demandait la permission - et passait donc sur le défaut.
 *
 * ⚠ IL NE PARAÎT PAS QUAND TOUT VA BIEN. Un bandeau permanent sur un état
 * correct apprend à ne plus lire les bandeaux, et celui d'à côté (« les
 * notifications demandent une connexion ») doit rester visible.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Linking, View } from "react-native";

import {
  demanderPush,
  etatPush,
  type EtatPush,
} from "@/notifications/jeton-push";
import { useSession } from "@/session/provider";
import { Banner } from "@/ui";

export function BandeauPush() {
  const { refresh } = useSession();
  const [etat, setEtat] = useState<EtatPush | null>(null);
  const [enCours, setEnCours] = useState(false);

  const vivant = useRef(true);
  useEffect(() => {
    vivant.current = true;
    return () => {
      vivant.current = false;
    };
  }, []);

  const relire = useCallback(async () => {
    try {
      const e = await etatPush();
      if (vivant.current) setEtat(e);
    } catch {
      // Un module natif absent n'est pas une panne : on ne propose rien.
      if (vivant.current) setEtat(null);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- aucun `setState` avant le premier `await` ; même faux positif que `cloche.tsx`, mesuré.
    void relire();
  }, [relire]);

  // ⚠ ET AU RETOUR AU PREMIER PLAN. Les réglages du système sont une AUTRE
  // application : un marchand qui vient d'y accorder la permission revient
  // forcément par un front `background → active`, et sans cette relecture le
  // bandeau resterait affiché sur un état déjà corrigé.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") void relire();
    });
    return () => sub.remove();
  }, [relire]);

  const autoriser = useCallback(async () => {
    setEnCours(true);
    try {
      const apres = await demanderPush();
      if (vivant.current) setEtat(apres);
      // ⚠ L'ADRESSE NE MONTE QUE PAR LE RÉVEIL. `champsPush` voyage avec
      //   `/auth/devices/session/`, par choix documenté : sans ce
      //   rafraîchissement, le marchand accorde la permission et attend le
      //   prochain démarrage pour que son téléphone devienne joignable.
      if (apres.etat === "accorde") await refresh();
    } catch {
      // Rien à dire : l'état relu dira ce qu'il en est, et une invite qui
      // échoue ne doit pas poser un bandeau d'erreur de plus.
      void relire();
    } finally {
      if (vivant.current) setEnCours(false);
    }
  }, [refresh, relire]);

  if (etat === null) return null;

  // Accordé, ou appareil incapable de rendre une adresse (émulateur sans
  // services Google) : il n'y a rien à proposer.
  if (etat.etat === "accorde" || etat.etat === "indisponible") return null;

  if (etat.etat === "refuse_definitivement") {
    // ⚠ AUCUN BOUTON « AUTORISER » ICI : l'invite ne s'ouvrira plus, et le
    //   marchand appuierait dans le vide. Seul un détour par les réglages du
    //   système rouvre la porte, et c'est donc là qu'on l'envoie.
    return (
      <Cadre>
        <Banner
          tone="warning"
          title="Les notifications sont bloquées"
          message="Vous ne serez pas prévenu des ruptures ni des demandes à approuver. Cela se rouvre dans les réglages du téléphone, à la rubrique Notifications."
          action={{
            label: "Ouvrir les réglages",
            onPress: () => {
              void Linking.openSettings().catch(() => {});
            },
          }}
        />
      </Cadre>
    );
  }

  // `a_demander` (jamais demandé) et `refuse` (refusé une fois, l'invite se
  // rouvre) proposent le même geste : la différence n'est pas dans ce qu'on
  // peut faire, elle est dans ce qu'on dit.
  return (
    <Cadre>
      <Banner
        tone="warning"
        title={
          etat.etat === "refuse"
            ? "Les notifications ne sont pas autorisées"
            : "Soyez prévenu sans ouvrir l'application"
        }
        message="Ruptures de stock, créances en retard, demandes à approuver : le téléphone sonne au moment où le serveur le constate. La liste, elle, ne se lit qu'en l'ouvrant."
        action={{
          label: "Autoriser les notifications",
          onPress: () => void autoriser(),
          loading: enCours,
        }}
      />
    </Cadre>
  );
}

/**
 * Le cadre du bandeau.
 *
 * ⚠ IL VIT ICI, PAS DANS L'ÉCRAN. Ce composant rend `null` dans l'état le plus
 * fréquent (permission accordée), et un cadre posé par l'écran laisserait
 * alors huit points de blanc sous la barre de titre - un vide qui se lit comme
 * un bloc manquant.
 */
function Cadre({ children }: { children: React.ReactNode }) {
  return <View className="px-4 pt-2">{children}</View>;
}
