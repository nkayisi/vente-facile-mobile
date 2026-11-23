/**
 * Un libellé de bouton tient sur UNE ligne.
 *
 * Le défaut que ce test garde ne se voit pas à la relecture et ne lève rien :
 * Android passait le dernier mot à la ligne sur des libellés qui tenaient, et
 * la hauteur fixe du bouton rognait cette seconde ligne. « Voir les niveaux de
 * stock » sortait « Voir les niveaux de », la place du mot restée vide.
 */
import { Text } from "react-native";
import { act, create } from "react-test-renderer";

jest.mock("./theme", () => ({
  useTheme: () => ({ colors: { primaryForeground: "#fff", foreground: "#000" }, scheme: "light" }),
}));

import { Button, IconButton } from "./button";
import { Volet } from "./disposition";

function libelle(element: React.ReactElement) {
  let rendu!: ReturnType<typeof create>;
  act(() => {
    rendu = create(element);
  });
  return rendu.root.findAll(
    (n) => n.type === Text && n.props.children === "Voir les niveaux de stock"
  )[0];
}

describe("le libellé d'un bouton", () => {
  it("ne passe jamais à la ligne, en pleine largeur comme à sa taille", () => {
    for (const plein of [true, false]) {
      const t = libelle(
        <Button fullWidth={plein} leftIcon="Boxes" onPress={() => {}}>
          Voir les niveaux de stock
        </Button>
      );
      expect(t.props.numberOfLines).toBe(1);
    }
  });

  it("se réduit à la largeur du bouton plutôt que d'en déborder", () => {
    // Un libellé vraiment trop long finit par des points de suspension : sans
    // `flexShrink`, il sortirait du bouton, par-dessus ses voisins.
    const t = libelle(<Button onPress={() => {}}>Voir les niveaux de stock</Button>);
    const styles = [t.props.style].flat(Infinity).filter(Boolean);
    expect(styles.some((s: { flexShrink?: number }) => s.flexShrink === 1)).toBe(true);
  });
});

describe("un bouton réduit à son icône", () => {
  function textes(largeur: number) {
    let rendu!: ReturnType<typeof create>;
    act(() => {
      rendu = create(
        <Volet largeur={largeur}>
          <IconButton name="Download" label="Exporter le document" texte="Exporter" />
        </Volet>
      );
    });
    return rendu.root.findAll((n) => n.type === Text).map((n) => n.props.children);
  }

  it("reste une icône sur un téléphone, faute de place", () => {
    expect(textes(360)).not.toContain("Exporter");
  });

  it("porte son libellé dès que le volet a la place", () => {
    expect(textes(720)).toContain("Exporter");
    expect(textes(1500)).toContain("Exporter");
  });

  it("change de forme sur la largeur du VOLET, pas de la fenêtre", () => {
    expect(textes(719)).not.toContain("Exporter");
  });
});
