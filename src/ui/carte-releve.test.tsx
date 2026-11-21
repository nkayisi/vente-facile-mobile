/**
 * Une carte de relevé ne tronque jamais son montant : sous sa largeur
 * minimale, elle s'empile. Relevé sur une tablette, dans la liste posée à côté
 * de sa fiche (360 points), puis vérifié sur un téléphone de même largeur :
 * « 43 405,... » s'affichait à la place du total des créances.
 */
import { Text, View } from "react-native";
import { act, create } from "react-test-renderer";

jest.mock("./theme", () => ({
  useTheme: () => ({ colors: {} }),
  useColor: () => "#000",
}));

import { Volet } from "./disposition";
import { CarteReleve, LARGEUR_MIN_CARTE_RELEVE } from "./multi-currency-total";

function classeDeLaCarte(largeur: number): string {
  let rendu!: ReturnType<typeof create>;
  act(() => {
    rendu = create(
      <Volet largeur={largeur}>
        <CarteReleve label="Créances totales" icone={<View testID="pastille" />}>
          <Text>43 405,81 $</Text>
        </CarteReleve>
      </Volet>
    );
  });
  const pastille = rendu.root.findByProps({ testID: "pastille" });
  return String(pastille.parent?.props.className ?? "");
}

describe("la carte de relevé", () => {
  it("garde la pastille à côté du montant quand la cellule a la place", () => {
    expect(classeDeLaCarte(LARGEUR_MIN_CARTE_RELEVE)).toContain("flex-row");
  });

  it("s'empile sous sa largeur minimale, pour rendre la largeur au montant", () => {
    const c = classeDeLaCarte(156);
    expect(c).not.toContain("flex-row");
    expect(c).toContain("gap-2");
  });
});
