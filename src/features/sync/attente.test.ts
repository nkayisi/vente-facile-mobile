import { attentesPar } from "./attente";

describe("attentesPar", () => {
  it("rassemble les actes d'une même pièce", () => {
    const par = attentesPar([
      { id: "a", envoi: "en_attente" },
      { id: "b", envoi: "en_attente" },
    ]);
    expect([...par.keys()].sort()).toEqual(["a", "b"]);
  });

  it("retient le PIRE état d'une pièce", () => {
    // Une création en file plus une approbation bloquée : dire « attend son
    // envoi » ferait attendre un réseau qui ne débloquera rien.
    const par = attentesPar([
      { id: "a", envoi: "en_attente" },
      { id: "a", envoi: "bloque" },
      { id: "a", envoi: "en_attente" },
    ]);
    expect(par.get("a")).toBe("bloque");
  });

  it("ignore un identifiant absent, plutôt que d'inventer une clé vide", () => {
    expect(attentesPar([{ id: undefined, envoi: "en_attente" }]).size).toBe(0);
    expect(attentesPar([{ id: "", envoi: "bloque" }]).size).toBe(0);
  });
});
