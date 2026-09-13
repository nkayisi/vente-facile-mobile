/**
 * L'ordre du cycle, et le fait qu'il se referme.
 *
 * Ce qui se joue ici n'est pas cosmétique : un cycle qui ne repasse pas par
 * `system` enferme le marchand dans un thème explicite, et il n'existe plus
 * aucun chemin - la bascule ayant remplacé l'écran « Apparence » - pour rendre
 * le thème au téléphone.
 */
import { LIBELLE_THEME, ORDRE_THEME, themeSuivant, type ModeTheme } from "./theme-cycle";

describe("cycle de thème", () => {
  it("suit l'ordre annoncé : automatique, clair, sombre", () => {
    expect(themeSuivant("system")).toBe("light");
    expect(themeSuivant("light")).toBe("dark");
    expect(themeSuivant("dark")).toBe("system");
  });

  it("se referme : trois appuis ramènent au point de départ", () => {
    for (const depart of ORDRE_THEME) {
      expect(themeSuivant(themeSuivant(themeSuivant(depart)))).toBe(depart);
    }
  });

  it("atteint les TROIS modes depuis n'importe lequel", () => {
    // Sans cet invariant, « Automatique » pourrait devenir inatteignable sans
    // que rien ne le signale : l'icône changerait, le mode non.
    for (const depart of ORDRE_THEME) {
      const vus = new Set<ModeTheme>([depart]);
      let courant = depart as ModeTheme;
      for (let i = 0; i < ORDRE_THEME.length; i += 1) {
        courant = themeSuivant(courant);
        vus.add(courant);
      }
      expect([...vus].sort()).toEqual([...ORDRE_THEME].sort());
    }
  });

  it("retombe sur `system` devant un mode inconnu, sans lever", () => {
    // Une valeur rangée par une version antérieure de l'application. Un thème
    // est un confort : il ne doit pas pouvoir arrêter le comptoir.
    expect(themeSuivant("auto" as ModeTheme)).toBe("system");
  });

  it("nomme les trois modes, et chacun porte son propre glyphe", () => {
    const glyphes = ORDRE_THEME.map((m) => LIBELLE_THEME[m].icon);
    expect(new Set(glyphes).size).toBe(ORDRE_THEME.length);
    for (const m of ORDRE_THEME) {
      expect(LIBELLE_THEME[m].titre.trim().length).toBeGreaterThan(0);
      expect(LIBELLE_THEME[m].aide.trim().length).toBeGreaterThan(0);
    }
  });
});
