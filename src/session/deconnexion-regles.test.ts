import {
  confirmationAvant,
  FILE_VIDE,
  issueApresEnvoi,
  MESSAGE_OCCUPE,
  messageImpasse,
  nbEnFile,
  phrasePerissables,
  type EtatFile,
} from "./deconnexion-regles";

const file = (p: Partial<EtatFile>): EtatFile => ({ ...FILE_VIDE, ...p });

describe("le dialogue de confirmation", () => {
  it("ne promet pas une synchronisation quand il n'y a rien à envoyer", () => {
    const c = confirmationAvant(FILE_VIDE);
    expect(c.action).toBe("Se déconnecter");
    expect(c.message).toContain("Tout est synchronisé");
  });

  it("annonce l'envoi quand la file porte quelque chose", () => {
    const c = confirmationAvant(file({ pending: 3 }));
    expect(c.action).toBe("Synchroniser et déconnecter");
    expect(c.message).toContain("3 opérations");
  });

  it("accorde le singulier", () => {
    expect(confirmationAvant(file({ pending: 1 })).message).toContain("1 opération n'a pas");
  });
});

describe("l'issue après l'envoi", () => {
  it("purge quand la file est vide", () => {
    expect(issueApresEnvoi(FILE_VIDE)).toBe("purger");
  });

  it("compte les quatre états qui survivent", () => {
    expect(nbEnFile(file({ pending: 1, inflight: 2, quarantined: 3, blocked: 4 }))).toBe(10);
  });

  /**
   * ⚠ LE TEST QUI COMPTE.
   *
   * Une quarantaine ne repartira jamais seule, mais elle EXISTE : derrière
   * chacune il peut y avoir une vente encaissée dont un client tient le ticket.
   * Purger sans le dire serait le défaut qu'on referme.
   */
  it("ne purge JAMAIS sur une quarantaine seule", () => {
    expect(issueApresEnvoi(file({ quarantined: 1 }))).toBe("impasse_decision");
  });

  it("ne purge jamais sur une opération bloquée seule", () => {
    expect(issueApresEnvoi(file({ blocked: 1 }))).toBe("impasse_decision");
  });

  /**
   * Le réseau passe AVANT la décision : renvoyer vers « Opérations à corriger »
   * pour une panne de réseau ferait chercher une faute là où il n'y en a pas.
   */
  it("annonce le réseau tant qu'il reste du réessayable", () => {
    expect(issueApresEnvoi(file({ pending: 1, quarantined: 5 }))).toBe("impasse_reseau");
    expect(issueApresEnvoi(file({ inflight: 1, blocked: 5 }))).toBe("impasse_reseau");
  });
});

describe("le message d'impasse", () => {
  it("distingue hors ligne et temporisation", () => {
    const hors = messageImpasse(file({ pending: 2 }), file({ pending: 2 }), false);
    expect(hors.message).toContain("Le serveur est injoignable");

    const enLigne = messageImpasse(file({ pending: 2 }), file({ pending: 2 }), true);
    expect(enLigne.message).toContain("d'elles-mêmes dans quelques minutes");
  });

  it("dit ce qui est parti quand une partie est passée", () => {
    const m = messageImpasse(file({ pending: 5 }), file({ pending: 2 }), false);
    expect(m.message).toContain("3 opérations sont parties");
  });

  it("ne raconte rien quand rien n'est parti", () => {
    const m = messageImpasse(file({ pending: 2 }), file({ pending: 2 }), false);
    expect(m.message).not.toContain("sont parties");
  });

  it("offre de réessayer sur le réseau, et de corriger sur une décision", () => {
    expect(messageImpasse(file({ pending: 1 }), file({ pending: 1 }), false)).toMatchObject({
      offreReessayer: true,
      offreCorriger: false,
    });
    expect(messageImpasse(file({ blocked: 1 }), file({ blocked: 1 }), true)).toMatchObject({
      offreReessayer: false,
      offreCorriger: true,
    });
  });

  /**
   * ⚠ NI « RÉESSAYEZ », NI « SYNCHRONISEZ » SUR UNE OPÉRATION BLOQUÉE.
   *
   * Les deux sont sans effet : elle attend un abonnement ou un droit, pas le
   * réseau. Le marchand qui lit cette phrase cherche du réseau, le trouve,
   * synchronise, et rien ne bouge - potentiellement des jours.
   */
  it("ne propose jamais de synchroniser ce qu'un droit retient", () => {
    for (const f of [file({ blocked: 2 }), file({ quarantined: 3 }), file({ blocked: 1, quarantined: 1 })]) {
      const m = messageImpasse(f, f, true);
      expect(m.message.toLowerCase()).not.toMatch(/synchronis|réessay/);
      expect(m.offreReessayer).toBe(false);
    }
  });

  it("nomme ce qui débloque une opération retenue", () => {
    const m = messageImpasse(file({ blocked: 1 }), file({ blocked: 1 }), true);
    expect(m.message).toMatch(/abonnement|permission/);
  });

  /**
   * ⚠ La modale ne détruit JAMAIS. Quoi qu'il reste, elle dit que se déconnecter
   * en effaçant perdrait ces opérations : c'est ce qui justifie l'issue
   * « Se déconnecter sans effacer », la seule sortie non destructrice.
   */
  it("dit toujours que l'effacement perdrait ce qui reste", () => {
    for (const f of [
      file({ pending: 1 }),
      file({ blocked: 1 }),
      file({ quarantined: 1 }),
      file({ pending: 1, blocked: 1, quarantined: 1 }),
    ]) {
      expect(messageImpasse(f, f, true).message).toContain("perdrait");
    }
  });
});

