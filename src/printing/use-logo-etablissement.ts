/**
 * Garde le logo de l'établissement prêt à imprimer.
 *
 * Séparé de `logo-courant.ts` parce que celui-ci est lu par
 * `features/pos/ticket.ts`, dont les tests sont PURS : y faire entrer la
 * session tirerait `@/db/client`, qui ouvre SQLite au chargement.
 *
 * Trois réveils, et il faut les trois : le logo CHANGE (le chemin bouge),
 * chaque synchronisation (`fetched_at` bouge : un échec précédent se rattrape
 * dès que le réseau revient), et le retour au premier plan. Le chargement lui-
 * même vit dans `assurer-logo.ts`, hors de React : un démontage ne le perd plus.
 *
 * ⚠ LE LOGO S'EFFACE QUAND L'ÉTABLISSEMENT CHANGE : celui de la précédente, sur
 * un document qui porte le nom de la nouvelle, serait pire que pas de logo.
 */
import { useEffect } from "react";
import { AppState } from "react-native";

import { useSession } from "@/session/provider";

import { assurerLogo } from "./assurer-logo";

export function useLogoDeLEtablissement(): void {
  const { snapshot } = useSession();
  const organisationId = snapshot?.organization.id ?? null;
  const chemin = snapshot?.organization.logo ?? null;
  const releve = snapshot?.fetched_at ?? null;

  useEffect(() => {
    void assurerLogo(organisationId, chemin);
  }, [organisationId, chemin, releve]);

  useEffect(() => {
    const abonnement = AppState.addEventListener("change", (etat) => {
      if (etat === "active") void assurerLogo(organisationId, chemin);
    });
    return () => abonnement.remove();
  }, [organisationId, chemin]);
}
