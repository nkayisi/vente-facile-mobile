/**
 * Se déconnecter proprement : synchroniser, puis vider la base locale.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ POURQUOI CE FOURNISSEUR VIT À LA RACINE, ET NON DANS UN ÉCRAN.          │
 * │                                                                          │
 * │ La surcouche doit SURVIVRE au démontage du groupe `(app)`, que la        │
 * │ séquence provoque elle-même en posant `anonymous`. Une modale écrite     │
 * │ dans `profil.tsx` disparaîtrait à l'instant précis où l'on en a le plus  │
 * │ besoin : pendant le nettoyage.                                           │
 * │                                                                          │
 * │ Et les trois appelants vivent dans DEUX groupes : le tiroir et le profil │
 * │ dans `(app)`, le déverrouillage dans `(locked)`.                         │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * La doctrine de `session.ts` ne change pas : `logout()` n'efface pas la base.
 * La purge est la décision de CET orchestrateur, jamais un effet de bord de la
 * déconnexion - et il ne la prend qu'après avoir garanti que la file est vide.
 */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { View } from "react-native";
import { router } from "expo-router";

import { useEnLigne } from "@/data/reseau";
import { purgerBaseLocale } from "@/db/purge";
import { envoyerPhotosEnAttente } from "@/features/inventaire/photos";
import { attendreLibre, prendre, pushAll, rendre } from "@/sync";
import { Button, Dialog, Spinner, Text } from "@/ui";

import {
  AUCUN_PERISSABLE,
  confirmationAvant,
  FILE_VIDE,
  issueApresEnvoi,
  MESSAGE_OCCUPE,
  messageImpasse,
  nbEnFile,
  type EtatFile,
  type PerissablesLocaux,
} from "./deconnexion-regles";
import { lireEnSouffrance, lirePerissablesLocaux } from "./en-souffrance";
import { useSession } from "./provider";

/** Un cycle automatique peut tourner à la seconde où le marchand appuie. */
const ATTENTE_VERROU_MS = 30_000;

/**
 * Le temps laissé à la garde pour naviguer et démonter le groupe `(app)`.
 *
 * Généreux à dessein : il est invisible - la surcouche opaque est déjà posée -
 * et il vaut mieux payer cinquante millisecondes que réveiller cinquante
 * lectures sur une base qu'on est en train de vider.
 */
export const RESPIRATION_MS = 50;

type Etape =
  | "repos"
  | "confirmation"
  /** Le verrou de synchronisation se libère. Rien n'est encore engagé. */
  | "attente"
  | "envoi"
  | "impasse"
  | "occupe"
  | "nettoyage";

/**
 * Ce que la surcouche annonce, par étape.
 *
 * ⚠ **`attente` a sa phrase, et ne réutilise aucune des deux autres.** « Envoi
 * des opérations » mentirait sur une file vide, et « Nettoyage du terminal »
 * mentirait avant même d'avoir le verrou - on peut encore ressortir sur
 * « occupé » sans avoir rien touché.
 */
const PHRASE: Partial<Record<Etape, string>> = {
  attente: "Préparation de la déconnexion...",
  envoi: "Envoi des opérations en attente...",
  nettoyage: "Nettoyage du terminal...",
};

interface ValeurDeconnexion {
  /** Ouvre la modale. Le SEUL chemin de déconnexion de l'application. */
  demander: () => void;
  enCours: boolean;
}

const Contexte = createContext<ValeurDeconnexion | null>(null);

