import {
  contexteFileDe,
  entrepotInconnuAdmis,
  libelleDuVerrou,
  nombreDeFiltresPerimetre,
  offreDePerimetre,
  parametresDePerimetre,
  resumeDuPerimetre,
  sansLeFiltrePerimetre,
  type EntreeDePerimetre,
  type MembrePerimetre,
} from "./filtre-perimetre";
import type { EntrepotNomme } from "./entrepots";

const A = "wh-a";
const B = "wh-b";

const depots: EntrepotNomme[] = [
  { id: A, nom: "Dépôt A", parDefaut: true, actif: true },
  { id: B, nom: "Dépôt B", parDefaut: false, actif: true },
];

const PATRON: MembrePerimetre[] = [
  { userId: "u-own", nom: "Patron", role: "owner", entrepots: [] },
  { userId: "u-ger", nom: "Gérante", role: "manager", entrepots: [A] },
  { userId: "u-cai", nom: "Caissier A", role: "cashier", entrepots: [A] },
  { userId: "u-cbi", nom: "Caissier B", role: "cashier", entrepots: [B] },
];

function offre(patch: Partial<EntreeDePerimetre> = {}) {
  return offreDePerimetre({
    role: "owner",
    moi: "u-own",
    assignes: [],
    tousLesEntrepots: depots,
    equipe: PATRON,
    choix: { entrepot: null, utilisateur: null },
    avecAuteur: true,
    ...patch,
  });
}

