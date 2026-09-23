/**
 * Ce que le balayage de `doctrine.test.ts` ne peut pas voir.
 *
 * Il lit le TEXTE des fichiers et constate qu'aucun `bg-splash` ni `plaque`
 * n'y traîne. Il resterait vert si `Logo` posait le dessin sur un fond sombre,
 * où il est amputé, ou s'il rendait un mot-symbole en doublon du titre déjà
 * écrit à côté.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LES DEUX DÉFAUTS QUE CE FICHIER ATTRAPE NE LÈVENT RIEN.                 │
 * │                                                                          │
 * │ Un logo amputé s'affiche, simplement : il n'y reste que le tourbillon    │
 * │ orange, et cela se lit comme un défaut d'affichage sans qu'aucune erreur │
 * │ ne soit levée. Un mot-symbole en doublon s'affiche aussi. Les deux se    │
 * │ découvrent à l'oeil, de nuit, sur le terminal d'un marchand.             │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import { act, create } from "react-test-renderer";
import { Image } from "expo-image";

// ⚠ Le préfixe `mock` n'est pas cosmétique : `jest.mock` refuse toute
// variable hors de sa portée et ne fait exception que pour lui.
let mockScheme: "light" | "dark" = "light";
jest.mock("./theme", () => ({
  useTheme: () => ({ scheme: mockScheme, colors: {}, preference: "system", setPreference: () => {} }),
}));

import { Logo } from "./logo";

function rendre(element: React.ReactElement) {
  let rendu!: ReturnType<typeof create>;
  act(() => {
    rendu = create(element);
  });
  return rendu;
}

/** Tout le texte de l'arbre, aplati. */
function texte(noeud: unknown): string {
  if (noeud == null || typeof noeud === "boolean") return "";
  if (typeof noeud === "string" || typeof noeud === "number") return String(noeud);
  if (Array.isArray(noeud)) return noeud.map(texte).join("");
  const enfants = (noeud as { children?: unknown }).children;
  return enfants === undefined ? "" : texte(enfants);
}

/** Toute classe d'arrière-plan trouvée dans l'arbre rendu. */
function fonds(noeud: unknown, trouves: string[] = []): string[] {
  if (noeud == null || typeof noeud !== "object") return trouves;
  if (Array.isArray(noeud)) {
    noeud.forEach((n) => fonds(n, trouves));
    return trouves;
  }
  const props = (noeud as { props?: Record<string, unknown> }).props ?? {};
  const cls = typeof props.className === "string" ? props.className : "";
  for (const m of cls.matchAll(/\bbg-[\w-]+/g)) trouves.push(m[0]);
  return fonds((noeud as { children?: unknown }).children, trouves);
}

afterEach(() => {
  mockScheme = "light";
});

describe("le fond derrière le logo", () => {
  it("rend le DESSIN en thème clair", () => {
    const r = rendre(<Logo hauteur={104} />);
    expect(r.root.findAllByType(Image)).toHaveLength(1);
  });

  /**
   * ⚠ MESURÉ sur l'émulateur : posé sur `#0f0f11`, le tourbillon orange tient
   * 5,38:1, mais le bleu du mot « Vente » tombe à 1,61:1 et le contour noir du
   * téléphone à 1,01:1. Il ne resterait que l'orange.
   */
  it("ne pose JAMAIS le dessin sur un fond sombre", () => {
    mockScheme = "dark";
    const r = rendre(<Logo hauteur={104} />);
    expect(r.root.findAllByType(Image)).toHaveLength(0);
  });

  it("rend le mot-symbole à la place, pour que la marque ne disparaisse pas", () => {
    mockScheme = "dark";
    const r = rendre(<Logo hauteur={44} />);
    expect(texte(r.toJSON())).toBe("VenteFacile");
  });

  /**
   * La connexion porte son titre « Vente Facile » et le tiroir porte
   * « Vente » + « Facile » : un second mot-symbole y ferait doublon.
   */
  it("se tait quand le nom est déjà écrit à côté", () => {
    mockScheme = "dark";
    const r = rendre(<Logo hauteur={104} nomAilleurs />);
    expect(r.toJSON()).toBeNull();
  });

  /** L'écran de démarrage : son fond est `bg-splash`, clair dans les deux thèmes. */
  it("rend le dessin sur un écran clair même de nuit", () => {
    mockScheme = "dark";
    const r = rendre(<Logo largeur={180} fondClair />);
    expect(r.root.findAllByType(Image)).toHaveLength(1);
  });

  /**
   * LE CONTRÔLE QUI PORTE LA RÈGLE : aucune plaque, dans aucun thème.
   * Le fond derrière le logo est toujours celui de la page.
   */
  it("n'entoure le logo d'AUCUN fond, dans les deux thèmes", () => {
    for (const s of ["light", "dark"] as const) {
      mockScheme = s;
      for (const el of [
        <Logo hauteur={104} key="a" />,
        <Logo hauteur={44} key="b" />,
        <Logo largeur={180} fondClair key="c" />,
      ]) {
        expect(fonds(rendre(el).toJSON())).toEqual([]);
      }
    }
  });
});
