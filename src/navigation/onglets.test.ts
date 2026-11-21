/**
 * Invariants de la coquille : la barre du bas et le tiroir.
 *
 * Ce sont des règles de doctrine, pas des détails.
 */
import { MENU, entreesDuMenu, permissionDeLaSection } from "./menu";
import {
  NOMS_ONGLETS,
  ONGLETS,
  ORDRE_DE_LA_BARRE,
  PERMISSION_DU_COMPTOIR,
  REMPLACANTS,
  ecransDeLaBarre,
  estUneRouteDOnglet,
  gestePourSection,
  ongletDeLaSection,
  ongletsDuMembre,
} from "./onglets";

/**
 * Les droits de chaque rôle, tels que le serveur les accorde
 * (`apps/core/services.py`, `ROLE_PERMISSIONS`), réduits à ceux que la
 * navigation lit. Recopiés ici parce que ce sont des FIXTURES : la règle
 * éprouvée est celle de la permission, et un rôle n'est qu'un jeu de droits.
 */
const DROITS: Record<string, string[]> = {
  cashier: ["dashboard.view", "sales.view", "sales.create", "products.view", "customers.view", "cashbook.view"],
  stock_keeper: ["dashboard.view", "products.view", "stock.view", "inventory.view", "customers.view", "cashbook.view"],
  manager: [
    "dashboard.view", "sales.view", "sales.create", "products.view", "stock.view", "inventory.view",
    "cashbook.view", "reports.view", "customers.view", "users.view", "settings.view",
  ],
};
const peutEtre = (role: string) => (permission: string) => DROITS[role].includes(permission);
const AUCUN = () => false;
const TOUT = () => true;
/** Le seul droit que les quatre rôles partagent : celui de l'accueil. */
const ACCUEIL_SEUL = (p: string) => p === "dashboard.view";

const noms = (peut: (p: string) => boolean) => ongletsDuMembre(peut).map((o) => o.nom);

