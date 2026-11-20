/**
 * Où ranger un secret de session : le Keystore, et un repli quand il refuse.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CERTAINS TERMINAUX N'ONT PAS DE KEYSTORE QUI FONCTIONNE.                 │
 * │                                                                          │
 * │ Relevé sur une carte Rockchip rk3568 sous Android 11 : le service        │
 * │ Keymaster du système (OP-TEE) plante sur une attestation de clé          │
 * │ (`SIGSEGV` dans `libRkkeymaster_portable.so`, `generate_attestation`),   │
 * │ et le démon keystore garde ensuite une liaison morte vers lui            │
 * │ (`DEAD_OBJECT`). Toute écriture échoue alors, pour TOUTES les            │
 * │ applications, jusqu'au redémarrage - les services Google compris. Le     │
 * │ marchand lisait « ExpoSecureStore.setValueWithKeyAsync has been          │
 * │ rejected » sous le bouton « Se connecter », et ne pouvait plus jamais    │
 * │ ouvrir sa caisse.                                                        │
 * │                                                                          │
 * │ Le repli range le secret dans le stockage PRIVÉ de l'application. C'est  │
 * │ la protection de la base locale, qui n'est pas chiffrée non plus :       │
 * │ `allowBackup=false`, et seul un appareil rooté y accède. Un terminal     │
 * │ volé livre déjà le fichier SQLite ; la défense reste la révocation de    │
 * │ l'appareil (voir §5.5 du CLAUDE.md). Refuser la connexion à un terminal  │
 * │ dont le Keystore est en panne ne protège rien : il ne vend plus, c'est   │
 * │ tout.                                                                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Trois règles, et c'est l'ordre qui garantit qu'aucune valeur périmée ne sort :
 *
 * 1. **Une fois le repli actif, toutes les écritures y vont**, même si le
 *    Keystore remarche entre-temps. Sinon un jeton de rafraîchissement tourné
 *    partirait au Keystore pendant que le repli garderait l'ancien, que le
 *    serveur a mis sur liste noire : la session serait condamnée au
 *    rafraîchissement suivant.
 * 2. **Le repli se lit en premier.** Une clé absente du repli a été écrite au
 *    Keystore AVANT la bascule et jamais réécrite depuis : c'est sa dernière
 *    valeur. Une paire écrite à cheval sur la bascule se relit donc entière.
 * 3. **Le repli ne s'éteint qu'à la déconnexion** (`reinitialiser`), quand
 *    plus rien n'y vit : la connexion suivante retente le Keystore.
 *
 * Module PUR : les deux coffres sont injectés, ce qui rend la règle éprouvable
 * sans appareil. Le branchement vit dans `storage.ts`.
 */

/** Un endroit où ranger des chaînes. Chaque opération peut lever. */
export interface Coffre {
  lire(cle: string): Promise<string | null>;
  ecrire(cle: string, valeur: string): Promise<void>;
  effacer(cle: string): Promise<void>;
}

/** Le repli : un coffre qui sait dire s'il a pris le relais. */
export interface CoffreDeRepli extends Coffre {
  actif(): Promise<boolean>;
  activer(): Promise<void>;
  /** Éteint le repli ET efface tout ce qu'il contient. */
  vider(): Promise<void>;
}

/**
 * La phrase que lit le marchand quand même le repli refuse. Le message natif
 * (« Keystore operation failed ») ne dit rien de ce qu'il faut faire.
 */
export const MESSAGE_RANGEMENT_IMPOSSIBLE =
  "Ce terminal n'a pas pu enregistrer votre session. Redémarrez-le, puis reconnectez-vous.";

export interface Rangement {
  lire(cle: string): Promise<string | null>;
  ecrire(cle: string, valeur: string): Promise<void>;
  effacer(cle: string): Promise<void>;
  /** À appeler quand toute la session vient d'être effacée. */
  reinitialiser(): Promise<void>;
}

async function sansErreur(geste: () => Promise<unknown>): Promise<void> {
  try {
    await geste();
  } catch {
    // Best-effort : l'appelant a déjà ce qu'il lui faut.
  }
}

export function creerRangement(options: {
  sur: Coffre;
  repli: CoffreDeRepli;
  /** Prévenu UNE fois par bascule, avec l'erreur du Keystore. */
  signalerBascule?: (erreur: unknown) => void;
}): Rangement {
  const { sur, repli, signalerBascule } = options;

  async function enRepli(): Promise<boolean> {
    try {
      return await repli.actif();
    } catch {
      return false;
    }
  }

  return {
    async lire(cle) {
      try {
        const valeur = await repli.lire(cle);
        if (valeur !== null) return valeur;
      } catch {
        // Un repli illisible ne doit pas masquer ce que le Keystore détient.
      }
      try {
        return await sur.lire(cle);
      } catch {
        // Un Keystore momentanément indisponible (appareil qui se déverrouille)
        // ne doit pas ressembler à une session absente : l'appelant distingue
        // `null` de l'échec par le contexte, et on ne détruit jamais sur cette voie.
        return null;
      }
    },

    async ecrire(cle, valeur) {
      let vientDeBasculer = false;
      let erreurKeystore: unknown;

      if (!(await enRepli())) {
        try {
          await sur.ecrire(cle, valeur);
          return;
        } catch (erreur) {
          vientDeBasculer = true;
          erreurKeystore = erreur;
        }
      }

      try {
        if (vientDeBasculer) await repli.activer();
        await repli.ecrire(cle, valeur);
      } catch {
        throw new Error(MESSAGE_RANGEMENT_IMPOSSIBLE);
      }
      // La copie restée au Keystore serait plus ancienne : on la retire.
      await sansErreur(() => sur.effacer(cle));

      if (vientDeBasculer) signalerBascule?.(erreurKeystore);
    },

    async effacer(cle) {
      await Promise.all([
        sansErreur(() => repli.effacer(cle)),
        sansErreur(() => sur.effacer(cle)),
      ]);
    },

    async reinitialiser() {
      await sansErreur(() => repli.vider());
    },
  };
}
