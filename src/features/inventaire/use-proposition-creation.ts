/**
 * Proposer de créer l'article qu'une recherche n'a pas trouvé.
 *
 * Un seul endroit fabrique l'action, pour le comptoir, l'écran de scan,
 * l'onglet Articles et les feuilles (réquisition, devis, mouvements, appro) :
 * la permission, la garde contre une création déjà en file et la route ne
 * peuvent alors pas dire deux choses d'un écran à l'autre.
 *
 * ⚠ Aucun changement de rôle : seuls ceux qui ont déjà `products.create`
 *   voient la proposition.
 */
import { useCallback } from "react";
import { router } from "expo-router";

import { useLecture } from "@/data/live";
import { creationDejaEnFile, parametresCreationArticle } from "@/data/terme-creation";
import { catalogueEnAttente } from "@/features/inventaire/actes";
import { useSession } from "@/session/provider";

export interface PropositionCreation {
  /** `null` : rien à proposer (pas le droit, terme vide, ou déjà en file). */
  action: { label: string; onPress: () => void } | null;
  /** Le nom de l'article déjà créé ici et encore en file, à NOMMER. */
  dejaEnFile: string | null;
}

export function usePropositionCreation(): (
  terme: string,
  options?: {
    scanne?: boolean;
    /**
     * Avant de partir : une FEUILLE range son brouillon et se ferme. Un écran
     * plein n'a rien à ranger, la pile le garde monté.
     */
    avant?: () => void;
  }
) => PropositionCreation {
  const { can } = useSession();
  const peut = can("products.create");
  const { donnees } = useLecture(catalogueEnAttente, { tables: ["outbox_operations"] });
  const enFile = donnees?.articles;

  return useCallback(
    (terme, options = {}) => {
      if (!peut) return { action: null, dejaEnFile: null };
      const deja = creationDejaEnFile(terme, enFile ?? []);
      if (deja) return { action: null, dejaEnFile: deja };
      const params = parametresCreationArticle(terme, { scanne: options.scanne, retour: true });
      if (!params) return { action: null, dejaEnFile: null };
      const valeur = params.nom ?? params.codeBarres ?? "";
      return {
        action: {
          label: params.nom ? `Créer « ${valeur} »` : "Créer l'article de ce code",
          onPress: () => {
            options.avant?.();
            router.push({ pathname: "/article/nouveau", params });
          },
        },
        dejaEnFile: null,
      };
    },
    [peut, enFile]
  );
}

/** La phrase qui nomme une création déjà en file. */
export function phraseDejaEnFile(nom: string): string {
  return `« ${nom} » a déjà été créé sur ce terminal et attend son envoi : il apparaîtra après la synchronisation.`;
}
