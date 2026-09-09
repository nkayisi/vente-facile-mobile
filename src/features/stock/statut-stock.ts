/**
 * L'état d'un rayon, traduit pour le SERVEUR.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ `low` ET `available` DU SERVEUR SE RECOUVRENT. PAS LES ÉTATS D'ICI.     │
 * │                                                                          │
 * │ `low` (`quantity <= reorder_point`) contient les RUPTURES, et            │
 * │ `available` (`quantity > 0`) contient les stocks BAS : ce sont deux      │
 * │ ALERTES, et c'est ce que le back-office attend de son bouton « Stock     │
 * │ bas ». L'écran `/rayon`, lui, range chaque rayon dans une case et une    │
 * │ seule.                                                                   │
 * │                                                                          │
 * │ Traduire « bas » par `low` produirait donc un DOCUMENT PLUS LARGE QUE    │
 * │ L'ÉCRAN qui l'a déclenché, très exactement le défaut que tous les        │
 * │ exports de ce dépôt ont dû corriger. D'où `low_only` et `healthy`,       │
 * │ ajoutés à `StockFilter` pour dire ce que le serveur ne savait pas dire.  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Une correspondance fausse ne se verrait NULLE PART : le fichier sortirait,
 * plausible, et couvrirait autre chose que la liste. D'où ce module pur et
 * son test.
 */
import type { EtatStock } from "@/data/etats-stock";

/** `undefined` : aucun filtre d'état, donc tout le stock. */
export function statutServeur(etat: EtatStock | undefined): string | undefined {
  switch (etat) {
    case "rupture":
      return "out";
    case "bas":
      return "low_only";
    case "ok":
      return "healthy";
    default:
      return undefined;
  }
}
