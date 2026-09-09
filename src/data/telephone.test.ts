/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE CHAMP `phone` D'UN CLIENT EST LIBRE, ET IL EN PROFITE.               │
 * │                                                                          │
 * │ Il porte des numéros, mais aussi « voir Papa Jean », « bureau », ou un   │
 * │ code interne à cinq chiffres saisi dans la mauvaise case. Ouvrir un      │
 * │ composeur sur l'une de ces chaînes rend un clavier vide, et le marchand  │
 * │ croit que son téléphone est cassé. Un bouton qui ne s'affiche pas est    │
 * │ plus honnête qu'un bouton qui ne fait rien.                              │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import { numeroAppelable } from "./telephone";

describe("numeroAppelable", () => {
  it("retire le décor de saisie et garde les chiffres", () => {
    expect(numeroAppelable("099 812 34 56")).toBe("0998123456");
    expect(numeroAppelable("0998-123-456")).toBe("0998123456");
    expect(numeroAppelable("(0998) 123.456")).toBe("0998123456");
  });

  it("garde le `+` international, et lui seul", () => {
    expect(numeroAppelable("+243 998 123 456")).toBe("+243998123456");
    // Un `+` au milieu n'est pas un indicatif : c'est une faute de frappe, et
    // le recoller en tête fabriquerait un numéro international qui n'existe pas.
    expect(numeroAppelable("0998+123456")).toBe("0998123456");
  });

  it("refuse ce qui n'est pas un numéro", () => {
    for (const mauvais of ["", "   ", "voir Papa Jean", "bureau", null, undefined]) {
      expect(numeroAppelable(mauvais)).toBeNull();
    }
  });

  it("refuse un numéro trop court pour en être un", () => {
    // Cinq chiffres désignent presque toujours un code interne ; un numéro
    // congolais en compte neuf après le zéro.
    expect(numeroAppelable("12345")).toBeNull();
    expect(numeroAppelable("Réf. 4821")).toBeNull();
    expect(numeroAppelable("123456")).toBe("123456");
  });

  it("ne se laisse pas duper par des lettres autour d'un vrai numéro", () => {
    // Ce cas est fréquent : « 0998123456 (fils) ». On compose, plutôt que de
    // refuser un numéro parfaitement valide pour une annotation.
    expect(numeroAppelable("0998123456 (fils)")).toBe("0998123456");
  });
});
