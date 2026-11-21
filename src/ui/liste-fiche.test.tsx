/**
 * La liste et sa fiche.
 *
 * Quatre défauts que rien ne signale à l'exécution : une liste REMONTÉE à
 * chaque rotation (recherche et filtres perdus), une fiche qui garde l'état
 * de la pièce précédente, une fiche ouverte qui disparaît quand la tablette
 * passe en portrait, et une fiche posée à côté d'un onglet qui ajoute sa
 * propre marge du haut sous la barre de l'onglet.
 */
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { act, create } from "react-test-renderer";

const mockRouter = { push: jest.fn(), back: jest.fn() };
const mockFocus = { valeur: true };
jest.mock("expo-router", () => ({
  router: {
    push: (...a: unknown[]) => mockRouter.push(...a),
    back: (...a: unknown[]) => mockRouter.back(...a),
  },
  useIsFocused: () => mockFocus.valeur,
  useLocalSearchParams: () => ({}),
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 24, bottom: 16, left: 0, right: 0 }),
  useSafeAreaFrame: () => ({ width: 1920, height: 1080 }),
}));
jest.mock("./theme", () => ({
  useTheme: () => ({ colors: { primary: "#f60" } }),
  useColor: () => "#000",
}));

import { AppBar } from "./app-bar";
import { Volet } from "./disposition";
import { useIdDeFiche, useListeFiche } from "./liste-fiche";
import { Screen } from "./screen";

let montagesListe = 0;
let montagesFiche = 0;

function Liste() {
  useEffect(() => {
    montagesListe += 1;
  }, []);
  return <Text>liste</Text>;
}

function Fiche() {
  const id = useIdDeFiche();
  // Un état LOCAL : s'il survivait au changement de pièce, la saisie glisserait
  // d'une vente à la suivante.
  const [saisie] = useState(`saisie-${id}`);
  useEffect(() => {
    montagesFiche += 1;
  }, []);
  return (
    <Screen>
      <AppBar title={`fiche ${id}`} />
      <Text testID="id">{id}</Text>
      <Text testID="saisie">{saisie}</Text>
    </Screen>
  );
}

let api!: ReturnType<typeof useListeFiche>;
const capter = (a: ReturnType<typeof useListeFiche>) => {
  api = a;
};
function Hote({ bords }: { bords?: [] }) {
  const liste = useListeFiche({
    chemin: (id) => `/vente/${id}`,
    Fiche,
    vide: { icon: "Receipt", titre: "Choisissez une vente" },
    bords,
  });
  capter(liste);
  return <>{liste.rendre(<Liste />)}</>;
}

function rendre(largeur: number, bords?: []) {
  let rendu!: ReturnType<typeof create>;
  act(() => {
    rendu = create(
      <Volet largeur={largeur}>
        <Hote bords={bords} />
      </Volet>
    );
  });
  return {
    rendu,
    largeur: (l: number) =>
      act(() => {
        rendu.update(
          <Volet largeur={l}>
            <Hote bords={bords} />
          </Volet>
        );
      }),
  };
}

const texte = (rendu: ReturnType<typeof create>) =>
  rendu.root
    .findAllByType(Text)
    .map((t) => t.props.children)
    .flat()
    .join(" | ");

beforeEach(() => {
  montagesListe = 0;
  montagesFiche = 0;
  mockFocus.valeur = true;
  mockRouter.push.mockClear();
  mockRouter.back.mockClear();
});

describe("en une colonne", () => {
  it("pousse la fiche, comme avant, et ne montre que la liste", () => {
    const { rendu } = rendre(448);
    expect(api.coteACote).toBe(false);
    act(() => api.ouvrir("v1"));
    expect(mockRouter.push).toHaveBeenCalledWith("/vente/v1");
    expect(texte(rendu)).toBe("liste");
  });
});

