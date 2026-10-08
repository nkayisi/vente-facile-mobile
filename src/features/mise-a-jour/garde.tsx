/**
 * La porte de mise à jour, montée au-dessus du comptoir.
 *
 * **Elle enveloppe la porte d'abonnement, et l'ordre n'est pas ergonomique.**
 * On force une mise à jour précisément parce qu'on ne fait plus confiance au
 * binaire installé : laisser le marchand encaisser avec l'ancien code sous
 * prétexte qu'il doit d'abord régler son abonnement, ce serait laisser tourner
 * ce qu'on cherche à retirer. Et la dissymétrie tranche : une mise à jour peut
 * réparer un verdict d'abonnement faux, un paiement ne répare jamais un vieux
 * binaire.
 *
 * ⚠ **AUCUNE LECTURE DE BASE ICI.** Le décompte de ce qui n'est pas parti vit
 * dans le VOILE, qui ne monte que quand la porte est fermée. Lu ici, il ouvrait
 * un abonnement permanent à `outbox_operations` sur chaque terminal - donc un
 * agrégat rejoué à chaque vente, sur le chemin chaud du comptoir, pour un écran
 * qu'on ne verra pas. Un garde-fou de doctrine l'interdit désormais.
 *
 * Le pourquoi d'un voile plutôt que d'un état de session est écrit dans
 * `session/porte-voilee.tsx`, à un seul endroit.
 */
import { PorteVoilee } from "@/session/porte-voilee";
import { useSession } from "@/session/provider";

import { jugerMiseAJour } from "./porte";
import { versionInstallee } from "./version-installee";
import { VoileMiseAJour } from "./voile";

export function GardeMiseAJour({ children }: { children: React.ReactNode }) {
  const { snapshot } = useSession();

  const verdict = jugerMiseAJour(snapshot?.app_update, versionInstallee());

  return (
    <PorteVoilee
      ouverte={verdict.ouvert}
      // Le voile n'est pas fabriqué quand la porte est ouverte : ses hooks -
      // dont la lecture de la file - ne tournent alors pas du tout.
      voile={
        verdict.ouvert ? null : (
          <VoileMiseAJour exigence={snapshot?.app_update ?? null} />
        )
      }
    >
      {children}
    </PorteVoilee>
  );
}