describe("barre d'onglets", () => {
  it("donne au propriétaire la barre de base : accueil, caisse, POS, stock, paramètres", () => {
    expect(ONGLETS).toHaveLength(5);
    expect(NOMS_ONGLETS).toEqual(["index", "caisse", "vendre", "stock", "parametres"]);
    expect(noms(TOUT)).toEqual([...NOMS_ONGLETS]);
  });

  it("donne la même barre au gérant : il peut ouvrir les cinq", () => {
    expect(noms(peutEtre("manager"))).toEqual([...NOMS_ONGLETS]);
  });

  it("donne CINQ onglets au caissier, remplaçants compris", () => {
    // Stock et Paramètres lui sont fermés : Ventes et Produits prennent leur
    // place. Une barre à trois boutons gaspillait la place la plus accessible.
    expect(noms(peutEtre("cashier"))).toEqual(["index", "caisse", "vendre", "ventes", "articles"]);
  });

  it("donne CINQ onglets au magasinier, sans le POS : il ne peut pas vendre", () => {
    expect(noms(peutEtre("stock_keeper"))).toEqual(["index", "caisse", "articles", "stock", "inventaire"]);
  });

  it("garde le POS au centre pour qui peut vendre", () => {
    expect(ONGLETS[2].nom).toBe("vendre");
    expect(noms(peutEtre("cashier"))[2]).toBe("vendre");
  });

  it("range toujours les boutons dans l'ordre fixe de la barre", () => {
    for (const role of Object.keys(DROITS)) {
      const barre = noms(peutEtre(role));
      expect(barre).toEqual(ORDRE_DE_LA_BARRE.filter((n) => barre.includes(n)));
    }
  });

  it("place chaque onglet de base, puis chaque remplaçant, dans l'ordre fixe", () => {
    // Un nom oublié dans `ORDRE_DE_LA_BARRE` aurait le rang -1 : il passerait en
    // tête de la barre, devant l'accueil.
    const tous = [...NOMS_ONGLETS, ...REMPLACANTS.map((o) => o.nom)];
    expect([...ORDRE_DE_LA_BARRE].sort()).toEqual([...tous].sort());
    expect(ORDRE_DE_LA_BARRE.filter((n) => NOMS_ONGLETS.includes(n))).toEqual([...NOMS_ONGLETS]);
  });

  it("ne montre JAMAIS un onglet que le membre ne peut pas ouvrir", () => {
    for (const role of Object.keys(DROITS)) {
      for (const o of ongletsDuMembre(peutEtre(role))) {
        expect(o.permission === null || peutEtre(role)(o.permission)).toBe(true);
      }
    }
  });

  it("ne montre jamais deux fois la même section", () => {
    for (const role of [...Object.keys(DROITS)]) {
      const barre = noms(peutEtre(role));
      expect(new Set(barre).size).toBe(barre.length);
    }
  });

  it("n'invente pas d'onglet quand le membre n'a rien d'autre à ouvrir", () => {
    // Moins de cinq onglets plutôt qu'un onglet qui ne s'ouvrirait pas.
    expect(noms(ACCUEIL_SEUL)).toEqual(["index"]);
  });

  it("suit la PERMISSION, pas le rôle : un droit accordé rend sa place à l'onglet de base", () => {
    const caissierAvecStock = (p: string) => p === "stock.view" || peutEtre("cashier")(p);
    expect(noms(caissierAvecStock)).toEqual(["index", "caisse", "vendre", "ventes", "stock"]);
  });

  it("garde des étiquettes courtes : un bouton n'a qu'un cinquième de la largeur", () => {
    for (const o of [...ONGLETS, ...REMPLACANTS]) expect(o.label.length).toBeLessThanOrEqual(10);
  });

  it("ne place dans la barre que des sections du menu, ou le comptoir", () => {
    for (const o of [...ONGLETS, ...REMPLACANTS]) {
      if (o.nom === "vendre") continue;
      expect(MENU.some((e) => e.cle === o.nom)).toBe(true);
    }
  });

  it("ne propose pas en remplaçant un onglet de base", () => {
    for (const o of REMPLACANTS) expect(NOMS_ONGLETS).not.toContain(o.nom);
  });

  it("garde chaque onglet par le MÊME droit que son entrée du tiroir", () => {
    // Deux droits pour un seul écran feraient qu'un rôle le voit dans la barre
    // et pas dans le menu, ou l'inverse.
    for (const o of [...ONGLETS, ...REMPLACANTS]) {
      if (o.nom === "vendre") {
        expect(o.permission).toBe(PERMISSION_DU_COMPTOIR);
        continue;
      }
      expect(o.permission).toBe(permissionDeLaSection(o.nom));
    }
  });

  it("reprend le glyphe du tiroir, sauf « Ventes », dont le chariot est déjà celui du POS", () => {
    for (const o of [...ONGLETS, ...REMPLACANTS]) {
      if (o.nom === "vendre" || o.nom === "ventes") continue;
      expect(o.icon).toBe(MENU.find((e) => e.cle === o.nom)?.icon);
    }
  });

  it("ne montre jamais deux fois le même glyphe dans une barre", () => {
    // Vu à l'écran : « POS » et « Ventes » côte à côte, deux chariots.
    const caissierAvecStock = (p: string) => p === "stock.view" || peutEtre("cashier")(p);
    for (const peut of [TOUT, AUCUN, caissierAvecStock, ...Object.keys(DROITS).map(peutEtre)]) {
      const glyphes = ongletsDuMembre(peut).map((o) => o.icon);
      expect(new Set(glyphes).size).toBe(glyphes.length);
    }
  });
});

describe("les écrans déclarés", () => {
  /**
   * ⚠ L'INVARIANT QUI ÉVITE UN PLANTAGE.
   *
   * Les boutons se rangent dans l'ordre des `Tabs.Screen`. Une version qui
   * déclarait les écrans dans un ordre calculé depuis les droits les
   * réordonnait à la déconnexion, barre encore montée, et Fabric plantait
   * l'application (« addViewAt: failed to insert view »). Seul le bouton doit
   * varier avec les droits ; la liste et son ordre, jamais.
   */
  it("déclare les mêmes écrans, dans le même ordre, quels que soient les droits", () => {
    const ordre = (peut: (p: string) => boolean) => ecransDeLaBarre(peut).map((e) => e.nom);
    const reference = ordre(TOUT);
    for (const peut of [AUCUN, ...Object.keys(DROITS).map(peutEtre)]) {
      expect(ordre(peut)).toEqual(reference);
    }
  });

  it("déclare chaque section du menu, le POS et le profil, une seule fois", () => {
    // Une route absente de la déclaration perdrait la barre d'onglets quand on
    // y entre depuis le tiroir.
    const noms = ecransDeLaBarre(TOUT).map((e) => e.nom);
    expect(new Set(noms).size).toBe(noms.length);
    expect([...noms].sort()).toEqual(
      [...MENU.map((e) => e.cle), "vendre", "profil"].sort()
    );
  });

  it("donne un bouton aux seuls onglets du membre", () => {
    for (const role of Object.keys(DROITS)) {
      const avecBouton = ecransDeLaBarre(peutEtre(role)).filter((e) => e.bouton).map((e) => e.nom);
      expect(avecBouton).toEqual(noms(peutEtre(role)));
    }
  });
});

