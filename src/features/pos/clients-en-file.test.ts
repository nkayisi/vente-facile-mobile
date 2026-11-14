import { clientPosDepuisCreation, fusionnerClients, preremplissage } from "./clients-en-file";

const plier = (s: string) => s.toLowerCase();
const tire = (id: string, name: string) => ({
  id, name, phone: null, allow_credit: true, credit_limit: "0", current_balance: "1500",
});

describe("clientPosDepuisCreation", () => {
  it("rend un client sans dette, avec le crédit de sa saisie", () => {
    const c = clientPosDepuisCreation({
      id: "c1", name: " Awa ", phone: " 0811 ", allow_credit: false, credit_limit: "50000",
    });
    expect(c).toEqual({
      id: "c1", name: "Awa", phone: "0811", allow_credit: false,
      credit_limit: "50000", current_balance: "0",
    });
  });

  it("un crédit non précisé reste autorisé, comme le défaut du serveur", () => {
    expect(clientPosDepuisCreation({ id: "c1", name: "Awa" }).allow_credit).toBe(true);
  });
});

describe("fusionnerClients", () => {
  const enFile = [clientPosDepuisCreation({ id: "n1", name: "Awa Mbuyi", phone: "0811111111" })];

  it("propose le client en file, en tête", () => {
    const r = fusionnerClients([tire("t1", "Nelly")], enFile, "", plier, 25);
    expect(r.map((c) => c.id)).toEqual(["n1", "t1"]);
  });

  it("le trouve par son nom ou son téléphone", () => {
    expect(fusionnerClients([], enFile, "mbuyi", plier, 25)).toHaveLength(1);
    expect(fusionnerClients([], enFile, "0811", plier, 25)).toHaveLength(1);
    expect(fusionnerClients([], enFile, "nelly", plier, 25)).toHaveLength(0);
  });

  it("ne le montre pas deux fois une fois redescendu par le tirage", () => {
    const r = fusionnerClients([tire("n1", "Awa Mbuyi")], enFile, "", plier, 25);
    expect(r).toHaveLength(1);
    // La fiche tirée fait foi : elle porte la dette réelle.
    expect(r[0].current_balance).toBe("1500");
  });

  it("respecte la limite", () => {
    const r = fusionnerClients([tire("t1", "A"), tire("t2", "B")], enFile, "", plier, 2);
    expect(r).toHaveLength(2);
  });
});

describe("preremplissage", () => {
  it("un numéro va au téléphone", () => {
    expect(preremplissage(" +243 811 111 111 ")).toEqual({ nom: "", telephone: "+243 811 111 111" });
    expect(preremplissage("0811111111")).toEqual({ nom: "", telephone: "0811111111" });
  });

  it("un nom va au nom", () => {
    expect(preremplissage("Awa")).toEqual({ nom: "Awa", telephone: "" });
  });

  it("rien cherché, rien prérempli", () => {
    expect(preremplissage("  ")).toEqual({ nom: "", telephone: "" });
  });
});
