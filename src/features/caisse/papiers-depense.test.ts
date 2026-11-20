/**
 * La demande à la création, le reçu au paiement : les MÊMES cas que
 * `frontend/lib/cashbook/documents-depense.test.ts`.
 */
import type { DetailDepense } from "@/data/caisse";

import {
  demandeDeDepense,
  papierDeLaFiche,
  recuAuPaiement,
  recuDepuisLaFiche,
} from "./papiers-depense";

jest.mock("@/printing/jobs", () => ({}));

const chrome = { org: { name: "Boutique Test" } };

const fiche = (patch: Partial<DetailDepense> = {}): DetailDepense => ({
  id: "d1",
  reference: "DEP-20261120-B3U7-0001",
  couleur: null,
  description: "Groupe électrogène",
  categorie: "Carburant",
  montant: 46000,
  devise: "CDF",
  statut: "approved",
  beneficiaire: "Station Total",
  moyen: null,
  reference_paiement: null,
  notes: "",
  date: new Date(2026, 10, 20, 8, 0),
  payeeLe: null,
  auteur: "u-caissier",
  methodeId: null,
  sortieFaite: false,
  demandeur: "Caissier One",
  approbateur: "Propriétaire",
  payeur: null,
  paiementLe: null,
  caisse: null,
  ...patch,
});

describe("papierDeLaFiche", () => {
  it("le reçu une fois payée, ou rangé au paiement ; la demande avant ; rien après un rejet", () => {
    expect(papierDeLaFiche("paid", false)).toBe("recu");
    expect(papierDeLaFiche("approved", true)).toBe("recu");
    expect(papierDeLaFiche("draft", false)).toBe("demande");
    expect(papierDeLaFiche("pending", false)).toBe("demande");
    expect(papierDeLaFiche("approved", false)).toBe("demande");
    expect(papierDeLaFiche("rejected", false)).toBeNull();
    expect(papierDeLaFiche("cancelled", false)).toBeNull();
  });
});

describe("demandeDeDepense", () => {
  it("nomme le demandeur et porte le numéro de la dépense", () => {
    const d = demandeDeDepense({
      reference: "DEP-20261120-B3U7-0001",
      chrome,
      demandeur: "Caissier One",
      montant: 46000,
      devise: "CDF",
      le: new Date(2026, 10, 20, 9, 30),
    });
    expect(d.kind).toBe("expense_request");
    expect(d.cashierName).toBe("Caissier One");
    expect(d.number).toBe("DEP-20261120-B3U7-0001");
  });
});

describe("recuAuPaiement", () => {
  it("nomme le payeur et sa caisse, et se range marqué au paiement", () => {
    const r = recuAuPaiement({
      depense: fiche(),
      chrome,
      payeur: "Gérant Test",
      caisse: "Caisse Principale",
      moyen: "Espèces",
      approbateur: "Propriétaire",
      le: new Date(2026, 10, 20, 14, 30),
    });
    expect(r.auPaiement).toBe(true);
    expect(r.cashierName).toBe("Gérant Test");
    expect(r.registerName).toBe("Caisse Principale");
    expect(r.approvedBy).toBe("Propriétaire");
    expect(r.date).toContain("14:30");
  });
});

describe("recuDepuisLaFiche", () => {
  it("reprend le payeur, l'instant et la caisse de la sortie d'argent", () => {
    const r = recuDepuisLaFiche(
      fiche({
        statut: "paid",
        payeur: "Gérant Test",
        caisse: "Caisse Principale",
        paiementLe: new Date(2026, 10, 21, 11, 5),
      }),
      chrome
    );
    expect(r.cashierName).toBe("Gérant Test");
    expect(r.registerName).toBe("Caisse Principale");
    expect(r.date).toContain("11:05");
    expect(r.isDuplicate).toBe(true);
  });
});
