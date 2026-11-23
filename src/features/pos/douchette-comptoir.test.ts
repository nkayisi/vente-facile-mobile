import {
  COMPTOIR_AU_REPOS,
  frapperAuComptoir,
  retenirTerme,
  scanDiffuse,
  termeCourant,
  type EffetTouche,
  type Recherche,
} from "./douchette-comptoir";

/**
 * Rejoue une suite de touches comme le comptoir le fait : la recherche suit
 * chaque effet `terme`, et un scan la vide.
 */
function jouer(
  touches: [string, number][],
  depart: Recherche = { focalisee: false, terme: "" }
): { effets: EffetTouche[]; recherche: Recherche } {
  let etat = COMPTOIR_AU_REPOS;
  let recherche = { ...depart };
  const effets: EffetTouche[] = [];
  for (const [touche, instant] of touches) {
    const r = frapperAuComptoir(etat, touche, instant, recherche);
    etat = r.etat;
    effets.push(r.effet);
    if (r.effet.type === "terme") recherche = { ...recherche, terme: r.effet.terme };
    if (r.effet.type === "scan" && r.effet.terme !== null) recherche = { ...recherche, terme: r.effet.terme };
  }
  return { effets, recherche };
}

/** Une rafale de lecteur : un caractère toutes les `pas` millisecondes, puis Entrée. */
function rafale(code: string, depart = 1000, pas = 8): [string, number][] {
  const touches: [string, number][] = [...code].map((c, i) => [c, depart + i * pas]);
  touches.push(["Enter", depart + code.length * pas]);
  return touches;
}

const scans = (effets: EffetTouche[]) => effets.filter((e) => e.type === "scan");

describe("le lecteur au comptoir, rien de focalisé", () => {
  it("une rafale terminée par Entrée est un scan, et ne touche pas la recherche", () => {
    const { effets } = jouer(rafale("6001087011234"));
    expect(scans(effets)).toEqual([{ type: "scan", candidats: ["6001087011234"], terme: null }]);
    expect(effets.slice(0, -1).every((e) => e.type === "rien")).toBe(true);
  });

  it("une frappe lente n'est PAS un scan, et ne fait rien hors de la recherche", () => {
    const { effets } = jouer([["5", 0], ["0", 200], ["0", 400], ["0", 600], ["Enter", 800]]);
    expect(effets.every((e) => e.type === "rien")).toBe(true);
  });
});

describe("le lecteur au comptoir, recherche focalisée", () => {
  it("chaque caractère s'ajoute au terme, comme le navigateur le fait", () => {
    const { effets, recherche } = jouer(
      [["c", 0], ["o", 250]],
      { focalisee: true, terme: "" }
    );
    expect(effets).toEqual([
      { type: "terme", terme: "c" },
      { type: "terme", terme: "co" },
    ]);
    expect(recherche.terme).toBe("co");
  });

  it("une rafale vide le champ, comme le web", () => {
    const { effets, recherche } = jouer(rafale("96385074"), { focalisee: true, terme: "" });
    expect(scans(effets)).toEqual([{ type: "scan", candidats: ["96385074"], terme: "" }]);
    expect(recherche.terme).toBe("");
  });

  it("un premier caractère en retard : le champ entier devient le second candidat", () => {
    const touches: [string, number][] = [["8", 1000], ...rafale("7687GJHGD", 1060)];
    const { effets } = jouer(touches, { focalisee: true, terme: "" });
    expect(scans(effets)).toEqual([
      { type: "scan", candidats: ["7687GJHGD", "87687GJHGD"], terme: "" },
    ]);
  });

  it("Entrée sans rafale valide la recherche, avec le terme tapé", () => {
    const { effets } = jouer([["a", 0], ["s", 300], ["Enter", 600]], { focalisee: true, terme: "" });
    expect(effets[effets.length - 1]).toEqual({ type: "valider", terme: "as" });
  });

  it("le retour arrière retire un caractère, sans couper un caractère composé", () => {
    const { recherche } = jouer([["Backspace", 0]], { focalisee: true, terme: "café😀" });
    expect(recherche.terme).toBe("café");
  });

  it("une touche de fonction ne fait rien", () => {
    const { effets } = jouer([["Shift", 0]], { focalisee: true, terme: "x" });
    expect(effets).toEqual([{ type: "rien" }]);
  });
});

describe("un code reçu par message système", () => {
  it("est un scan complet, hors de la recherche", () => {
    expect(scanDiffuse(" 600123 ")).toEqual({ type: "scan", candidats: ["600123"], terme: null });
  });

  it("un message vide ne fait rien", () => {
    expect(scanDiffuse("  ")).toEqual({ type: "rien" });
  });
});

describe("le terme entre deux rendus", () => {
  it("une rafale garde tous ses caractères quand l'écran ne s'est pas redessiné", () => {
    let tenu = null as ReturnType<typeof retenirTerme> | null;
    let etat = COMPTOIR_AU_REPOS;
    const rendu = "8"; // l'écran affiche encore le premier caractère
    const effets: EffetTouche[] = [];
    for (const [touche, instant] of rafale("7687GJHGD", 1060)) {
      const c = termeCourant(tenu, rendu);
      tenu = c.tenu;
      const r = frapperAuComptoir(etat, touche, instant, { focalisee: true, terme: c.terme });
      etat = r.etat;
      effets.push(r.effet);
      if (r.effet.type === "terme") tenu = retenirTerme(tenu, rendu, r.effet.terme);
    }
    expect(scans(effets)).toEqual([
      { type: "scan", candidats: ["7687GJHGD", "87687GJHGD"], terme: "" },
    ]);
  });

  it("une valeur rendue en retard laisse la dernière écrite", () => {
    const tenu = retenirTerme(retenirTerme(null, "8", "87"), "8", "876");
    expect(termeCourant(tenu, "87").terme).toBe("876");
    expect(termeCourant(tenu, "8").terme).toBe("876");
  });

  it("l'écran rattrapé, on repart de lui", () => {
    const tenu = retenirTerme(null, "8", "87");
    expect(termeCourant(tenu, "87")).toEqual({ tenu: null, terme: "87" });
  });

  it("une valeur venue d'ailleurs (le clavier à l'écran) fait foi", () => {
    const tenu = retenirTerme(null, "8", "87");
    expect(termeCourant(tenu, "abc")).toEqual({ tenu: null, terme: "abc" });
  });
});
