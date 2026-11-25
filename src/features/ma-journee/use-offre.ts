/**
 * Le hook de « Ma journée » : la règle du noyau, branchée sur la session.
 *
 * Miroir de `features/perimetre/use-perimetre.ts` : mêmes sources (le membre
 * et l'équipe de l'instantané, les entrepôts qu'il sait nommer), seule la
 * règle change - ici le défaut est « mes opérations » pour TOUS les rôles, et
 * les filtres élargissent.
 *
 * ⚠ IL VIT DANS `features/`, PAS DANS `ui/` : `use-entrepots` ouvre la base.
 */
import { useMemo } from "react";

import { useSession } from "@/session/provider";

import type { FiltrePerimetre, MembrePerimetre } from "../perimetre/filtre-perimetre";
import { useEntrepotsDuMembre } from "../perimetre/use-entrepots";

import { offreDeLaJournee, type OffreJournee } from "./offre";

export function useOffreDeLaJournee(choix: FiltrePerimetre): OffreJournee {
  const { snapshot } = useSession();
  const { membre, tous } = useEntrepotsDuMembre();

  // `undefined` : roster inconnu (instantané ancien, ou fermé par le serveur).
  // Un roster réellement vide arrive en `[]`.
  const equipe: MembrePerimetre[] | undefined = useMemo(() => {
    const t = snapshot?.team;
    if (!t || !t.visible) return undefined;
    return t.members.map((m) => ({
      userId: m.user_id,
      nom: m.name,
      role: m.role,
      entrepots: m.warehouses,
    }));
  }, [snapshot?.team]);

  return useMemo(
    () =>
      offreDeLaJournee({
        membre,
        moi: snapshot?.user.id ?? null,
        tousLesEntrepots: tous,
        equipe,
        choix,
      }),
    [membre, snapshot?.user.id, tous, equipe, choix]
  );
}
