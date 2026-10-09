/**
 * Charge le logo de l'établissement, une fois, au démarrage.
 *
 * Séparé de `logo-courant.ts` parce que celui-ci est lu par
 * `features/pos/ticket.ts`, dont les tests sont PURS : y faire entrer la
 * session tirerait `@/db/client`, qui ouvre SQLite au chargement.
 *
 * ⚠ LE LOGO S'EFFACE QUAND L'ÉTABLISSEMENT CHANGE. Sans cela, un marchand qui
 * bascule d'une organisation à l'autre imprimerait le logo de la précédente,
 * sur un document qui porte le nom de la nouvelle - pire que pas de logo.
 */
import { useEffect } from "react";

import { useSession } from "@/session/provider";

import { chargerLogo } from "./load-logo";
import { cheminCharge, poserLogo } from "./logo-courant";

export function useLogoDeLEtablissement(): void {
  const { snapshot } = useSession();
  const chemin = snapshot?.organization.logo ?? null;

  useEffect(() => {
    if (chemin === cheminCharge()) return;
    // On efface AVANT de charger : entre les deux, un ticket sort sans logo,
    // ce qui est juste - celui de l'établissement précédent serait faux.
    poserLogo(chemin, null);

    if (!chemin) return;
    let vivant = true;
    void chargerLogo(chemin).then((logo) => {
      // Un chargement lent qui aboutit APRÈS un changement d'établissement ne
      // doit pas reposer l'ancien logo.
      if (vivant && cheminCharge() === chemin) poserLogo(chemin, logo);
    });
    return () => {
      vivant = false;
    };
  }, [chemin]);
}
