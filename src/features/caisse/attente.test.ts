/**
 * Ce que le journal fait entrer dans le tiroir, et ce qu'il n'y fait pas entrer.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ DEUX RÈGLES OPPOSÉES, ET C'EST TOUT L'ENJEU DU MODULE.                  │
 * │                                                                          │
 * │ Un MOUVEMENT en file a déjà bougé le tiroir : les billets y sont, il     │
 * │ compte dans le solde. Une DÉPENSE en file n'a rien bougé : le serveur    │
 * │ l'enregistre en brouillon et seuls `approve` / `pay` créent la sortie de │
 * │ caisse. Les traiter pareil ferait soit un solde qui ignore de l'argent   │
 * │ réel, soit un solde qui a déjà dépensé ce qui est encore là.             │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const mockJournal = new Map<
  string,
  { id: string; payload: unknown; occurredAt: Date; envoi: string }[]
>();
const mockOptionsVues = new Map<string, { avecBloquees?: boolean }>();

jest.mock("@/sync", () => ({
  enAttenteParType: (kind: string, options: { avecBloquees?: boolean } = {}) => {
    mockOptionsVues.set(kind, options);
    return Promise.resolve(mockJournal.get(kind) ?? []);
  },
}));

import { depensesEnFile, mouvementsEnFile } from "./attente";

const LE_2_SEPTEMBRE = new Date(2026, 8, 2, 14, 7);

beforeEach(() => {
  mockJournal.clear();
  mockOptionsVues.clear();
});

describe("mouvements en file", () => {
  it("lit le SENS dans le corps, jamais le signe du montant", async () => {
    // Le montant est toujours positif : c'est l'acte qui porte la direction.
    // Un écran qui déduirait le sens d'un signe ferait augmenter le tiroir une
    // fois sur deux, et l'erreur ne se verrait qu'au comptage du soir.
    mockJournal.set("cash_movement.create", [
      {
        id: "op-1",
        payload: {
          id: "m-1",
          direction: "out",
          movement_type: "other_out",
          amount: "12500",
          currency: "CDF",
          description: "Avance",
          movement_date: LE_2_SEPTEMBRE.toISOString(),
        },
        occurredAt: LE_2_SEPTEMBRE,
        envoi: "en_attente",
      },
    ]);
    const m = await mouvementsEnFile();
    expect(m).toHaveLength(1);
    expect(m[0].direction).toBe("out");
    expect(m[0].montant).toBe(12500);
    expect(m[0].devise).toBe("CDF");
  });

  it("demande les BLOQUÉES : les billets sont dans le tiroir malgré le blocage", async () => {
    // Un blocage tient le temps qu'un abonnement soit réglé - des jours. Sans
    // elles, le solde perdrait une somme bien réelle pendant tout ce temps.
    await mouvementsEnFile();
    expect(mockOptionsVues.get("cash_movement.create")).toEqual({ avecBloquees: true });
  });

  it("retombe sur l'heure de mise en file quand la date du corps est illisible", async () => {
    mockJournal.set("cash_movement.create", [
      {
        id: "op-2",
        payload: {
          id: "m-2",
          direction: "in",
          movement_type: "other_in",
          amount: "50",
          currency: "USD",
          description: "Apport",
          movement_date: "pas-une-date",
        },
        occurredAt: LE_2_SEPTEMBRE,
        envoi: "en_attente",
      },
    ]);
    const [m] = await mouvementsEnFile();
    // Et surtout PAS « maintenant » : cela le rangerait au mauvais jour dans
    // un cadran borné à aujourd'hui.
    expect(m.date?.getTime()).toBe(LE_2_SEPTEMBRE.getTime());
  });

  it("un montant illisible vaut zéro plutôt que NaN", async () => {
    // `NaN` se propagerait dans le solde et rendrait tout le cadran illisible,
    // sans qu'aucune ligne ne dise laquelle est fautive.
    mockJournal.set("cash_movement.create", [
      {
        id: "op-3",
        payload: {
          id: "m-3",
          direction: "in",
          movement_type: "other_in",
          amount: "abc",
          currency: "USD",
          description: "",
          movement_date: LE_2_SEPTEMBRE.toISOString(),
        },
        occurredAt: LE_2_SEPTEMBRE,
        envoi: "en_attente",
      },
    ]);
    const [m] = await mouvementsEnFile();
    expect(m.montant).toBe(0);
  });
});

describe("dépenses en file", () => {
  it("porte sa catégorie et son bénéficiaire, et un bénéficiaire vide vaut null", async () => {
    mockJournal.set("expense.create", [
      {
        id: "op-4",
        payload: {
          id: "d-1",
          category: "cat-1",
          description: "Carburant",
          amount: "30",
          currency: "USD",
          beneficiary: "   ",
          expense_date: "2026-09-02",
        },
        occurredAt: LE_2_SEPTEMBRE,
        envoi: "bloque",
      },
    ]);
    const [d] = await depensesEnFile();
    expect(d.categorieId).toBe("cat-1");
    expect(d.beneficiaire).toBeNull();
    expect(d.envoi).toBe("bloque");
  });

  it("demande les BLOQUÉES aussi : la dépense reste à traiter", async () => {
    await depensesEnFile();
    expect(mockOptionsVues.get("expense.create")).toEqual({ avecBloquees: true });
  });
});

describe("le corps d'une dépense en file porte tout ce que sa fiche montre", () => {
  it("relaie la référence d'appareil, le moyen, l'entrepôt et les notes", async () => {
    // Sans eux, la fiche d'une dépense saisie hors ligne mentirait par
    // omission : le reçu ne pourrait pas se réimprimer, et le bénéficiaire
    // repartirait sans pièce.
    mockJournal.set("expense.create", [
      {
        id: "op-5",
        payload: {
          id: "d-2",
          reference: "DEP-20260910-Q5L8-0001",
          category: "cat-1",
          description: "Carburant",
          amount: "30",
          currency: "USD",
          payment_method: "pm-1",
          warehouse: "wh-1",
          notes: "Bordereau 12",
          expense_date: "2026-09-09",
        },
        occurredAt: LE_2_SEPTEMBRE,
        envoi: "en_attente",
      },
    ]);
    const [d] = await depensesEnFile();
    expect(d.reference).toBe("DEP-20260910-Q5L8-0001");
    expect(d.methode).toBe("pm-1");
    expect(d.entrepot).toBe("wh-1");
    expect(d.notes).toBe("Bordereau 12");
  });

  it("une dépense mise en file AVANT la numérotation n'a pas de référence", async () => {
    // `null`, et jamais une chaîne vide déguisée en numéro : ces dépenses-là
    // existent sur des terminaux en service, et leur reçu vient du serveur.
    mockJournal.set("expense.create", [
      {
        id: "op-6",
        payload: {
          id: "d-3", category: "cat-1", description: "Ancienne",
          amount: "10", currency: "USD", expense_date: "2026-09-01",
        },
        occurredAt: LE_2_SEPTEMBRE,
        envoi: "en_attente",
      },
    ]);
    expect((await depensesEnFile())[0].reference).toBeNull();
  });
});
