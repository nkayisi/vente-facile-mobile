/**
 * Le ticket du client.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE FICHIER N'EXISTAIT PAS, ET C'EST POURQUOI LE DÉFAUT A TENU.          │
 * │                                                                          │
 * │ `donneesTicketVente` rangeait `totaux.total`, issu de `basketTotals`,    │
 * │ donc exprimé en devise PRINCIPALE - et l'étiquetait de la devise de      │
 * │ FACTURE. `totaux.totalFacture` était déclaré dans le contexte et jamais  │
 * │ lu. Sur un établissement tenu en dollars qui facture en francs, le       │
 * │ papier remis au client annonçait un montant deux mille huit cents fois   │
 * │ trop petit, sans erreur, sans journal, et sans que rien ne diffère tant  │
 * │ qu'on ne facture que dans sa devise principale - ce qui est le cas de    │
 * │ toutes les données de développement.                                     │
 * │                                                                          │
 * │ Le POS web y échappait parce qu'il attend le serveur et imprime le total │
 * │ qu'il lui rend. Le terminal doit imprimer HORS LIGNE : il totalise       │
 * │ lui-même, et c'est là que le raccourci a été pris.                       │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import { createCurrencyTable, saleCurrencyTotals } from "@vente-facile/core/pos";

import { buildSaleReceipt } from "@vente-facile/core/receipt";

import { rendreTexte } from "@/printing/render-text";

import { donneesTicketVente, type ContexteTicket } from "./ticket";
import { PANIER_VIDE, reducteurPanier, type EtatPanier } from "./etat-panier";
import type { ArticlePos } from "./catalogue";

/**
 * Un établissement tenu en FRANCS, qui facture aussi en dollars.
 *
 * `exchange_rate` se lit « unités de la devise PRINCIPALE pour une unité de
 * celle-ci » : le dollar à 2 800 vaut 2 800 francs. Le prendre à l'envers rend
 * des montants qui ont l'air plausibles et un test qui passe pour la mauvaise
 * raison.
 */
const devises = createCurrencyTable(
  [
    { currency_code: "CDF", exchange_rate: "1", currency_decimal_places: 0, is_primary: true },
    { currency_code: "USD", exchange_rate: "2800", currency_decimal_places: 2 },
  ],
  { code: "CDF", decimal_places: 2 }
);

const savon = {
  id: "p1",
  name: "Savon",
  sku: null, barcode: null, image: null, categoryId: null, categoryName: null,
  selling_price: "28000",
  wholesale_price: null,
  is_taxable: false,
  tax_rate: "0",
  selling_mode: "retail_only",
  units_per_package: null,
  unit_name: "pièce",
  packaging_unit_name: null,
  allow_auto_unpacking: false,
  track_inventory: true,
  allow_negative_stock: false,
  stock_quantity: 100,
  stock_packages: null,
  stock_loose: 100,
  reserved_quantity: 0,
  verrou_inventaire: null,
} satisfies ArticlePos;

const casier = {
  ...savon,
  id: "p2",
  name: "Primus 65cl",
  selling_price: "5600",
  wholesale_price: "50400",
  selling_mode: "wholesale_and_retail",
  units_per_package: 12,
  unit_name: "bouteille",
  packaging_unit_name: "casier",
  allow_auto_unpacking: true,
  stock_packages: 8,
  stock_loose: 12,
} satisfies ArticlePos;

const ajouter = (etat: EtatPanier, article: ArticlePos, packages: number, loose: number) =>
  reducteurPanier(etat, {
    type: "ajouter",
    article,
    saisie: { packages, loose },
    prix: Number(article.selling_price),
  });

/** Le contexte que l'écran d'encaissement construit, pour la devise demandée. */
function contexte(etat: EtatPanier, deviseFacture: string): ContexteTicket {
  const facture = saleCurrencyTotals({
    lines: etat.lignes,
    currencies: devises,
    invoiceCurrency: deviseFacture,
  });
  return {
    reference: "VT-20260904-Q5L8-0001",
    date: new Date("2026-09-04T10:00:00Z"),
    etat,
    totaux: { facture, remiseFidelite: 0, monnaie: 0 },
    deviseFacture,
    snapshot: null,
    aCredit: false,
    restantDu: 0,
  };
}

