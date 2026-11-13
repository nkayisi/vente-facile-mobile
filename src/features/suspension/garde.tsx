/**
 * La porte d'un établissement suspendu, montée au-dessus du comptoir.
 *
 * **Entre la mise à jour et l'abonnement**, et l'ordre a ses raisons : une
 * mise à jour obligatoire passe avant tout (le binaire installé n'est plus
 * fiable) ; une suspension passe avant l'abonnement, parce que régler
 * l'abonnement d'un établissement suspendu ne le rouvrirait pas, et que le
 * voile d'abonnement enverrait payer pour rien.
 *
 * ⚠ **AUCUNE LECTURE DE BASE ICI** : le décompte de la file vit dans le voile,
 * qui ne monte que porte fermée (même règle que les deux autres gardes).
 */
import { PorteVoilee } from "@/session/porte-voilee";
import { useSession } from "@/session/provider";

import { etablissementSuspendu } from "./porte";
import { VoileSuspension } from "./voile";

export function GardeSuspension({ children }: { children: React.ReactNode }) {
  const { snapshot } = useSession();
  const organisation = snapshot?.organization;
  const suspendu = etablissementSuspendu(organisation);

  return (
    <PorteVoilee
      ouverte={!suspendu}
      voile={suspendu ? <VoileSuspension nom={organisation?.name ?? ""} /> : null}
    >
      {children}
    </PorteVoilee>
  );
}
