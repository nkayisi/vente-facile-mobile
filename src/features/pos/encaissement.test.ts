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
  montantApresBasculeDevise,
  blocageEncaissement,
  libelleConfirmation,
  libelleMontant,
  motifCreditFerme,
  OPTION_CREDIT,
  phraseBlocage,
  phraseCreditFerme,
  recalerReglement,
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

describe("le recalage du montant recu", () => {
  const decimalesDe = (code: string) => (code === "CDF" ? 0 : 2);
  const arrondir = (m: number, code: string) => {
    const f = Math.pow(10, decimalesDe(code));
    return Math.round((m + Number.EPSILON) * f) / f;
  };

  /** La conversion BRUTE du noyau (`convert`), celle que le plafond recoit. */
  const brut = (m: number, de: string, vers: string) =>
    de === vers ? m : de === "USD" ? m * 2300 : m / 2300;

  const conv = { convertirBrut: brut, decimalesDe };

  /**
   * Ce que `tendersIn` refait en SENS INVERSE pour juger le paiement.
   *
   * ⚠ C'est `convertMoney` - conversion PUIS arrondi - et c'est tout l'enjeu :
   * le defaut vivait dans les deux arrondis successifs, aller et retour. Un
   * test dont le retour n'arrondit pas ne peut RIEN voir.
   */
  const retour = (montant: number, de: string, vers: string) =>
    arrondir(brut(montant, de, vers), vers);

  it("repose le reste du dans la devise ENCAISSEE", () => {
    expect(
      recalerReglement({
        mode: "comptant",
        totalFacture: 20,
        deviseFacture: "USD",
        deviseReglement: "CDF",
        ...conv,
      })
    ).toBe("46000");
  });

  it("laisse le montant tel quel quand les deux devises coincident", () => {
    expect(
      recalerReglement({
        mode: "comptant",
        totalFacture: 11.6,
        deviseFacture: "USD",
        deviseReglement: "USD",
        ...conv,
      })
    ).toBe("11.6");
  });

  /**
   * ⚠ LE CUL-DE-SAC QU'ON REFERME.
   *
   * Facture en CDF, encaissement en USD : `26 681 / 2300 = 11,60043...`. Arrondi
   * AU PLUS PROCHE, cela donnait 11,60 ; `tendersIn` reconvertissait
   * `11,60 x 2300 = 26 680`, soit UN FRANC de moins que la facture. Le bouton
   * « Encaisser » se fermait sur une vente que l'ecran venait lui-meme de
   * preremplir, et aucun montant en dollars ne pouvait la solder.
   */
  it("SOLDE la facture meme quand la devise encaissee est plus grossiere", () => {
    const montant = recalerReglement({
      mode: "comptant",
      totalFacture: 26681,
      deviseFacture: "CDF",
      deviseReglement: "USD",
      ...conv,
    });
    expect(montant).toBe("11.61");
    // Le controle reel : reconverti vers la facture, il ne manque RIEN.
    expect(retour(Number(montant), "USD", "CDF")).toBeGreaterThanOrEqual(26681);
  });

  /**
   * ⚠ LA PLAGE EST LARGE PARCE QU'UNE PLAGE ETROITE EST AVEUGLE.
   *
   * La premiere version balayait `26000..27000`, autour du seul exemple connu.
   * Mesure : cette plage contient ZERO valeur fautive, si bien que le test
   * passait pendant que le defaut vivait. C'est le motif d'echec que ce depot
   * documente deja - un test ecrit sur une valeur imaginee valide
   * l'imagination.
   */
  /**
   * ⚠ LA REFERENCE EST ENTIERE, ET C'EST TOUT L'INTERET.
   *
   * Au taux du jeu d'essai, UN CENT VAUT EXACTEMENT 23 FRANCS : l'attendu se
   * calcule donc en arithmetique entiere, sans jamais emprunter le flottant
   * qu'on eprouve. Une premiere version comparait a
   * `Math.ceil(f / 2300 * 100) / 100`, c'est-a-dire au MEME produit fautif :
   * elle validait le defaut au lieu de l'attraper.
   *
   * La plage est large parce qu'une plage etroite est aveugle. La premiere
   * version balayait `26000..27000`, autour du seul exemple connu ; mesure,
   * cette plage contient ZERO valeur fautive, si bien que le test passait
   * pendant que le defaut vivait. C'est le motif d'echec que ce depot
   * documente deja - un test ecrit sur une valeur imaginee valide
   * l'imagination.
   */
  it("rend le plus petit montant qui solde, facture en francs", () => {
    for (let f = 1; f <= 60000; f += 1) {
      const m = Number(
        recalerReglement({
          mode: "comptant",
          totalFacture: f,
          deviseFacture: "CDF",
          deviseReglement: "USD",
          ...conv,
        })
      );
      // Il SOLDE : reconverti vers la facture, il ne manque rien.
      expect(retour(m, "USD", "CDF")).toBeGreaterThanOrEqual(f);
      // Et c'est le PLUS PETIT : un cent de moins ne solde plus.
      const unCentDeMoins = Math.round((m - 0.01) * 100) / 100;
      if (unCentDeMoins > 0) {
        expect(retour(unCentDeMoins, "USD", "CDF")).toBeLessThan(f);
      }
      // Attendu exact, en cents : 125 valeurs de cette plage en sortaient.
      expect(Math.round(m * 100)).toBe(Math.ceil(f / 23));
    }
  });

  it("solde aussi dans l'autre sens, facture en dollars reglee en francs", () => {
    for (let cents = 1; cents <= 200000; cents += 1) {
      const x = cents / 100;
      const m = Number(
        recalerReglement({
          mode: "comptant",
          totalFacture: x,
          deviseFacture: "USD",
          deviseReglement: "CDF",
          ...conv,
        })
      );
      expect(retour(m, "CDF", "USD")).toBeGreaterThanOrEqual(x);
      // Un cent vaut 23 francs, exactement : l'attendu n'a pas de reste.
      // 6 397 valeurs de cette plage sortaient un franc au-dessus.
      expect(m).toBe(cents * 23);
    }
  });

  /**
   * ⚠ LE CAS ORDINAIRE, ET CELUI QUI ETAIT FAUX.
   *
   * `convert` du noyau rend le montant TEL QUEL quand les deux devises
   * coincident : le plafond ne doit donc RIEN deplacer. La garde absolue
   * ajoutait pourtant une unite mineure sur 4,58 % des montants a deux
   * decimales - sur le chemin mono-devise, qui est celui de presque toutes les
   * ventes. Le champ portait « 4.11 » et le bouton annoncait « 4,12 $ ».
   */
  it("reste neutre a devises egales, sur TOUTE la plage", () => {
    for (let cents = 1; cents <= 200000; cents += 1) {
      const x = cents / 100;
      const rendu = recalerReglement({
        mode: "comptant",
        totalFacture: x,
        deviseFacture: "USD",
        deviseReglement: "USD",
        ...conv,
      });
      if (Number(rendu) !== x) {
        throw new Error(`${x} USD est ressorti a ${rendu}`);
      }
    }
    for (let f = 1; f <= 50000; f += 1) {
      const rendu = recalerReglement({
        mode: "comptant",
        totalFacture: f,
        deviseFacture: "CDF",
        deviseReglement: "CDF",
        ...conv,
      });
      if (Number(rendu) !== f) throw new Error(`${f} CDF est ressorti a ${rendu}`);
    }
  });

  it("rend 4,11 pour une vente de 4,11 $, et c'est la valeur temoin", () => {
    // `4.11 * 100` vaut 411.00000000000006 : un ulp au-dessus de l'entier, donc
    // `Math.ceil` montait a 412. La valeur est nommee pour qu'on ne la perde
    // pas dans un balayage qu'on retrecirait un jour.
    expect(
      recalerReglement({
        mode: "comptant",
        totalFacture: 4.11,
        deviseFacture: "USD",
        deviseReglement: "USD",
        ...conv,
      })
    ).toBe("4.11");
  });

  it("NE TOUCHE A RIEN en credit : l'acompte est facultatif", () => {
    // Le remplir ferait d'une vente a credit une vente soldee, qui
    // n'inscrirait aucune dette. Le back-office a paye ce defaut.
    expect(
      recalerReglement({
        mode: "credit",
        totalFacture: 20,
        deviseFacture: "USD",
        deviseReglement: "USD",
        ...conv,
      })
    ).toBeNull();
  });
});

