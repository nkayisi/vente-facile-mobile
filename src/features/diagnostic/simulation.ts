/**
 * Forcer un verdict de zone sûre, EN DÉVELOPPEMENT SEULEMENT.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE DÉFAUT NE SE PRODUIT SUR AUCUN APPAREIL QU'ON A SOUS LA MAIN.        │
 * │                                                                          │
 * │ Un émulateur AOSP annonce ses marges correctement : `marge_absente` ne   │
 * │ s'y produit jamais, quel que soit le mode de navigation. Sans cet        │
 * │ interrupteur, le chemin qui pose le plancher ne serait JAMAIS regardé -  │
 * │ ni les cinq onglets, ni un pied de formulaire, ni une feuille, ni le     │
 * │ scanner. On livrerait un correctif que personne n'a vu fonctionner.      │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ ON FABRIQUE DES MESURES, JAMAIS UN VERDICT. Court-circuiter `verdict()`
 * ferait regarder un chemin qui n'est pas celui de la production : ici les
 * mesures entrent par la porte normale, et toute la politique s'applique
 * dessus telle qu'elle est livrée.
 *
 * ⚠ INERTE HORS `__DEV__`, et c'est la seule chose qui compte vraiment dans ce
 * fichier. Un interrupteur qui survivrait à la compilation de production
 * laisserait un moyen de fausser la mise en page d'un terminal de marchand.
 */
import { useSyncExternalStore } from "react";

import type { Mesures, Verdict } from "./marge-basse";

let force: Verdict | null = null;
const abonnes = new Set<() => void>();

function abonner(surChangement: () => void): () => void {
  abonnes.add(surChangement);
  return () => {
    abonnes.delete(surChangement);
  };
}

/** Le verdict forcé, ou `null`. Rend TOUJOURS `null` hors développement. */
export function verdictForce(): Verdict | null {
  return __DEV__ ? force : null;
}

export function forcerVerdict(v: Verdict | null): void {
  if (!__DEV__) return;
  force = v;
  for (const f of abonnes) f();
}

export function useVerdictForce(): Verdict | null {
  return useSyncExternalStore(abonner, verdictForce, () => null);
}

/**
 * Les mesures qu'aurait un appareil dont le verdict serait `v`.
 *
 * PUR, donc éprouvable : un test exige que `verdict(mesuresSimulees(x, v))`
 * redonne `v`. Sans lui, l'interrupteur pourrait mentir sur ce qu'il simule et
 * on croirait avoir regardé un chemin qu'on n'a pas emprunté.
 */
export function mesuresSimulees(reelles: Mesures, v: Verdict | null): Mesures {
  if (!v) return reelles;
  switch (v) {
    case "marge_absente":
      // Bord-à-bord, et le système n'annonce rien.
      return { ...reelles, hauteurFenetre: reelles.hauteurEcran, margeBasse: 0 };
    case "fenetre_inseree":
      // Le système a déjà retiré la barre de la fenêtre : zéro est JUSTE.
      return {
        hauteurEcran: reelles.hauteurEcran,
        hauteurFenetre: reelles.hauteurEcran - 48,
        margeBasse: 0,
      };
    case "conforme":
      // Bord-à-bord avec une marge annoncée. On garde celle de l'appareil
      // quand il en a une : la sienne est plus instructive qu'une inventée.
      return {
        ...reelles,
        hauteurFenetre: reelles.hauteurEcran,
        margeBasse: reelles.margeBasse > 0 ? reelles.margeBasse : 24,
      };
  }
}
