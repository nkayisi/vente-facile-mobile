/**
 * Les grilles se calculent sur la largeur du VOLET : c'est le seul défaut qu'un
 * relecteur ne peut pas voir, une grille fausse s'affichant parfaitement - sur
 * deux colonnes de six cents points.
 */
import { Text, View } from "react-native";
import { act, create, type ReactTestInstance } from "react-test-renderer";

import { useDisposition, Volet } from "./disposition";
import { Colonnes, Flux, Grille, RangeeChamps, SEUIL_RANGEE_CHAMPS } from "./grille";

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

describe("Flux", () => {
  /** Un bloc qui écrit la largeur que son volet lui annonce. */
  function Bloc({ nom }: { nom: string }) {
    const { largeur } = useDisposition();
    return <Text testID={nom}>{String(largeur)}</Text>;
  }
  const blocs = (n: number) =>
    Array.from({ length: n }, (_, i) => <Bloc key={i} nom={`b${i}`} />);
  const rangees = (r: ReturnType<typeof create>) =>
    r.root.findAll(
      (n) => n.type === View && String(n.props.className ?? "").includes("flex-row")
    );
  const colonnes = (r: ReturnType<typeof create>) =>
    r.root.findAll(
      (n) => n.type === View && String(n.props.className ?? "").includes("min-w-0 flex-1")
    );

  it("laisse un téléphone exactement comme il était : une seule pile", () => {
    const r = rendre(
      <Volet largeur={360}>
        <Flux>{blocs(4)}</Flux>
      </Volet>
    );
    expect(rangees(r)).toHaveLength(0);
    expect(r.root.findByProps({ testID: "b3" }).props.children).toBe("360");
  });

  it("occupe la largeur d'un grand écran, et annonce à chaque bloc SA colonne", () => {
    const r = rendre(
      <Volet largeur={1540}>
        <Flux>{blocs(6)}</Flux>
      </Volet>
    );
    expect(colonnes(r)).toHaveLength(3);
    // (1540 - 2 écarts de 16) / 3 : un bloc qui lirait la largeur de la page
    // poserait ses propres colonnes sur 1 540 points, dans une colonne de 500.
    expect(r.root.findByProps({ testID: "b0" }).props.children).toBe("502.6666666666667");
  });

  it("ne crée jamais une colonne vide : deux blocs font deux colonnes", () => {
    const r = rendre(
      <Volet largeur={1540}>
        <Flux>{blocs(2)}</Flux>
      </Volet>
    );
    expect(colonnes(r)).toHaveLength(2);
  });

  it("respecte le plafond demandé par l'écran", () => {
    const r = rendre(
      <Volet largeur={1540}>
        <Flux max={2}>{blocs(6)}</Flux>
      </Volet>
    );
    expect(colonnes(r)).toHaveLength(2);
  });

  it("ne perd aucun bloc en les répartissant", () => {
    const r = rendre(
      <Volet largeur={1540}>
        <Flux>{blocs(7)}</Flux>
      </Volet>
    );
    for (let i = 0; i < 7; i++) expect(r.root.findAllByProps({ testID: `b${i}` }).length).toBeGreaterThan(0);
  });
});