export function DeconnexionProvider({ children }: { children: ReactNode }) {
  const { snapshot, status, logout } = useSession();
  const enLigne = useEnLigne();

  const [etape, setEtape] = useState<Etape>("repos");
  const [avant, setAvant] = useState<EtatFile>(FILE_VIDE);
  const [apres, setApres] = useState<EtatFile>(FILE_VIDE);
  const [perissables, setPerissables] = useState<PerissablesLocaux>(AUCUN_PERISSABLE);

  /**
   * Le nettoyage. **L'ORDRE N'EST PAS NÉGOCIABLE.**
   *
   * ⚠ **IL S'EXÉCUTE SOUS LE VERROU DE SYNCHRONISATION, QUE L'APPELANT TIENT
   * DÉJÀ.** Il ne le prend pas lui-même : le prendre ici laisserait une fenêtre
   * entre la poussée et le nettoyage, et cette fenêtre suffit. `pushOnce` ÉCRIT
   * dans `outbox_operations`, ce qui réveille l'écouteur de journal du
   * fournisseur avec un débounce de deux secondes ; `logout()` fait un POST
   * réseau qui peut durer plus longtemps. Un cycle complet partirait alors
   * pendant la déconnexion et écrirait sa première page APRÈS la purge - une
   * ligne de `sync_state` réécrite, et le compte suivant reprendrait le tirage
   * au curseur de l'ancien : son catalogue ne descendrait JAMAIS.
   *
   * La session part d'ABORD, la base ENSUITE, et c'est tout le raisonnement :
   *
   * - **Aucun écran ne doit lire pendant la purge.** Purger sous un comptoir
   *   monté réveille une cinquantaine de `useLecture` au commit ; ils avalent
   *   leurs erreurs, donc les écrans ne plantent pas, ils se VIDENT sous les
   *   yeux du marchand. `logout()` pose `anonymous`, la garde démonte `(app)`,
   *   et tous ces abonnements disparaissent avec lui.
   * - **La dissymétrie des pannes tranche.** Tué entre les deux, on rouvre
   *   `anonymous` sur une base périmée dont l'estampille nomme encore l'ancien
   *   propriétaire : le filet d'entrée l'attrape au prochain enrôlement, et au
   *   pire on refait la purge. Dans l'ordre inverse, on rouvrirait `ready` sur
   *   une base VIDE, sans aucune discordance pour le signaler, et le marchand
   *   croirait sa journée évaporée. On choisit toujours la panne que le filet
   *   rattrape.
   * - `clearSession()`, que `logout()` appelle, garantit qu'aucune requête en
   *   vol ne peut pousser sous l'identité mourante.
   */
  const nettoyer = useCallback(async () => {
    setEtape("nettoyage");
    await logout();
    // ┌──────────────────────────────────────────────────────────────────────┐
    // │ ON LAISSE LA GARDE DÉMONTER `(app)` AVANT DE TOUCHER À LA BASE.     │
    // │                                                                      │
    // │ `logout()` pose `anonymous` ; la garde navigue dans son effet, et le │
    // │ groupe `(app)` se démonte avec sa cinquantaine de `useLecture`. Sans │
    // │ cette respiration, la purge les réveillerait tous - ils avalent      │
    // │ leurs erreurs, donc rien ne planterait : les écrans se videraient    │
    // │ simplement, et on aurait payé cinquante requêtes pour rien.          │
    // │                                                                      │
    // │ Un `setTimeout`, et PAS `InteractionManager` : celui-ci est déprécié │
    // │ depuis React Native 0.86 et sera retiré. La surcouche opaque couvre  │
    // │ de toute façon l'écran pendant tout ce temps, donc ce délai est une  │
    // │ économie, pas une garantie d'affichage.                              │
    // └──────────────────────────────────────────────────────────────────────┘
    await new Promise<void>((resoudre) => setTimeout(resoudre, RESPIRATION_MS));
    try {
      await purgerBaseLocale();
    } catch {
      // Une purge qui échoue laisse une base estampillée à l'ancien
      // propriétaire : le filet d'entrée la reprendra. Ne pas retenir le
      // marchand devant un écran pour cela.
    }
    setEtape("repos");
  }, [logout]);

  /**
   * Se déconnecter SANS rien effacer : la base survit, estampillée.
   *
   * ⚠ **Hors verrou, et c'est justifié** : elle ne touche pas à la base. Lui
   * imposer trente secondes d'attente serait une rétention sans objet, sur la
   * seule issue dont le marchand dispose quand tout le reste est bloqué.
   */
  const partirSansEffacer = useCallback(async () => {
    setEtape("nettoyage");
    await logout();
    setEtape("repos");
  }, [logout]);

  /**
   * La séquence entière, SOUS UN SEUL VERROU du premier octet au dernier.
   *
   * ⚠ **On n'appelle PAS `lancer` du fournisseur de synchronisation.** Ses deux
   * pièges sont dirimants : elle rend `Promise<void>`, donc aucun bilan, et si
   * un cycle tourne déjà elle résout INSTANTANÉMENT sans rien attendre -
   * l'attendre ne prouverait rien. `pushAll` boucle jusqu'à `more === false` et
   * rend un bilan ; un tirage serait d'ailleurs absurde ici, on téléchargerait
   * quarante-cinq tables pour les effacer trente secondes plus tard.
   */
  const executer = useCallback(
    async (avecEnvoi: boolean) => {
      // ┌──────────────────────────────────────────────────────────────────┐
      // │ L'ÉTAPE SE POSE AVANT LE PREMIER `await`, SUR LES DEUX CHEMINS. │
      // │                                                                  │
      // │ Elle ne l'était que si l'on avait quelque chose à envoyer. Sur   │
      // │ une file VIDE, l'étape restait `confirmation` : le dialogue      │
      // │ restait donc AFFICHÉ ET ACTIF pendant toute l'attente du verrou, │
      // │ qui dure jusqu'à trente secondes quand un cycle tourne. Presser  │
      // │ « Annuler » ne faisait que le fermer - la promesse continuait,   │
      // │ prenait le verrou, et appelait `logout()` PUIS la purge. Une     │
      // │ destruction après une annulation explicite.                      │
      // │                                                                  │
      // │ Second effet du même trou : un deuxième appui sur « Se           │
      // │ déconnecter » lançait un `executer` concurrent.                  │
      // └──────────────────────────────────────────────────────────────────┘
      setEtape(avecEnvoi ? "envoi" : "attente");

      // Un cycle automatique peut très bien avoir démarré à la seconde où le
      // marchand appuie : le sien attend son tour. Les DEUX retours sont lus -
      // ignorer celui d'`attendreLibre` ferait annoncer « le serveur est
      // injoignable » alors qu'on n'a même pas essayé.
      const libre = await attendreLibre(ATTENTE_VERROU_MS);
      if (!libre || !prendre()) {
        setEtape("occupe");
        return;
      }

      try {
        if (avecEnvoi) {
          try {
            await pushAll(snapshot?.device?.id);
            // ┌──────────────────────────────────────────────────────────────┐
            // │ LES PHOTOS PARTENT APRÈS LA POUSSÉE, ET L'ORDRE EST OBLIGÉ. │
            // │                                                              │
            // │ Une photo est un `PATCH` multipart sur un article qui doit   │
            // │ EXISTER côté serveur : `/sync/operations/` ne transporte que │
            // │ du JSON, elle ne peut donc pas voyager avec sa création.     │
            // │ Envoyée avant, elle viserait un article inconnu.             │
            // │                                                              │
            // │ C'est l'ordre exact du cycle complet ; s'en écarter ferait   │
            // │ deux règles à tenir en phase.                                │
            // └──────────────────────────────────────────────────────────────┘
            await envoyerPhotosEnAttente();
          } catch {
            // Un envoi qui lève ne dit rien de plus que la relecture ci-dessous.
          }
        }

        const fin = await lireEnSouffrance();
        setApres(fin);
        if (issueApresEnvoi(fin) === "purger") {
          await nettoyer();
          return;
        }
        setEtape("impasse");
      } finally {
        rendre();
      }
    },
    [nettoyer, snapshot?.device?.id]
  );

  const demander = useCallback(() => {
    void (async () => {
      const [debut, locaux] = await Promise.all([
        lireEnSouffrance(),
        lirePerissablesLocaux(),
      ]);
      setAvant(debut);
      setApres(debut);
      setPerissables(locaux);
      setEtape("confirmation");
    })();
  }, []);

  /**
   * ⚠ **Le verrou est pris sur les DEUX chemins, file vide comprise.**
   *
   * C'est le chemin « rien à envoyer » qui était le plus exposé : il allait
   * droit au nettoyage sans jamais toucher au verrou, si bien qu'un cycle
   * automatique pouvait tourner pendant toute la purge.
   */
  const confirmer = useCallback(() => {
    void executer(nbEnFile(avant) > 0);
  }, [avant, executer]);

  const valeur = useMemo<ValeurDeconnexion>(
    () => ({ demander, enCours: etape !== "repos" }),
    [demander, etape]
  );

  const conf = confirmationAvant(avant, perissables);
  const impasse = messageImpasse(avant, apres, enLigne);
  // Depuis `(locked)`, « Opérations à corriger » n'est pas atteignable : l'écran
  // vit dans `(app)`. Proposer un bouton qui ne mène nulle part serait pire que
  // de ne rien proposer.
  const dansApp = status === "ready";

  return (
    <Contexte.Provider value={valeur}>
      {children}

      <Dialog
        ouvert={etape === "confirmation"}
        onFermer={() => setEtape("repos")}
        titre={conf.titre}
        description={conf.message}
        actions={
          <>
            <Button fullWidth onPress={confirmer}>
              {conf.action}
            </Button>
            <Button fullWidth variant="outline" onPress={() => setEtape("repos")}>
              Annuler
            </Button>
          </>
        }
      />

      <Dialog
        ouvert={etape === "impasse"}
        onFermer={() => setEtape("repos")}
        titre={impasse.titre}
        description={impasse.message}
        actions={
          <>
            {impasse.offreReessayer ? (
              <Button fullWidth onPress={() => void executer(true)}>
                Réessayer
              </Button>
            ) : null}
            {impasse.offreCorriger && dansApp ? (
              <Button
                fullWidth
                onPress={() => {
                  setEtape("repos");
                  router.push("/(app)/appareil/operations");
                }}
              >
                Voir les opérations
              </Button>
            ) : null}
            {/* L'issue qui ne détruit rien, et qui empêche quand même la fusion :
                la base garde son estampille, et le filet d'entrée arbitrera à la
                connexion suivante. */}
            <Button fullWidth variant="outline" onPress={() => void partirSansEffacer()}>
              Se déconnecter sans effacer
            </Button>
            <Button fullWidth variant="outline" onPress={() => setEtape("repos")}>
              Annuler
            </Button>
          </>
        }
      />

      {/* ⚠ Un verrou occupé n'est PAS une panne de réseau, et le confondre avec
          une panne envoie le marchand chercher du réseau qui est déjà là. On
          n'a pas essayé : un autre cycle tournait. */}
      <Dialog
        ouvert={etape === "occupe"}
        onFermer={() => setEtape("repos")}
        titre={MESSAGE_OCCUPE.titre}
        description={MESSAGE_OCCUPE.message}
        actions={
          <>
            <Button fullWidth onPress={() => void executer(nbEnFile(avant) > 0)}>
              Réessayer
            </Button>
            <Button fullWidth variant="outline" onPress={() => void partirSansEffacer()}>
              Se déconnecter sans effacer
            </Button>
            <Button fullWidth variant="outline" onPress={() => setEtape("repos")}>
              Annuler
            </Button>
          </>
        }
      />

      {/* ⚠ Une surcouche OPAQUE, pas le voile d'un `Dialog` : derrière elle, le
          groupe `(app)` se démonte et la base se vide. Un voile translucide
          laisserait voir les écrans se vider un à un. */}
      {PHRASE[etape] ? (
        <View className="absolute inset-0 items-center justify-center gap-4 bg-background">
          <Spinner />
          <Text variant="muted">{PHRASE[etape]}</Text>
        </View>
      ) : null}
    </Contexte.Provider>
  );
}

export function useDeconnexion(): ValeurDeconnexion {
  const valeur = useContext(Contexte);
  if (!valeur) {
    throw new Error("useDeconnexion doit être appelé sous <DeconnexionProvider>.");
  }
  return valeur;
}
