/**
 * La fusion des ventes en file au tableau de bord.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CETTE FUSION N'AVAIT AUCUN TEST, ET ELLE PORTAIT QUATRE DÉFAUTS.        │
 * │                                                                          │
 * │ Elle vivait dans `data/`, où elle ouvrait SQLite : donc intestable, donc │
 * │ non testée, et le CLAUDE.md la déclarait pourtant « prouvée par le code  │
 * │ et les tests ». Chacun des cas ci-dessous correspond à un défaut mesuré  │
 * │ sur le code d'origine.                                                   │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import {
  fusionnerVentesEnFile,
  quantiteVendue,
  retientVenteEnFile,
  statutDeVente,
  type EntreesFusion,
} from "./en-file";
import type { VenteEnAttenteDetaillee } from "@/features/ventes/attente";

/** Un casier de douze, à 2 800 francs pour un dollar. */
const FACTEURS = new Map<string, number | null>([
  ["casier", 12],
  ["savon", null],
]);
const COUTS = new Map<string, number>([
  ["casier", 1.5],
  ["savon", 4],
]);

const vente = (p: Partial<VenteEnAttenteDetaillee> = {}): VenteEnAttenteDetaillee => ({
  id: "v1",
  reference: "VT-20260904-Q5L8-0001",
  client: null,
  total: 100,
  resteAPayer: 0,
  devise: "USD",
  date: new Date("2026-09-04T10:00:00Z"),
  nbArticles: 1,
  session: "s1",
  entrepot: null,
  envoi: "en_attente",
  versionDonnees: 2,
  brutsTicket: [100],
  corps: {
    id: "v1",
    reference: "VT-20260904-Q5L8-0001",
    exchange_rate: 1,
    items: [{ product: "savon", quantity: 2 }],
    payments: [{ payment_method: "m1", tendered_amount: 100, currency: "USD" }],
  },
  ...p,
});

const fusion = (ventes: VenteEnAttenteDetaillee[], dejaTirees: string[] = []) =>
  fusionnerVentesEnFile({
    ventes,
    dejaTirees: new Set(dejaTirees),
    facteurs: FACTEURS,
    couts: COUTS,
  } satisfies EntreesFusion);

describe("le dédoublonnage contre la table", () => {
  it("écarte une vente que le tirage a déjà ramenée", () => {
    // Le serveur reprend la référence du terminal, et une opération appliquée
    // dont la réponse s'est perdue repart en `pending` : sans ce croisement la
    // vente compte DEUX fois, en chiffre d'affaires comme en unités.
    const f = fusion([vente()], ["VT-20260904-Q5L8-0001"]);
    expect(f.ventes).toHaveLength(0);
    expect(f.lignes).toHaveLength(0);
    expect(f.reglements).toHaveLength(0);
  });

  it("garde celle que le tirage n'a pas encore vue", () => {
    expect(fusion([vente()]).ventes).toHaveLength(1);
  });
});

describe("les unités d'une vente en gros", () => {
  it("reconstitue la quantité quand `quantity` est absent du corps", () => {
    // `buildSalePayload` n'envoie PAS `quantity` pour un produit conditionné :
    // il envoie les deux compteurs. Le lire seul comptait zéro unité et zéro
    // coût sur toute vente en gros, donc une marge de cent pour cent.
    const f = fusion([
      vente({
        corps: {
          id: "v1",
          reference: "VT-20260904-Q5L8-0001",
          exchange_rate: 1,
          items: [{ product: "casier", package_quantity: 2, loose_quantity: 3 }],
        },
      }),
    ]);
    expect(f.lignes[0].quantite).toBe(27); // 2 x 12 + 3
    expect(f.lignes[0].contenants).toBe(2);
    expect(f.lignes[0].cout).toBe(40.5); // 27 x 1,50
  });

  it("garde `quantity` quand le corps le porte", () => {
    expect(fusion([vente()]).lignes[0].quantite).toBe(2);
    expect(fusion([vente()]).lignes[0].cout).toBe(8); // 2 x 4
  });

  it("ne devine aucun facteur pour un produit inconnu du catalogue", () => {
    // Sans facteur, deux contenants ne valent pas deux unités : on ne compte
    // que le vrac, plutôt que d'inventer un contenu.
    expect(quantiteVendue({ package_quantity: 2, loose_quantity: 3 }, null)).toBe(3);
  });
});

describe("le statut, déduit du restant dû", () => {
  it("range une vente à crédit en `partially_paid`, comme le serveur", () => {
    // Il était écrit `completed` en dur : la vente entrait dans le chiffre
    // d'affaires puis en SORTAIT après synchronisation, quand le serveur la
    // redescendait en `partially_paid`. Le chiffre baissait après une synchro
    // réussie, et rien ne disait laquelle des deux lectures croire.
    expect(statutDeVente(40)).toBe("partially_paid");
    expect(statutDeVente(0)).toBe("completed");
    expect(fusion([vente({ resteAPayer: 40 })]).ventes[0].status).toBe("partially_paid");
  });
});

