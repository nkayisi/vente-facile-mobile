import {
  TYPE_MOUVEMENT_STOCK,
  codesParSens,
  estEntreeValorisee,
  typesFiltres,
  typesSaisissables,
  TYPES_ENTREE_VALORISEE,
  cumulerParSens,
  type AgregatParType,
} from "./types-mouvement";

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN CODE FAUX NE LÈVE RIEN, ET C'EST ARRIVÉ ICI.                         │
 * │                                                                          │
 * │ La table portait `unpacking` là où le serveur dit `unpack`. Aucune       │
 * │ erreur, aucun journal : la lecture retombait sur son repli, le badge     │
 * │ d'un déconditionnement portait le code nu au milieu de libellés          │
 * │ français, et la puce de filtre du même nom rendait toujours une liste    │
 * │ vide - indistinguable d'un rayon sans mouvement.                         │
 * │                                                                          │
 * │ C'est la famille de défaut que `session/permissions.test.ts` existe déjà │
 * │ pour attraper sur les codes de permission. On la ferme ici aussi.        │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Les valeurs de `StockMovement.MovementType`. À RÉGÉNÉRER quand le serveur en
 * ajoute :
 *
 *   grep -A15 'class MovementType' backend/apps/inventory/models.py \
 *     | grep -oE "= '[a-z_]+'" | tr -d "= '"
 */
const CODES_SERVEUR = [
  "purchase",
  "sale",
  "return_in",
  "return_out",
  "transfer_in",
  "transfer_out",
  "adjustment_in",
  "adjustment_out",
  "damage",
  "expired",
  "initial",
  "production_in",
  "production_out",
  "unpack",
];

describe("les types de mouvement", () => {
  it("le balayage BALAIE : la table n'est pas vide", () => {
    // Un contrôle qui ne trouve rien passe et ne prouve rien : le dépôt l'a
    // déjà payé sur `test_users_scope` et sur le garde-fou des écritures en
    // masse. On compte donc ce qu'on examine.
    expect(Object.keys(TYPE_MOUVEMENT_STOCK).length).toBeGreaterThanOrEqual(12);
  });

  it("chaque code existe côté serveur", () => {
    // L'inclusion est À SENS UNIQUE, et c'est voulu : `production_in` et
    // `production_out` sont déclarés par le modèle mais AUCUN chemin serveur
    // ne les écrit, et le back-office ne les propose pas non plus dans son
    // filtre. Exiger l'égalité ferait offrir deux puces qui ne rendraient
    // jamais rien - le filtre mort qu'on vient de refermer.
    const inconnus = Object.keys(TYPE_MOUVEMENT_STOCK).filter(
      (code) => !CODES_SERVEUR.includes(code)
    );
    expect(inconnus).toEqual([]);
  });

  it("le déconditionnement porte le code du serveur, pas un gérondif", () => {
    // Le défaut exact, nommé : il ne doit pas revenir par une relecture qui
    // trouverait `unpacking` plus lisible.
    expect(TYPE_MOUVEMENT_STOCK.unpack?.label).toBe("Déconditionnement");
    expect(TYPE_MOUVEMENT_STOCK.unpacking).toBeUndefined();
  });

  it("tout type a un sens, et les deux sens partitionnent la table", () => {
    // C'est cette partition que l'export envoie au serveur : un code qui
    // tomberait dans aucun des deux sens serait invisible au document tout en
    // restant visible à l'écran.
    const entrees = codesParSens(true);
    const sorties = codesParSens(false);
    expect(entrees.length + sorties.length).toBe(
      Object.keys(TYPE_MOUVEMENT_STOCK).length
    );
    expect(entrees.filter((c) => sorties.includes(c))).toEqual([]);
  });

  it("le sens des types connus est celui du back-office", () => {
    expect(codesParSens(true)).toContain("purchase");
    expect(codesParSens(true)).toContain("unpack");
    expect(codesParSens(false)).toContain("sale");
    expect(codesParSens(false)).toContain("damage");
  });
});


