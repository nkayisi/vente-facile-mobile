import { DIFFUSIONS, diffusionsPourLeModule } from "./diffusions";

describe("les lecteurs à message système", () => {
  it("chaque marque a une action et une clé, et aucune action n'est en double", () => {
    expect(DIFFUSIONS.length).toBeGreaterThanOrEqual(6);
    for (const d of DIFFUSIONS) {
      expect(d.action.trim()).not.toBe("");
      expect(d.cle.trim()).not.toBe("");
    }
    const actions = DIFFUSIONS.map((d) => d.action);
    expect(new Set(actions).size).toBe(actions.length);
  });

  it("le module natif ne reçoit que l'action et la clé", () => {
    const pourLeModule = diffusionsPourLeModule();
    expect(pourLeModule).toHaveLength(DIFFUSIONS.length);
    expect(pourLeModule[0]).toEqual({
      action: "com.sunmi.scanner.ACTION_DATA_CODE_RECEIVED",
      cle: "data",
    });
    for (const d of pourLeModule) expect(Object.keys(d).sort()).toEqual(["action", "cle"]);
  });
});