describe("Le ticket porte les montants de la devise qu'il annonce", () => {
  it("facture en dollars ce qui est tarifé en francs, sans laisser l'étiquette mentir", () => {
    // Deux savons à 28 000 FC : vingt dollars au taux de 2 800, et non
    // « 56 000 », qui est le montant en devise principale.
    const etat = ajouter(PANIER_VIDE, savon, 0, 2);
    const t = donneesTicketVente(contexte(etat, "USD"));

    expect(t.currency).toBe("USD");
    expect(t.total).toBe(20);
    expect(t.subtotal).toBe(20);
    // La ligne aussi : un ticket dont les lignes ne somment pas son total est
    // le premier chiffre qu'un client conteste.
    expect(t.items[0].total).toBe(20);
    expect(t.items[0].unitPrice).toBe(10);
  });

  it("laisse le montant intact quand la facture EST la devise principale", () => {
    // La non-régression qui compte : c'est la configuration de toutes les
    // données de développement, et de l'immense majorité des marchands.
    const etat = ajouter(PANIER_VIDE, savon, 0, 2);
    const t = donneesTicketVente(contexte(etat, "CDF"));

    expect(t.currency).toBe("CDF");
    expect(t.total).toBe(56000);
    expect(t.items[0].unitPrice).toBe(28000);
  });

  it("imprime le tarif du CONTENANT, pas le prix unitaire multiplié", () => {
    // Un casier à 18 $ quand la bouteille est à 2 $ : douze bouteilles achetées
    // au casier coûtent 18 et non 24. C'est tout l'intérêt commercial du gros,
    // et le client le lit sur son papier.
    const etat = ajouter(PANIER_VIDE, casier, 1, 3);
    const t = donneesTicketVente(contexte(etat, "USD"));

    expect(t.items[0].unitPrice).toBe(18);
    expect(t.items[0].total).toBe(24); // 18 + 3 x 2
    expect(t.items[0].quantityLabel).toBe("1 casier + 3 bouteilles");
  });

  it("somme ses lignes jusqu'à son propre total, dans les deux devises", () => {
    const etat = ajouter(ajouter(PANIER_VIDE, savon, 0, 2), casier, 1, 3);
    for (const devise of ["CDF", "USD"]) {
      const t = donneesTicketVente(contexte(etat, devise));
      const somme = t.items.reduce((s, i) => s + i.total, 0);
      expect(somme).toBe(t.subtotal);
      expect(t.total).toBe(t.subtotal);
    }
  });
});

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ `Reglement.method` EST UN IDENTIFIANT, ET IL PARTAIT SUR LE PAPIER.     │
 * │                                                                          │
 * │ `buildSaleReceipt` emploie `payments[].method` comme LIBELLÉ de la ligne │
 * │ de règlement : le client lisait « 3f2a9c1e-8b44-…  20,00 $ ». Sur tout  │
 * │ ticket encaissé au comptoir, par les trois transports, et depuis         │
 * │ toujours.                                                                │
 * │                                                                          │
 * │ Rien ne pouvait le signaler : c'est une chaîne valide en face d'un       │
 * │ montant juste. Et sur les données de développement le défaut se voyait   │
 * │ d'autant moins que le POS WEB, lui, résout déjà le nom - comme le fait   │
 * │ la RÉIMPRESSION du même ticket, qui joint `paymentMethods.name`. Le      │
 * │ papier original et son propre duplicata ne portaient donc pas la même    │
 * │ ligne, pour la même vente.                                               │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
describe("Le règlement porte le NOM du moyen de paiement", () => {
  const ESPECES = "3f2a9c1e-8b44-4c21-9f0e-7a1d5b2c8e33";
  const moyens = [{ id: ESPECES, name: "Espèces" }];

  /** Un panier réglé, tel que l'écran d'encaissement le construit. */
  function regle(deviseFacture: string, methode = ESPECES, liste = moyens) {
    const etat = reducteurPanier(ajouter(PANIER_VIDE, savon, 0, 2), {
      type: "reglements",
      reglements: [
        { cle: "r1", method: methode, currency: deviseFacture, amount: "20" },
      ],
    });
    return donneesTicketVente({ ...contexte(etat, deviseFacture), moyens: liste });
  }

  it("imprime « Espèces », jamais l'identifiant du moyen", () => {
    expect(regle("USD").payments[0].method).toBe("Espèces");
  });

  it("se replie sur « Règlement » quand le moyen est introuvable", () => {
    // Un moyen désactivé entre la vente et la réimpression. Le repli n'est pas
    // décoratif : sans lui, le papier porterait un libellé VIDE en face d'un
    // montant, ce qui est pire qu'un mot générique. C'est celui du POS web.
    expect(regle("USD", ESPECES, []).payments[0].method).toBe("Règlement");
    expect(regle("USD", "inconnu").payments[0].method).toBe("Règlement");
  });

  it("se replie aussi sur un nom vide, que la base accepte", () => {
    const anonyme = [{ id: ESPECES, name: "   " }];
    expect(regle("USD", ESPECES, anonyme).payments[0].method).toBe("Règlement");
  });
});

