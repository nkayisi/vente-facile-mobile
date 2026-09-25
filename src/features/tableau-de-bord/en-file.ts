/**
 * Les ventes du journal, mises à la forme des ventes tirées.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE PREMIER ÉCRAN DU MATIN ÉTAIT FAUX APRÈS UNE JOURNÉE HORS LIGNE.      │
 * │                                                                          │
 * │ Corollaire de « les tables tirées ne sont écrites que par le tirage » :  │
 * │ une vente encaissée sans réseau n'est pas dans `sales`. Le hub des       │
 * │ ventes et l'historique avaient refermé ce défaut ; le tableau de bord,   │
 * │ non - et c'est celui qu'on regarde en premier.                           │
 * │                                                                          │
 * │ Il l'avait refermé À MOITIÉ, ce qui est pire : le chiffre d'affaires et  │
 * │ la courbe comptaient le journal, l'anneau des encaissements et les       │
 * │ produits les plus vendus l'ignoraient. Deux cartes voisines se           │
 * │ contredisaient, et rien ne disait laquelle croire.                       │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Module PUR : il ne lit pas la base. C'est ce qui le rend testable, et
 * l'ancienne fusion ne l'était pas - elle vivait dans `data/`, elle ouvrait
 * SQLite, et elle n'avait aucun test.
 */
import type { ContexteFile } from "@/features/perimetre/filtre-perimetre";
import type { VenteEnAttenteDetaillee } from "@/features/ventes/attente";

