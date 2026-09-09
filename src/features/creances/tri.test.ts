/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE QUE CES TESTS DÉFENDENT : UN ORDRE INTER-DEVISES EST AUSSI FAUX      │
 * │ QU'UNE SOMME INTER-DEVISES.                                             │
 * │                                                                          │
 * │ Le serveur range ses débiteurs par `amount_due` décroissant, toutes      │
 * │ devises confondues : un client devant 50 000 FC - environ dix-huit       │
 * │ dollars - se place au-dessus d'un client devant 3 000 $. Le marchand     │
 * │ relance dans l'ordre de la liste, c'est tout l'usage de cet écran, et il │
 * │ commence donc par le mauvais. Aucun chiffre faux n'apparaît nulle part,  │
 * │ ce qui est exactement ce qui rend le défaut invisible.                   │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import type { Debiteur } from "@/data/rapports";

import { libelleRetard, tonDuRetard, vueDebiteurs } from "./tri";

function debiteur(p: Partial<Debiteur> & { nom: string }): Debiteur {
  return {
    clientId: p.nom.toLowerCase().replace(/\s/g, ""),
    telephone: null,
    devise: "USD",
    montant: 0,
    echu: 0,
    nbFactures: 1,
    plusAncienneJours: 0,
    ...p,
  };
}

const SANS_FILTRE = { recherche: "", seulementEchus: false, devise: null };

describe("vueDebiteurs", () => {
  it("SÉPARE les devises au lieu de les ranger ensemble", () => {
    const v = vueDebiteurs(
      [
        debiteur({ nom: "Petit Franc", devise: "CDF", montant: 50000 }),
        debiteur({ nom: "Gros Dollar", devise: "USD", montant: 3000 }),
      ],
      SANS_FILTRE,
      "montant"
    );

    // Deux sections, et « Gros Dollar » est en tête de la SIENNE : sans les
    // sections, il passait derrière cinquante mille francs valant dix-huit
    // dollars, et c'est lui qu'il fallait appeler en premier.
    expect(v.elements.map((e) => e.type)).toEqual([
      "section",
      "debiteur",
      "section",
      "debiteur",
    ]);
    const sections = v.elements.filter((e) => e.type === "section");
    expect(sections.map((s) => (s.type === "section" ? s.devise : ""))).toEqual([
      "CDF",
      "USD",
    ]);
  });

  it("n'ouvre AUCUNE section quand il n'y a qu'une devise", () => {
    // Un en-tête qui ne sépare rien est du bruit, et il se lit comme le début
    // d'une seconde liste.
    const v = vueDebiteurs(
      [debiteur({ nom: "A", montant: 10 }), debiteur({ nom: "B", montant: 5 })],
      SANS_FILTRE,
      "montant"
    );
    expect(v.elements.every((e) => e.type === "debiteur")).toBe(true);
  });

  it("le sous-total d'une section est celui de SES lignes, dans SA devise", () => {
    const v = vueDebiteurs(
      [
        debiteur({ nom: "A", devise: "USD", montant: 100 }),
        debiteur({ nom: "B", devise: "USD", montant: 25 }),
        debiteur({ nom: "C", devise: "CDF", montant: 9000 }),
      ],
      SANS_FILTRE,
      "montant"
    );
    const totaux = v.elements
      .filter((e) => e.type === "section")
      .map((e) => (e.type === "section" ? [e.devise, e.total, e.nb] : null));
    expect(totaux).toEqual([
      ["CDF", 9000, 1],
      ["USD", 125, 2],
    ]);
  });

  it("range par montant, du plus exposé au moins exposé", () => {
    const v = vueDebiteurs(
      [
        debiteur({ nom: "Petit", montant: 10, plusAncienneJours: 120 }),
        debiteur({ nom: "Gros", montant: 900, plusAncienneJours: 2 }),
      ],
      SANS_FILTRE,
      "montant"
    );
    expect(v.lignes.map((d) => d.nom)).toEqual(["Gros", "Petit"]);
  });

  it("range par ancienneté quand c'est l'urgence qu'on cherche", () => {
    // Les deux questions sont légitimes et n'ont pas la même réponse : une
    // petite dette de cent vingt jours se relance avant une grosse toute
    // fraîche. C'est pour cela qu'il y a deux ordres et non un seul.
    const v = vueDebiteurs(
      [
        debiteur({ nom: "Petit", montant: 10, plusAncienneJours: 120, echu: 10 }),
        debiteur({ nom: "Gros", montant: 900, plusAncienneJours: 2, echu: 900 }),
      ],
      SANS_FILTRE,
      "retard"
    );
    expect(v.lignes.map((d) => d.nom)).toEqual(["Petit", "Gros"]);
  });

  it("départage à égalité, sinon la liste bouge sous le doigt", () => {
    // Deux débiteurs à égalité qui changeraient de place d'un rendu à l'autre
    // font perdre celui qu'on venait d'y repérer.
    const entree = [
      debiteur({ nom: "Zoé", montant: 100 }),
      debiteur({ nom: "Amina", montant: 100 }),
    ];
    const un = vueDebiteurs(entree, SANS_FILTRE, "montant").lignes.map((d) => d.nom);
    const deux = vueDebiteurs([...entree].reverse(), SANS_FILTRE, "montant").lignes.map(
      (d) => d.nom
    );
    expect(un).toEqual(["Amina", "Zoé"]);
    expect(deux).toEqual(un);
  });

  it("cherche par nom ET par numéro : on relance sur le numéro", () => {
    const gens = [
      debiteur({ nom: "Nelly Kayisi", telephone: "0998123456" }),
      debiteur({ nom: "Jean Mukendi", telephone: "0812223344" }),
    ];
    expect(
      vueDebiteurs(gens, { ...SANS_FILTRE, recherche: "nelly" }, "montant").lignes
    ).toHaveLength(1);
    expect(
      vueDebiteurs(gens, { ...SANS_FILTRE, recherche: "0812" }, "montant").lignes[0].nom
    ).toBe("Jean Mukendi");
  });

  it("les décomptes des puces sont calculés AVANT les puces", () => {
    // Une puce dont le décompte tomberait à zéro dès qu'une autre est active
    // se lirait « il n'y en a pas », et non « vous ne les regardez pas ».
    const gens = [
      debiteur({ nom: "A", echu: 50, montant: 50 }),
      debiteur({ nom: "B", echu: 0, montant: 80 }),
    ];
    const filtre = vueDebiteurs(gens, { ...SANS_FILTRE, seulementEchus: true }, "montant");
    expect(filtre.lignes.map((d) => d.nom)).toEqual(["A"]);
    expect(filtre.nbTous).toBe(2);
    expect(filtre.nbEchus).toBe(1);
  });

  it("la recherche, elle, RÉDUIT le périmètre et donc les décomptes", () => {
    const gens = [debiteur({ nom: "Amina", echu: 5 }), debiteur({ nom: "Zoé", echu: 5 })];
    const v = vueDebiteurs(gens, { ...SANS_FILTRE, recherche: "amina" }, "montant");
    expect(v.nbTous).toBe(1);
    expect(v.nbEchus).toBe(1);
  });

  it("annonce les devises présentes, pour que les puces existent", () => {
    const v = vueDebiteurs(
      [debiteur({ nom: "A", devise: "USD" }), debiteur({ nom: "B", devise: "CDF" })],
      SANS_FILTRE,
      "montant"
    );
    expect(v.devises).toEqual(["CDF", "USD"]);
  });

  it("une liste vide ne fabrique ni section ni ligne", () => {
    const v = vueDebiteurs([], SANS_FILTRE, "montant");
    expect(v.elements).toEqual([]);
    expect(v.nbTous).toBe(0);
    expect(v.devises).toEqual([]);
  });

  it("les clés sont uniques quand un client doit dans DEUX devises", () => {
    // Le serveur rend une ligne par couple client-devise : une clé qui
    // n'emporterait que l'identifiant ferait disparaître l'une des deux de la
    // liste virtualisée, sans erreur.
    const v = vueDebiteurs(
      [
        debiteur({ nom: "Nelly", devise: "USD", montant: 10 }),
        debiteur({ nom: "Nelly", devise: "CDF", montant: 20 }),
      ],
      SANS_FILTRE,
      "montant"
    );
    const cles = v.elements.map((e) => e.cle);
    expect(new Set(cles).size).toBe(cles.length);
  });
});

