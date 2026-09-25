/**
 * Verrou local de l'application : celui de l'APPAREIL, et aucun autre.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ NOUS NE POSSÉDONS PLUS DE SECRET. LE SYSTÈME S'EN CHARGE.               │
 * │                                                                          │
 * │ Ce module tenait un code à quatre ou six chiffres, haché en SHA-256      │
 * │ salé, avec son compteur d'essais et sa temporisation. Il argumentait     │
 * │ longuement qu'aucune dérivation ne rend 10 000 possibilités résistantes  │
 * │ à une attaque hors ligne - ce qui était vrai, et reste le meilleur       │
 * │ argument CONTRE le fait d'en tenir un.                                   │
 * │                                                                          │
 * │ Le marchand connaît déjà le code de son téléphone. Lui en imposer un     │
 * │ second, c'est un secret de plus à retenir, un de plus à oublier, et un   │
 * │ de plus à écrire au dos du terminal. On demande donc au système          │
 * │ d'authentifier son propriétaire, et il choisit lui-même par quoi : code, │
 * │ schéma, mot de passe, empreinte ou visage.                               │
 * │                                                                          │
 * │ Les défenses réelles passent de trois à deux, et ce sont les deux qui    │
 * │ tenaient déjà :                                                          │
 * │   1. l'identifiant vit dans le matériel (Keystore Android, Trousseau     │
 * │      iOS), et c'est le système qui le vérifie - nous ne le voyons        │
 * │      jamais, donc nous ne pouvons pas le perdre ;                        │
 * │   2. le gérant révoque le terminal depuis le back-office, ce qui coupe   │
 * │      l'accès serveur quoi qu'il arrive au verrou local.                  │
 * │                                                                          │
 * │ La troisième, notre compteur d'essais, appartient désormais à l'OS. On   │
 * │ ne peut ni le lire, ni le remettre à zéro, ni forcer une reconnexion par │
 * │ mot de passe après dix échecs. C'est la contrepartie assumée, et elle    │
 * │ est compensée par une issue de secours PERMANENTE sur l'écran de         │
 * │ déverrouillage (voir `(locked)/unlock.tsx`).                             │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ⚠ UN TERMINAL SANS VERROU D'ÉCRAN N'A AUCUNE BARRIÈRE, ET C'EST UN      │
 * │   CHOIX EXPLICITE DU PRODUIT.                                           │
 * │                                                                          │
 * │ Beaucoup de terminaux de caisse partagés n'ont jamais reçu de            │
 * │ verrouillage : `getEnrolledLevelAsync()` rend alors `NONE`, et il n'y a  │
 * │ littéralement rien à quoi s'authentifier. L'application s'ouvre          │
 * │ directement plutôt que d'exiger la pose d'un verrou, ce qui ferait d'un  │
 * │ réglage système un cul-de-sac au comptoir. Elle le DIT, sans rien        │
 * │ bloquer : voir le bandeau de `profil.tsx`.                               │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import * as LocalAuthentication from "expo-local-authentication";

/**
 * Ce que le SYSTÈME sait vérifier sur cet appareil.
 *
 * ⚠ CE N'EST PAS `isEnrolledAsync()`, QUI NE PARLE QUE DE BIOMÉTRIE. Un
 * terminal sans lecteur d'empreinte mais protégé par un schéma rend `false`
 * là, et `SECRET` ici : s'en remettre à la première ferait passer pour
 * « sans verrou » la configuration la plus répandue du parc visé.
 */
export type NiveauVerrou = LocalAuthentication.SecurityLevel;

export async function niveauDeVerrou(): Promise<NiveauVerrou> {
  try {
    return await LocalAuthentication.getEnrolledLevelAsync();
  } catch {
    // ⚠ ON OUVRE, ET CELA SE LIT À L'ENVERS SANS CETTE PHRASE. Un appareil
    // incapable de dire s'il a un verrou ne peut pas en honorer un : rendre
    // `SECRET` par prudence enfermerait le marchand derrière une invitation
    // que le système refusera ensuite d'afficher. C'est le même arbitrage que
    // `storage.ts` fait pour le trousseau - sur cette voie, on ne détruit
    // jamais et on ne bloque jamais.
    return LocalAuthentication.SecurityLevel.NONE;
  }
}