const nb = (v: string | number | null | undefined): number => {
  const n = typeof v === "string" ? parseFloat(v) : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** Une vente du journal, à la forme d'une ligne de `sales`. */
export interface VenteDuJournal {
  id: string;
  reference: string;
  /** Total en devise PRINCIPALE. `null` quand le ticket est introuvable. */
  totalPrincipal: number | null;
  date: Date | null;
  status: string;
}

/** Une ligne de vente, à la forme d'une ligne de `sale_items`. */
export interface LigneDuJournal {
  saleId: string;
  produitId: string | null;
  /** Quantité totale, en unité de DÉTAIL. */
  quantite: number;
  /** Contenants entiers facturés, pour la lecture gros/détail. */
  contenants: number;
  /** Coût d'achat total de la ligne, en principale (le catalogue y est tenu). */
  cout: number;
  /** Recette de la ligne en principale. `null` si le ticket ne la porte pas. */
  revenuPrincipal: number | null;
}

/** Un règlement, à la forme d'une ligne de `payments`. */
export interface ReglementDuJournal {
  saleId: string;
  /** Identifiant du moyen de paiement ; le nom se joint par le catalogue. */
  methodeId: string | null;
  /** Le billet reçu, tel que le caissier l'a compté. */
  natif: number;
  devise: string | null;
  /** Le même, ramené en devise principale aux taux FIGÉS de l'opération. */
  principal: number;
}

export interface EntreesFusion {
  ventes: VenteEnAttenteDetaillee[];
  /**
   * Les références déjà présentes dans `sales`.
   *
   * ┌────────────────────────────────────────────────────────────────────────┐
   * │ SANS ELLE, UNE VENTE SE COMPTE DEUX FOIS.                             │
   * │                                                                        │
   * │ Le serveur reprend l'identifiant ET la référence du terminal, et la    │
   * │ poussée remet l'opération en `pending` quand la réponse se perd APRÈS  │
   * │ application. Un tirage la ramène alors dans `sales` pendant qu'elle    │
   * │ est encore dans le journal : sans ce croisement, son montant entre     │
   * │ deux fois dans le chiffre d'affaires, les unités et la courbe. C'est   │
   * │ la règle que `data/ventes.ts` et `data/sessions.ts` appliquent déjà.   │
   * └────────────────────────────────────────────────────────────────────────┘
   */
  dejaTirees: Set<string>;
  /** Contenu d'un conditionnement, par produit, depuis le catalogue local. */
  facteurs: Map<string, number | null>;
  /** Prix d'achat unitaire, par produit. Déjà en devise principale. */
  couts: Map<string, number>;
}

export interface Fusion {
  ventes: VenteDuJournal[];
  lignes: LigneDuJournal[];
  reglements: ReglementDuJournal[];
}

/**
 * Le taux qui ramène un montant de FACTURE en devise principale.
 *
 * Un taux nul ou absent vaudrait « montant à zéro » : sur une vente en devise
 * secondaire dont le taux n'aurait pas été enregistré, le chiffre d'affaires
 * perdrait la vente en silence. Le taux neutre laisse au moins le montant.
 */
const tauxDeVente = (v: VenteEnAttenteDetaillee): number => {
  const t = nb(v.corps.exchange_rate);
  return t > 0 ? t : 1;
};

/**
 * Ramène un montant du TICKET en devise principale.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA VERSION DU TICKET DÉCIDE, ET ELLE SEULE.                             │
 * │                                                                          │
 * │ Jusqu'à la version 2, le ticket rangeait des montants en devise          │
 * │ PRINCIPALE sous l'étiquette de la devise de facture. Rien dans les       │
 * │ données ne le dit : `currency` annonçait déjà la facture dans les deux   │
 * │ cas. Convertir un document de version 1 le multiplierait une seconde     │
 * │ fois par le taux - deux mille huit cents, sur un dollar contre franc.    │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const enPrincipale = (v: VenteEnAttenteDetaillee, montant: number): number =>
  v.versionDonnees >= 2 ? montant * tauxDeVente(v) : montant;

/**
 * La quantité d'une ligne, en unité de détail.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ `quantity` EST ABSENT DÈS QUE LE PRODUIT EST CONDITIONNÉ.               │
 * │                                                                          │
 * │ `buildSalePayload` envoie `{package_quantity, loose_quantity}` pour une  │
 * │ vente en gros et n'ajoute `quantity` que pour une vente à l'unité. Le    │
 * │ lire seul comptait donc ZÉRO unité et ZÉRO coût sur toute vente en       │
 * │ gros : les unités vendues étaient sous-comptées et la marge affichait    │
 * │ cent pour cent, ce qui a l'air d'une excellente journée.                 │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function quantiteVendue(
  item: NonNullable<VenteEnAttenteDetaillee["corps"]["items"]>[number],
  facteur: number | null
): number {
  if (item.quantity !== undefined && item.quantity !== null) return nb(item.quantity);
  const contenants = nb(item.package_quantity);
  const detail = nb(item.loose_quantity);
  return contenants * (facteur ?? 0) + detail;
}

/**
 * Le statut que le SERVEUR posera, déduit du restant dû.
 *
 * Il était écrit `completed` en dur. Une vente à crédit entrait donc dans le
 * chiffre d'affaires - que le serveur borne à `completed` - puis en sortait à
 * la synchronisation, quand elle redescendait en `partially_paid` : le chiffre
 * d'affaires BAISSAIT après une synchronisation réussie, et le marchand n'avait
 * aucun moyen de savoir laquelle des deux lectures croire.
 */
export function statutDeVente(resteAPayer: number): string {
  return resteAPayer > 0 ? "partially_paid" : "completed";
}

/**
 * Une vente du journal concerne-t-elle ce périmètre ?
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UNE VENTE SANS ENTREPÔT N'EST PAS « TOUS LES ENTREPÔTS ».               │
 * │                                                                          │
 * │ C'est un entrepôt INCONNU : `buildSalePayload` n'écrit la clé que si la  │
 * │ caisse en a un. L'imputer à celui qu'on regarde gonflerait son chiffre   │
 * │ d'affaires d'une vente qu'un autre dépôt a peut-être faite, et la somme  │
 * │ des dépôts dépasserait le total. Même règle que `memeEntrepot` de        │
 * │ `features/pos/reserve-locale.ts`, et pour la même raison.                │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ L'AUTEUR EST CERTAIN, ET LA GARANTIE VIENT DE `proprietaire.ts`.        │
 * │                                                                          │
 * │ Le corps d'une vente ne porte PAS `sold_by` - le serveur l'attribue - et │
 * │ `outbox_operations` n'a aucune colonne d'auteur. Mais                    │
 * │ `session/proprietaire.ts` estampille la base et rend le verdict          │
 * │ `etrangere` dès qu'un autre compte se présente, y compris après une      │
 * │ déconnexion SANS purge : une vente encore en file appartient donc        │
 * │ forcément à l'utilisateur connecté.                                      │
 * │                                                                          │
 * │ ⚠ Si cette estampille venait à disparaître, ce filtre deviendrait faux   │
 * │ sans que rien ne le signale. Ne pas « simplifier » `proprietaire.ts`     │
 * │ sans revenir ici.                                                        │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Sans nom d'utilisateur connu, on ne retient RIEN : attribuer des ventes à
 * quelqu'un qu'on ne sait pas nommer fabriquerait un total par caissier qui
 * est une fiction.
 */
export function retientVenteEnFile(
  v: { corps: { warehouse?: string } },
  perimetre: { entrepot: string | null; utilisateur: string | null },
  file: ContexteFile
): boolean {
  const { moi, entrepotInconnuAdmis } = file;
  const entrepot = v.corps.warehouse ?? null;
  // ┌────────────────────────────────────────────────────────────────────┐
  // │ SOUS UN VERROU, UN ENTREPÔT INCONNU PASSE. Voir                    │
  // │ `entrepotInconnuAdmis`.                                            │
  // │                                                                    │
  // │ Un membre borné à UN SEUL dépôt porte son entrepôt en permanence,   │
  // │ sans l'avoir choisi. Qu'il encaisse sur une caisse SANS entrepôt -  │
  // │ configuration que l'écran d'ouverture tolère avec un avertissement  │
  // │ - et sa vente disparaissait du tableau de bord ET de l'historique   │
  // │ entre l'encaissement et la synchronisation. Sur les deux seuls      │
  // │ écrans où il la cherche, ticket en main.                            │
  // │                                                                    │
  // │ Un verrou est le périmètre du RÔLE : la vente ne peut appartenir    │
  // │ qu'à lui. Sous un CHOIX délibéré, en revanche, la question est      │
  // │ « qu'y a-t-il eu dans le dépôt B ? », et une vente dont on ignore   │
  // │ le dépôt n'y répond pas.                                            │
  // └────────────────────────────────────────────────────────────────────┘
  if (perimetre.entrepot && entrepot !== perimetre.entrepot) {
    if (entrepot !== null || !entrepotInconnuAdmis) return false;
  }
  if (perimetre.utilisateur && perimetre.utilisateur !== moi) return false;
  return true;
}

/** Met les ventes du journal à la forme de celles du tirage. */
export function fusionnerVentesEnFile({
  ventes,
  dejaTirees,
  facteurs,
  couts,
}: EntreesFusion): Fusion {
  const sorties: Fusion = { ventes: [], lignes: [], reglements: [] };

  for (const v of ventes) {
    if (dejaTirees.has(v.reference)) continue;

    sorties.ventes.push({
      id: v.corps.id,
      reference: v.reference,
      // `null` se lit INCONNU, jamais zéro : la vente n'entre dans aucune somme
      // d'argent, plutôt que d'y entrer pour rien.
      totalPrincipal: v.total === null ? null : enPrincipale(v, v.total),
      date: v.date,
      status: statutDeVente(v.resteAPayer),
    });

    (v.corps.items ?? []).forEach((item, i) => {
      const produitId = item.product ?? null;
      const facteur = produitId ? (facteurs.get(produitId) ?? null) : null;
      const quantite = quantiteVendue(item, facteur);
      const brut = v.brutsTicket[i];
      sorties.lignes.push({
        saleId: v.corps.id,
        produitId,
        quantite,
        contenants: nb(item.package_quantity),
        // ┌──────────────────────────────────────────────────────────────────┐
        // │ LE COÛT N'EST PAS CONVERTI, ET C'EST VOLONTAIRE.                 │
        // │                                                                  │
        // │ Il vient du catalogue, qui n'a pas de devise : il est DÉJÀ en    │
        // │ principale. Lui appliquer le taux d'une vente en francs le       │
        // │ diviserait par deux mille huit cents, et la marge passerait de   │
        // │ quarante pour cent à cent.                                       │
        // └──────────────────────────────────────────────────────────────────┘
        cout: (produitId ? (couts.get(produitId) ?? 0) : 0) * quantite,
        revenuPrincipal: typeof brut === "number" ? enPrincipale(v, brut) : null,
      });
    });

    for (const r of v.corps.payments ?? []) {
      const natif = nb(r.tendered_amount);
      // ┌────────────────────────────────────────────────────────────────────┐
      // │ DEUX TAUX, ET TOUS DEUX FIGÉS SUR L'OPÉRATION.                    │
      // │                                                                    │
      // │ Celui du règlement mène du BILLET à la facture, celui de la vente  │
      // │ de la facture à la principale. Prendre les taux du jour ferait     │
      // │ bouger la recette d'hier avec le cours, et un tableau de bord qui  │
      // │ se relit autrement chaque matin n'est plus un repère. Le taux du   │
      // │ règlement est absent quand il est réglé dans la devise de facture. │
      // └────────────────────────────────────────────────────────────────────┘
      const versFacture = nb(r.exchange_rate) > 0 ? nb(r.exchange_rate) : 1;
      sorties.reglements.push({
        saleId: v.corps.id,
        methodeId: r.payment_method ?? null,
        natif,
        devise: r.currency ?? null,
        principal: natif * versFacture * tauxDeVente(v),
      });
    }
  }

  return sorties;
}
