import { inscrireModale, modaleOuverte } from "./modales-ouvertes";

describe("les modales ouvertes", () => {
  it("se comptent, et le lecteur reprend quand la dernière se ferme", () => {
    expect(modaleOuverte()).toBe(false);
    const a = inscrireModale();
    const b = inscrireModale();
    expect(modaleOuverte()).toBe(true);
    a();
    expect(modaleOuverte()).toBe(true);
    b();
    expect(modaleOuverte()).toBe(false);
  });

  it("retirer deux fois la même ne fausse pas le compte", () => {
    const a = inscrireModale();
    const b = inscrireModale();
    a();
    a();
    expect(modaleOuverte()).toBe(true);
    b();
    expect(modaleOuverte()).toBe(false);
  });
});