describe("offreDePerimetre", () => {
  it("un caissier ne peut pas ouvrir ses deux filtres", () => {
    // Même en posant un choix étranger dans son état d'écran, ce qui borne sa
    // lecture reste lui-même, dans son dépôt.
    const o = offre({
      role: "cashier",
      moi: "u-cai",
      assignes: [{ id: A }],
      choix: { entrepot: B, utilisateur: "u-cbi" },
    });
    expect(o.entrepotVerrouille).toBe("cashier");
    expect(o.utilisateurVerrouille).toBe("cashier");
    // ⚠ SA BORNE EST L'AUTEUR, PAS L'ENTREPÔT - et c'est exactement ce que le
    // serveur oppose (`filter(created_by=user)`, sans dépôt). Lui imposer son
    // dépôt en plus resserrait au-delà de la règle : un mouvement de caisse
    // saisi hors ligne n'a ni vente, ni dépense, ni session tant que la
    // poussée ne l'a pas rattaché, et il disparaissait de son propre Livre de
    // caisse jusqu'à la synchronisation suivante.
    expect(o.applique).toEqual({ entrepot: null, utilisateur: "u-cai" });
  });

  it("un caissier GARDE son dépôt là où la donnée n'a pas d'auteur", () => {
    // ⚠ L'asymétrie du rôle, et le seul endroit où elle se lit. Sur le stock,
    // le serveur borne le caissier par ENTREPÔT et par rien d'autre
    // (`WarehouseScopedQuerysetMixin` n'a aucune branche caissier), et
    // `stock_transfers` n'est délibérément pas borné au tirage : lui retirer
    // son dépôt ici lui ouvrirait les transferts de toute l'organisation.
    const o = offre({
      role: "cashier",
      moi: "u-cai",
      assignes: [{ id: A }],
      avecAuteur: false,
    });
    expect(o.applique).toEqual({ entrepot: A, utilisateur: null });
    // Et le motif dit la vérité : ces données n'ont jamais eu d'auteur, pour
    // personne - ce n'est pas un droit qu'on lui refuse.
    expect(o.utilisateurVerrouille).toBe("sans-auteur");
  });

  it("un rôle borné à un seul dépôt se voit toujours imposer CE dépôt", () => {
    // Le pendant du caissier : lui, le serveur le borne bien par entrepôt, et
    // `cash_movements` / `expenses` n'ayant aucun `warehouse_path` au tirage,
    // c'est la SEULE borne qui les tienne en base locale.
    const o = offre({ role: "manager", moi: "u-ger", assignes: [{ id: A }] });
    expect(o.entrepotVerrouille).toBe("un-seul-entrepot");
    expect(o.applique.entrepot).toBe(A);
  });

  it("un gérant ne se voit proposer que ses entrepôts", () => {
    const o = offre({ role: "manager", moi: "u-ger", assignes: [{ id: A }] });
    expect(o.entrepots.map((x) => x.valeur)).toEqual([A]);
  });

  it("un propriétaire se voit proposer tous les entrepôts", () => {
    expect(offre().entrepots.map((x) => x.valeur)).toEqual([A, B]);
  });

  it("choisir un entrepôt restreint la liste des utilisateurs", () => {
    const o = offre({ choix: { entrepot: B, utilisateur: null } });
    const ids = o.utilisateurs.map((x) => x.valeur);
    expect(ids).toContain("u-cbi");
    expect(ids).not.toContain("u-cai");
  });

  it("le propriétaire reste proposé quel que soit l'entrepôt choisi", () => {
    // Il n'a AUCUNE affectation : le croiser le ferait disparaître de sa
    // propre liste dès qu'un dépôt est posé.
    //
    // ⚠ ON REGARDE DEPUIS UN AUTRE COMPTE, ET C'EST TOUT L'INTÉRÊT. Écrit
    // depuis le propriétaire lui-même, ce test passait par la branche « on se
    // propose toujours soi-même » : il restait VERT en retirant l'exemption de
    // rôle, donc il ne démontrait rien.
    const o = offre({
      role: "manager",
      moi: "u-ger",
      assignes: [{ id: A }],
      choix: { entrepot: A, utilisateur: null },
    });
    expect(o.utilisateurs.map((x) => x.valeur)).toContain("u-own");
  });

  it("on se propose toujours soi-même, même hors de son dépôt", () => {
    const o = offre({
      role: "manager",
      moi: "u-ger",
      assignes: [{ id: A }],
      choix: { entrepot: A, utilisateur: null },
    });
    expect(o.utilisateurs.map((x) => x.valeur)).toContain("u-ger");
  });

  it("un gérant ne se voit pas proposer les membres d'une autre boutique", () => {
    const o = offre({ role: "manager", moi: "u-ger", assignes: [{ id: A }] });
    expect(o.utilisateurs.map((x) => x.valeur)).not.toContain("u-cbi");
  });

  it("l'absence de roster ne se lit pas comme un roster vide", () => {
    const o = offre({ equipe: undefined });
    expect(o.utilisateurVerrouille).toBe("equipe-inconnue");
    expect(o.utilisateurs).toEqual([]);
  });

  it("un roster vide n'est pas la même chose qu'un roster inconnu", () => {
    const o = offre({ equipe: [] });
    expect(o.utilisateurVerrouille).toBeNull();
    expect(o.utilisateurs).toEqual([]);
  });

  it("un écran sans auteur verrouille l'utilisateur et le laisse nul", () => {
    const o = offre({
      avecAuteur: false,
      choix: { entrepot: A, utilisateur: "u-cai" },
    });
    expect(o.utilisateurVerrouille).toBe("sans-auteur");
    expect(o.applique).toEqual({ entrepot: A, utilisateur: null });
  });

  it("un rôle borné à un seul dépôt l'applique sans le faire choisir", () => {
    const o = offre({ role: "manager", moi: "u-ger", assignes: [{ id: A }] });
    expect(o.entrepotVerrouille).toBe("un-seul-entrepot");
    expect(o.applique.entrepot).toBe(A);
  });

  it("un rôle borné SANS affectation le dit, au lieu de laisser croire à tout", () => {
    // ⚠ Le serveur, lui, ne borne pas dans ce cas : sans ce message, l'écran
    // montrerait toute l'organisation sans que rien ne l'explique.
    const o = offre({ role: "manager", moi: "u-ger", assignes: [] });
    expect(o.entrepotVerrouille).toBe("aucun-entrepot");
    expect(o.entrepots).toEqual([]);
  });

  it("un entrepôt hors périmètre est écarté, jamais appliqué", () => {
    const o = offre({
      role: "manager",
      moi: "u-ger",
      assignes: [{ id: A }],
      choix: { entrepot: B, utilisateur: null },
    });
    expect(o.applique.entrepot).toBe(A);
  });

  it("un utilisateur devenu hors périmètre est écarté", () => {
    const o = offre({ choix: { entrepot: A, utilisateur: "u-cbi" } });
    expect(o.applique.utilisateur).toBeNull();
  });
});

