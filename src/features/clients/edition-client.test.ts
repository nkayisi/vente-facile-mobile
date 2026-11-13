import {
  corpsClient,
  corpsDepuisLigneClient,
  lirePlafond,
  valeursDepuisCorpsClient,
  type SaisieClient,
} from "./edition-client";

const SAISIE: SaisieClient = {
  nom: " Mama Lucie ",
  telephone: " 0990000001 ",
  entreprise: false,
  raisonSociale: "SARL Lucie",
  numeroImpot: "A123",
  email: "",
  adresse: "Marché central",
  creditAutorise: true,
  plafondCredit: 50000,
  notes: "",
};

describe("le plafond de crédit saisi", () => {
  it("« 50 000 » se lit cinquante mille, pas zéro", () => {
    // ⚠ Zéro veut dire « sans plafond » : la lecture d'origine ouvrait un
    //   crédit illimité à qui tapait un séparateur de milliers.
    expect(lirePlafond("50 000")).toEqual({ ok: true, valeur: 50000 });
    expect(lirePlafond("12500,5")).toEqual({ ok: true, valeur: 12500.5 });
  });

  it("un champ vide vaut zéro, c'est-à-dire sans plafond", () => {
    expect(lirePlafond("")).toEqual({ ok: true, valeur: 0 });
  });

  it("une saisie illisible ou négative est un refus, jamais un zéro", () => {
    expect(lirePlafond("12,5,0").ok).toBe(false);
    expect(lirePlafond("-5").ok).toBe(false);
  });
});

describe("le corps d'un client, commun à la création et à la modification", () => {
  it("un particulier n'a ni raison sociale ni numéro d'impôt", () => {
    const c = corpsClient(SAISIE);
    expect(c.customer_type).toBe("individual");
    expect(c.company_name).toBe("");
    expect(c.tax_id).toBe("");
  });

  it("rogne et envoie le plafond en chaîne", () => {
    const c = corpsClient(SAISIE);
    expect(c.name).toBe("Mama Lucie");
    expect(c.phone).toBe("0990000001");
    expect(c.credit_limit).toBe("50000");
  });

  it("une entreprise garde ses deux champs", () => {
    const c = corpsClient({ ...SAISIE, entreprise: true });
    expect(c.company_name).toBe("SARL Lucie");
    expect(c.tax_id).toBe("A123");
  });
});

describe("la fiche locale devient le formulaire", () => {
  it("un plafond à zéro se lit comme un champ vide, et les décimales de queue tombent", () => {
    const base = {
      customerType: "individual", name: "Mama Lucie", companyName: "", email: "", phone: "0990000001",
      address: "", taxId: "", allowCredit: true, notes: "",
    };
    expect(valeursDepuisCorpsClient(corpsDepuisLigneClient({ ...base, creditLimit: "0.00" })).plafond).toBe("");
    expect(valeursDepuisCorpsClient(corpsDepuisLigneClient({ ...base, creditLimit: "50000.00" })).plafond).toBe("50000");
  });
});