describe("tonDuRetard", () => {
  it("suit EXACTEMENT les seuils de la balance âgée", () => {
    // Une pastille qui basculerait au rouge à soixante jours quand le rapport
    // bascule à quatre-vingt-onze ferait dire deux choses différentes au même
    // écran, sur la même créance.
    expect(tonDuRetard(0)).toBe("neutral");
    expect(tonDuRetard(1)).toBe("warning");
    expect(tonDuRetard(60)).toBe("warning");
    expect(tonDuRetard(61)).toBe("destructive");
  });
});

describe("libelleRetard", () => {
  it("compte en jours tant que le compte parle, puis en mois", () => {
    expect(libelleRetard(9)).toBe("9 j");
    expect(libelleRetard(60)).toBe("60 j");
    // Au-delà de deux mois, « 217 j » ne dit plus rien à personne.
    expect(libelleRetard(90)).toBe("3 mois");
  });

  it("ne dit rien quand rien n'est en retard", () => {
    // Zéro jour n'est pas « échu depuis 0 j » : rien n'est en retard, et le
    // dire autrement inquiète pour rien.
    expect(libelleRetard(0)).toBe("");
  });
});

describe("une devise filtrée qui n'existe plus", () => {
  it("ne filtre RIEN, et l'annonce", () => {
    // Le marchand filtre sur les francs, puis cherche un nom qui ne doit qu'en
    // dollars. La puce « CDF » disparaît avec le filtre qu'elle portait : si
    // celui-ci restait appliqué, la liste serait vide sans qu'aucun bouton à
    // l'écran ne permette de la débloquer.
    const v = vueDebiteurs(
      [debiteur({ nom: "Nelly", devise: "USD", montant: 100 })],
      { recherche: "nelly", seulementEchus: false, devise: "CDF" },
      "montant"
    );
    expect(v.deviseActive).toBeNull();
    expect(v.lignes.map((d) => d.nom)).toEqual(["Nelly"]);
  });

  it("mais une devise présente filtre bien", () => {
    const v = vueDebiteurs(
      [
        debiteur({ nom: "A", devise: "USD", montant: 100 }),
        debiteur({ nom: "B", devise: "CDF", montant: 90000 }),
      ],
      { recherche: "", seulementEchus: false, devise: "CDF" },
      "montant"
    );
    expect(v.deviseActive).toBe("CDF");
    expect(v.lignes.map((d) => d.nom)).toEqual(["B"]);
    // Et plus aucune section : il ne reste qu'une devise à l'écran.
    expect(v.elements.every((e) => e.type === "debiteur")).toBe(true);
  });
});
