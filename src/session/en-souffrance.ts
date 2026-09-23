/**
 * Ce que ce terminal porte et que le serveur n'a PAS.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ TROIS DÉCISIONS S'APPUIENT SUR CE COMPTE, ET ELLES DÉTRUISENT.           │
 * │                                                                          │
 * │   - la modale de déconnexion, pour savoir si elle a le droit de vider ;  │
 * │   - `appliquerVerdictBase`, pour purger sans rien demander ou faire      │
 * │     arbitrer un humain ;                                                 │
 * │   - l'écran de reprise, pour NOMMER ce qui est en jeu.                   │
 * │                                                                          │
 * │ Trois copies de la même règle finiraient par diverger, et la divergence  │
 * │ se paierait en ventes effacées : la modale bloquerait pendant que le     │
 * │ filet purgerait, ou l'inverse.                                           │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ **LES PHOTOS EN FONT PARTIE, et c'est ce qu'on a oublié.** Une photo en
 * attente est la SEULE copie d'un fichier : le serveur ne l'a pas, et rien ne la
 * reconstitue. `viderDossierPhotos()` la détruit. C'est la même classe de perte
 * qu'une vente non envoyée, et elle doit se compter de la même façon.
 *
 * Les RÈGLES, elles, vivent dans `deconnexion-regles.ts`, qui n'ouvre pas la
 * base et se teste donc sans appareil. Ici, les entrées et sorties.
 */
import { compterEnAttente } from "@/features/pos/attente";
import { nbPhotosEnAttente } from "@/features/inventaire/photos";
import { compterDocuments } from "@/printing/jobs";
import { countByState } from "@/sync";

import { FILE_VIDE, type EtatFile } from "./deconnexion-regles";

/**
 * Le journal et les photos : tout ce qui n'a jamais atteint le serveur.
 *
 * ⚠ **Une base illisible rend UNE unité, jamais zéro.** On ne peut pas affirmer
 * qu'il n'y a rien à perdre ; on fait arbitrer plutôt que purger. Zéro serait la
 * réponse optimiste, et l'optimisme efface.
 */
export async function lireEnSouffrance(): Promise<EtatFile> {
  try {
    const [c, photos] = await Promise.all([countByState(), nbPhotosEnAttente()]);
    return {
      pending: c.pending,
      inflight: c.inflight,
      quarantined: c.quarantined,
      blocked: c.blocked,
      photos,
    };
  } catch {
    return { ...FILE_VIDE, pending: 1 };
  }
}

/** Ce qui est purement local et ne reviendra JAMAIS d'un serveur. */
export interface PerissablesLocaux {
  paniers: number;
  documents: number;
}

/**
 * Ce que la purge emporte sans que le serveur puisse le rendre.
 *
 * Ce n'est PAS une raison de bloquer : un panier rangé ne porte que des
 * identifiants de l'ancien établissement, il n'aurait plus de sens sous un
 * autre compte ; et les documents gardent leurs numéros sur le papier du
 * client. C'est une raison de le DIRE, parce que la confirmation promet que
 * tout « redescendra à la prochaine connexion » - et pour ces deux-là, c'est
 * faux.
 */
export async function lirePerissablesLocaux(): Promise<PerissablesLocaux> {
  try {
    const [paniers, documents] = await Promise.all([
      compterEnAttente(),
      compterDocuments(),
    ]);
    return { paniers, documents };
  } catch {
    // Un décompte illisible ne doit pas empêcher de se déconnecter : on se tait
    // plutôt que d'annoncer un chiffre faux.
    return { paniers: 0, documents: 0 };
  }
}
