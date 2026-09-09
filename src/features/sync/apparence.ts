/**
 * À quoi ressemblent les trois états d'envoi.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UNE COCHE VERTE SUR « ATTEND SON ENVOI » DIT LE CONTRAIRE DU TEXTE.     │
 * │                                                                          │
 * │ Le parc de caisses et la fiche ne changeaient de couleur que pour le     │
 * │ BLOCAGE : une ouverture encore en file sortait en vert, sous un          │
 * │ `CheckCircle2`, à côté des mots « Attend son envoi ». La coche est le    │
 * │ signal le plus fort de l'écran, et elle affirme « c'est fait ». On lit   │
 * │ une forme avant de lire un mot : le caissier en conclut que le serveur   │
 * │ a sa session, et ne synchronise pas avant de rentrer.                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * **La table vivait dans `features/caisse/`, et elle n'a rien de caissier.**
 * C'est « à quoi ressemblent les trois états d'envoi », question que se posent
 * désormais le parc de caisses, la feuille de comptage et une quinzaine
 * d'autres écrans. Deux écrans qui ne peignent pas de la même façon le même
 * état font douter qu'il s'agisse du même.
 *
 * Le VOCABULAIRE, lui, reste dans `data/envoi.ts` : ces phrases sont partagées
 * avec « Opérations à corriger », et deux mots différents pour le même état
 * font douter qu'il s'agisse du même.
 */
import type { EtatEnvoi } from "@/sync";

export interface ApparenceEtat {
  /** Bordure et fond du panneau. Classes LITTÉRALES : NativeWind ignore le reste. */
  boite: string;
  /** Le filet interne, qui doit suivre la bordure du panneau. */
  filet: string;
  icone: "CheckCircle2" | "Clock" | "AlertTriangle";
  couleur: "success" | "mutedForeground" | "warning";
}

export const ETAT_ENVOI: Record<EtatEnvoi, ApparenceEtat> = {
  envoye: {
    boite: "border-success/30 bg-success/10",
    filet: "border-success/30",
    icone: "CheckCircle2",
    couleur: "success",
  },
  en_attente: {
    // Ni vert ni orange : l'acte est normal et il partira seul. Le vert
    // affirmerait qu'il est arrivé, l'orange ferait chercher un problème.
    boite: "border-border bg-muted/50",
    filet: "border-border",
    icone: "Clock",
    couleur: "mutedForeground",
  },
  bloque: {
    boite: "border-warning/40 bg-warning/10",
    filet: "border-warning/30",
    icone: "AlertTriangle",
    couleur: "warning",
  },
};