/** Vrai quand le système a de quoi authentifier son propriétaire. */
export async function appareilVerrouille(): Promise<boolean> {
  return (await niveauDeVerrou()) !== LocalAuthentication.SecurityLevel.NONE;
}

/**
 * Le verdict d'une tentative de déverrouillage.
 *
 * ⚠ IL N'Y A PAS DE `lockout_permanent`, et ce n'est pas un oubli.
 * `LocalAuthenticationError` ne le déclare pas, et les deux natifs écrasent le
 * cas permanent sur le transitoire (`ERROR_LOCKOUT, ERROR_LOCKOUT_PERMANENT ->
 * "lockout"` côté Android, `return "lockout"` côté iOS). On ne peut donc pas
 * distinguer « attendez trente secondes » de « cette empreinte est morte », et
 * c'est POUR CELA que l'issue de secours de l'écran est inconditionnelle.
 */
export type Deverrouillage =
  | { statut: "ok" }
  | { statut: "sans_verrou" }
  | { statut: "annule" }
  | { statut: "temporise" }
  | { statut: "indisponible"; motif: string };

const ANNULATIONS = ["user_cancel", "app_cancel", "system_cancel", "user_fallback"];
/** Le système dit lui-même qu'il n'a rien à vérifier. */
const SANS_VERROU = ["not_enrolled", "passcode_not_set"];

/**
 * Demande au système d'authentifier son propriétaire.
 *
 * ⚠ LE NIVEAU EST SONDÉ AVANT D'INVITER, et c'est le filet anti-enfermement.
 * Le marchand peut retirer le verrou de son téléphone pendant que
 * l'application est verrouillée ; sans cette sonde, l'invitation échouerait en
 * `not_enrolled` à chaque appui et l'écran n'aurait plus aucune issue. On rend
 * `sans_verrou` SANS rien afficher, et l'appelant fait entrer.
 */
export async function deverrouiller(): Promise<Deverrouillage> {
  if (!(await appareilVerrouille())) return { statut: "sans_verrou" };

  try {
    const resultat = await LocalAuthentication.authenticateAsync({
      promptMessage: "Déverrouiller Vente Facile",
      // ⚠ `disableDeviceFallback` N'EST PLUS POSÉ. Il valait `true`, pour
      // garder NOTRE code et NOTRE compteur ; le défaut de la bibliothèque est
      // `false`, donc le système propose le code de l'appareil quand la
      // biométrie échoue ou n'existe pas. C'est tout l'objet de ce lot.
      fallbackLabel: "Code de l'appareil",
    });
    if (resultat.success) return { statut: "ok" };

    const motif = resultat.error;
    if (SANS_VERROU.includes(motif)) return { statut: "sans_verrou" };
    if (ANNULATIONS.includes(motif)) return { statut: "annule" };
    if (motif === "lockout") return { statut: "temporise" };
    return { statut: "indisponible", motif };
  } catch {
    // Une exception du module n'est pas un refus d'identité : on n'invente ni
    // succès ni verdict, on laisse l'écran proposer de réessayer.
    return { statut: "indisponible", motif: "unknown" };
  }
}

/**
 * De quoi NOMMER le moyen sur le bouton : « Empreinte digitale » se reconnaît
 * là où « Déverrouiller » ne dit pas par quoi.
 */
export async function libelleBiometrie(): Promise<string | null> {
  try {
    const [materiel, enrole, types] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
      LocalAuthentication.supportedAuthenticationTypesAsync(),
    ]);
    if (!materiel || !enrole) return null;
    return types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)
      ? "Reconnaissance faciale"
      : "Empreinte digitale";
  } catch {
    return null;
  }
}