describe("la bascule de la devise d'encaissement", () => {
  const decimalesDe = (code: string) => (code === "CDF" ? 0 : 2);
  const arrondir = (m: number, code: string) => {
    const f = Math.pow(10, decimalesDe(code));
    return Math.round((m + Number.EPSILON) * f) / f;
  };
  const brut = (m: number, de: string, vers: string) =>
    de === vers ? m : de === "USD" ? m * 2300 : m / 2300;
  const arrondi = (m: number, de: string, vers: string) =>
    arrondir(brut(m, de, vers), vers);

  const conv = {
    convertirBrut: brut,
    convertirArrondi: arrondi,
    decimalesDe,
  };

  /**
   * ⚠ LE CUL-DE-SAC QU'ON REFERME, PAR SA SECONDE PORTE.
   *
   * `montantExigible` le fermait deja au prereemplissage ; la bascule de devise
   * le rouvrait, en convertissant AU PLUS PROCHE. Le champ portait 11,60, le
   * bouton annoncait 11,61, et aucun montant en dollars ne soldait la facture.
   */
  it("SOLDE encore apres etre passe a une devise plus grossiere", () => {
    const m = montantApresBasculeDevise({
      mode: "comptant",
      saisie: "26681",
      deviseAvant: "CDF",
      totalFacture: 26681,
      deviseFacture: "CDF",
      deviseReglement: "USD",
      ...conv,
    });
    expect(m).toBe("11.61");
    // Le controle reel : reconverti vers la facture, il ne manque RIEN.
    expect(arrondi(Number(m), "USD", "CDF")).toBeGreaterThanOrEqual(26681);
  });

  it("ne releve RIEN quand la conversion suffit deja", () => {
    // 23 000 FC valent exactement 10 $ : rien a plafonner.
    expect(
      montantApresBasculeDevise({
        mode: "comptant",
        saisie: "23000",
        deviseAvant: "CDF",
        totalFacture: 23000,
        deviseFacture: "CDF",
        deviseReglement: "USD",
        ...conv,
      })
    ).toBe("10");
  });

  /**
   * ⚠ L'AUTRE MOITIE DE LA REGLE, et celle qu'on casserait en premier.
   *
   * « On convertit, on n'efface jamais » ne bouge pas : relever un montant que
   * le caissier a voulu PARTIEL serait lui reprendre sa saisie.
   */
  it("laisse un montant PARTIEL tel quel, converti", () => {
    expect(
      montantApresBasculeDevise({
        mode: "comptant",
        saisie: "11500",
        deviseAvant: "CDF",
        totalFacture: 26681,
        deviseFacture: "CDF",
        deviseReglement: "USD",
        ...conv,
      })
    ).toBe("5");
  });

  it("NE TOUCHE A RIEN en credit : l'acompte est facultatif", () => {
    expect(
      montantApresBasculeDevise({
        mode: "credit",
        saisie: "26681",
        deviseAvant: "CDF",
        totalFacture: 26681,
        deviseFacture: "CDF",
        deviseReglement: "USD",
        ...conv,
      })
    ).toBe("11.6");
  });

  it("laisse un champ vide vide, et une saisie illisible verbatim", () => {
    const base = {
      mode: "comptant" as const,
      deviseAvant: "CDF",
      totalFacture: 26681,
      deviseFacture: "CDF",
      deviseReglement: "USD",
      ...conv,
    };
    expect(montantApresBasculeDevise({ ...base, saisie: "" })).toBe("");
    expect(montantApresBasculeDevise({ ...base, saisie: "12,5,0" })).toBe("12,5,0");
  });

  it("ne bouge pas quand les deux devises coincident", () => {
    expect(
      montantApresBasculeDevise({
        mode: "comptant",
        saisie: "26681",
        deviseAvant: "CDF",
        totalFacture: 26681,
        deviseFacture: "CDF",
        deviseReglement: "CDF",
        ...conv,
      })
    ).toBe("26681");
  });

  /**
   * Le balayage qui compte : sur toute facture en francs dont le champ porte le
   * montant exact, basculer en dollars doit laisser le bouton OUVERT.
   */
  it("ne ferme JAMAIS le bouton sur une facture qui etait soldee", () => {
    for (let f = 1; f <= 40000; f += 1) {
      const m = montantApresBasculeDevise({
        mode: "comptant",
        saisie: String(f),
        deviseAvant: "CDF",
        totalFacture: f,
        deviseFacture: "CDF",
        deviseReglement: "USD",
        ...conv,
      });
      if (arrondi(Number(m), "USD", "CDF") + 1e-6 < f) {
        throw new Error(`${f} FC bascule en ${m} $, qui ne solde plus`);
      }
    }
  });
});
