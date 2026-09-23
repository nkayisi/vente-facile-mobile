/**
 * L'état vide, et pourquoi il disparaissait dans une carte.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ TROIS SECTIONS DU TABLEAU DE BORD N'AVAIENT RIEN À AFFICHER, ET NE LE    │
 * │ DISAIENT PAS.                                                            │
 * │                                                                          │
 * │ Relevé à l'écran : « Évolution des ventes » et « Encaissements par       │
 * │ devise » s'arrêtaient à leur sous-titre, un fragment de cercle gris      │
 * │ dépassant dans la gouttière sous la carte ; « Produits les plus vendus » │
 * │ ne montrait RIEN du tout - cette carte-là porte `overflow-hidden`.       │
 * │                                                                          │
 * │ `EmptyState` posait `flex-1` sur sa racine, ce qui vaut `flex-basis: 0`. │
 * │ Dans un parent dont la hauteur est AUTOMATIQUE - une `Card`, exactement  │
 * │ - la boîte se résout à ses seules marges intérieures, et son contenu     │
 * │ sort par le bas. Rien ne le signale : pas d'erreur, pas d'avertissement, │
 * │ et sous `overflow-hidden` le contenu est simplement rogné.               │
 * │                                                                          │
 * │ ⚠ Le défaut ne concernait pas que le tableau de bord : le hub Ventes     │
 * │ pose lui aussi son état vide dans une `Card className="overflow-hidden   │
 * │ p-0"`. Son « Aucune vente aujourd'hui » était donc invisible, avec son   │
 * │ bouton de sortie - sur l'écran où un caissier sans vente arrive en       │
 * │ premier. C'est pour lui que `grow` remplace `flex-1` plutôt que d'ouvrir │
 * │ seulement une variante : un état vide ne doit pouvoir s'effacer nulle    │
 * │ part, pas seulement là où on vient de regarder.                          │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ CE TEST NE PROUVE PAS LE RENDU, il prouve la STRUCTURE : que la contrainte
 * est posée, et sur la bonne pièce. Une hauteur se juge à l'œil, sur un
 * terminal. Même réserve que `sheet.test.tsx` et `screen.test.tsx`.
 */
import { act, create, type ReactTestInstance } from "react-test-renderer";

jest.mock("./theme", () => ({
  useTheme: () => ({
    colors: { muted: "#eee", mutedForeground: "#666", foreground: "#000", primary: "#f60" },
    scheme: "light",
  }),
}));

import { EmptyState } from "./feedback";

function rendre(element: React.ReactElement) {
  let rendu!: ReturnType<typeof create>;
  act(() => {
    rendu = create(element);
  });
  return rendu;
}

/** Les classes de tous les nœuds du rendu, dans l'ordre de l'arbre. */
function classes(rendu: ReturnType<typeof create>): string[] {
  return rendu.root
    .findAll((n: ReactTestInstance) => typeof n.props?.className === "string")
    .map((n) => n.props.className as string);
}

describe("l'état vide plein écran", () => {
  it("ne fonde JAMAIS sa hauteur sur une base nulle", () => {
    // `flex-1` vaut `flex-basis: 0` : dans une `Card`, dont la hauteur est
    // automatique, la boîte se réduit à ses marges et le contenu sort.
    const racine = classes(rendre(<EmptyState title="Aucune vente" />))[0];
    expect(racine).not.toMatch(/\bflex-1\b/);
    expect(racine).toMatch(/\bgrow\b/);
  });

  it("prend quand même la place qui reste, et s'y centre", () => {
    // Le cas plein écran ne doit pas régresser : `grow` sans base nulle remplit
    // l'espace libre exactement comme `flex-1` le faisait.
    const racine = classes(rendre(<EmptyState title="Aucune vente" />))[0];
    expect(racine).toMatch(/\bitems-center\b/);
    expect(racine).toMatch(/\bjustify-center\b/);
  });

  it("garde son cercle, qui dit que le vide est DÉLIBÉRÉ", () => {
    // Sans lui, un écran vide se lit comme un écran qui n'a pas fini de charger.
    expect(classes(rendre(<EmptyState title="Aucune vente" />))).toContainEqual(
      expect.stringContaining("rounded-full")
    );
  });
});

describe("l'état vide en carte", () => {
  it("ne prend AUCUNE hauteur d'écran", () => {
    // Trois sections vides à la suite donneraient un tableau de bord qui crie
    // trois fois qu'il n'a rien à dire.
    const racine = classes(rendre(<EmptyState variante="carte" title="Aucune vente" />))[0];
    expect(racine).not.toMatch(/\bflex-1\b/);
    expect(racine).not.toMatch(/\bgrow\b/);
    expect(racine).not.toMatch(/\bjustify-center\b/);
  });

  it("ne redessine PAS l'icône que la carte porte déjà", () => {
    // Le glyphe de l'en-tête et celui de l'état vide étaient le même, à deux
    // cartes du tableau de bord sur trois, l'un deux fois plus gros que l'autre.
    expect(
      classes(rendre(<EmptyState variante="carte" title="Aucun encaissement" />))
    ).not.toContainEqual(expect.stringContaining("rounded-full"));
  });

  it("dit tout de même ce qui manque, et pourquoi", () => {
    // Un bloc muet sous un titre se lit comme un chargement qui n'a pas abouti.
    const rendu = rendre(
      <EmptyState
        variante="carte"
        title="Aucun encaissement"
        message="Rien n'a été réglé sur cette période."
      />
    );
    const texte = JSON.stringify(rendu.toJSON());
    expect(texte).toContain("Aucun encaissement");
    expect(texte).toContain("Rien n'a été réglé sur cette période.");
  });
});
