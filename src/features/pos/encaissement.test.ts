/**
 * Ce qui decide a l'encaissement.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN COMPTANT SOUS-PAYE ETAIT UNE VENTE A CREDIT, SANS QUE PERSONNE       │
 * │ NE LE DEMANDE.                                                          │
 * │                                                                          │
 * │ Le terminal DEDUISAIT le credit du reste a payer (`aCredit = reste > 0`) │
 * │ et ouvrait son champ montant VIDE : a l'arrivee sur l'ecran, avant la    │
 * │ moindre frappe, le bouton annoncait « Enregistrer a credit » et un       │
 * │ bandeau reclamait un client. Un caissier qui se trompait d'un chiffre    │
 * │ portait la difference au compte d'un client ; s'il n'y en avait pas, le  │
 * │ bouton se fermait sans un mot.                                          │
 * │                                                                          │
 * │ Le credit est desormais un CHOIX du selecteur, comme au back-office, et  │
 * │ un sous-paiement est un REFUS chiffre.                                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import type { ClientPos } from "./etat-panier";
import {
  blocageEncaissement,
  libelleConfirmation,
  libelleMontant,
  motifCreditFerme,
  OPTION_CREDIT,
  phraseBlocage,
  phraseCreditFerme,
  suffixeOptionCredit,
  type EntreeEncaissement,
} from "./encaissement";

const CLIENT: ClientPos = {
  id: "c1",
  name: "Nelly Kayisi",
  phone: null,
  allow_credit: true,
  credit_limit: "0",
  current_balance: "0",
};

/** Une vente de comptoir ordinaire : rien ne la bloque. */
function entree(patch: Partial<EntreeEncaissement> = {}): EntreeEncaissement {
  return {
    mode: "comptant",
    nbLignes: 2,
    sessionOuverte: true,
    moyenChoisi: true,
    referenceExigee: false,
    reference: "",
    montantLisible: true,
    totalFacture: 11.6,
    payeFacture: 11.6,
    client: null,
    creditBloque: false,
    ...patch,
  };
}

describe("le mode de reglement", () => {
  it("nomme un acompte quand la vente part a credit", () => {
    expect(libelleMontant("comptant")).toBe("Montant reçu");
    expect(libelleMontant("credit")).toBe("Acompte facultatif");
  });

  it("porte le montant dans le bouton en comptant, jamais en credit", () => {
    expect(libelleConfirmation("comptant", "11,6 $")).toBe("Encaisser 11,6 $");
    expect(libelleConfirmation("credit", "11,6 $")).toBe("Confirmer la vente à crédit");
  });
});

describe("l'option credit du selecteur", () => {
  it("est fermee sans client : il n'y a pas de compte ou porter la dette", () => {
    expect(motifCreditFerme(null)).toBe("sans-client");
    expect(suffixeOptionCredit("sans-client")).toBe(" (client requis)");
    expect(phraseCreditFerme("sans-client", null)).toMatch(/client/i);
  });

  it("est fermee quand la fiche du client refuse le credit", () => {
    expect(motifCreditFerme({ ...CLIENT, allow_credit: false })).toBe("non-autorise");
    expect(phraseCreditFerme("non-autorise", "Nelly Kayisi")).toContain("Nelly Kayisi");
  });

  it("reste OUVERTE sur un plafond a zero : zero veut dire SANS plafond", () => {
    // `allow_credit` et `credit_limit` sont deux regles distinctes. Les
    // confondre refuserait le credit a tous les clients d'un marchand qui ne
    // pose aucun plafond, c'est-a-dire au cas le plus courant.
    expect(motifCreditFerme({ ...CLIENT, credit_limit: "0" })).toBeNull();
    expect(suffixeOptionCredit(null)).toBe("");
  });

  it("reste ouverte quand l'autorisation n'est pas renseignee", () => {
    // `null` ne se lit jamais comme un refus : le serveur tranchera.
    expect(motifCreditFerme({ ...CLIENT, allow_credit: null })).toBeNull();
  });

  it("emploie la meme sentinelle que le back-office", () => {
    expect(OPTION_CREDIT).toBe("__credit__");
  });
});

