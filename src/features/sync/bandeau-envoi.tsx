/**
 * Le bandeau d'un acte qui n'est pas encore arrivé au serveur, avec son issue.
 *
 * Remplace une vingtaine de `Banner` recopiés, dont pas un ne proposait
 * d'envoyer ce qu'il annonçait comme en attente. La DÉCISION (quel ton, quelle
 * phrase, et surtout s'il y a un bouton) vit dans `bandeau.ts`, module pur et
 * testé ; ce fichier ne fait que la rendre.
 *
 * ⚠ Il vit dans `features/sync/` et non dans `src/ui/` : `useSynchronisation`
 * tire `@/sync` → `@/db/client`, qui appelle `SQLite.openDatabaseSync` AU
 * CHARGEMENT du module. Dans `src/ui/`, il rendrait `import { Text } from
 * "@/ui"` impossible à charger dans un test pur, et casserait
 * `ui/doctrine.test.ts` par ricochet. C'est le motif déjà écrit en tête de
 * `features/inventaire/actes.ts`.
 */
import type { EtatEnvoi } from "@/sync";
import { Banner } from "@/ui";

import { contenuBandeau } from "./bandeau";
import { useSynchronisation } from "./provider";

export function BandeauEnvoi({
  envoi,
  titre,
  consequence,
}: {
  envoi: EtatEnvoi | undefined;
  /** Ce qui attend : « Ce retour attend son envoi ». */
  titre: string;
  /** Ce qui n'arrivera qu'après : « Le statut ne changera qu'après. » */
  consequence: string;
}) {
  const { enCours, lancer } = useSynchronisation();
  const c = contenuBandeau(envoi, { titre, consequence });
  if (!c) return null;

  return (
    <Banner
      tone={c.ton}
      title={c.titre}
      message={c.message}
      action={
        c.offreSynchronisation
          ? {
              // `enCours` vient du fournisseur : TOUS les bandeaux montés
              // passent en attente ensemble, ce qui est vrai - il n'y a qu'un
              // cycle. Le bandeau disparaît ensuite de lui-même, `useLecture`
              // écoutant déjà `outbox_operations`.
              label: enCours ? "Synchronisation…" : "Synchroniser",
              loading: enCours,
              onPress: () => void lancer("bandeau"),
            }
          : undefined
      }
    />
  );
}
