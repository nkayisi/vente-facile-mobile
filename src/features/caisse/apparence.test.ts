/**
 * L'état d'une session, et ce qu'on en montre.
 *
 * Ces deux règles ont chacune coûté un aller-retour au comptoir : une coche
 * verte qui dit le contraire du texte, et un bouton mort qui ne dit rien.
 */
import { ETAT_SESSION, motifClotureFermee } from "./apparence";

describe("ETAT_SESSION", () => {
  it("ne peint la RÉUSSITE que sur ce qui est arrivé", () => {
    // Le fond vert et la coche affirment « c'est fait ». Les poser sur une
    // ouverture encore en file fait conclure au caissier que le serveur a sa
    // session, et il rentre sans synchroniser.
    expect(ETAT_SESSION.envoye.icone).toBe("CheckCircle2");
    for (const etat of ["en_attente", "bloque"] as const) {
      expect(ETAT_SESSION[etat].icone).not.toBe("CheckCircle2");
      expect(ETAT_SESSION[etat].boite).not.toContain("success");
      expect(ETAT_SESSION[etat].couleur).not.toBe("success");
    }
  });

  it("distingue « en file » de « bloqué » AUTREMENT que par le texte", () => {
    // Une file n'appelle aucun geste, un blocage en appelle un : les deux ne
    // peuvent pas se ressembler, sinon la distinction ne tient qu'à une phrase
    // que personne ne lit sur un écran qu'on traverse.
    expect(ETAT_SESSION.en_attente.boite).not.toBe(ETAT_SESSION.bloque.boite);
    expect(ETAT_SESSION.bloque.boite).toContain("warning");
    expect(ETAT_SESSION.en_attente.boite).not.toContain("warning");
  });

  it("garde le filet interne accordé à sa bordure", () => {
    // Un filet vert dans un panneau gris se lit comme un reste de l'ancien
    // état, et c'est exactement ce qu'il serait.
    for (const etat of ["envoye", "en_attente", "bloque"] as const) {
      const jeton = ETAT_SESSION[etat].filet.replace("border-", "").split("/")[0];
      expect(ETAT_SESSION[etat].boite).toContain(jeton);
    }
  });
});

describe("motifClotureFermee", () => {
  it("ne dit rien quand rien n'empêche", () => {
    // Une phrase sous un bouton actif ferait chercher un problème absent.
    expect(motifClotureFermee("envoye")).toBe("");
  });

  it("ne propose JAMAIS de synchroniser pour débloquer", () => {
    // Même règle que `libelleEnvoi` : c'est sans effet, et le proposer fait
    // perdre des jours au marchand, qui croit son réseau en cause.
    const m = motifClotureFermee("bloque").toLowerCase();
    expect(m).not.toContain("synchronis");
    expect(m).toMatch(/abonnement|permission/);
  });

  it("dit qu'une session en file s'ouvrira à la synchronisation", () => {
    expect(motifClotureFermee("en_attente").toLowerCase()).toContain("synchronisation");
  });
});