describe("ce qui ferme le bouton", () => {
  it("se ferme sur une ligne qui ne s'encaisse pas, même payée en totalité", () => {
    // Un inventaire démarré pendant que la feuille est ouverte : le comptoir
    // l'a vu (le verrou se relit), la feuille doit le voir aussi, sinon le
    // ticket sort pour une vente que le serveur refusera.
    const motif = "Primus est bloqué par un inventaire en cours (INV-1).";
    expect(blocageEncaissement(entree({ motifsLignes: [motif] }))).toBe(
      "lignes-non-encaissables"
    );
    expect(phraseBlocage("lignes-non-encaissables")).toContain("proforma");
    expect(blocageEncaissement(entree({ motifsLignes: [] }))).toBeNull();
  });

  it("laisse passer une vente de comptoir ordinaire", () => {
    expect(blocageEncaissement(entree())).toBeNull();
  });

  it("REFUSE un comptant sous-paye au lieu de le porter a credit", () => {
    expect(blocageEncaissement(entree({ payeFacture: 5 }))).toBe("sous-paye");
  });

  it("tolere l'arrondi, comme l'affichage", () => {
    // Sans la meme tolerance que « paye en totalite », le bouton reste ferme
    // alors que l'ecran annonce la vente soldee.
    expect(blocageEncaissement(entree({ payeFacture: 11.6 - 1e-9 }))).toBeNull();
  });

  it("n'exige AUCUN acompte en credit : le champ y est facultatif", () => {
    expect(
      blocageEncaissement(entree({ mode: "credit", client: CLIENT, payeFacture: 0 }))
    ).toBeNull();
  });

  it("exige un client en credit, et l'oppose AVANT le plafond", () => {
    // Sans client il n'y a pas de verdict de credit du tout : annoncer
    // « limite depassee » designerait un compte qui n'existe pas.
    expect(
      blocageEncaissement(entree({ mode: "credit", client: null, creditBloque: true }))
    ).toBe("credit-sans-client");
  });

  it("oppose le verdict de credit du noyau", () => {
    expect(
      blocageEncaissement(entree({ mode: "credit", client: CLIENT, creditBloque: true }))
    ).toBe("credit-refuse");
  });

  it("nomme d'abord ce qui empeche TOUTE vente", () => {
    // Un caissier sans session ouverte doit lire « ouvrez une caisse », pas
    // « il manque 12 $ ».
    expect(blocageEncaissement(entree({ sessionOuverte: false, payeFacture: 0 }))).toBe(
      "sans-session"
    );
    expect(blocageEncaissement(entree({ nbLignes: 0, sessionOuverte: false }))).toBe(
      "panier-vide"
    );
  });

  it("refuse un montant illisible plutot que de le lire comme zero", () => {
    // « 12 500 » rendait `NaN`, ramene a 0 en silence : la vente partait pour
    // rien, et le caissier ne voyait qu'un bouton qui ne repond pas.
    expect(blocageEncaissement(entree({ montantLisible: false }))).toBe(
      "montant-illisible"
    );
  });

  it("exige la reference d'un mobile money, et seulement en comptant", () => {
    expect(blocageEncaissement(entree({ referenceExigee: true }))).toBe(
      "reference-manquante"
    );
    expect(
      blocageEncaissement(entree({ referenceExigee: true, reference: "  TX42 " }))
    ).toBeNull();
    // En credit rien n'est remis : il n'y a aucune transaction a referencer.
    expect(
      blocageEncaissement(
        entree({ mode: "credit", client: CLIENT, referenceExigee: true, payeFacture: 0 })
      )
    ).toBeNull();
  });

  it("refuse un total negatif", () => {
    expect(blocageEncaissement(entree({ totalFacture: -1, payeFacture: 0 }))).toBe(
      "total-negatif"
    );
  });
});

describe("la phrase sous le bouton", () => {
  it("se tait quand l'ecran explique deja l'empechement", () => {
    // Repeter sous le bouton ce qu'un bandeau annonce trois lignes plus haut
    // fait douter qu'il s'agisse du meme empechement.
    expect(phraseBlocage(null)).toBeNull();
    expect(phraseBlocage("sous-paye")).toBeNull();
    expect(phraseBlocage("sans-session")).toBeNull();
    expect(phraseBlocage("credit-sans-client")).toBeNull();
    expect(phraseBlocage("credit-refuse")).toBeNull();
  });

  it("parle quand rien d'autre ne le fait", () => {
    for (const b of ["sans-moyen", "montant-illisible", "reference-manquante", "total-negatif"] as const) {
      expect(phraseBlocage(b)).toBeTruthy();
    }
  });
});
