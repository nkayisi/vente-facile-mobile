import {
  causeGrilleVide,
  messageGrilleVide,
  type DiagnosticCatalogue,
} from "./etat-catalogue";

/**
 * Un catalogue sain : des articles reçus, vendables, VISIBLES, aucun filtre.
 *
 * ⚠ `visibles` suit `vendables` par défaut. Le laisser à zéro ferait tomber
 * chaque cas dans `"perimetre"`, et les six tests de filtre passeraient pour
 * une raison qui n'est pas la leur.
 */
function diag(p: Partial<DiagnosticCatalogue> = {}): DiagnosticCatalogue {
  const base = { recus: 12, vendables: 12, recherche: false, rubrique: false };
  const fusion = { ...base, ...p };
  return { ...fusion, visibles: p.visibles ?? fusion.vendables };
}

describe("la cause d'une grille vide", () => {
  it("une table vide est un catalogue absent", () => {
    expect(causeGrilleVide(diag({ recus: 0, vendables: 0 }))).toBe("catalogue-absent");
  });

  it("des articles reçus dont aucun n'est vendable ne sont PAS un catalogue absent", () => {
    expect(causeGrilleVide(diag({ recus: 12, vendables: 0 }))).toBe("aucun-vendable");
  });

  it("un terme n'explique rien quand il n'y a rien à chercher", () => {
    // Le défaut pris par l'autre bout : « essayez un autre mot » sur une base
    // vide envoie chercher ce qui n'existe pas.
    expect(causeGrilleVide(diag({ recus: 0, vendables: 0, recherche: true })))
      .toBe("catalogue-absent");
    expect(causeGrilleVide(diag({ recus: 12, vendables: 0, recherche: true })))
      .toBe("aucun-vendable");
  });

  it("une rubrique non plus", () => {
    expect(causeGrilleVide(diag({ recus: 12, vendables: 0, rubrique: true })))
      .toBe("aucun-vendable");
  });

  it("sur un catalogue vendable, le terme explique", () => {
    expect(causeGrilleVide(diag({ recherche: true }))).toBe("recherche");
  });

  it("sur un catalogue vendable sans terme, c'est la rubrique", () => {
    expect(causeGrilleVide(diag({ rubrique: true }))).toBe("rubrique");
  });

  it("le terme l'emporte sur la rubrique : c'est ce qu'on vient de taper", () => {
    expect(causeGrilleVide(diag({ recherche: true, rubrique: true }))).toBe("recherche");
  });
});

