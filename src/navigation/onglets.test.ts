/**
 * Invariants de la barre d'onglets et de l'écran « Plus ».
 *
 * Ce sont des règles de doctrine, pas des détails : cinq emplacements, le
 * dernier toujours « Plus », et ONZE entrées de menu quel que soit le rôle.
 */
import { MENU, entreesDuMenu, type Role } from "./menu";
import { ONGLET_PLUS, TAB_SETS, ongletsPourRole } from "./onglets";

const ROLES: Role[] = ["cashier", "stock_keeper", "manager", "owner"];

describe("barre d'onglets", () => {
  it.each(ROLES)("le rôle %s a cinq emplacements", (role) => {
    expect(TAB_SETS[role]).toHaveLength(5);
  });

  it.each(ROLES)("le dernier emplacement du rôle %s est « Plus »", (role) => {
    expect(TAB_SETS[role][4]).toBe(ONGLET_PLUS);
  });

  it("place l'action d'accueil en tête, celle que le pouce atteint", () => {
    expect(TAB_SETS.cashier[0]).toBe("vendre");
    expect(TAB_SETS.stock_keeper[0]).toBe("stock");
    expect(TAB_SETS.manager[0]).toBe("index");
    expect(TAB_SETS.owner[0]).toBe("index");
  });

  it("sans rôle, ne montre que ce qui ne suppose aucun droit", () => {
    const sans = ongletsPourRole(null);
    expect(sans).toContain(ONGLET_PLUS);
    for (const nom of sans) {
      const entree = MENU.find((e) => e.cle === nom);
      // `vendre` et `plus` ne sont pas des entrées du menu : ils n'ont pas de
      // permission à vérifier.
      if (entree) expect(entree.permission).toBeNull();
    }
  });
});

describe("écran « Plus »", () => {
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
    const tdb = entreesDuMenu(AUCUN).find((e) => e.cle === "index");
    expect(tdb?.accessible).toBe(true);
  });

  it("marque « Bientôt » exactement les sections qu'un lot doit encore câbler", () => {
    const bientot = entreesDuMenu(TOUT).filter((e) => e.bientot).map((e) => e.cle);
    expect(bientot).not.toContain("parametres");
    expect(bientot.length).toBe(10);
  });
});
