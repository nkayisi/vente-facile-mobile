import { etablissementSuspendu } from "./porte";

describe("etablissementSuspendu", () => {
  it("ferme sur un établissement explicitement suspendu", () => {
    expect(etablissementSuspendu({ id: "o", name: "Boutique", is_active: false })).toBe(true);
  });

  it("reste ouvert sur un établissement actif", () => {
    expect(etablissementSuspendu({ id: "o", name: "Boutique", is_active: true })).toBe(false);
  });

  it("reste ouvert quand le champ manque : le parc en service n'a pas l'instantané neuf", () => {
    expect(etablissementSuspendu({ id: "o", name: "Boutique" })).toBe(false);
    expect(etablissementSuspendu(null)).toBe(false);
    expect(etablissementSuspendu(undefined)).toBe(false);
  });
});
