import { verdict, type Mesures, type Verdict } from "./marge-basse";
import { forcerVerdict, mesuresSimulees, verdictForce } from "./simulation";

const REEL: Mesures = { hauteurEcran: 997, hauteurFenetre: 997, margeBasse: 24 };
const TOUS: Verdict[] = ["conforme", "fenetre_inseree", "marge_absente"];

describe("la simulation de verdict", () => {
  afterEach(() => {
    forcerVerdict(null);
  });

  it("fabrique des mesures qui rendent VRAIMENT le verdict demandé", () => {
    // Sans ce test, l'interrupteur pourrait mentir sur ce qu'il simule et on
    // croirait avoir regardé un chemin qu'on n'a pas emprunté.
    for (const v of TOUS) {
      expect(verdict(mesuresSimulees(REEL, v))).toBe(v);
    }
  });

  it("ne touche à rien quand rien n'est forcé", () => {
    expect(mesuresSimulees(REEL, null)).toEqual(REEL);
  });

  it("fabrique le défaut même sur un appareil qui annonce sa marge", () => {
    expect(mesuresSimulees(REEL, "marge_absente").margeBasse).toBe(0);
  });

  it("EST INERTE hors développement", () => {
    // Un interrupteur qui survivrait à la compilation de production laisserait
    // un moyen de fausser la mise en page du terminal d'un marchand.
    forcerVerdict("marge_absente");
    expect(verdictForce()).toBe("marge_absente");

    const dev = (globalThis as { __DEV__?: boolean }).__DEV__;
    try {
      (globalThis as { __DEV__?: boolean }).__DEV__ = false;
      expect(verdictForce()).toBeNull();
      forcerVerdict("fenetre_inseree");
      expect(verdictForce()).toBeNull();
    } finally {
      (globalThis as { __DEV__?: boolean }).__DEV__ = dev;
    }
  });
});
