/**
 * Ce que chaque pièce attend d'envoyer, et dans quel état.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN `Set` NE DIT PAS SI L'ACTE PARTIRA SEUL.                             │
 * │                                                                          │
 * │ Une dizaine de lectures aplatissaient leurs actes en identifiants : les  │
 * │ écrans savaient qu'« une opération » attendait, jamais si elle était     │
 * │ BLOQUÉE. Ils annonçaient donc « attend son envoi » sur une opération qui │
 * │ attend une décision, et le marchand cherchait du réseau des jours        │
 * │ durant. C'est le défaut que `data/envoi.ts` existe pour fermer, resté    │
 * │ ouvert partout où l'état n'atteignait pas l'écran.                       │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Module PUR : aucune ouverture de base, il n'agrège que ce qu'on lui passe.
 */
import { pireEnvoi } from "@/data/envoi";
import type { EtatEnvoi } from "@/sync";

/** Par identifiant de pièce, le PIRE état de ses actes en file. */
export type Attentes = Map<string, EtatEnvoi>;

/**
 * Rassemble des actes par pièce.
 *
 * Le PIRE l'emporte : dire « attend son envoi » d'une pièce dont un acte est
 * bloqué ferait attendre un réseau qui ne débloquera rien. Un identifiant
 * absent est ignoré - un corps d'opération mal formé ne doit pas fabriquer une
 * entrée sous une clé vide.
 */
export function attentesPar(
  actes: { id: string | null | undefined; envoi: EtatEnvoi }[]
): Attentes {
  const par: Attentes = new Map();
  for (const a of actes) {
    if (!a.id) continue;
    par.set(a.id, pireEnvoi([par.get(a.id), a.envoi]));
  }
  return par;
}

/**
 * Le pire état d'une poignée d'actes, ou `undefined` s'il n'y en a aucun.
 *
 * `pireEnvoi([])` rend `"envoye"`, ce qui est juste pour un lot et faux pour
 * une pièce UNIQUE : « envoyé » affirmerait qu'un acte est arrivé là où il n'y
 * en a jamais eu. Les écrans lisent `undefined` comme « rien à dire », et
 * `libelleEnvoi` comme `contenuBandeau` en font `null`.
 */
export function pireEnvoiOuRien(etats: EtatEnvoi[]): EtatEnvoi | undefined {
  return etats.length > 0 ? pireEnvoi(etats) : undefined;
}

/** Un LOT d'actes de même nature, et le pire état du lot. */
export interface LotEnAttente {
  nombre: number;
  /** `undefined` quand le lot est vide : il n'y a rien à dire. */
  envoi: EtatEnvoi | undefined;
}

/**
 * Compte un lot ET dit s'il partira seul.
 *
 * Un nombre nu - « 3 dépenses attendent leur envoi » - ne distingue pas ce qui
 * part à la prochaine synchronisation de ce qui attend un droit. Les écrans de
 * liste s'en servent pour dire, sous leur en-tête, que leur contenu n'est pas
 * encore complet ; sans l'état, ils enverraient chercher un réseau déjà là.
 */
export function lotEnAttente(ops: { envoi: EtatEnvoi }[]): LotEnAttente {
  return { nombre: ops.length, envoi: pireEnvoiOuRien(ops.map((o) => o.envoi)) };
}
