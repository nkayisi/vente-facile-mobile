import {
  aDesFiltresCaisse,
  aDesFiltresDepense,
  FILTRES_CAISSE_VIDES,
  FILTRES_DEPENSE_VIDES,
  nombreDeFiltresCaisse,
  nombreDeFiltresDepense,
  parametresCaisse,
  parametresDepense,
  resumeDesFiltresCaisse,
  sansLeFiltreCaisse,
  sansLeFiltreDepense,
} from "./filtres";
import { libellePeriodeFiltre } from "@/data/periode-filtre";

const libelle = (p: Parameters<typeof libellePeriodeFiltre>[0]) =>
  libellePeriodeFiltre(p, new Date(2026, 8, 10));

describe("périmètre des mouvements de caisse", () => {
  it("exclut TOUJOURS les mouvements annulés", () => {
    // Un mouvement annulé n'a pas bougé le tiroir : le compter dans un
    // document de caisse donnerait un total qui ne correspond à aucune liasse.
    // Le back-office envoie `is_cancelled=false` sur sa liste, sans exception.
    expect(parametresCaisse(FILTRES_CAISSE_VIDES).is_cancelled).toBe("false");
    expect(
      parametresCaisse({ ...FILTRES_CAISSE_VIDES, sens: "out" }).is_cancelled
    ).toBe("false");
  });

  it("n'envoie JAMAIS `month` : le serveur l'ignorerait en silence", () => {
    // `CashMovementViewSet.get_queryset` ne lit que `date_from` / `date_to`.
    // Un `?month=` y serait jeté sans erreur : la liste locale montrerait
    // février et le document couvrirait tout l'historique, sous un en-tête qui
    // annonce février.
    const p = parametresCaisse({
      ...FILTRES_CAISSE_VIDES,
      periode: { mode: "mois", mois: "2024-02" },
    });
    expect(p).not.toHaveProperty("month");
    expect(p.date_from).toBe("2024-02-01");
    // Le dernier jour n'est pas deviné : 2024 est bissextile.
    expect(p.date_to).toBe("2024-02-29");
  });

  it("porte le sens en `direction` et le type en `movement_type`", () => {
    const p = parametresCaisse({
      ...FILTRES_CAISSE_VIDES,
      sens: "in",
      type: "fund_in",
      devise: "CDF",
      recherche: "  loyer  ",
    });
    expect(p.direction).toBe("in");
    expect(p.movement_type).toBe("fund_in");
    expect(p.currency).toBe("CDF");
    expect(p.search).toBe("loyer");
  });

  it("n'envoie pas une recherche vide", () => {
    expect(parametresCaisse({ ...FILTRES_CAISSE_VIDES, recherche: "   " }).search)
      .toBeUndefined();
  });
});

describe("décompte de la pastille", () => {
  it("ne compte NI la recherche NI le sens : ils sont déjà sous les yeux", () => {
    // Les compter ferait dire « 2 filtres » à un écran qui n'en cache aucun.
    expect(
      nombreDeFiltresCaisse({
        ...FILTRES_CAISSE_VIDES,
        recherche: "loyer",
        sens: "out",
      })
    ).toBe(0);
  });

  it("compte le type, la devise et la période", () => {
    expect(
      nombreDeFiltresCaisse({
        ...FILTRES_CAISSE_VIDES,
        type: "expense",
        devise: "USD",
        periode: { mode: "jour" },
      })
    ).toBe(3);
  });

  it("ne compte pas le statut d'une dépense : il a ses puces", () => {
    expect(
      nombreDeFiltresDepense({ ...FILTRES_DEPENSE_VIDES, statut: "paid" })
    ).toBe(0);
  });

  it("`aDesFiltres` voit ce que la pastille ne compte pas", () => {
    // Sinon l'état vide dirait « la caisse est vide » sous une recherche qui
    // ne rend rien, et n'offrirait aucun chemin de retour.
    expect(aDesFiltresCaisse(FILTRES_CAISSE_VIDES)).toBe(false);
    expect(aDesFiltresCaisse({ ...FILTRES_CAISSE_VIDES, recherche: "x" })).toBe(true);
    expect(aDesFiltresCaisse({ ...FILTRES_CAISSE_VIDES, sens: "in" })).toBe(true);
    expect(aDesFiltresDepense({ ...FILTRES_DEPENSE_VIDES, statut: "draft" })).toBe(true);
  });
});

describe("puces retirables", () => {
  it("retire UN filtre et laisse les autres intacts", () => {
    const f = {
      ...FILTRES_CAISSE_VIDES,
      type: "expense",
      devise: "USD",
      recherche: "loyer",
    };
    const sans = sansLeFiltreCaisse(f, "type");
    expect(sans.type).toBeNull();
    expect(sans.devise).toBe("USD");
    expect(sans.recherche).toBe("loyer");
  });

  it("nomme le type par son LIBELLÉ, jamais par son code", () => {
    const puces = resumeDesFiltresCaisse(
      { ...FILTRES_CAISSE_VIDES, type: "fund_in" },
      libelle
    );
    expect(puces).toEqual([{ cle: "type", label: "Apport de fonds" }]);
  });

  it("écrit « Catégorie inconnue » plutôt qu'un identifiant", () => {
    // Un UUID dans une puce n'est pas un nom, c'est du bruit.
    const p = sansLeFiltreDepense(
      { ...FILTRES_DEPENSE_VIDES, categorie: "abc" },
      "devise"
    );
    expect(p.categorie).toBe("abc");
  });
});

describe("périmètre des dépenses", () => {
  it("borne sur `expense_date`, via date_from / date_to", () => {
    // Une dépense notée samedi soir et enregistrée lundi appartient au samedi :
    // c'est la borne que `ExpenseViewSet.get_queryset` applique.
    const p = parametresDepense({
      ...FILTRES_DEPENSE_VIDES,
      periode: { mode: "personnalisee", debut: "2026-09-01", fin: "2026-09-30" },
      statut: "paid",
      categorie: "cat-1",
    });
    expect(p.date_from).toBe("2026-09-01");
    expect(p.date_to).toBe("2026-09-30");
    expect(p.status).toBe("paid");
    expect(p.category).toBe("cat-1");
  });
});
