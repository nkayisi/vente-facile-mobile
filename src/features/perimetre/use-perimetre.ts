/**
 * Le hook que tout écran filtrable consomme.
 *
 * Il assemble les trois sources - le rôle et l'équipe (session), les entrepôts
 * (base locale), le choix de l'écran - et rend l'offre que `offreDePerimetre`
 * a décidée. Les écrans n'ont ainsi RIEN à savoir des règles de rôle : ils
 * affichent ce qu'on leur donne et lisent `applique`.
 *
 * ⚠ IL VIT DANS `features/`, PAS DANS `ui/`. Il tire `@/data/stock`, qui ouvre
 * la base SQLite au chargement : dans `src/ui/`, il rendrait
 * `import { Text } from "@/ui"` impossible à charger dans un test pur et
 * casserait `ui/doctrine.test.ts` par ricochet.
 */
import { useMemo } from "react";

import { useLecture } from "@/data/live";
import { entrepotsSansValorisation } from "@/data/stock";
import { useSession } from "@/session/provider";

import {
  offreDePerimetre,
  type FiltrePerimetre,
  type MembrePerimetre,
  type OffrePerimetre,
} from "./filtre-perimetre";

// ⚠ `warehouses` SEULE. `entrepotsSansValorisation` ne touche pas au stock, donc ce
// hook ne se relit pas à chaque vente - ce qu'il ferait avec `entrepots()`, sur
// l'écran ouvert, pour trois noms de dépôt.
const TABLES = ["warehouses"];

/**
 * @param choix       Ce que l'écran a retenu (state ou filtres persistés).
 * @param avecAuteur  Faux là où la donnée n'a pas d'auteur : stock, inventaire,
 *                    transferts, ajustements. Le filtre « Utilisateur » s'y
 *                    ferme alors avec son motif, plutôt que de disparaître :
 *                    un contrôle retiré se lit comme une fonction manquante.
 */
export function usePerimetre(
  choix: FiltrePerimetre,
  avecAuteur: boolean
): OffrePerimetre {
  const { snapshot } = useSession();
  const { donnees: depots } = useLecture(entrepotsSansValorisation, { tables: TABLES });

  // `?? []` fabrique un tableau NEUF à chaque rendu : sans ce mémo, l'offre
  // changerait d'identité en permanence et relancerait tout effet qui en
  // dépend. Le dépôt a déjà payé cette famille de défaut sur l'écran
  // d'encaissement, qui tournait en boucle sans rien afficher.
  const assignes = useMemo(
    () => snapshot?.membership.assigned_warehouses ?? [],
    [snapshot?.membership.assigned_warehouses]
  );

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
        role: snapshot?.membership.role ?? null,
        moi: snapshot?.user.id ?? null,
        assignes,
        tousLesEntrepots: depots ?? [],
        equipe,
        choix,
        avecAuteur,
      }),
    [
      snapshot?.membership.role,
      snapshot?.user.id,
      assignes,
      depots,
      equipe,
      choix,
      avecAuteur,
    ]
  );
}
