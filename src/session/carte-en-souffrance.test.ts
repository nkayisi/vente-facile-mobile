/**
 * Ce que les deux voiles DISENT, éprouvé sans appareil.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE QUI SE JOUE ICI EST UNE PERTE DE DONNÉES, PAS UNE TOURNURE.           │
 * │                                                                          │
 * │ Le voile de mise à jour conseille au marchand d'installer une nouvelle    │
 * │ version. Sur un terminal de comptoir sans magasin, cela veut dire un APK  │
 * │ posé à la main, donc une désinstallation, donc la base effacée. Une carte │
 * │ qui affirme « tout est déjà parti » alors qu'une photo d'article attend    │
 * │ encore - la SEULE copie de son fichier - lui fait détruire son travail    │
 * │ avec l'accord de l'écran.                                                │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import {
  carteAbonnement,
  carteMiseAJour,
  partsDe,
} from "./carte-en-souffrance";
import { FILE_VIDE, type EtatFile } from "./deconnexion-regles";

function file(partiel: Partial<EtatFile> = {}): EtatFile {
  return { ...FILE_VIDE, ...partiel };
}

const AFFIRMATION = "déjà parti";

describe("partsDe", () => {
  it("range les compteurs par ce qu'on peut en FAIRE", () => {
    const p = partsDe(
      file({ pending: 2, inflight: 1, blocked: 3, quarantined: 4, photos: 5 }),
    );
    // Un envoi fait partir les prêtes et les en-vol ; les photos partent aussi
    // mais se nomment à part ; le droit et le refus, non.
    expect(p).toEqual({ aEnvoyer: 3, photos: 5, bloquees: 3, refusees: 4 });
  });
});

describe("la carte de mise à jour", () => {
  it("N'AFFIRME RIEN tant que la base n'a pas répondu", () => {
    // La première image de tout rendu. Affirmer là, c'est affirmer à chaque
    // ouverture du voile, avant d'avoir rien mesuré.
    const c = carteMiseAJour({ file: FILE_VIDE, inconnu: true });
    expect(c.phrase).not.toContain(AFFIRMATION);
    expect(c.envoi).toBeNull();
    expect(c.ton).toBe("alerte");
  });

  it("affirme SEULEMENT quand il ne reste rien du tout", () => {
    const c = carteMiseAJour({ file: FILE_VIDE, inconnu: false });
    expect(c.phrase).toContain(AFFIRMATION);
    expect(c.ton).toBe("neutre");
    expect(c.envoi).toBeNull();
  });

  it("COMPTE LES PHOTOS, et les nomme", () => {
    // Une photo en attente est la seule copie de son fichier : le serveur ne
    // l'a pas, et rien ne la reconstitue.
    const c = carteMiseAJour({ file: file({ photos: 2 }), inconnu: false });
    expect(c.phrase).not.toContain(AFFIRMATION);
    expect(c.phrase).toContain("2 photos d'articles");
    expect(c.phrase).toContain("que sur ce terminal");
    expect(c.envoi).toBe("Envoyer mes 2 photos");
  });

  it("propose d'envoyer AVANT de mettre à jour, avec son décompte", () => {
    const c = carteMiseAJour({
      file: file({ pending: 2, inflight: 1 }),
      inconnu: false,
    });
    expect(c.envoi).toBe("Envoyer mes 3 opérations");
    expect(c.phrase).toContain("3 opérations n'ont pas encore atteint le serveur");
  });

  it("ACCORDE le singulier, verbe et pronom compris", () => {
    // Un gabarit donnerait « 1 opération attendent... Envoyez-LES... ELLES
    // partiront » : trois accords faux dans la même phrase.
    const c = carteMiseAJour({ file: file({ pending: 1 }), inconnu: false });
    expect(c.envoi).toBe("Envoyer mon opération");
    expect(c.phrase).toContain("1 opération n'a pas encore");
    expect(c.phrase).toContain("Envoyez-la");
    expect(c.phrase).toContain("elle partira");
    expect(c.phrase).not.toContain("opération attendent");
    expect(c.phrase).not.toContain("opérations attend ");
  });

  it("ne parle plus d'« opérations » dès qu'une photo s'y mêle", () => {
    // « Envoyer mes 3 opérations » serait faux si l'une des trois est une photo.
    const c = carteMiseAJour({
      file: file({ pending: 2, photos: 1 }),
      inconnu: false,
    });
    expect(c.envoi).toBe("Tout envoyer maintenant");
  });

  describe("ce qu'un envoi ne fera PAS partir", () => {
    it("n'offre AUCUN bouton d'envoi pour une opération bloquée", () => {
      // Le défaut central : fondue dans le décompte d'envoi, elle posait une
      // condition impossible - le bouton partait, le serveur refusait pour un
      // droit manquant, le compte ne descendait jamais, et « Mettre à jour »
      // restait secondaire indéfiniment.
      const c = carteMiseAJour({ file: file({ blocked: 1 }), inconnu: false });
      expect(c.envoi).toBeNull();
      expect(c.phrase).toContain("attend un droit");
      expect(c.phrase).toContain("Opérations à corriger");
      expect(c.phrase).not.toContain(AFFIRMATION);
    });

    it("NOMME une opération refusée, que rien ne fera partir", () => {
      const c = carteMiseAJour({ file: file({ quarantined: 2 }), inconnu: false });
      expect(c.envoi).toBeNull();
      expect(c.phrase).toContain("ont été refusées");
      expect(c.phrase).toContain("Opérations à corriger");
    });

    it("garde le bouton d'envoi pour ce qui peut partir, et dit le reste", () => {
      const c = carteMiseAJour({
        file: file({ pending: 1, blocked: 1 }),
        inconnu: false,
      });
      expect(c.envoi).toBe("Envoyer mon opération");
      expect(c.phrase).toContain("Envoyez-la");
      expect(c.phrase).toContain("attend un droit");
    });
  });

  it("ne dit JAMAIS « synchronisez » ni « réessayez » sur ce qui est retenu", () => {
    // Les deux sont sans effet : l'opération attend un droit, pas le réseau. Le
    // marchand qui lit ces mots cherche du réseau qui est déjà là, des jours
    // durant. `data/envoi.ts` a tranché.
    for (const f of [file({ blocked: 2 }), file({ quarantined: 2 })]) {
      const phrase = carteMiseAJour({ file: f, inconnu: false }).phrase.toLowerCase();
      expect(phrase).not.toContain("synchronis");
      expect(phrase).not.toContain("réessay");
    }
  });
});

describe("la carte d'abonnement", () => {
  it("n'affirme rien tant que la base n'a pas répondu", () => {
    const c = carteAbonnement({ file: FILE_VIDE, inconnu: true });
    expect(c.phrase).not.toContain("Tout ce qui a été encaissé");
    expect(c.envoi).toBeNull();
  });

  it("n'offre JAMAIS de bouton d'envoi", () => {
    // Rien ne part tant que l'abonnement n'est pas réglé : le serveur répond 402
    // à la poussée. Un bouton d'envoi serait un bouton qui ne fait rien.
    for (const f of [FILE_VIDE, file({ pending: 3 }), file({ blocked: 1 })]) {
      expect(carteAbonnement({ file: f, inconnu: false }).envoi).toBeNull();
    }
  });

  it("promet le retour d'une opération BLOQUÉE, et c'est juste ICI", () => {
    // Sous cette porte, régler l'abonnement libère réellement les opérations
    // bloquées : c'est même ce que le cycle de synchronisation fait, dans cet
    // ordre précis. La même phrase serait fausse sous le voile de mise à jour.
    const c = carteAbonnement({ file: file({ blocked: 2 }), inconnu: false });
    expect(c.phrase).toContain("2 opérations attendent");
    expect(c.phrase).toContain("Elles repartiront seules");
    expect(c.ton).toBe("neutre");
  });

  it("ACCORDE le singulier", () => {
    // Le défaut qu'un gabarit laissait passer : « 1 opération ATTENDENT sur ce
    // terminal. ELLES repartiront seules. »
    const c = carteAbonnement({ file: file({ pending: 1 }), inconnu: false });
    expect(c.phrase).toContain("1 opération attend sur ce terminal");
    expect(c.phrase).toContain("Elle repartira seule");
    expect(c.phrase).not.toContain("opération attendent");
    expect(c.phrase).not.toContain("Elles repartiront");
  });

  it("EXCEPTE ce que le serveur a refusé de sa promesse", () => {
    // Un règlement ne fera pas repartir une opération que le serveur a refusée.
    const c = carteAbonnement({ file: file({ quarantined: 1 }), inconnu: false });
    expect(c.phrase).toContain("a été refusée");
    expect(c.phrase).toContain("ne repartira pas d'un règlement");
    expect(c.ton).toBe("alerte");
  });
});