describe("la conversion en devise principale", () => {
  it("convertit un ticket de version 2, qui porte des montants de FACTURE", () => {
    const f = fusion([
      vente({
        total: 100,
        brutsTicket: [100],
        versionDonnees: 2,
        corps: {
          id: "v1",
          reference: "VT-20260904-Q5L8-0001",
          exchange_rate: 2800,
          items: [{ product: "savon", quantity: 2 }],
        },
      }),
    ]);
    expect(f.ventes[0].totalPrincipal).toBe(280000);
    expect(f.lignes[0].revenuPrincipal).toBe(280000);
  });

  it("NE convertit PAS un ticket de version 1, déjà en principale", () => {
    // Le défaut le plus coûteux si on l'oublie : un document rangé avant la
    // correction de la devise du ticket porte déjà des montants en principale.
    // Le convertir le multiplierait une seconde fois par deux mille huit cents.
    const f = fusion([
      vente({
        total: 280000,
        brutsTicket: [280000],
        versionDonnees: 1,
        corps: {
          id: "v1",
          reference: "VT-20260904-Q5L8-0001",
          exchange_rate: 2800,
          items: [{ product: "savon", quantity: 2 }],
        },
      }),
    ]);
    expect(f.ventes[0].totalPrincipal).toBe(280000);
  });

  it("laisse le montant plutôt que de le perdre quand le taux manque", () => {
    const f = fusion([
      vente({
        corps: { id: "v1", reference: "VT-20260904-Q5L8-0001", exchange_rate: 0 },
      }),
    ]);
    expect(f.ventes[0].totalPrincipal).toBe(100);
  });
});

describe("le ticket introuvable", () => {
  it("rend un montant INCONNU, jamais zéro, sans effacer la vente", () => {
    const f = fusion([vente({ total: null, brutsTicket: [] })]);
    expect(f.ventes[0].totalPrincipal).toBeNull();
    // La vente existe, et ses unités sont certaines : elles viennent du corps
    // de l'opération, pas du ticket.
    expect(f.lignes[0].quantite).toBe(2);
    expect(f.lignes[0].revenuPrincipal).toBeNull();
  });
});

describe("les encaissements", () => {
  it("applique les DEUX taux figés : le billet, puis la facture", () => {
    // Un client paie 28 000 FC sur une facture en dollars, l'établissement
    // étant tenu en francs. Le taux du règlement mène du billet à la facture
    // (1/2800 dollar par franc), celui de la vente de la facture à la
    // principale (2 800 francs par dollar) : on retombe sur 28 000 FC.
    const f = fusion([
      vente({
        corps: {
          id: "v1",
          reference: "VT-20260904-Q5L8-0001",
          exchange_rate: 2800,
          payments: [
            {
              payment_method: "m1",
              tendered_amount: 28000,
              currency: "CDF",
              exchange_rate: 1 / 2800,
            },
          ],
        },
      }),
    ]);
    expect(f.reglements[0].natif).toBe(28000);
    expect(f.reglements[0].devise).toBe("CDF");
    expect(f.reglements[0].principal).toBeCloseTo(28000, 6);
  });

  it("prend le taux neutre quand le billet EST dans la devise de facture", () => {
    // `buildSalePayload` n'écrit alors aucun `exchange_rate` sur le règlement.
    const f = fusion([
      vente({
        corps: {
          id: "v1",
          reference: "VT-20260904-Q5L8-0001",
          exchange_rate: 2800,
          payments: [{ payment_method: "m1", tendered_amount: 100, currency: "USD" }],
        },
      }),
    ]);
    expect(f.reglements[0].principal).toBe(280000);
  });
});

describe("les opérations bloquées", () => {
  it("les compte comme les autres : elles ont été encaissées et imprimées", () => {
    // `blocked` n'est pas `quarantined` : l'opération est conservée et repart
    // dès que l'abonnement est réglé. Les taire ferait afficher une journée
    // vide pendant tout le blocage, qui dure.
    const f = fusion([vente({ envoi: "bloque" })]);
    expect(f.ventes).toHaveLength(1);
  });
});

describe("une vente encaissée sur une caisse SANS entrepôt", () => {
  // ┌──────────────────────────────────────────────────────────────────────┐
  // │ ELLE DISPARAISSAIT DU TABLEAU DE BORD ET DE L'HISTORIQUE.            │
  // │                                                                      │
  // │ `buildSalePayload` n'écrit la clé `warehouse` que si la caisse en a   │
  // │ un - configuration que l'écran d'ouverture tolère avec un             │
  // │ avertissement. Un membre borné à UN SEUL dépôt porte son entrepôt en  │
  // │ permanence, sans l'avoir choisi : la comparaison plate rejetait donc  │
  // │ sa propre vente, entre l'encaissement et la synchronisation, sur les  │
  // │ deux seuls écrans où il la cherche, ticket en main.                   │
  // └──────────────────────────────────────────────────────────────────────┘
  const sansEntrepot = { corps: {} } as { corps: { warehouse?: string } };
  const dansB = { corps: { warehouse: "wh-b" } };
  const perimetre = { entrepot: "wh-a", utilisateur: null };

  it("survit sous un VERROU", () => {
    expect(
      retientVenteEnFile(sansEntrepot, perimetre, {
        moi: "u-1",
        entrepotInconnuAdmis: true,
      })
    ).toBe(true);
  });

  it("est écartée sous un CHOIX délibéré", () => {
    // « Qu'y a-t-il eu dans le dépôt A ? » : une vente dont on ignore le
    // dépôt n'y répond pas, et l'y compter gonflerait son total.
    expect(
      retientVenteEnFile(sansEntrepot, perimetre, {
        moi: "u-1",
        entrepotInconnuAdmis: false,
      })
    ).toBe(false);
  });

  it("une vente d'un AUTRE dépôt reste écartée, verrou ou pas", () => {
    // Le contrôle : sans lui, tout laisser passer passerait le premier test.
    for (const tolere of [true, false]) {
      expect(
        retientVenteEnFile(dansB, perimetre, {
          moi: "u-1",
          entrepotInconnuAdmis: tolere,
        })
      ).toBe(false);
    }
  });
});
