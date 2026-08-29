/**
 * Invariants de la coquille : la barre du bas et le tiroir.
 *
 * Ce sont des règles de doctrine, pas des détails.
 */
import { MENU, entreesDuMenu } from "./menu";
import { NOMS_ONGLETS, ONGLETS } from "./onglets";

describe("barre d'onglets", () => {
  it("a cinq emplacements, et ils ne dépendent pas du rôle", () => {
    // Une barre qui change de contenu selon qui se connecte oblige à
    // réapprendre l'application à chaque poste.
    expect(ONGLETS).toHaveLength(5);
  });

  it("place le POS au centre, là où le pouce est le plus sûr", () => {
    expect(ONGLETS[2].nom).toBe("vendre");
  });

  it("suit l'ordre convenu : accueil, caisse, POS, stock, paramètres", () => {
    expect(NOMS_ONGLETS).toEqual(["index", "caisse", "vendre", "stock", "parametres"]);
  });

  it("garde des étiquettes courtes : un bouton n'a qu'un cinquième de la largeur", () => {
    for (const o of ONGLETS) expect(o.label.length).toBeLessThanOrEqual(10);
  });

  it("ne place dans la barre que des sections du menu, ou le comptoir", () => {
    for (const nom of NOMS_ONGLETS) {
      if (nom === "vendre") continue;
      expect(MENU.some((e) => e.cle === nom)).toBe(true);
    }
  });
});

describe("tiroir latéral", () => {
  const AUCUN = () => false;
  const TOUT = () => true;

  it("montre TOUJOURS les onze entrées, même sans aucun droit", () => {
    // Le web les retire ; le plan dit de les griser. Masquer enseigne mal : un
    // caissier qui ne voit jamais « Stock » ne sait pas que la fonction existe.
    expect(entreesDuMenu(AUCUN)).toHaveLength(11);
    expect(entreesDuMenu(TOUT)).toHaveLength(11);
  });

  it("donne une raison non vide à chaque entrée hors droits", () => {
    for (const e of entreesDuMenu(AUCUN)) {
      if (e.accessible) continue;
      expect(e.raison).toBeTruthy();
      expect(e.raison!.length).toBeGreaterThan(3);
    }
  });

  it("n'est jamais à la fois accessible et porteur d'une raison", () => {
    for (const e of [...entreesDuMenu(AUCUN), ...entreesDuMenu(TOUT)]) {
      expect(e.accessible === (e.raison === null)).toBe(true);
    }
  });

  it("laisse « Tableau de bord » accessible sans aucun droit, comme le web", () => {
    expect(entreesDuMenu(AUCUN).find((e) => e.cle === "index")?.accessible).toBe(true);
  });
});