describe("les photos comptent comme des ventes non envoyées", () => {
  /**
   * ⚠ LE PIÈGE QU'ON A PAYÉ.
   *
   * Une photo en attente est la SEULE copie d'un fichier : le serveur ne l'a
   * pas, et `viderDossierPhotos()` la détruit. La laisser hors du compte
   * revenait à l'effacer en silence.
   */
  it("une photo seule empêche la purge", () => {
    expect(nbEnFile(file({ photos: 1 }))).toBe(1);
    expect(issueApresEnvoi(file({ photos: 1 }))).toBe("impasse_decision");
  });

  it("le message nomme la photo et dit qu'elle n'existe qu'ici", () => {
    const m = messageImpasse(file({ photos: 2 }), file({ photos: 2 }), true);
    expect(m.message).toContain("2 photos d'articles n'ont pas pu partir");
    expect(m.message).toContain("que sur ce terminal");
  });

  /**
   * Réessayer a du sens pour une photo - son envoi est un `PATCH` qui peut
   * échouer sur le réseau - jamais pour une opération qu'un droit retient.
   */
  it("offre de réessayer une photo, jamais de corriger", () => {
    expect(messageImpasse(file({ photos: 1 }), file({ photos: 1 }), true)).toMatchObject({
      offreReessayer: true,
      offreCorriger: false,
    });
  });

  it("renvoie quand même vers les opérations quand un droit retient aussi", () => {
    expect(messageImpasse(file({ photos: 1, blocked: 1 }), file({ photos: 1, blocked: 1 }), true))
      .toMatchObject({ offreReessayer: true, offreCorriger: true });
  });

  it("la photo s'ajoute au message de réseau sans l'effacer", () => {
    const m = messageImpasse(file({ pending: 1, photos: 1 }), file({ pending: 1, photos: 1 }), false);
    expect(m.message).toContain("Le serveur est injoignable");
    expect(m.message).toContain("photo d'article");
  });
});

describe("ce qui ne redescendra jamais", () => {
  it("se tait quand il n'y a rien à annoncer", () => {
    expect(phrasePerissables({ paniers: 0, documents: 0 })).toBe("");
  });

  /**
   * ⚠ « Tout redescendra à la prochaine connexion » est FAUX pour ces deux-là :
   * ils sont purement locaux. Le marchand ne doit pas découvrir la perte quand
   * un client revient avec son ticket.
   */
  it("nomme les paniers et les documents, au singulier comme au pluriel", () => {
    expect(phrasePerissables({ paniers: 1, documents: 0 })).toContain("1 panier en attente");
    expect(phrasePerissables({ paniers: 0, documents: 3 })).toContain("3 documents à réimprimer");
    const deux = phrasePerissables({ paniers: 2, documents: 5 });
    expect(deux).toContain("2 paniers en attente");
    expect(deux).toContain("5 documents à réimprimer");
  });

  /**
   * ⚠ LE VERBE ET LE PRONOM COMPTAIENT DEUX CHOSES DIFFÉRENTES.
   *
   * Le verbe comptait les OBJETS, le pronom comptait les GROUPES. Sur deux
   * paniers et aucun document, la phrase sortait : « 2 paniers en attente
   * SERONT PERDUS : IL N'EXISTE que sur ce terminal. »
   */
  it("accorde le verbe et le pronom sur la même pluralité", () => {
    const seul = phrasePerissables({ paniers: 1, documents: 0 });
    expect(seul).toContain("sera perdu");
    expect(seul).toContain("il n'existe");

    const unDocument = phrasePerissables({ paniers: 0, documents: 1 });
    expect(unDocument).toContain("sera perdu");
    expect(unDocument).toContain("il n'existe");

    // Deux objets d'un SEUL groupe : c'est le cas que la divergence cassait.
    const deuxPaniers = phrasePerissables({ paniers: 2, documents: 0 });
    expect(deuxPaniers).toContain("seront perdus");
    expect(deuxPaniers).toContain("ils n'existent");

    const lesDeux = phrasePerissables({ paniers: 1, documents: 1 });
    expect(lesDeux).toContain("seront perdus");
    expect(lesDeux).toContain("ils n'existent");
  });

  it("la confirmation les porte, et se tait quand il n'y en a pas", () => {
    expect(confirmationAvant(FILE_VIDE, { paniers: 2, documents: 0 }).message).toContain(
      "2 paniers en attente"
    );
    expect(confirmationAvant(FILE_VIDE).message).not.toContain("panier");
  });
});

describe("un verrou occupé", () => {
  /**
   * ⚠ Ce n'est PAS une panne de réseau. On n'a pas essayé : un autre cycle
   * tournait. Annoncer « le serveur est injoignable » enverrait le marchand
   * chercher du réseau qui est déjà là.
   */
  it("ne parle ni de serveur injoignable ni de droit manquant", () => {
    expect(MESSAGE_OCCUPE.message.toLowerCase()).not.toMatch(/injoignable|abonnement|permission/);
    expect(MESSAGE_OCCUPE.message).toMatch(/attendez|réessayez/i);
  });
});
