import { doitNotifier, doitSignaler, estAutomatique, type OrigineSync } from "./origines";

const TOUTES: OrigineSync[] = ["ecran", "bandeau", "indicateur", "auto"];

describe("les origines d'un cycle", () => {
  it("ne reconnaît qu'une seule origine automatique", () => {
    expect(estAutomatique("auto")).toBe(true);
    for (const o of TOUTES.filter((x) => x !== "auto")) {
      expect(estAutomatique(o)).toBe(false);
    }
  });

  describe("le toast de fin de cycle", () => {
    it("ne s'annonce JAMAIS pour un cycle automatique", () => {
      // Un marchand en zone morte recevrait un bandeau toutes les minutes, et
      // un marchand connecté un « Synchronisation terminée » après chaque
      // vente. À ce rythme on cesse de lire les toasts.
      expect(doitNotifier("auto")).toBe(false);
    });

    it("répond à une demande, et seulement à une demande", () => {
      expect(doitNotifier("bandeau")).toBe(true);
      expect(doitNotifier("indicateur")).toBe(true);
    });

    it("se tait sur l'écran Synchronisation, qui rend déjà sa progression", () => {
      expect(doitNotifier("ecran")).toBe(false);
    });
  });

  describe("le signalement d'un échec", () => {
    it("tait l'absence de réseau d'un cycle automatique", () => {
      // Le témoin de la barre dit déjà « hors ligne ». Peindre un bandeau
      // rouge par-dessus apprendrait à ne plus voir les bandeaux rouges.
      expect(doitSignaler("auto", "network")).toBe(false);
    });

    it("signale tout le reste, même en automatique", () => {
      // Un 500 ou un refus de serializer ne se répare pas en attendant.
      for (const kind of ["server", "request", "auth", "subscription", "throttled"] as const) {
        expect(doitSignaler("auto", kind)).toBe(true);
      }
      expect(doitSignaler("auto", null)).toBe(true);
    });

    it("signale toujours ce que l'utilisateur a demandé, réseau compris", () => {
      for (const o of TOUTES.filter((x) => x !== "auto")) {
        expect(doitSignaler(o, "network")).toBe(true);
      }
    });
  });
});
