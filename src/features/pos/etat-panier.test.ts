/**
 * Les transitions du panier.
 *
 * Un défaut ici ne plante pas : il fabrique un panier faux, qu'on découvre au
 * moment d'encaisser, ou pire, sur le ticket du client.
 */
import { motifDeRefus, PANIER_VIDE, reducteurPanier, type EtatPanier } from "./etat-panier";
import type { ArticlePos } from "./catalogue";

const casier = {
  id: "p1",
  name: "Primus 65cl",
  sku: null, barcode: null, image: null, categoryId: null, categoryName: null,
  selling_price: "5000",
  wholesale_price: "50000",
  is_taxable: false,
  tax_rate: "0",
  selling_mode: "wholesale_and_retail",
  units_per_package: 12,
  unit_name: "bouteille",
  packaging_unit_name: "casier",
  allow_auto_unpacking: true,
  track_inventory: true,
  allow_negative_stock: false,
  stock_quantity: 60,
  stock_packages: 4,
  stock_loose: 12,
  reserved_quantity: 0,
  verrou_inventaire: null,
} satisfies ArticlePos;

const detail = {
  ...casier,
  id: "p2",
  name: "Savon",
  selling_mode: "retail_only",
  units_per_package: null,
  packaging_unit_name: null,
  wholesale_price: null,
  stock_quantity: 10,
  stock_packages: null,
  stock_loose: 10,
} satisfies ArticlePos;

const ajouter = (etat: EtatPanier, article: ArticlePos, packages: number, loose: number) =>
  reducteurPanier(etat, {
    type: "ajouter",
    article,
    saisie: { packages, loose },
    prix: Number(article.selling_price),
  });