/**
 * Le balayage qui couvre le TUYAU, et non un appelant.
 *
 * Il rend le ticket en TEXTE - donc par le chemin qu'emprunte réellement une
 * imprimante Bluetooth - et refuse qu'une seule ligne porte une forme
 * d'identifiant. Une vente en a quatre sous la main (article, client, moyen de
 * paiement, session) : c'est le genre de valeur qui se glisse dans un champ
 * d'affichage sans que rien ne lève.
 *
 * Une seule vente suffit à couvrir presque tout le modèle partagé : en-tête
 * d'organisation, bandeau, bloc d'identité, articles, colonnes de montants,
 * total et pied y passent tous.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UNE PREMIÈRE VERSION DE CE BALAYAGE EST PASSÉE AU VERT SUR LE DÉFAUT.   │
 * │                                                                          │
 * │ Elle cherchait un UUID COMPLET, ses cinq groupes. Or une ligne de        │
 * │ règlement est un couple libellé / montant, et `paire()` abrège le        │
 * │ LIBELLÉ : sur 42 colonnes, l'identifiant sortait                         │
 * │ « 3f2a9c1e-8b44-4c21-9f0e-7a1d5b2. 56 000 FC », tronqué au point. Le    │
 * │ motif ne pouvait donc RIEN reconnaître, et le test déclarait conforme le │
 * │ papier dont le défaut venait d'être mesuré. Relevé par mutation, pas par │
 * │ relecture - c'est le même piège que `\bqueryset\b`, qui ne mordait pas   │
 * │ sur `self.get_queryset()`.                                               │
 * │                                                                          │
 * │ On raisonne donc par JETON, et non par motif global : un identifiant ne  │
 * │ contient que des chiffres hexadécimaux et des tirets, là où tout ce      │
 * │ qu'un ticket porte légitimement de long et de tireté - un numéro de      │
 * │ document - commence par un préfixe dont au moins une lettre n'est pas    │
 * │ hexadécimale (le V de « VT », le Z de « CZ », le P de « DEP »).          │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
describe("Aucun identifiant ne sort sur le papier", () => {
  /**
   * Les jetons qui ressemblent à un identifiant, tronqués ou non.
   *
   * Douze signes et deux tirets au minimum : une date (« 2026-09-04 », dix
   * signes) n'en est pas un, et un identifiant coupé court - « 3f2a9c1e-8b44-4c21 »
   * - en est encore un.
   */
  function identifiants(ligne: string): string[] {
    return ligne
      .split(/\s+/)
      // La troncature ajoute un point, et une ponctuation de fin n'appartient
      // pas au jeton.
      .map((jeton) => jeton.replace(/[.,;:]+$/, ""))
      .filter(
        (jeton) =>
          jeton.length >= 12 &&
          /^[0-9a-f-]+$/i.test(jeton) &&
          (jeton.match(/-/g) ?? []).length >= 2
      );
  }

  const client = {
    id: "9c1b7d54-2f6a-4e88-b0c3-5d4e6f7a8b90",
    name: "Nelly Kayisi",
    phone: "+243 997 876 765",
    allow_credit: true,
    credit_limit: "0",
    current_balance: "0",
  };

  /** Le ticket d'une vente qui porte tous les identifiants d'un comptoir. */
  function lignesDuTicket() {
    const moyen = "3f2a9c1e-8b44-4c21-9f0e-7a1d5b2c8e33";
    let etat = ajouter(PANIER_VIDE, savon, 0, 2);
    etat = reducteurPanier(etat, { type: "client", client });
    etat = reducteurPanier(etat, {
      type: "reglements",
      reglements: [{ cle: "r1", method: moyen, currency: "CDF", amount: "56000" }],
    });
    const donnees = donneesTicketVente({
      ...contexte(etat, "CDF"),
      moyens: [{ id: moyen, name: "Espèces" }],
      registerName: "Caisse principale",
      warehouseName: "Depot central",
    });
    return rendreTexte(buildSaleReceipt(donnees), { paperWidth: 58 }).map((l) => l.text);
  }

  it("balaie un ticket entier sans y trouver d'identifiant", () => {
    const lignes = lignesDuTicket();
    // UN BALAYAGE QUI NE BALAIE RIEN PASSE AU VERT : ce dépôt l'a déjà payé
    // quatre fois. On compte donc ce qu'on a lu avant de conclure.
    expect(lignes.length).toBeGreaterThan(15);
    expect(lignes.flatMap(identifiants)).toEqual([]);
  });

  it("porte bien les vraies valeurs à la place", () => {
    const papier = lignesDuTicket().join("\n");
    expect(papier).toContain("Especes");
    expect(papier).toContain("Nelly Kayisi");
    expect(papier).toContain("Depot central");
    expect(papier).toContain("Caisse principale");
  });

  it("MORD sur la forme que le défaut produisait, TRONQUÉE comprise", () => {
    // La forme relevée sur le papier, point de troncature compris.
    expect(identifiants("3f2a9c1e-8b44-4c21-9f0e-7a1d5b2. 56 000 FC")).toHaveLength(1);
    // Et sur une troncature plus dure, qu'un montant long provoquerait.
    expect(identifiants("3f2a9c1e-8b44-4c21 12 500 000 000 FC")).toHaveLength(1);
    // Sans confondre avec ce qu'un ticket porte légitimement. Le numéro de
    // document est le cas à ne pas rater : sa date et son code d'appareil sont
    // parfois entièrement hexadécimaux (« 20260904-A1B2-0001 »), et c'est son
    // PRÉFIXE qui l'en distingue.
    expect(identifiants("Recu n: VT-20260904-A1B2-0001")).toEqual([]);
    expect(identifiants("Date: 2026-09-04 10:00")).toEqual([]);
    expect(identifiants("Tel.: +243 997 876 765")).toEqual([]);
    expect(identifiants("Sous-total 56 000 FC")).toEqual([]);
  });
});

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE BLOC FIDÉLITÉ NE SORTAIT QUE SI DES POINTS ÉTAIENT DÉPENSÉS.         │
 * │                                                                          │
 * │ `pointsGagnes` et `pointsRestants` étaient DÉCLARÉS dans `ContexteTicket`│
 * │ depuis l'origine, et personne ne les passait : `earned` valait 0 et      │
 * │ `balance` restait `undefined`. Or `showsLoyalty` du noyau exige l'un des │
 * │ trois. Le client rattaché qui venait lire son cumul ne le trouvait donc  │
 * │ nulle part, alors que le back-office l'imprime depuis toujours.          │
 * │                                                                          │
 * │ Ce n'est pas un défaut de calcul : c'est un défaut de CÂBLAGE, invisible │
 * │ au type-check - les deux champs sont facultatifs - et invisible à la     │
 * │ relecture du ticket, qui les lit correctement.                           │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