describe("tiroir latéral", () => {
  it("montre les onze entrées quand tout est permis", () => {
    expect(entreesDuMenu(TOUT)).toHaveLength(11);
  });

  it("ne montre au caissier aucune section qu'il ne peut pas ouvrir", () => {
    // Elles étaient grisées avec « Réservé au gérant » : six sur onze que le
    // caissier touchait sans pouvoir y entrer.
    expect(entreesDuMenu(peutEtre("cashier")).map((e) => e.cle)).toEqual([
      "index", "ventes", "articles", "caisse", "contacts",
    ]);
  });

  it("ne montre au magasinier ni les ventes, ni les rapports, ni l'administration", () => {
    expect(entreesDuMenu(peutEtre("stock_keeper")).map((e) => e.cle)).toEqual([
      "index", "articles", "stock", "inventaire", "caisse", "contacts",
    ]);
  });

  it("garde l'ordre du menu : une entrée disparaît, les autres ne bougent pas", () => {
    for (const role of Object.keys(DROITS)) {
      const cles = entreesDuMenu(peutEtre(role)).map((e) => e.cle);
      const ordre = MENU.map((e) => e.cle).filter((c) => cles.includes(c));
      expect(cles).toEqual(ordre);
    }
  });

  it("garde « Tableau de bord » sous `dashboard.view`, comme le web", () => {
    // Les quatre rôles le portent : l'accueil reste ouvert à tous, mais par la
    // règle de route du back-office, sans exception propre au terminal.
    expect(entreesDuMenu(ACCUEIL_SEUL).map((e) => e.cle)).toEqual(["index"]);
    expect(entreesDuMenu(AUCUN)).toEqual([]);
  });

  it("refuse une clé de section inconnue plutôt que de l'ouvrir à tous", () => {
    // `null` veut dire « ouvert à tous » : une faute de frappe ne doit pas y mener.
    expect(() => permissionDeLaSection("stok")).toThrow("stok");
  });
});

describe("le rail d'une tablette", () => {
  it("donne une étiquette courte à CHAQUE section du menu", () => {
    // Le rail liste toutes les sections que le rôle peut ouvrir : une section
    // sans étiquette courte lèverait au rendu, sur la tablette d'un gérant.
    for (const e of MENU) expect(ongletDeLaSection(e.cle).label.length).toBeGreaterThan(0);
  });

  it("garde le glyphe de la barre du bas, reçu compris pour les ventes", () => {
    expect(ongletDeLaSection("ventes").icon).toBe("Receipt");
    expect(ongletDeLaSection("utilisateurs").label).toBe("Équipe");
  });
});

describe("une route d'onglet", () => {
  it("reconnaît les écrans sous la barre d'onglets", () => {
    expect(estUneRouteDOnglet("/")).toBe(true);
    expect(estUneRouteDOnglet("/stock")).toBe(true);
    expect(estUneRouteDOnglet("/vendre")).toBe(true);
    expect(estUneRouteDOnglet("/profil")).toBe(true);
    expect(estUneRouteDOnglet("/parametres/devises")).toBe(true);
  });

  it("écarte les fiches poussées par la pile", () => {
    expect(estUneRouteDOnglet("/vente/abc")).toBe(false);
    expect(estUneRouteDOnglet("/pos/panier")).toBe(false);
    expect(estUneRouteDOnglet("/appareil/operations")).toBe(false);
    // Les groupes ne comptent pas : `/(app)/ma-journee` est une fiche de pile.
    expect(estUneRouteDOnglet("/(app)/ma-journee")).toBe(false);
    expect(estUneRouteDOnglet("/(app)/(tabs)/stock")).toBe(true);
    expect(estUneRouteDOnglet(null)).toBe(false);
  });
});

describe("le geste vers une section", () => {
  /**
   * ⚠ `dismissTo` DEPUIS UN ONGLET NE FAIT RIEN : il produit un `POP_TO` que
   * le routeur d'onglets ignore. Vu sur l'émulateur, appui sans effet ni
   * erreur. Et `push` depuis une fiche empilerait une seconde coquille.
   */
  it("saute d'onglet depuis un onglet", () => {
    expect(gestePourSection("/")).toBe("navigate");
    expect(gestePourSection("/parametres/devises")).toBe("navigate");
  });

  it("dépile depuis une fiche, ou quand on ne sait pas où l'on est", () => {
    expect(gestePourSection("/vente/abc")).toBe("dismissTo");
    expect(gestePourSection("/pos/panier")).toBe("dismissTo");
    expect(gestePourSection(null)).toBe("dismissTo");
  });
});
