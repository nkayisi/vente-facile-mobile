/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE QUE CES TESTS DÉFENDENT : UNE CLASSE QUI NE FAIT RIEN, EN SILENCE.   │
 * │                                                                          │
 * │ En NativeWind, deux classes qui touchent la même propriété se départagent│
 * │ par l'ordre de la FEUILLE COMPILÉE, c'est-à-dire par ordre alphabétique, │
 * │ et non par l'ordre du `className`. Mesuré sur l'émulateur :              │
 * │ `text-destructive` perdait contre le `text-foreground` de la variante,   │
 * │ et `text-2xl` contre `text-base` - « 2 » précède « b ».                  │
 * │                                                                          │
 * │ Aucun avertissement, aucune erreur : la classe est simplement sans effet.│
 * │ Les tests ci-dessous nomment les deux cas mesurés, pour qu'un correctif  │
 * │ ne puisse pas les rouvrir.                                               │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import { fusionner, groupe } from "./classes";

describe("fusionner", () => {
  it("retire la COULEUR de la base quand l'appelant en donne une", () => {
    // Le cas mesuré : un « reste à payer » écrit en rouge sortait en noir.
    expect(fusionner("text-base font-sans text-foreground", "text-destructive")).toBe(
      "text-base font-sans text-destructive"
    );
  });

  it("retire la TAILLE de la base quand l'appelant en donne une", () => {
    // Le cas mesuré : le plus grand palier de `StatValue` sortait à 16 points,
    // et tous les cadrans de l'application perdaient leur hiérarchie.
    expect(fusionner("text-base font-sans text-foreground", "font-sans-bold text-2xl")).toBe(
      "text-foreground font-sans-bold text-2xl"
    );
  });

  it("retire le REMBOURRAGE de la base : `p-0` doit valoir zéro", () => {
    expect(fusionner("rounded-xl bg-card p-4", "overflow-hidden p-0")).toBe(
      "rounded-xl bg-card overflow-hidden p-0"
    );
  });

  it("ne confond pas l'ALIGNEMENT avec une couleur", () => {
    // `text-center` commence par `text-` sans toucher à la couleur : le ranger
    // en couleur retirerait celle de la variante, et le libellé d'une tuile
    // d'action sortirait de la couleur du corps de texte.
    expect(fusionner("text-sm font-sans text-foreground", "text-center")).toBe(
      "text-sm font-sans text-foreground text-center"
    );
  });

  it("l'opacité ne change pas la propriété", () => {
    expect(fusionner("bg-card", "bg-primary/10")).toBe("bg-primary/10");
    expect(fusionner("text-foreground", "text-warning/70")).toBe("text-warning/70");
  });

  it("garde ce qu'il ne sait pas nommer", () => {
    // Se tromper de groupe retirerait une classe voulue : l'inconnu passe.
    expect(fusionner("flex-1 shrink-0", "min-w-0")).toBe("flex-1 shrink-0 min-w-0");
  });

  it("sans ajout, la base sort intacte", () => {
    expect(fusionner("text-base font-sans text-foreground")).toBe(
      "text-base font-sans text-foreground"
    );
    expect(fusionner("text-base", null)).toBe("text-base");
  });

  it("nomme les groupes qu'il connaît, et rien d'autre", () => {
    expect(groupe("text-2xl")).toBe("taille");
    expect(groupe("text-destructive")).toBe("couleur");
    expect(groupe("text-center")).toBe("alignement");
    expect(groupe("font-sans-bold")).toBe("famille");
    expect(groupe("px-4")).toBe("px");
    expect(groupe("rounded-full")).toBe("rayon");
    // `p` seul n'est pas une classe de rembourrage, et `flex-1` n'est rien
    // qu'on sache trancher.
    expect(groupe("flex-1")).toBeNull();
    expect(groupe("shrink-0")).toBeNull();
  });
});
