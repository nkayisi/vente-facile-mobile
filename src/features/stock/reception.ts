/**
 * Ce que le magasinier a réellement déchargé d'un transfert.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ MODULE PUR, ET C'EST LE MOTIF DE L'EXTRACTION.                          │
 * │                                                                          │
 * │ Ces fonctions décident de ce qui part au serveur, et une erreur ici fait │
 * │ entrer du stock qui n'est jamais arrivé - ou en perdre. Elles doivent    │
 * │ donc s'éprouver SANS appareil. Les laisser dans la feuille les rendait   │
 * │ intestables : `@/ui` tire le thème, qui tire les réglages, qui OUVRE LA  │
 * │ BASE SQLite au chargement. C'est le déplacement déjà fait pour           │
 * │ `data/etats-stock` et `data/statuts-vente`.                              │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import { lireNombre } from "@/data/nombres";
import type { LigneTransfert } from "@/data/stock-operations";

/** La saisie d'une ligne, telle qu'elle est tapée. */
export interface SaisieReception {
  contenants: string;
  vrac: string;
}

/**
 * Ce qui part au serveur pour UNE ligne.
 *
 * Miroir du paramètre `lignesRecues` de `transitionTransfert` : les deux
 * compteurs pour un produit conditionné, le total sinon.
 */
export interface LigneRecue {
  ligne: string;
  contenants?: number;
  vrac?: number;
  total?: number;
}

/**
 * Une ligne se compte-t-elle par CANAL, et sur quel partage expédié ?
 *
 * ⚠ Le partage est LU sur la ligne, jamais redivisé : `expedie / facteur`
 * redécouperait au facteur du jour un envoi préparé sous un autre, et c'est la
 * classe de défaut que `PackagingService.split` existe pour fermer. Sans
 * partage enregistré, il n'y a rien à proposer par canal : on retombe sur le
 * total, et le second champ n'est pas offert.
 */
export function partageExpedie(ligne: LigneTransfert) {
  const total = ligne.expedie ?? ligne.demande;
  const conditionne = (ligne.facteur ?? 0) >= 2;
  const aUnPartage =
    ligne.contenantsExpedies != null || ligne.vracExpedie != null;
  if (!conditionne || !aUnPartage) return { canaux: false as const, total };
  return {
    canaux: true as const,
    contenants: ligne.contenantsExpedies ?? 0,
    vrac: ligne.vracExpedie ?? 0,
    total,
  };
}

/**
 * Les champs à l'ouverture de la feuille : L'EXPÉDIÉ, pas du vide.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ « LAISSEZ VIDE POUR TOUT RÉCEPTIONNER » ÉTAIT UNE PROMESSE QUE LE       │
 * │ SERVEUR NE TIENT PAS.                                                    │
 * │                                                                          │
 * │ Sa règle est PAR LIGNE, pas par champ : dès qu'un seul des deux canaux   │
 * │ portait une valeur, l'autre partait à ZÉRO. Le magasinier qui saisissait │
 * │ « 3 contenants » sur un envoi de « 3 casiers + 7 bouteilles » perdait    │
 * │ les sept bouteilles, en silence, en croyant avoir tout réceptionné.      │
 * │                                                                          │
 * │ Préremplir lève l'ambiguïté au lieu de la documenter : ce qui est à      │
 * │ l'écran est ce qui part, et on corrige la ligne venue courte.            │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function saisiesInitiales(
  lignes: LigneTransfert[]
): Record<string, SaisieReception> {
  const depart: Record<string, SaisieReception> = {};
  for (const ligne of lignes) {
    const p = partageExpedie(ligne);
    depart[ligne.id] = p.canaux
      ? { contenants: String(p.contenants), vrac: String(p.vrac) }
      : { contenants: "", vrac: String(p.total) };
  }
  return depart;
}

/**
 * Ce que le magasinier a réellement déchargé.
 *
 * Module de LECTURE de la saisie, séparé du rendu pour qu'il s'éprouve sans
 * appareil : c'est lui qui décide de ce qui part au serveur, et une erreur ici
 * fait entrer du stock qui n'est jamais arrivé.
 *
 * Les champs étant PRÉREMPLIS de l'expédié, toutes les lignes partent, et un
 * champ vidé à la main vaut bien zéro : le préremplissage a montré ce qui était
 * attendu, l'effacer est une affirmation.
 */
export function lignesDeReception(
  lignes: LigneTransfert[],
  saisies: Record<string, SaisieReception>
): LigneRecue[] | undefined {
  const retenues: LigneRecue[] = [];

  for (const ligne of lignes) {
    const s = saisies[ligne.id] ?? { contenants: "", vrac: "" };
    const p = partageExpedie(ligne);
    const nc = lireNombre((s.contenants ?? "").trim());
    const nv = lireNombre((s.vrac ?? "").trim());
    // Une saisie illisible n'est PAS un zéro : on rend `undefined`, et le
    // bouton reste fermé tant qu'elle l'est. Compter zéro ferait réceptionner
    // une ligne vide sur une faute de frappe.
    if (!nc.ok || !nv.ok) return undefined;

    retenues.push(
      p.canaux
        ? {
            ligne: ligne.id,
            contenants: nc.valeur ?? 0,
            vrac: nv.valeur ?? 0,
          }
        : { ligne: ligne.id, total: nv.valeur ?? 0 }
    );
  }

  return retenues.length > 0 ? retenues : undefined;
}

/** Le premier motif de refus d'une saisie, ou `null`. */
export function refusDeReception(
  lignes: LigneTransfert[],
  saisies: Record<string, SaisieReception>
): string | null {
  for (const ligne of lignes) {
    const s = saisies[ligne.id];
    if (!s) continue;
    for (const brut of [s.contenants, s.vrac]) {
      const t = (brut ?? "").trim();
      if (t === "") continue;
      const n = lireNombre(t);
      // `lireNombre` rend un CODE, jamais une phrase : la phrase que le
      // magasinier lit appartient à l'écran qui la lui montre.
      if (!n.ok) {
        return n.motif === "negatif"
          ? `${ligne.produit} : une quantité reçue ne peut pas être négative.`
          : `${ligne.produit} : quantité illisible.`;
      }
    }
  }
  return null;
}