describe("Panier", () => {
  it("garde les deux compteurs séparés au lieu de leur somme", () => {
    const etat = ajouter(PANIER_VIDE, casier, 2, 3);
    expect(etat.lignes).toHaveLength(1);
    expect(etat.lignes[0].packageQuantity).toBe(2);
    expect(etat.lignes[0].quantity).toBe(27);
  });

  it("additionne chaque canal séparément en fusionnant deux ajouts", () => {
    // 2 casiers + 3 bouteilles, puis 1 casier + 2 bouteilles.
    // Attendu : 3 casiers + 5 bouteilles, PAS « 41 » redécoupé en 3 casiers + 5,
    // ce qui donnerait ici le même chiffre par hasard mais divergerait dès que
    // le vrac dépasse un contenant.
    let etat = ajouter(PANIER_VIDE, casier, 2, 3);
    etat = ajouter(etat, casier, 1, 2);
    expect(etat.lignes).toHaveLength(1);
    expect(etat.lignes[0].packageQuantity).toBe(3);
    expect(etat.lignes[0].quantity).toBe(41);
  });

  it("ne redécoupe pas un vrac qui dépasse un contenant", () => {
    // 0 casier + 20 bouteilles : le rayon a bien 20 unités isolées, pas
    // « 1 casier + 8 bouteilles ». Un contenant entamé ne se rescelle pas.
    const etat = ajouter(PANIER_VIDE, casier, 0, 20);
    expect(etat.lignes[0].packageQuantity).toBe(0);
    expect(etat.lignes[0].quantity).toBe(20);
  });

  it("refuse un ajout que le stock ne permet pas, sans toucher au panier", () => {
    const plein = ajouter(PANIER_VIDE, casier, 4, 12); // tout le rayon
    const apres = ajouter(plein, casier, 0, 1);
    expect(apres).toBe(plein);
  });

  it("refuse le gros quand les contenants manquent, meme si le total suffit", () => {
    // 4 casiers scellés seulement, mais 60 unités au total.
    const etat = ajouter(PANIER_VIDE, casier, 5, 0);
    expect(etat.lignes).toHaveLength(0);
  });

  it("exclut la ligne editee de son propre controle de stock", () => {
    // Sans cette exclusion, ramener 4 casiers à 4 casiers serait refusé, la
    // ligne se comptant contre elle-même : le caissier ne pourrait plus rien
    // corriger dès qu'il a pris tout le rayon.
    const plein = ajouter(PANIER_VIDE, casier, 4, 0);
    const meme = reducteurPanier(plein, {
      type: "modifier", index: 0, saisie: { packages: 4, loose: 0 },
    });
    expect(meme.lignes[0].quantity).toBe(48);

    const reduit = reducteurPanier(plein, {
      type: "modifier", index: 0, saisie: { packages: 1, loose: 0 },
    });
    expect(reduit.lignes[0].quantity).toBe(12);
    expect(reduit.lignes[0].packageQuantity).toBe(1);
  });

  it("ignore une modification qui viderait la ligne", () => {
    // Retirer une ligne est une action explicite : une quantité à zéro laissée
    // dans le panier facturerait un article à 0, ce que le serveur accepterait.
    const plein = ajouter(PANIER_VIDE, casier, 1, 0);
    const apres = reducteurPanier(plein, {
      type: "modifier", index: 0, saisie: { packages: 0, loose: 0 },
    });
    expect(apres).toBe(plein);
  });

  it("borne la remise de ligne au plafond du marchand, jamais à cent", () => {
    // Cette assertion disait « au plus 100 » : c'était la borne du comptoir, et
    // elle n'a jamais été celle du serveur, qui oppose le réglage de
    // l'organisation (défaut 50). Voir la section « plafond de remise de
    // ligne » plus bas pour la règle complète.
    let etat = ajouter(PANIER_VIDE, detail, 0, 1);
    etat = reducteurPanier(etat, { type: "remiseLigne", index: 0, pourcentage: 150 });
    expect(etat.lignes[0].discount_percentage).toBe(PANIER_VIDE.plafondRemise);
    etat = reducteurPanier(etat, { type: "remiseLigne", index: 0, pourcentage: -5 });
    expect(etat.lignes[0].discount_percentage).toBe(0);
  });

  it("retire du client ce qui n'a de sens qu'avec lui", () => {
    let etat = ajouter(PANIER_VIDE, detail, 0, 1);
    etat = reducteurPanier(etat, {
      type: "client",
      client: { id: "c1", name: "Kalume", allow_credit: true, credit_limit: "0", current_balance: "0" },
    });
    etat = reducteurPanier(etat, { type: "points", points: 500 });
    etat = reducteurPanier(etat, { type: "credit", actif: true, echeance: "2026-09-30" });
    expect(etat.points).toBe(500);

    // Retirer le client doit retirer les points et le crédit : les laisser
    // enverrait au serveur des points qui n'appartiennent à personne.
    etat = reducteurPanier(etat, { type: "client", client: null });
    expect(etat.points).toBe(0);
    expect(etat.aCredit).toBe(false);
    expect(etat.echeance).toBeNull();
  });

  it("oublie l'échéance quand la vente cesse d'être à crédit", () => {
    let etat = reducteurPanier(PANIER_VIDE, {
      type: "credit", actif: true, echeance: "2026-09-30",
    });
    etat = reducteurPanier(etat, { type: "credit", actif: false });
    expect(etat.echeance).toBeNull();
  });

  it("traite un produit à l'unité seule sans jamais compter de contenants", () => {
    const etat = ajouter(PANIER_VIDE, detail, 3, 2);
    expect(etat.lignes[0].packageQuantity).toBe(0);
    expect(etat.lignes[0].quantity).toBe(2);
  });

  it("vide tout, y compris le client et les règlements", () => {
    let etat = ajouter(PANIER_VIDE, detail, 0, 1);
    etat = reducteurPanier(etat, {
      type: "reglements",
      reglements: [{ cle: "r1", method: "m1", currency: "CDF", amount: "5000" }],
    });
    etat = reducteurPanier(etat, { type: "vider" });
    expect(etat).toEqual(PANIER_VIDE);
  });
});

