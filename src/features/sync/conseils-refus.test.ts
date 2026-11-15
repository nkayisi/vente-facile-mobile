import { CODES_CONSEILLES, conseilDuRefus } from "./conseils-refus";

describe("le conseil d'une opération refusée", () => {
  it("chaque code que le serveur rend a son geste", () => {
    // Les codes remarquables du journal (`apps/core/exceptions.py`,
    // `apps/sync/handlers.py`) : un code sans conseil laisserait le marchand
    // devant « Abandonner » sans savoir ce qu'il perd.
    for (const code of [
      "consultation_seule",
      "entrepot_inactif",
      "session_d_un_autre",
      "session_personnelle_ouverte",
      "stock_insuffisant",
      "not_own_sale",
      "not_found",
      "reserve_au_proprietaire",
      "entrepot_principal",
      "session_ouverte",
      "transfert_en_route",
      "inventaire_en_cours",
      "seul_entrepot_actif",
      "stock_restant",
    ]) {
      expect(conseilDuRefus(code)).not.toBeNull();
    }
  });

  it("aucun conseil n'invite à réessayer ni à synchroniser", () => {
    // Une opération refusée ne repart jamais : ce qui se refait se RESSAISIT.
    for (const code of CODES_CONSEILLES) {
      const conseil = conseilDuRefus(code)!.toLowerCase();
      expect(conseil).not.toContain("synchronis");
      expect(conseil).not.toContain("réessay");
    }
  });

  it("un code inconnu ne fabrique pas de conseil", () => {
    expect(conseilDuRefus("invalid")).toBeNull();
    expect(conseilDuRefus(null)).toBeNull();
  });
});
