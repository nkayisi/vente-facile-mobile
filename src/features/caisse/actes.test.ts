/**
 * Ce que la saisie de caisse envoie réellement au serveur.
 *
 * Trois défauts s'y cachaient, tous silencieux, tous sur du papier ou une
 * date : la dépense était datée du jour de l'ENVOI, elle ne portait aucun
 * entrepôt (donc devenait invisible à son auteur), et son reçu n'avait aucun
 * numéro tant que le serveur ne l'avait pas vue.
 */
const mockFile = new Map<string, unknown>();
let mockNumero = 0;

jest.mock("expo-crypto", () => ({ randomUUID: () => "uuid-neuf" }));
jest.mock("@/sync", () => ({
  enqueue: (id: string, kind: string, payload: unknown) => {
    mockFile.set(kind, payload);
    return Promise.resolve(id);
  },
  enAttenteParType: () => Promise.resolve([]),
}));
jest.mock("@/features/pos/numerotation", () => ({
  PREFIXE: { depense: "DEP" },
  prochainNumero: (prefixe: string, code: string | null) => {
    mockNumero += 1;
    return Promise.resolve(
      `${prefixe}-20260910-${code ?? "XXXX"}-${String(mockNumero).padStart(4, "0")}`
    );
  },
}));

import { creerDepense, creerMouvementCaisse } from "./actes";

const BASE = {
  categorie: "cat-1",
  description: "  Carburant  ",
  montant: "30.50",
  devise: "USD",
  date: "2026-09-09",
  deviceCode: "Q5L8",
};

beforeEach(() => {
  mockFile.clear();
  mockNumero = 0;
});

describe("une dépense", () => {
  it("porte la date du FORMULAIRE, jamais celle de l'envoi", async () => {
    // Le défaut : `expense_date: jourISO(new Date())` en dur, sans aucun champ
    // pour l'offrir. Une dépense notée samedi et saisie dimanche appartenait
    // au dimanche, et le rapport de caisse la rangeait au mauvais jour.
    await creerDepense(BASE);
    expect((mockFile.get("expense.create") as Record<string, unknown>).expense_date)
      .toBe("2026-09-09");
  });

  it("porte un numéro D'APPAREIL, et le rend à l'appelant pour l'impression", async () => {
    const { reference } = await creerDepense(BASE);
    expect(reference).toBe("DEP-20260910-Q5L8-0001");
    // Le même numéro voyage dans le corps : le serveur le reprend, et le
    // papier remis au bénéficiaire continue de désigner la pièce.
    expect((mockFile.get("expense.create") as Record<string, unknown>).reference)
      .toBe(reference);
  });

  it("porte l'entrepôt quand il y en a un, et rien quand il n'y en a pas", async () => {
    await creerDepense({ ...BASE, entrepot: "wh-1" });
    expect((mockFile.get("expense.create") as Record<string, unknown>).warehouse)
      .toBe("wh-1");

    mockFile.clear();
    await creerDepense({ ...BASE, entrepot: null });
    // La clé est ABSENTE, pas nulle : le serveur distingue « non fourni » de
    // « explicitement vide », et une charge d'établissement n'a pas d'entrepôt.
    expect(mockFile.get("expense.create")).not.toHaveProperty("warehouse");
  });

  it("envoie le montant en CHAÎNE, jamais en nombre", async () => {
    // Un panier en CDF à sept chiffres perd ses unités en virgule flottante.
    await creerDepense({ ...BASE, montant: "12500" });
    const corps = mockFile.get("expense.create") as Record<string, unknown>;
    expect(corps.amount).toBe("12500");
    expect(typeof corps.amount).toBe("string");
  });

  it("élague les blancs de la description et du bénéficiaire", async () => {
    await creerDepense({ ...BASE, beneficiaire: "  Chauffeur  " });
    const corps = mockFile.get("expense.create") as Record<string, unknown>;
    expect(corps.description).toBe("Carburant");
    expect(corps.beneficiary).toBe("Chauffeur");
  });
});

describe("un mouvement de caisse", () => {
  const MOUVEMENT = {
    sens: "in" as const,
    montant: "5000",
    devise: "CDF",
    description: "Apport de fonds",
    instant: "2026-09-09T23:55:00.000Z",
  };

  it("porte l'instant d'OUVERTURE de l'écran, pas celui de la validation", async () => {
    // Un caissier qui commence à 23 h 55 et valide à 00 h 02 rangerait son
    // apport au mauvais jour, dans un cadran borné à aujourd'hui.
    await creerMouvementCaisse(MOUVEMENT);
    expect((mockFile.get("cash_movement.create") as Record<string, unknown>).movement_date)
      .toBe("2026-09-09T23:55:00.000Z");
  });

  it("choisit son type d'après le SENS, jamais d'après le signe du montant", async () => {
    await creerMouvementCaisse(MOUVEMENT);
    let corps = mockFile.get("cash_movement.create") as Record<string, unknown>;
    expect(corps.direction).toBe("in");
    expect(corps.movement_type).toBe("other_in");

    await creerMouvementCaisse({ ...MOUVEMENT, sens: "out" });
    corps = mockFile.get("cash_movement.create") as Record<string, unknown>;
    expect(corps.direction).toBe("out");
    expect(corps.movement_type).toBe("other_out");
  });

  it("porte ses notes, que le back-office offre depuis toujours", async () => {
    await creerMouvementCaisse({ ...MOUVEMENT, notes: "Reçu n°12" });
    expect((mockFile.get("cash_movement.create") as Record<string, unknown>).notes)
      .toBe("Reçu n°12");
  });

  it("n'alloue AUCUN numéro : un mouvement de tiroir n'a pas de reçu", async () => {
    // Seule la dépense en a un. Fabriquer un numéro ici ouvrirait une série
    // que rien n'imprime, et qui trouerait celle des dépenses.
    await creerMouvementCaisse(MOUVEMENT);
    expect(mockNumero).toBe(0);
  });
});
