/**
 * Le sélecteur s'ouvre sur 1, et la première touche le REMPLACE.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ L'ACCUMULATEUR AJOUTE CHAQUE TOUCHE À LA VALEUR.                         │
 * │                                                                          │
 * │ Sans le drapeau de remplacement, taper 2 sur le 1 proposé donnait « 12 », │
 * │ et 2 sur une ligne rouverte à 3 donnait « 32 ». Le défaut ne lève rien : │
 * │ le caissier ajoute douze articles au lieu de deux.                       │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import { act, create, type ReactTestInstance } from "react-test-renderer";

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  useSafeAreaFrame: () => ({ width: 400, height: 800 }),
}));
jest.mock("expo-router", () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
}));
jest.mock("@/ui/theme", () => ({
  useTheme: () => ({ colors: { primary: "#f60", foreground: "#000" }, scheme: "light" }),
}));

import type { ArticlePos } from "./catalogue";
import { SelecteurQuantite } from "./selecteur-quantite";

const article = {
  id: "p1",
  name: "Sucre",
  sku: "SUC",
  barcode: null,
  image: null,
  categoryId: null,
  categoryName: null,
  selling_price: "1000",
  wholesale_price: null,
  is_taxable: false,
  tax_rate: null,
  selling_mode: "retail_only",
  units_per_package: null,
  unit_name: "kg",
  packaging_unit_name: null,
  allow_auto_unpacking: true,
  track_inventory: true,
} as unknown as ArticlePos;

function ouvrir(props: Partial<React.ComponentProps<typeof SelecteurQuantite>> = {}) {
  const valider = jest.fn();
  let rendu!: ReturnType<typeof create>;
  act(() => {
    rendu = create(
      <SelecteurQuantite article={article} visible onFermer={() => {}} onValider={valider} {...props} />
    );
  });
  const touche = (label: string) => {
    const [cible] = rendu.root.findAll(
      (n: ReactTestInstance) => n.props.accessibilityLabel === label && typeof n.props.onPress === "function"
    );
    act(() => cible.props.onPress());
  };
  const bouton = () =>
    rendu.root.findAll(
      (n: ReactTestInstance) =>
        typeof n.props.onPress === "function" && n.props.children === "Ajouter"
    )[0];
  const ajouter = () => {
    act(() => bouton().props.onPress());
  };
  return { rendu, touche, ajouter, bouton, valider };
}

describe("SelecteurQuantite", () => {
  it("propose 1, qu'« Ajouter » ajoute d'un appui", () => {
    const { ajouter, valider } = ouvrir();
    ajouter();
    expect(valider).toHaveBeenCalledWith({ packages: 0, loose: 1 }, undefined, undefined);
  });

  it("remplace le 1 proposé à la première touche : 2 donne 2, jamais 12", () => {
    const { touche, ajouter, valider } = ouvrir();
    touche("2");
    touche("5");
    ajouter();
    expect(valider).toHaveBeenCalledWith({ packages: 0, loose: 25 }, undefined, undefined);
  });

  it("remplace la valeur d'une ligne rouverte : 3 puis 2 donne 2, jamais 32", () => {
    const { touche, ajouter, valider } = ouvrir({ initiale: { packages: 0, loose: 3 } });
    touche("2");
    ajouter();
    expect(valider).toHaveBeenCalledWith({ packages: 0, loose: 2 }, undefined, undefined);
  });

  it("ne propose rien quand 1 fermerait l'encaissement, et dit pourquoi", () => {
    const motif = "Stock insuffisant pour Sucre : 0,4 kg en stock.";
    const { rendu, bouton } = ouvrir({ avertir: () => motif });
    expect(JSON.stringify(rendu.toJSON())).toContain(motif);
    expect(JSON.stringify(rendu.toJSON())).toContain("Rien n'est proposé");
    expect(bouton().props.disabled).toBe(true);
  });
});