/**
 * Le plafond de remise vient du MARCHAND, pas du comptoir.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE COMPTOIR BORNAIT À 100, LE SERVEUR À 50 PAR DÉFAUT.                  │
 * │                                                                          │
 * │ Le réglage vit dans les paramètres de l'organisation. Un marchand qui    │
 * │ l'abaisse à 20 voyait la caisse accepter 45 %, annoncer le prix, imprimer │
 * │ le ticket, puis le serveur refuser la vente ENTIÈRE : le refus arrivait  │
 * │ après le client. Dans l'autre sens, un marchand qui relève son plafond   │
 * │ à 80 ne pouvait pas saisir la remise qu'il avait lui-même autorisée.     │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
describe("plafond de remise de ligne", () => {
  const avecPlafond = (pct: number): EtatPanier =>
    reducteurPanier(ajouter(PANIER_VIDE, casier, 1, 0), {
      type: "plafondRemise",
      pourcentage: pct,
    });

  const remiser = (etat: EtatPanier, pct: number) =>
    reducteurPanier(etat, { type: "remiseLigne", index: 0, pourcentage: pct }).lignes[0]
      .discount_percentage;

  it("borne la remise au plafond de l'organisation", () => {
    expect(remiser(avecPlafond(20), 45)).toBe(20);
  });

  it("laisse passer une remise SOUS le plafond", () => {
    expect(remiser(avecPlafond(20), 15)).toBe(15);
  });

  it("laisse passer une remise que le marchand a RELEVÉE", () => {
    // La borne à 100 n'était pas seulement trop permissive : couplée au défaut
    // serveur à 50, elle laissait saisir ce que le serveur refusait ensuite.
    expect(remiser(avecPlafond(80), 70)).toBe(70);
  });

  it("applique le défaut SERVEUR tant que la session n'a rien dit", () => {
    expect(remiser(ajouter(PANIER_VIDE, casier, 1, 0), 90)).toBe(50);
  });

  it("refuse une remise négative", () => {
    expect(remiser(avecPlafond(20), -5)).toBe(0);
  });

  it("retombe sur le défaut serveur pour un réglage ABERRANT", () => {
    // Le serveur borne pareil : une valeur illisible ou négative rend le
    // défaut, jamais zéro. Zéro fermerait toute remise en silence.
    expect(avecPlafond(Number.NaN).plafondRemise).toBe(50);
    expect(avecPlafond(-10).plafondRemise).toBe(50);
    expect(avecPlafond(250).plafondRemise).toBe(100);
  });

  it("SURVIT au vidage du panier", () => {
    // Le plafond est du jour, pas du panier. Le rendre au défaut à chaque
    // vente rouvrirait la remise que le marchand a fermée, sans que rien ne
    // le signale : la vente suivante repasserait à 50 %.
    const vide = reducteurPanier(avecPlafond(20), { type: "vider" });
    expect(vide.plafondRemise).toBe(20);
    expect(vide.lignes).toEqual([]);
  });

  it("SURVIT à la reprise d'un panier mis en attente", () => {
    // Même règle que pour les prix et le stock, relus à la reprise : un panier
    // rangé hier ne rouvre pas une remise fermée depuis.
    const repris = reducteurPanier(avecPlafond(20), {
      type: "restaurer",
      etat: { ...PANIER_VIDE, plafondRemise: 90 },
    });
    expect(repris.plafondRemise).toBe(20);
  });
});

/**
 * Le motif opposé au caissier, dans l'ordre du serveur.
 *
 * Ces phrases sont la seule chose qu'un caissier reçoit quand la vente ne peut
 * pas se faire. Fausses, elles l'envoient chercher au dépôt une marchandise
 * interdite à la vente, ou synchroniser un appareil qui est à jour.
 */
describe("motifDeRefus", () => {
  const saisie = { packages: 0, loose: 1 };

  it("laisse passer un ajout possible", () => {
    expect(motifDeRefus(casier, [], { packages: 1, loose: 0 })).toBeNull();
  });

  it("oppose le VERROU avant le stock", () => {
    // L'ordre du serveur : `SaleCreateSerializer.validate` refuse les produits
    // bloqués avant de regarder les quantités. Dire « stock insuffisant » sur
    // un article sous inventaire enverrait le caissier chercher au dépôt une
    // marchandise qui est là, mais interdite à la vente.
    const bloque = { ...casier, stock_quantity: 0, stock_packages: 0, stock_loose: 0,
                     verrou_inventaire: "INV-0001" };
    const motif = motifDeRefus(bloque, [], saisie)!;

    expect(motif).toContain("INV-0001");
    expect(motif).not.toContain("Stock insuffisant");
  });

  it("distingue un stock INCONNU d'un stock nul", () => {
    // Relevé à l'écran : « Stock insuffisant : 0 en stock. » sous une carte
    // qui annonçait « Stock inconnu ». Deux affirmations contradictoires sur
    // le même écran, et le caissier ne sait ni laquelle croire ni quoi faire.
    const inconnu = { ...casier, stock_quantity: null, stock_packages: null, stock_loose: null };
    const motif = motifDeRefus(inconnu, [], saisie)!;

    expect(motif).toContain("Aucun stock enregistré");
    expect(motif).not.toContain("0 en stock");
  });

  it("garde « 0 en stock » sur un zéro RÉELLEMENT enregistré", () => {
    // Un zéro enregistré est une information certaine. La noyer dans
    // « inconnu » ferait chercher une synchronisation là où il faut
    // réapprovisionner.
    const vide = { ...casier, stock_quantity: 0, stock_packages: 0, stock_loose: 0 };
    const motif = motifDeRefus(vide, [], saisie)!;

    expect(motif).toContain("Stock insuffisant");
    expect(motif).not.toContain("Aucun stock enregistré");
  });

  it("n'oppose AUCUNE borne quand l'entrepôt tolère le découvert", () => {
    // Stock inconnu ET découvert autorisé : le serveur ne contrôle rien, le
    // comptoir non plus. Refuser ici bloquerait une caisse sans entrepôt.
    const libre = {
      ...casier, stock_quantity: null, stock_packages: null, stock_loose: null,
      allow_negative_stock: true,
    };
    expect(motifDeRefus(libre, [], saisie)).toBeNull();
  });

  it("rend le motif du NOYAU quand le stock est simplement trop court", () => {
    const motif = motifDeRefus(casier, [], { packages: 99, loose: 0 })!;
    expect(motif).toContain("Stock insuffisant");
    expect(motif).toContain("Primus 65cl");
  });
});

