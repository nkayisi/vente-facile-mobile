/**
 * Le bandeau d'envoi : ce qu'il dit, et surtout ce qu'il ne propose pas.
 */
import { contenuBandeau } from "./bandeau";

const SUJET = {
  titre: "Une opération attend son envoi",
  consequence: "Le statut ne changera qu'après.",
};

describe("contenuBandeau", () => {
  it("ne dit rien d'un acte déjà arrivé", () => {
    expect(contenuBandeau("envoye", SUJET)).toBeNull();
    expect(contenuBandeau(undefined, SUJET)).toBeNull();
  });

  it("propose de synchroniser une opération EN FILE", () => {
    const c = contenuBandeau("en_attente", SUJET);
    expect(c?.offreSynchronisation).toBe(true);
    expect(c?.titre).toBe(SUJET.titre);
  });

  it("ne propose JAMAIS de synchroniser une opération BLOQUÉE", () => {
    // Elle n'attend pas le réseau, elle attend une décision. Le bouton ferait
    // chercher un réseau déjà là, des jours durant.
    expect(contenuBandeau("bloque", SUJET)?.offreSynchronisation).toBe(false);
  });

  it("ne reprend pas la conséquence de l'appelant sur un blocage", () => {
    // C'est LA façon dont ce module pourrait rouvrir le défaut : par la phrase
    // de l'appelant, qui dit presque toujours « après synchronisation ».
    const c = contenuBandeau("bloque", {
      titre: "Une opération attend son envoi",
      consequence: "Le statut changera après synchronisation. Réessayez plus tard.",
    });
    expect(c?.message).not.toMatch(/synchronis/i);
    expect(c?.message).not.toMatch(/réessay/i);
    // Et il NOMME ce qui débloque, sinon il ne remplace rien.
    expect(c?.message).toMatch(/abonnement|permission/i);
  });

  it("ne peint pas une file comme un problème, et un blocage comme une routine", () => {
    // Un acte en file est NORMAL et partira seul : l'orange ferait chercher un
    // problème absent, et à force on ne voit plus le vrai orange.
    expect(contenuBandeau("en_attente", SUJET)?.ton).toBe("info");
    expect(contenuBandeau("bloque", SUJET)?.ton).toBe("warning");
  });

  it("dit dans son titre qu'un blocage n'est pas une attente d'envoi", () => {
    const c = contenuBandeau("bloque", SUJET);
    expect(c?.titre).toMatch(/attente d'un droit/i);
  });
});