describe("la pastille et les puces", () => {
  it("un filtre verrouillé ne compte pas dans la pastille", () => {
    const o = offre({ role: "cashier", moi: "u-cai", assignes: [{ id: A }] });
    expect(nombreDeFiltresPerimetre(o)).toBe(0);
    expect(resumeDuPerimetre(o)).toEqual([]);
  });

  it("deux filtres posés comptent deux", () => {
    const o = offre({ choix: { entrepot: B, utilisateur: "u-cbi" } });
    expect(nombreDeFiltresPerimetre(o)).toBe(2);
    expect(resumeDuPerimetre(o).map((p) => p.label)).toEqual([
      "Dépôt B",
      "Caissier B",
    ]);
  });

  it("retirer un filtre laisse l'autre intact", () => {
    const f = { entrepot: A, utilisateur: "u-cai" };
    expect(sansLeFiltrePerimetre(f, "entrepot")).toEqual({
      entrepot: null,
      utilisateur: "u-cai",
    });
    expect(sansLeFiltrePerimetre(f, "utilisateur")).toEqual({
      entrepot: A,
      utilisateur: null,
    });
  });
});

describe("parametresDePerimetre", () => {
  it("n'envoie que ce qui est posé", () => {
    expect(parametresDePerimetre({ entrepot: null, utilisateur: null })).toEqual({
      warehouse: undefined,
      user: undefined,
    });
    expect(parametresDePerimetre({ entrepot: A, utilisateur: "u-cai" })).toEqual({
      warehouse: A,
      user: "u-cai",
    });
  });
});

describe("libelleDuVerrou", () => {
  it("chaque motif a une phrase, et aucune n'est vide", () => {
    for (const motif of [
      "cashier",
      "un-seul-entrepot",
      "aucun-entrepot",
      "sans-auteur",
      "equipe-inconnue",
    ] as const) {
      expect(libelleDuVerrou(motif).length).toBeGreaterThan(10);
    }
  });

  it("aucun verrou n'invite à un geste qui n'y changerait rien", () => {
    // « Synchronisez » sur un verrou de rôle enverrait le marchand chercher du
    // réseau pendant des jours. Seul `equipe-inconnue` se règle ainsi.
    for (const motif of ["cashier", "un-seul-entrepot", "sans-auteur"] as const) {
      expect(libelleDuVerrou(motif).toLowerCase()).not.toContain("synchronis");
      expect(libelleDuVerrou(motif).toLowerCase()).not.toContain("réessay");
    }
  });
});

describe("entrepotInconnuAdmis", () => {
  it("un VERROU tolère une ligne dont on ignore le dépôt", () => {
    // Un verrou est le périmètre du RÔLE : la ligne ne peut appartenir qu'à
    // lui. L'écarter ferait disparaître ce que le marchand vient de saisir.
    const caissier = offre({ role: "cashier", moi: "u-cai", assignes: [{ id: A }] });
    const monoDepot = offre({ role: "manager", moi: "u-ger", assignes: [{ id: A }] });
    expect(entrepotInconnuAdmis(caissier)).toBe(true);
    expect(entrepotInconnuAdmis(monoDepot)).toBe(true);
  });

  it("un CHOIX délibéré est exact", () => {
    // « Qu'y a-t-il eu dans le dépôt B ? » : une ligne dont on ignore le dépôt
    // n'y répond pas, et l'y compter gonflerait son total.
    const proprio = offre({ choix: { entrepot: B, utilisateur: null } });
    expect(proprio.entrepotVerrouille).toBeNull();
    expect(entrepotInconnuAdmis(proprio)).toBe(false);
  });

  it("le contexte de file porte l'auteur ET la tolérance", () => {
    const o = offre({ role: "manager", moi: "u-ger", assignes: [{ id: A }] });
    expect(contexteFileDe(o, "u-ger")).toEqual({
      moi: "u-ger",
      entrepotInconnuAdmis: true,
    });
  });
});
