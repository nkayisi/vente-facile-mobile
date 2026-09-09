/**
 * La balance âgée, telle que le serveur la rend.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE QUE CES TESTS DÉFENDENT : QUATRE ZÉROS SOUS UN TOTAL DE DIX MILLE.   │
 * │                                                                          │
 * │ La lecture inventait `days_30_60`, `days_60_90` et `days_90_plus`, qui   │
 * │ n'existent nulle part - le serveur rend `d31_60`, `d61_90`, `d90_plus`.  │
 * │ Trois tranches sur quatre valaient donc `undefined`, rendu ZÉRO, et la   │
 * │ quatrième lisait `current`, le PAS ENCORE ÉCHU, sous l'étiquette         │
 * │ « 0-30 j ».                                                              │
 * │                                                                          │
 * │ Relevé à l'écran : 9 923,43 $ de créances, quatre tranches à 0 $. Pour   │
 * │ qui le lit, « rien n'est en retard » - le contraire exact de la vérité,  │
 * │ sur l'écran dont le métier est de dire qui relancer.                     │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const mockGet = jest.fn();
jest.mock("@/api/client", () => ({ api: { get: (...a: unknown[]) => mockGet(...a) } }));

import { chargerCreances } from "./rapports";

const CONTEXTE = {
  organisation: "org",
  money: (montant: string | number, devise: string) => `${montant} ${devise}`,
  devisePrincipale: "USD",
};

/** La forme EXACTE de `ReportsStatisticsViewSet.receivables`. */
const REPONSE = {
  as_of: "2026-09-01",
  buckets: ["current", "d1_30", "d31_60", "d61_90", "d90_plus"],
  by_currency: [
    {
      currency: "USD",
      total: "9923.43",
      current: "0.00",
      d1_30: "9000.00",
      d31_60: "800.00",
      d61_90: "100.00",
      d90_plus: "23.43",
    },
  ],
  by_customer: [
    {
      customer_id: "c1",
      customer_name: "Nelly Kayisi",
      currency: "USD",
      amount_due: "9923.43",
      invoice_count: 2,
      oldest_days: 9,
      overdue_amount: "9923.43",
    },
  ],
  invoice_count: 2,
  debtor_count: 1,
  total_primary: "9923.43",
  primary_currency: "USD",
};

beforeEach(() => mockGet.mockReset());

