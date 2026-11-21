/**
 * Les grilles se calculent sur la largeur du VOLET : c'est le seul défaut qu'un
 * relecteur ne peut pas voir, une grille fausse s'affichant parfaitement - sur
 * deux colonnes de six cents points.
 */
import { Text, View } from "react-native";
import { act, create, type ReactTestInstance } from "react-test-renderer";

import { Volet } from "./disposition";
import { Colonnes, Grille, RangeeChamps, SEUIL_RANGEE_CHAMPS } from "./grille";

function rendre(element: React.ReactElement) {
  let rendu!: ReturnType<typeof create>;
  act(() => {
    rendu = create(element);
  });
  return rendu;
}

/** Les cellules : les vues portant une base de flex. */
function cellules(rendu: ReturnType<typeof create>): ReactTestInstance[] {
  return rendu.root.findAll(
    (n) => n.type === View && Boolean(n.props.style) && "flexBasis" in (n.props.style as object)
  );
}

const six = Array.from({ length: 6 }, (_, i) => <Text key={i}>{`c${i}`}</Text>);

describe("Grille", () => {
  it("garde deux colonnes sur un téléphone", () => {
    const r = rendre(
      <Volet largeur={360}>
        <Grille largeurMin={170} min={2}>
          {six}
        </Grille>
      </Volet>
    );
    expect(cellules(r)).toHaveLength(6);
    expect(cellules(r)[0].props.style.flexBasis).toBe("46%");
  });

  it("met les six relevés sur une rangée d'un grand écran", () => {
    const r = rendre(
      <Volet largeur={1200}>
        <Grille largeurMin={170} min={2} max={6}>
          {six}
        </Grille>
      </Volet>
    );
    const base = parseFloat(cellules(r)[0].props.style.flexBasis);
    expect(base).toBeCloseTo(100 / 6 - 4, 5);
  });

  it("préfère deux rangées pleines à une rangée et demie", () => {
    // 4 colonnes tiendraient ; 3 rangent six relevés sans trou.
    const r = rendre(
      <Volet largeur={760}>
        <Grille largeurMin={170} max={6}>
          {six}
        </Grille>
      </Volet>
    );
    const base = parseFloat(cellules(r)[0].props.style.flexBasis);
    expect(base).toBeCloseTo(100 / 3 - 4, 5);
  });

  it("ne compte pas un enfant absent comme une cellule", () => {
    const r = rendre(
      <Volet largeur={1200}>
        <Grille largeurMin={170}>
          <Text>a</Text>
          {false}
          {null}
          <Text>b</Text>
        </Grille>
      </Volet>
    );
    expect(cellules(r)).toHaveLength(2);
  });

  it("rend à chaque cellule SA largeur", () => {
    let vu = 0;
    function Sonde() {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      vu = require("./disposition").useDisposition().largeur;
      return null;
    }
    rendre(
      <Volet largeur={1212}>
        <Grille largeurMin={170} max={2} ecart={12}>
          <Sonde />
          <Text>b</Text>
        </Grille>
      </Volet>
    );
    expect(vu).toBe(600);
  });
});

describe("Colonnes", () => {
  it("empile sur un téléphone, dans l'ordre", () => {
    const r = rendre(
      <Volet largeur={400}>
        <Colonnes>
          <Text>gauche</Text>
          <Text>droite</Text>
        </Colonnes>
      </Volet>
    );
    expect(r.root.findAll((n) => n.props.className === "flex-row")).toHaveLength(0);
  });

  it("passe côte à côte dès que le volet le permet", () => {
    const r = rendre(
      <Volet largeur={1000}>
        <Colonnes>
          <Text>gauche</Text>
          <Text>droite</Text>
        </Colonnes>
      </Volet>
    );
    expect(r.root.findAll((n) => n.type === View && n.props.className === "flex-row")).toHaveLength(1);
  });
});

describe("RangeeChamps", () => {
  it("rend les champs TELS QUELS sous le seuil : aucune vue entre le formulaire et eux", () => {
    // Une vue intercalée porterait un écart, qui s'ajouterait à la marge du
    // bas de chaque `FormField` : un formulaire de téléphone s'espacerait.
    const r = rendre(
      <Volet largeur={SEUIL_RANGEE_CHAMPS - 1}>
        <RangeeChamps>
          <Text>nom</Text>
          <Text>telephone</Text>
        </RangeeChamps>
      </Volet>
    );
    expect(r.root.findAll((n) => n.type === View)).toHaveLength(0);
    expect(r.root.findAllByType(Text).map((t) => t.props.children)).toEqual(["nom", "telephone"]);
  });

  it("met deux champs côte à côte au-delà, chacun avec SA largeur", () => {
    let vu = 0;
    function Sonde() {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      vu = require("./disposition").useDisposition().largeur;
      return null;
    }
    const r = rendre(
      <Volet largeur={612}>
        <RangeeChamps>
          <Sonde />
          <Text>telephone</Text>
        </RangeeChamps>
      </Volet>
    );
    expect(r.root.findAll((n) => n.type === View && n.props.className === "flex-row")).toHaveLength(1);
    expect(vu).toBe(300);
  });

  it("laisse un champ seul tel quel, même sur un grand écran", () => {
    const r = rendre(
      <Volet largeur={1200}>
        <RangeeChamps>
          <Text>seul</Text>
          {null}
        </RangeeChamps>
      </Volet>
    );
    expect(r.root.findAll((n) => n.type === View)).toHaveLength(0);
  });
});