describe("en deux colonnes", () => {
  it("ouvre la fiche à côté de la liste, et dit ce qu'on attend avant", () => {
    const { rendu } = rendre(1664);
    expect(api.coteACote).toBe(true);
    expect(texte(rendu)).toContain("Choisissez une vente");

    act(() => api.ouvrir("v1"));
    expect(mockRouter.push).not.toHaveBeenCalled();
    expect(rendu.root.findByProps({ testID: "id" }).props.children).toBe("v1");
    expect(api.selection).toBe("v1");
  });

  it("remonte la fiche à chaque pièce : rien ne glisse d'une vente à la suivante", () => {
    const { rendu } = rendre(1664);
    act(() => api.ouvrir("v1"));
    act(() => api.ouvrir("v2"));
    expect(rendu.root.findByProps({ testID: "saisie" }).props.children).toBe("saisie-v2");
    expect(montagesFiche).toBe(2);
  });

  it("referme le volet par la croix de la barre, sans quitter la liste", () => {
    const { rendu } = rendre(1664);
    act(() => api.ouvrir("v1"));
    const croix = rendu.root.findByProps({ accessibilityLabel: "Fermer la fiche" });
    act(() => croix.props.onPress());
    expect(mockRouter.back).not.toHaveBeenCalled();
    expect(api.selection).toBeNull();
    expect(texte(rendu)).toContain("Choisissez une vente");
  });

  it("donne à la fiche les bords de l'écran hôte : aucun haut à côté d'un onglet", () => {
    const { rendu } = rendre(1664, []);
    act(() => api.ouvrir("v1"));
    const pad = rendu.root
      .findAllByType(View)
      .map((v) => v.props.style as Record<string, unknown> | undefined)
      .find((st) => st !== undefined && st !== null && "paddingTop" in st);
    expect(pad).toMatchObject({ paddingTop: 0, paddingBottom: 0 });
  });
});

describe("quand la page change de largeur", () => {
  it("ne remonte jamais la liste", () => {
    const { largeur } = rendre(448);
    for (const l of [1664, 720, 1664, 448]) largeur(l);
    expect(montagesListe).toBe(1);
  });

  it("pousse la fiche ouverte quand il n'y a plus la place des deux, une seule fois", () => {
    const { largeur } = rendre(1664);
    act(() => api.ouvrir("v1"));
    largeur(720);
    expect(mockRouter.push).toHaveBeenCalledTimes(1);
    expect(mockRouter.push).toHaveBeenCalledWith("/vente/v1");
    // Revenir en deux colonnes puis repartir ne la repousse pas : elle n'est
    // plus ouverte dans le volet, elle est sur la pile.
    largeur(1664);
    largeur(720);
    expect(mockRouter.push).toHaveBeenCalledTimes(1);
  });

  it("ne pousse rien quand un autre écran est déjà par-dessus la liste", () => {
    const { largeur } = rendre(1664);
    act(() => api.ouvrir("v1"));
    mockFocus.valeur = false;
    largeur(720);
    expect(mockRouter.push).not.toHaveBeenCalled();
  });
});

describe("une liste qui mêle deux sortes de pièces", () => {
  function FicheClient() {
    return <Text testID="sorte">client {useIdDeFiche()}</Text>;
  }
  function FicheFournisseur() {
    return <Text testID="sorte">fournisseur {useIdDeFiche()}</Text>;
  }
  let contacts!: ReturnType<typeof useListeFiche>;
  const capterContacts = (a: ReturnType<typeof useListeFiche>) => {
    contacts = a;
  };
  function Contacts() {
    const liste = useListeFiche({
      variantes: {
        client: { chemin: (id) => `/client/${id}`, Fiche: FicheClient },
        fournisseur: { chemin: (id) => `/fournisseur/${id}`, Fiche: FicheFournisseur },
      },
      vide: { icon: "Users", titre: "Choisissez un contact" },
    });
    capterContacts(liste);
    return <>{liste.rendre(<Liste />)}</>;
  }

  it("ouvre la fiche de la sorte demandée, et pousse sa route en une colonne", () => {
    let rendu!: ReturnType<typeof create>;
    act(() => {
      rendu = create(
        <Volet largeur={1664}>
          <Contacts />
        </Volet>
      );
    });
    act(() => contacts.ouvrir("c1", "client"));
    expect(rendu.root.findByProps({ testID: "sorte" }).props.children).toEqual(["client ", "c1"]);
    act(() => contacts.ouvrir("f1", "fournisseur"));
    expect(rendu.root.findByProps({ testID: "sorte" }).props.children).toEqual([
      "fournisseur ",
      "f1",
    ]);

    act(() => {
      rendu.update(
        <Volet largeur={448}>
          <Contacts />
        </Volet>
      );
    });
    expect(mockRouter.push).toHaveBeenCalledWith("/fournisseur/f1");
  });
});