describe("le cumul par sens du cadran", () => {
  const ligne = (type: string, nombre: number, quantite: number): AgregatParType => ({
    type,
    nombre,
    quantite,
  });

  it("ventile les magnitudes selon le sens de la table", () => {
    const r = cumulerParSens([
      ligne("initial", 5, 1562),
      ligne("return_in", 1, 2),
      ligne("sale", 32, 905),
    ]);
    expect(r.nombre).toBe(38);
    // Les chiffres de l'établissement de développement, et ce sont EXACTEMENT
    // ceux que rend `quantity_after - quantity_before`. Voir la docstring.
    expect(r.entrees).toBe(1564);
    expect(r.sorties).toBe(905);
  });

  it("compte une magnitude, jamais une somme signée", () => {
    // C'est le défaut du document : `total_out` accumulait la valeur brute, et
    // deux lignes anciennes à la convention inverse (« +1 » pour « 0 → -1 »)
    // en venaient DÉDUCTION. Ici l'appelant passe déjà des magnitudes, mais le
    // test épingle le contrat : rien de négatif ne sort d'ici.
    const r = cumulerParSens([ligne("sale", 3, 905)]);
    expect(r.sorties).toBeGreaterThan(0);
    expect(r.entrees).toBe(0);
  });

  it("un déconditionnement ne pèse sur aucune quantité", () => {
    // Mesuré dans le document : « 1 BOITE ; 0 ; 378 → 378 ». Aucun cas
    // particulier n'est nécessaire, sa quantité est nulle.
    const r = cumulerParSens([ligne("unpack", 6, 0)]);
    expect(r).toEqual({ nombre: 6, entrees: 0, sorties: 0 });
  });

  it("un type inconnu compte comme une entrée, jamais comme rien", () => {
    // Le repli de `listeMouvements` fait le même choix. Une quantité qui
    // disparaîtrait des deux relevés ferait un cadran qui ne s'additionne pas,
    // sans qu'aucune erreur ne le signale.
    const r = cumulerParSens([ligne("production_in", 1, 7)]);
    expect(r.entrees).toBe(7);
    expect(r.sorties).toBe(0);
  });

  it("rend trois zéros sur un périmètre vide, jamais `NaN`", () => {
    expect(cumulerParSens([])).toEqual({ nombre: 0, entrees: 0, sorties: 0 });
  });
});

describe("les types qu'un humain saisit", () => {
  it("en propose ONZE : les douze, moins le déconditionnement", () => {
    // Le balayage BALAIE : un compte figé attrape la table vidée par accident.
    expect(typesSaisissables()).toHaveLength(11);
    expect(typesSaisissables()).not.toContain("unpack");
  });

  it("les propose TOUS sauf celui-là", () => {
    const attendus = Object.keys(TYPE_MOUVEMENT_STOCK).filter((c) => c !== "unpack");
    expect(new Set(typesSaisissables())).toEqual(new Set(attendus));
  });

  it("porte le libellé du back-office pour chacun", () => {
    for (const code of typesSaisissables()) {
      expect(TYPE_MOUVEMENT_STOCK[code]?.label).toBeTruthy();
    }
  });
});

describe("les entrées VALORISÉES portent un prix, les autres non", () => {
  /**
   * Recopié de `STOCK_IN_TYPES_WITH_COST` du back-office. Régénérer par :
   *   grep -A 8 'STOCK_IN_TYPES_WITH_COST' \
   *     frontend/app/dashboard/stock/movements/page.tsx
   */
  const WEB = ["purchase", "initial", "return_in", "transfer_in", "adjustment_in"];

  it("dit exactement ce que le back-office dit", () => {
    expect([...TYPES_ENTREE_VALORISEE]).toEqual(WEB);
  });

  it("n'y range NI le déconditionnement NI une sortie", () => {
    expect(estEntreeValorisee("unpack")).toBe(false);
    expect(estEntreeValorisee("damage")).toBe(false);
    expect(estEntreeValorisee("transfer_out")).toBe(false);
  });

  it("écarte `production_in`, que le serveur range en entrée mais qu'aucun écran n'offre", () => {
    expect(estEntreeValorisee("production_in")).toBe(false);
  });
});

describe("le type et le sens s'intersectent, ils ne s'écrasent pas", () => {
  it("ne restreint rien quand aucun des deux n'est posé", () => {
    expect(typesFiltres(null, null)).toBeNull();
  });

  it("rend le seul type quand le sens est libre", () => {
    expect(typesFiltres("damage", null)).toEqual(["damage"]);
  });

  it("rend les types du sens quand le type est libre", () => {
    expect(typesFiltres(null, true)).toEqual(codesParSens(true));
  });

  it("garde le type quand il appartient au sens", () => {
    expect(typesFiltres("purchase", true)).toEqual(["purchase"]);
  });

  it("REND LE VIDE quand les deux se contredisent", () => {
    // C'est le cas qui produisait un document plein sous une liste vide :
    // l'export n'envoyait que le type et perdait le sens en route.
    expect(typesFiltres("sale", true)).toEqual([]);
    expect(typesFiltres("purchase", false)).toEqual([]);
  });
});