describe("le message rendu au caissier", () => {
  /**
   * ┌────────────────────────────────────────────────────────────────────────┐
   * │ LE GARDE-FOU DU LOT : ON N'ENVOIE PAS SYNCHRONISER QUAND LE CATALOGUE  │
   * │ EST DÉJÀ LÀ.                                                           │
   * │                                                                        │
   * │ C'est le défaut exact de T1 : le caissier synchronise, tout réussit,   │
   * │ la grille reste vide, et il recommence. Un message qui désigne le      │
   * │ mauvais geste coûte plus qu'un message absent.                         │
   * └────────────────────────────────────────────────────────────────────────┘
   */
  it("aucune cause n'est levée par une synchronisation quand le catalogue est là", () => {
    const fautifs = [
      diag({ recus: 12, vendables: 0 }),
      diag({ recus: 1, vendables: 0 }),
      diag({ recus: 12, vendables: 0, recherche: true }),
      diag({ recus: 12, vendables: 0, rubrique: true }),
      diag({ recherche: true }),
      diag({ rubrique: true }),
    ]
      .map(messageGrilleVide)
      .filter((m) => m.leveParSynchronisation)
      .map((m) => m.cause);

    expect(fautifs).toEqual([]);
  });

  /**
   * Le contrôle de PROSE, en plus du drapeau, et il porte sur l'IMPÉRATIF.
   *
   * ⚠ Chercher « synchronis » dans la prose crierait sur « synchroniser n'y
   * changera rien », qui est la phrase la plus utile de l'écran : c'est elle
   * qui empêche le caissier de retenter le geste. On ne vise donc que la forme
   * qui ORDONNE, et seulement là où le geste n'aboutit pas.
   */
  it("aucune cause non levée par la synchronisation n'en porte l'ordre", () => {
    const fautifs = [
      diag({ recus: 12, vendables: 0 }),
      diag({ recherche: true }),
      diag({ rubrique: true }),
    ]
      .map(messageGrilleVide)
      .filter((m) => /synchronisez/i.test(`${m.titre} ${m.message}`))
      .map((m) => m.cause);

    expect(fautifs).toEqual([]);
  });

  it("mais elle l'est bien quand la table est réellement vide", () => {
    // Le contrôle en sens inverse : sans lui, on ne saurait pas si les deux
    // règles ci-dessus refusent trop. Un drapeau toujours faux les passerait.
    const m = messageGrilleVide(diag({ recus: 0, vendables: 0 }));
    expect(m.leveParSynchronisation).toBe(true);
    expect(m.message).toMatch(/synchronisez/i);
  });

  it("le nombre d'articles reçus est NOMMÉ : il prouve que le tirage a marché", () => {
    expect(messageGrilleVide(diag({ recus: 12, vendables: 0 })).message).toContain("12");
  });

  it("un seul article reçu s'accorde au singulier", () => {
    const m = messageGrilleVide(diag({ recus: 1, vendables: 0 }));
    expect(m.message).toContain("1 article est bien reçu");
    expect(m.message).not.toContain("articles sont");
  });

  it("le message dit OÙ se règle une cause qu'on ne lève pas au comptoir", () => {
    expect(messageGrilleVide(diag({ recus: 12, vendables: 0 })).message)
      .toMatch(/back-office/i);
  });

  it("chaque cause a son propre titre : deux causes ne se lisent pas pareil", () => {
    const titres = [
      diag({ recus: 0, vendables: 0 }),
      diag({ recus: 12, vendables: 0 }),
      diag({ recherche: true }),
      diag({ rubrique: true }),
    ].map((d) => messageGrilleVide(d).titre);

    expect(new Set(titres).size).toBe(titres.length);
  });
});