describe("Le ticket porte le cumul de points du client", () => {
  const CLIENT = {
    id: "c1",
    name: "Nelly Kayisi",
    phone: null,
    allow_credit: true,
    credit_limit: "0",
    current_balance: "0",
  };

  function avecClient(patch: Partial<ContexteTicket>) {
    const etat: EtatPanier = { ...PANIER_VIDE, client: CLIENT };
    return donneesTicketVente({ ...contexte(etat, "USD"), ...patch });
  }

  it("annonce le solde MÊME quand aucun point n'est dépensé", () => {
    // C'est exactement le cas signalé : un client rattaché, aucune déduction,
    // et le papier ne disait rien de son cumul.
    expect(avecClient({ pointsRestants: 1798.57 }).loyalty).toMatchObject({
      balance: 1798.57,
    });
  });

  it("porte les trois lignes du back-office quand elles existent", () => {
    expect(
      avecClient({ pointsGagnes: 2, pointsRestants: 655.72 }).loyalty
    ).toMatchObject({ earned: 2, balance: 655.72 });
  });

  it("ne porte AUCUN bloc sans client : il n'y a pas de compte à annoncer", () => {
    expect(
      donneesTicketVente({ ...contexte(PANIER_VIDE, "USD"), pointsRestants: 900 }).loyalty
    ).toBeUndefined();
  });

  it("laisse le solde ABSENT plutôt que nul quand l'appelant n'en a pas", () => {
    // `undefined` et `0` ne disent pas la même chose : le premier retire la
    // ligne, le second affirme « vous n'avez plus rien ».
    expect(avecClient({}).loyalty?.balance).toBeUndefined();
  });
});
