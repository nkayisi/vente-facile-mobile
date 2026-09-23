/**
 * Rapport de plantage.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN RAPPORT DE PLANTAGE NE DOIT EMPORTER NI CLIENT, NI MONTANT, NI JETON. │
 * │                                                                          │
 * │ Ce terminal manipule des noms de clients, des numéros de téléphone, des  │
 * │ soldes de crédit et des jetons d'appareil. Un service tiers qui les      │
 * │ recevrait ferait sortir du pays des données que le marchand nous a       │
 * │ confiées pour tenir sa caisse, pas pour être analysées ailleurs.         │
 * │                                                                          │
 * │ D'où trois verrous, et non un : `sendDefaultPii` à faux, les fils        │
 * │ d'ariane de console et de réseau COUPÉS, et un `beforeSend` qui rature   │
 * │ ce qui ressemble encore à une donnée personnelle.                        │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * **Sans DSN, rien ne s'initialise, et ce n'est pas une erreur.** Le
 * développement et les compilations internes n'ont pas de service de collecte ;
 * lever au démarrage pour un outil d'observation empêcherait de vendre à cause
 * d'un outil censé aider. `EXPO_PUBLIC_SENTRY_DSN` n'est posé nulle part : il
 * est à ajouter aux profils `preview` et `production` d'`eas.json` le jour où
 * un projet Sentry existe. ⚠ Une valeur VIDE y est REFUSÉE par EAS CLI, qui
 * répond « eas.json is not valid » et n'entame même pas la compilation : on
 * retire la clé, on ne la met pas à la chaîne vide.
 */
import * as Sentry from "@sentry/react-native";

import { raturer } from "./rature";

/** Vrai quand la collecte est configurée. */
export function observationActive(): boolean {
  return Boolean(process.env.EXPO_PUBLIC_SENTRY_DSN);
}

export function initSentry(): void {
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    // Le profil de compilation, pas `__DEV__` : préproduction et production
    // doivent se distinguer dans la console, sinon un plantage de test se mêle
    // aux vrais.
    environment: process.env.EAS_BUILD_PROFILE ?? "development",
    sendDefaultPii: false,
    // Un POS travaille sur 2G. Une trace sur dix suffit à voir une lenteur, et
    // ne prend pas la bande passante dont la synchronisation a besoin.
    tracesSampleRate: 0.1,
    // Les requêtes en échec ne sont pas capturées : leur URL porte les
    // identifiants de client, et leur corps le reste. C'est déjà le défaut du
    // SDK ; on l'écrit pour que personne ne l'active en croyant gagner du
    // diagnostic.
    enableCaptureFailedRequests: false,
    integrations: (defaut) =>
      defaut.filter(
        // ┌──────────────────────────────────────────────────────────────────┐
        // │ ON NE RETIRE QUE `Breadcrumbs`, ET SÛREMENT PAS LES              │
        // │ GESTIONNAIRES D'ERREURS.                                         │
        // │                                                                  │
        // │ Le nom trompe : `ReactNativeErrorHandlers` ne pose AUCUN fil     │
        // │ d'ariane. Il installe le gestionnaire global d'`ErrorUtils` et   │
        // │ le suivi des promesses non rattrapées                            │
        // │ (`reactnativeerrorhandlers.js`, `setupErrorUtilsGlobalHandler`). │
        // │ Le retirer laissait le SDK démarrer, la console dire « Sentry    │
        // │ initialisé », et AUCUN plantage non rattrapé ne partir jamais -  │
        // │ y compris celui du montage que `_layout.tsx` dit vouloir         │
        // │ attraper en initialisant tôt. Un outil d'observation muet est    │
        // │ pire qu'un outil absent : on croit voir.                         │
        // │                                                                  │
        // │ `Breadcrumbs`, lui, est bien le fautif : il recopie la CONSOLE   │
        // │ (où passent des corps de requête entiers) et les requêtes XHR    │
        // │ (dont les URL portent les identifiants de client).               │
        // └──────────────────────────────────────────────────────────────────┘
        (i) => i.name !== "Breadcrumbs"
      ),
    beforeSend: (evenement) => raturer(evenement) as typeof evenement,
    beforeBreadcrumb: (fil) => raturer(fil) as typeof fil,
  });
}

/**
 * Signale une erreur que l'application a RATTRAPÉE.
 *
 * À employer avec parcimonie : un refus métier n'est pas un incident, et
 * remonter chaque quarantaine noierait les vrais plantages. Réservé à ce qui ne
 * devrait pas arriver.
 */
export function signaler(erreur: unknown, contexte?: Record<string, unknown>): void {
  if (!observationActive()) return;
  Sentry.captureException(
    erreur,
    contexte ? { extra: raturer(contexte) as Record<string, unknown> } : undefined
  );
}