/**
 * La remise globale, bornée À LA SAISIE.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE CHAMP MONTRAIT 999 999 PENDANT QUE LE TOTAL APPLIQUAIT LE PLAFOND.   │
 * │                                                                          │
 * │ `basketTotals` borne déjà l'EFFET (`min(saisie, sous-total - remises de  │
 * │ ligne)`), et c'est la seule borne que le serveur oppose : le corps envoyé │
 * │ est donc juste, et le total affiché aussi. Ce qui était faux, c'est le    │
 * │ CHAMP : il gardait le nombre tapé.                                       │
 * │                                                                          │
 * │ Le caissier annonce alors une remise de 999 999 à son client, lit un      │
 * │ total qui ne la reflète pas, et ne peut pas savoir lequel des deux croire.│
 * │ Le corriger dans l'écran l'aurait laissé à refaire au prochain écran qui  │
 * │ saisit une remise ; ici l'état ne peut plus prendre de valeur impossible. │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
describe("plafond de la remise globale", () => {
  const panierDe = (packages: number, loose: number) =>
    ajouter(PANIER_VIDE, casier, packages, loose);

  const remiser = (etat: EtatPanier, montant: number) =>
    reducteurPanier(etat, { type: "remiseGlobale", montant });

  it("borne la saisie au total remisable", () => {
    // Un casier vendu AU PRIX DE GROS : 50 000, et non douze fois le prix de
    // détail. C'est `lineGross` qui en décide, et le plafond en découle.
    const etat = remiser(panierDe(1, 0), 999999);
    expect(etat.remiseGlobale).toBe(50000);
  });

  it("laisse passer une remise possible", () => {
    expect(remiser(panierDe(1, 0), 15000).remiseGlobale).toBe(15000);
  });

  it("refuse une remise négative", () => {
    expect(remiser(panierDe(1, 0), -50).remiseGlobale).toBe(0);
  });

  it("RABAISSE la remise quand une ligne est retirée", () => {
    // Le cas que borner à la seule saisie manquerait : la remise devient
    // impossible APRÈS coup, et le champ garderait un nombre que le total ne
    // reflète plus. Un casier (50 000) plus dix savons (50 000) : 100 000.
    let etat = remiser(ajouter(panierDe(1, 0), detail, 0, 10), 90000);
    expect(etat.remiseGlobale).toBe(90000);

    etat = reducteurPanier(etat, { type: "retirer", index: 0 });
    expect(etat.remiseGlobale).toBe(50000);
  });

  it("RABAISSE la remise quand une ligne est réduite", () => {
    let etat = remiser(panierDe(2, 0), 120000);
    // Déjà ramenée à 100 000 par la saisie : deux casiers, au prix de gros.
    expect(etat.remiseGlobale).toBe(100000);

    etat = reducteurPanier(etat, {
      type: "modifier", index: 0, saisie: { packages: 1, loose: 0 },
    });
    expect(etat.remiseGlobale).toBe(50000);
  });

  it("tombe à zéro quand le panier se vide de ses lignes", () => {
    let etat = remiser(panierDe(1, 0), 50000);
    etat = reducteurPanier(etat, { type: "retirer", index: 0 });
    expect(etat.remiseGlobale).toBe(0);
  });

  it("ne REMONTE jamais une remise d'elle-même", () => {
    // Ajouter un article n'accorde pas une remise que personne n'a saisie.
    const etat = reducteurPanier(remiser(panierDe(1, 0), 1000), {
      type: "ajouter", article: detail, saisie: { packages: 0, loose: 5 }, prix: 100,
    });
    expect(etat.remiseGlobale).toBe(1000);
  });
});
