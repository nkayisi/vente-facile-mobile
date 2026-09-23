import {
  codeDevise,
  economieAnnuelle,
  finEstimee,
  lirePlafond,
  montantDuCycle,
  normaliserNumero,
  numeroUtilisable,
} from "./abonnement";

/**
 * Deux pièges de l'abonnement, tous deux RELEVÉS SUR L'ÉMULATEUR.
 */
describe("codeDevise", () => {
  /**
   * ┌────────────────────────────────────────────────────────────────────────┐
   * │ `Plan.currency` EST UN OBJET, `Subscription.currency` EST UNE CHAÎNE.  │
   * │                                                                        │
   * │ Les deux champs portent le même nom, si bien que rien ne le signale à  │
   * │ la relecture. Passer l'objet au formateur a imprimé « 3 [object        │
   * │ Object] » en tête de la grille des plans, à l'endroit exact où le      │
   * │ marchand cherche le prix.                                              │
   * └────────────────────────────────────────────────────────────────────────┘
   */
  it("lit le code d'un objet devise", () => {
    expect(codeDevise({ id: "x", code: "USD", symbol: "$" })).toBe("USD");
  });

  it("laisse passer une chaîne", () => {
    expect(codeDevise("CDF")).toBe("CDF");
  });

  it("se replie sans jamais rendre un objet", () => {
    expect(codeDevise(null)).toBe("CDF");
    expect(codeDevise(undefined)).toBe("CDF");
    expect(codeDevise({})).toBe("CDF");
    expect(codeDevise({ code: "" })).toBe("CDF");
  });
});

describe("lirePlafond", () => {
  it("dit « 3 sur 12 » quand une borne existe", () => {
    expect(lirePlafond({ label: "Utilisateurs", utilise: 3, limite: 12 })).toBe(
      "3 sur 12"
    );
  });

  /**
   * `null` ne se lit JAMAIS comme zéro. « 3 sur 0 » annoncerait un
   * dépassement imaginaire là où le plan n'impose aucune borne.
   */
  it("n'invente pas une borne quand il n'y en a pas", () => {
    expect(lirePlafond({ label: "Produits", utilise: 3, limite: null })).toBe("3");
  });
});

/**
 * Le montant annoncé, et le numéro envoyé.
 *
 * ⚠ **C'est le SERVEUR qui arrête le montant** (`_subscription_checkout_amount`).
 * Ces trois formules n'existent ici que pour l'ANNONCER avant l'envoi : un
 * écart ferait payer autre chose que ce qui est écrit sur le bouton, et le
 * marchand ne s'en apercevrait qu'au débit.
 */
describe("montantDuCycle", () => {
  const plan = {
    id: "p1", nom: "Pro", code: "PRO", description: "",
    prixMensuel: 30, prixAnnuel: 300, devise: "USD", tier: 2,
    miseEnAvant: false, limites: [], fonctions: [],
  };

  it("mensuel : le prix mensuel", () => {
    expect(montantDuCycle(plan, "monthly")).toBe(30);
  });

  it("trimestriel : TROIS fois le mensuel, et non un prix à part", () => {
    // Le serveur fait `price_monthly * 3`. Il n'existe aucun `price_quarterly`.
    expect(montantDuCycle(plan, "quarterly")).toBe(90);
  });

  it("annuel : le prix annuel, jamais douze fois le mensuel", () => {
    // 12 x 30 = 360, et le plan se vend 300 : recopier la mauvaise formule
    // ferait annoncer soixante dollars de trop.
    expect(montantDuCycle(plan, "yearly")).toBe(300);
  });
});

describe("normaliserNumero", () => {
  it("ne garde que les chiffres, comme le serveur", () => {
    expect(normaliserNumero("+243 997 057 917")).toBe("243997057917");
    expect(normaliserNumero("0997-057-917")).toBe("0997057917");
  });

  it("refuse en deçà de neuf chiffres, pour épargner un aller-retour", () => {
    expect(numeroUtilisable("0997057917")).toBe(true);
    expect(numeroUtilisable("099705")).toBe(false);
    expect(numeroUtilisable("")).toBe(false);
  });

  it("un numéro joliment ponctué reste utilisable", () => {
    // Le piège : compter les caractères SAISIS plutôt que les chiffres
    // refuserait « +243 997 057 917 » pour cause d'espaces.
    expect(numeroUtilisable("+243 997 057 917")).toBe(true);
  });
});

/**
 * Ce que la feuille de paiement ANNONCE avant l'envoi.
 *
 * Deux chiffres que le marchand lit pour décider, et qui doivent donc dire la
 * même chose que le serveur écrira.
 */
describe("economieAnnuelle", () => {
  const plan = (mensuel: number, annuel: number) => ({
    id: "p", nom: "P", code: "P", description: "",
    prixMensuel: mensuel, prixAnnuel: annuel, devise: "USD", tier: 1,
    miseEnAvant: false, limites: [], fonctions: [],
  });

  it("chiffre la remise de l'annuel", () => {
    // 10 x 12 = 120, vendu 100 : c'est 17 % d'économie.
    expect(economieAnnuelle(plan(10, 100))).toBe(17);
  });

  it("rend ZÉRO quand l'annuel n'économise rien", () => {
    // Sans cela, une pastille « -0 % » s'afficherait sur un plan sans remise,
    // ce qui se lit comme une offre alors que ce n'en est pas une.
    expect(economieAnnuelle(plan(10, 120))).toBe(0);
    expect(economieAnnuelle(plan(10, 130))).toBe(0);
  });

  it("rend ZÉRO plutôt qu'un pourcentage inventé sur un plan gratuit", () => {
    expect(economieAnnuelle(plan(0, 0))).toBe(0);
  });
});

describe("finEstimee", () => {
  const LE_10 = new Date("2026-09-10T00:00:00.000Z");

  it("compte TRENTE jours pour un mois, comme le serveur", () => {
    // ⚠ Le serveur fait `duration_months * 30`. Compter en mois calendaires
    // annoncerait une échéance que la facture ne tiendrait pas.
    const fin = finEstimee(LE_10, "monthly", "extend");
    expect(fin?.toISOString().slice(0, 10)).toBe("2026-10-10");
  });

  it("compte TROIS CENT SOIXANTE jours pour un an, et non 365", () => {
    const fin = finEstimee(LE_10, "yearly", "extend");
    expect(fin?.toISOString().slice(0, 10)).toBe("2027-09-05");
  });

  it("en PROLONGATION, part de l'échéance en cours", () => {
    // Repartir d'aujourd'hui ferait perdre au marchand les jours qu'il avait
    // déjà payés - c'est ce que `extend_subscription` évite côté serveur.
    const futur = new Date("2026-12-01T00:00:00.000Z");
    const fin = finEstimee(futur, "monthly", "extend");
    expect(fin?.toISOString().slice(0, 10)).toBe("2026-12-31");
  });

  it("sans échéance en cours, une prolongation n'annonce RIEN", () => {
    expect(finEstimee(null, "monthly", "extend")).toBeNull();
  });
});