describe("le périmètre de catalogue, et la cause qu'on ne sait pas nommer", () => {
  /**
   * ┌──────────────────────────────────────────────────────────────────────────┐
   * │ `d.rubrique` ÉTAIT DÉCLARÉ, COLLECTÉ, ET LU NULLE PART.                 │
   * │                                                                          │
   * │ `causeGrilleVide` retombait sur `"rubrique"` par défaut : sur une grille │
   * │ vide SANS aucun filtre - un caissier dont le périmètre masque tout, un  │
   * │ gérant sans entrepôt - l'écran rendait « Aucun article dans cette        │
   * │ rubrique · Choisissez Tout » alors que « Tout » était déjà sélectionné.  │
   * │ Un cul-de-sac, et c'est le défaut même que ce module existe pour         │
   * │ retirer.                                                                 │
   * └──────────────────────────────────────────────────────────────────────────┘
   */
  it("une grille vide SANS filtre n'est PAS une rubrique vide", () => {
    const cause = causeGrilleVide(diag({ recherche: false, rubrique: false }));
    expect(cause).not.toBe("rubrique");
  });

  it("un catalogue vendable hors périmètre se dit « perimetre »", () => {
    // Le cas réel : sept articles en vente, aucun stocké dans mon dépôt.
    expect(causeGrilleVide(diag({ recus: 12, vendables: 7, visibles: 0 })))
      .toBe("perimetre");
  });

  it("le périmètre passe AVANT les filtres : aucun mot ne le lève", () => {
    // Une cause structurelle d'abord : « essayez un autre mot » serait faux,
    // il n'y a aucun mot qui ramène un article hors de mon périmètre.
    expect(
      causeGrilleVide(diag({ vendables: 7, visibles: 0, recherche: true }))
    ).toBe("perimetre");
    expect(
      causeGrilleVide(diag({ vendables: 7, visibles: 0, rubrique: true }))
    ).toBe("perimetre");
  });

  it("mais il passe APRÈS « aucun vendable » : on ne nomme pas deux causes", () => {
    // Si rien n'est vendable, rien n'est visible non plus. La cause à dire est
    // le réglage des articles, pas l'affectation d'entrepôt.
    expect(causeGrilleVide(diag({ recus: 12, vendables: 0, visibles: 0 })))
      .toBe("aucun-vendable");
  });

  it("le message du périmètre NOMME l'affectation, et le nombre en vente", () => {
    const m = messageGrilleVide(diag({ recus: 12, vendables: 7, visibles: 0 }));
    expect(m.message).toContain("7");
    expect(m.message).toMatch(/entrepôt/i);
    expect(m.message).toMatch(/back-office/i);
  });

  it("le périmètre OFFRE la synchronisation, parce qu'elle y change tout", () => {
    /*
     * ┌──────────────────────────────────────────────────────────────────────┐
     * │ CE TEST AFFIRMAIT L'INVERSE, SOUS LE COMMENTAIRE « ET SURTOUT :      │
     * │ SYNCHRONISER N'Y CHANGE RIEN ». Il décrivait fidèlement un           │
     * │ comportement FAUX, ce qui le rendait permanent - la situation que ce │
     * │ dépôt a déjà payée sur le mois calendaire.                           │
     * │                                                                      │
     * │ Le périmètre vient de l'instantané de session, que seule une         │
     * │ synchronisation réécrit : une fois l'affectation faite au            │
     * │ back-office, synchroniser est le geste qui l'applique. Et `visibles` │
     * │ dépend de lignes de `stocks`, qui descendent par le tirage.          │
     * └──────────────────────────────────────────────────────────────────────┘
     */
    const m = messageGrilleVide(diag({ recus: 12, vendables: 7, visibles: 0 }));
    expect(m.leveParSynchronisation).toBe(true);
    // Et le message ne dit plus le contraire du bouton qu'il porte.
    expect(m.message).not.toMatch(/n.y changera rien/i);
    expect(m.message).toMatch(/synchronisation/i);
  });

  it("un seul article en vente s'accorde au singulier", () => {
    const m = messageGrilleVide(diag({ recus: 3, vendables: 1, visibles: 0 }));
    expect(m.message).toContain("1 article est en vente");
    expect(m.message).not.toContain("articles sont");
  });

  it("une rubrique RÉELLEMENT sélectionnée se dit toujours « rubrique »", () => {
    // Le contrôle : la nouvelle cause ne doit pas avaler l'ancienne.
    expect(causeGrilleVide(diag({ rubrique: true }))).toBe("rubrique");
  });

  it("un vide inexpliqué se DIT, il ne s'invente pas une cause", () => {
    const cause = causeGrilleVide(diag({ recus: 12, vendables: 12, visibles: 12 }));
    expect(cause).toBe("indetermine");
    const m = messageGrilleVide(diag({ recus: 12, vendables: 12, visibles: 12 }));
    // Le seul geste proposé est celui qui ne peut pas nuire.
    expect(m.leveParSynchronisation).toBe(true);
    // Et il n'envoie PAS choisir « Tout », qui est déjà choisi.
    expect(m.message).not.toMatch(/Tout/);
  });

  it("les six causes ont six titres distincts", () => {
    const titres = [
      diag({ recus: 0, vendables: 0 }),
      diag({ recus: 12, vendables: 0 }),
      diag({ vendables: 7, visibles: 0 }),
      diag({ recherche: true }),
      diag({ rubrique: true }),
      diag({}),
    ].map((d) => messageGrilleVide(d).titre);
    expect(new Set(titres).size).toBe(titres.length);
  });
});
