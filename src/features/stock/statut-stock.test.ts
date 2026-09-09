import { ETAT_STOCK, type EtatStock } from "@/data/etats-stock";

import { statutServeur } from "./statut-stock";

describe("l'état du rayon, traduit pour le serveur", () => {
  it("couvre TOUS les états de l'écran", () => {
    // Le balayage BALAIE : un état ajouté à `ETAT_STOCK` sans traduction
    // sortirait un document sur tout le stock, sans que rien ne le signale.
    const etats = Object.keys(ETAT_STOCK) as Exclude<EtatStock, "tous">[];
    expect(etats).toHaveLength(3);
    for (const e of etats) {
      expect(statutServeur(e)).toBeDefined();
    }
  });

  it("ne traduit PAS « bas » par `low`", () => {
    // `low` contient les ruptures : le document en porterait que l'écran ne
    // montre pas. C'est le coeur de ce module.
    expect(statutServeur("bas")).toBe("low_only");
    expect(statutServeur("bas")).not.toBe("low");
  });

  it("ne traduit PAS « ok » par `available`", () => {
    // `available` contient les stocks bas, que l'écran range ailleurs.
    expect(statutServeur("ok")).toBe("healthy");
    expect(statutServeur("ok")).not.toBe("available");
  });

  it("traduit la rupture par le seul état qui coïncide exactement", () => {
    expect(statutServeur("rupture")).toBe("out");
  });

  it("n'envoie AUCUN filtre pour « tous »", () => {
    expect(statutServeur("tous")).toBeUndefined();
    expect(statutServeur(undefined)).toBeUndefined();
  });

  it("rend trois valeurs DISTINCTES : deux états confondus fausseraient tout", () => {
    const valeurs = (["rupture", "bas", "ok"] as const).map(statutServeur);
    expect(new Set(valeurs).size).toBe(3);
  });
});
