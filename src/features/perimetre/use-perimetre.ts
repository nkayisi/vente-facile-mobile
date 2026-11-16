/**
 * Le hook que tout écran filtrable consomme.
 *
 * Il assemble le membre et l'équipe (session), les entrepôts qu'il sait nommer
 * et le choix de l'écran, et rend l'offre que `offreDePerimetre` a décidée.
 * Les écrans n'ont ainsi RIEN à savoir des règles de périmètre : ils affichent
 * ce qu'on leur donne et lisent `applique`.
 *
 * ⚠ IL VIT DANS `features/`, PAS DANS `ui/`. Il tire (par `use-entrepots`)
 * `@/data/stock`, qui ouvre
 * la base SQLite au chargement : dans `src/ui/`, il rendrait
 * `import { Text } from "@/ui"` impossible à charger dans un test pur et
 * casserait `ui/doctrine.test.ts` par ricochet.
 */
import { useMemo } from "react";

import { useSession } from "@/session/provider";

import {
  offreDePerimetre,
  PERIMETRE_VIDE,
  type FiltrePerimetre,
  type MembrePerimetre,
  type OffrePerimetre,
} from "./filtre-perimetre";
import { useEntrepotsDuMembre } from "./use-entrepots";

/**
 * @param choix       Ce que l'écran a retenu (state ou filtres persistés).
 * @param avecAuteur  Faux là où la donnée n'a pas d'auteur : stock, inventaire,
 *                    transferts, ajustements. Le filtre « Utilisateur » s'y
 *                    ferme alors avec son motif, plutôt que de disparaître :
 *                    un contrôle retiré se lit comme une fonction manquante.
 *
 * ⚠ LE PÉRIMÈTRE SE LIT DANS L'INSTANTANÉ, ET LUI SEUL. Le rôle, la case, la
 * permission « Voir tout », les affectations et l'annuaire viennent du même
 * réveil : les croiser avec une table locale tirée à un autre moment donnait
 * un entrepôt affecté mais absent du filtre jusqu'au tirage suivant.
 * `useEntrepotsDuMembre` ne garde la table locale qu'en repli.
 */
export function usePerimetre(
  choix: FiltrePerimetre,
  avecAuteur: boolean
): OffrePerimetre {
  const { snapshot } = useSession();
  const { membre, tous } = useEntrepotsDuMembre();

  // `undefined` quand la clé manque (instantané antérieur au lot) OU quand le
  // serveur a fermé le roster : dans les deux cas, le client ne CONNAÎT pas
  // l'équipe, et il le dit. Un roster réellement vide arrive en `[]`.
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
      offreDePerimetre({
        membre,
        moi: snapshot?.user.id ?? null,
        tousLesEntrepots: tous,
        equipe,
        choix,
        avecAuteur,
      }),
    [membre, snapshot?.user.id, tous, equipe, choix, avecAuteur]
  );
}

/**
 * Le périmètre d'un écran SANS filtre : le défaut du membre, rien de plus.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ « PARTOUT », Y COMPRIS LÀ OÙ IL N'Y A RIEN À CHOISIR (2026-11-16).      │
 * │                                                                          │
 * │ La base locale porte ce que le membre a le DROIT de lire, donc les       │
 * │ ventes de ses collègues sous « Voir tout dans son entrepôt » et les      │
 * │ autres entrepôts sous « Consulter tous ». Un écran qui les lirait sans   │
 * │ périmètre - le hub des ventes, les règlements en attente, la fiche d'un  │
 * │ client - montrerait au caissier ce que la règle ne lui montre que sur    │
 * │ filtre. Ces écrans lisent donc ceci.                                     │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function usePerimetreParDefaut(avecAuteur: boolean): FiltrePerimetre {
  return usePerimetre(PERIMETRE_VIDE, avecAuteur).applique;
}