describe("chargerCreances", () => {
  it("lit les CINQ tranches du serveur, sous leurs vrais noms", async () => {
    mockGet.mockResolvedValue(REPONSE);

    const c = await chargerCreances(CONTEXTE);
    expect(c.parDevise[0].tranches).toEqual([
      { cle: "current", label: "Pas encore échu", montant: 0 },
      { cle: "d1_30", label: "1 à 30 j", montant: 9000 },
      { cle: "d31_60", label: "31 à 60 j", montant: 800 },
      { cle: "d61_90", label: "61 à 90 j", montant: 100 },
      { cle: "d90_plus", label: "Plus de 90 j", montant: 23.43 },
    ]);
  });

  it("la somme des tranches fait le total, sinon l'écran ment", async () => {
    mockGet.mockResolvedValue(REPONSE);

    const d = (await chargerCreances(CONTEXTE)).parDevise[0];
    const somme = d.tranches.reduce((s, t) => s + t.montant, 0);
    expect(Number(somme.toFixed(2))).toBe(d.total);
  });

  it("suit l'ORDRE que le serveur annonce, pas un ordre écrit ici", async () => {
    // Le serveur porte ses tranches dans `buckets` : les redécider ici ferait
    // diverger l'écran du back-office au premier remaniement du rapport.
    mockGet.mockResolvedValue({ ...REPONSE, buckets: ["d90_plus", "current"] });

    const t = (await chargerCreances(CONTEXTE)).parDevise[0].tranches;
    expect(t.map((x) => x.cle)).toEqual(["d90_plus", "current"]);
  });

  it("se replie sur les cinq clés quand la réponse n'annonce rien", async () => {
    const { buckets: _, ...sansBuckets } = REPONSE;
    mockGet.mockResolvedValue(sansBuckets);

    const t = (await chargerCreances(CONTEXTE)).parDevise[0].tranches;
    expect(t.map((x) => x.cle)).toEqual(["current", "d1_30", "d31_60", "d61_90", "d90_plus"]);
  });

  it("rend les débiteurs : une balance âgée sans nom ne dit pas qui relancer", async () => {
    mockGet.mockResolvedValue(REPONSE);

    const c = await chargerCreances(CONTEXTE);
    expect(c.nbDebiteurs).toBe(1);
    expect(c.nbFactures).toBe(2);
    expect(c.debiteurs).toEqual([
      {
        clientId: "c1",
        nom: "Nelly Kayisi",
        devise: "USD",
        montant: 9923.43,
        echu: 9923.43,
        nbFactures: 2,
        plusAncienneJours: 9,
        // Le rapport ne porte AUCUN numéro, et c'est juste : un rapport n'a
        // pas à transporter un annuaire. L'écran le joint depuis la base
        // locale, après coup.
        telephone: null,
      },
    ]);
  });

  /**
   * ┌────────────────────────────────────────────────────────────────────────┐
   * │ LES DEUX SEULS CHIFFRES CONVERTIS DU RAPPORT ÉTAIENT JETÉS.            │
   * │                                                                        │
   * │ Le serveur rend `total_primary` et `overdue_primary` ; cette lecture ne │
   * │ les prenait pas, et l'écran n'avait donc aucune réponse à « combien     │
   * │ me doit-on ». Il fallait additionner les cartes par devise de tête,     │
   * │ c'est-à-dire faire soi-même l'addition inter-devises que tout le reste  │
   * │ de l'écran interdit.                                                    │
   * └────────────────────────────────────────────────────────────────────────┘
   */
  it("lit les deux chiffres convertis, et la devise dans laquelle ils sont", async () => {
    mockGet.mockResolvedValue({ ...REPONSE, overdue_primary: "9000.00" });

    const c = await chargerCreances(CONTEXTE);
    expect(c.totalPrincipal).toBe(9923.43);
    expect(c.echuPrincipal).toBe(9000);
    expect(c.devisePrincipale).toBe("USD");
  });

  it("lit la date d'arrêté : sans elle, on relance sur des chiffres d'avant-hier", async () => {
    mockGet.mockResolvedValue(REPONSE);
    expect((await chargerCreances(CONTEXTE)).arreteAu).toBe("2026-09-01");
  });

  it("une devise principale absente retombe sur celle du contexte, jamais sur du vide", async () => {
    // `money(x, "")` rend un montant SANS SYMBOLE, en silence : dans une
    // application multi-devise, « 9 923,43 » ne veut rien dire.
    mockGet.mockResolvedValue({ ...REPONSE, primary_currency: "" });
    expect((await chargerCreances(CONTEXTE)).devisePrincipale).toBe("USD");
  });

  it("une réponse tronquée ne fabrique ni date ni montant", async () => {
    // Un rapport amputé doit se lire comme amputé, pas comme un rapport à zéro
    // dont l'arrêté serait aujourd'hui.
    mockGet.mockResolvedValue({});
    const c = await chargerCreances(CONTEXTE);
    expect(c.arreteAu).toBeNull();
    expect(c.totalPrincipal).toBe(0);
    expect(c.parDevise).toEqual([]);
  });

  it("une réponse sans débiteur ne fabrique pas de ligne", async () => {
    mockGet.mockResolvedValue({ ...REPONSE, by_customer: undefined, debtor_count: 0 });

    const c = await chargerCreances(CONTEXTE);
    expect(c.debiteurs).toEqual([]);
    expect(c.nbDebiteurs).toBe(0);
  });
});
