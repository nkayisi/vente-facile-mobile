/**
 * Un compte rendu n'a qu'une issue.
 *
 * Relevé sur l'émulateur, à la reprise d'un panier rangé : la boîte « Panier
 * repris, avec des réserves » montrait un SECOND bouton vide, un cadre sans
 * mot sous « J'ai compris ». `AlertDialog` rendait toujours son bouton
 * d'annulation, et l'écran lui passait un libellé vide pour dire « aucune ».
 *
 * ⚠ Ce test prouve la STRUCTURE (combien de boutons, et lesquels), pas le
 * rendu : la même réserve que `screen.test.tsx`.
 */
import { Text as TexteNatif } from "react-native";
import { act, create } from "react-test-renderer";

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 24, bottom: 16, left: 0, right: 0 }),
  useSafeAreaFrame: () => ({ width: 400, height: 800 }),
}));
jest.mock("./theme", () => ({
  useTheme: () => ({ colors: { primary: "#f60", foreground: "#000" }, scheme: "light" }),
}));

// eslint-disable-next-line import/first
import { AlertDialog } from "./dialog";

function libelles(annuler: string | undefined): string[] {
  let arbre!: ReturnType<typeof create>;
  act(() => {
    arbre = create(
      <AlertDialog
        ouvert
        titre="Titre"
        message="Message"
        confirmer="J'ai compris"
        {...(annuler === undefined ? {} : { annuler })}
        onConfirmer={() => {}}
        onAnnuler={() => {}}
      />
    );
  });
  return arbre.root
    .findAllByType(TexteNatif)
    .map((t) => [t.props.children].flat().join(""))
    .filter((t) => t === "J'ai compris" || t === "Annuler" || t === "");
}

describe("AlertDialog", () => {
  it("une confirmation garde ses deux issues", () => {
    expect(libelles(undefined)).toEqual(["J'ai compris", "Annuler"]);
  });

  it("un libellé d'annulation vide ne rend AUCUN second bouton", () => {
    expect(libelles("")).toEqual(["J'ai compris"]);
  });
});
