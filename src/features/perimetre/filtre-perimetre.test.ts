import {
  afficheFiltresDePerimetre,
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
import type { EntrepotNomme, MembreDuTerminal } from "./entrepots";

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

/** Un membre au sens du noyau. Le gérant et le magasinier ont `sales.view_all` par leur rôle. */
function m(
  role: MembreDuTerminal["role"],
  affectes: string[] = [],
  o: { consulteTout?: boolean; voitCollegues?: boolean } = {}
): MembreDuTerminal {
  return {
    role,
    consulteTout: o.consulteTout ?? false,
    voitCollegues: o.voitCollegues ?? (role === "manager" || role === "stock_keeper"),
    affectes: affectes.map((id) => ({
      id,
      name: depots.find((d) => d.id === id)?.nom ?? id,
      is_active: depots.find((d) => d.id === id)?.actif ?? true,
    })),
  };
}

/** Ce qu'une lecture reçoit, sans élargissement explicite. */
function app(
  entrepot: string | null,
  utilisateur: string | null,
  extra: { entrepots?: string[] | null; tousEntrepots?: boolean; tousUtilisateurs?: boolean } = {}
) {
  return {
    entrepot,
    utilisateur,
    entrepots: extra.entrepots ?? null,
    tousEntrepots: extra.tousEntrepots ?? false,
    tousUtilisateurs: extra.tousUtilisateurs ?? false,
  };
}

function offre(patch: Partial<EntreeDePerimetre> = {}) {
  return offreDePerimetre({
    membre: m("owner"),
    moi: "u-own",
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
      membre: m("cashier", [A]),
      moi: "u-cai",
      choix: { entrepot: B, utilisateur: "u-cbi" },
    });
    // Son unique dépôt ferme le filtre d'entrepôt ; son RÔLE n'y est pour rien,
    // c'est l'absence de `sales.view_all` qui ferme celui de l'utilisateur.
    expect(o.entrepotVerrouille).toBe("un-seul-entrepot");
    expect(o.utilisateurVerrouille).toBe("propres-donnees");
    // ⚠ SA BORNE EST L'AUTEUR, PAS L'ENTREPÔT - et c'est exactement ce que le
    // serveur oppose (`filter(created_by=user)`, sans dépôt). Lui imposer son
    // dépôt en plus resserrait au-delà de la règle : un mouvement de caisse
    // saisi hors ligne n'a ni vente, ni dépense, ni session tant que la
    // poussée ne l'a pas rattaché, et il disparaissait de son propre Livre de
    // caisse jusqu'à la synchronisation suivante.
    expect(o.applique).toEqual(app(null, "u-cai"));
  });

  it("un caissier GARDE son dépôt là où la donnée n'a pas d'auteur", () => {
    // ⚠ L'asymétrie du rôle, et le seul endroit où elle se lit. Sur le stock,
    // le serveur borne le caissier par ENTREPÔT et par rien d'autre
    // (`WarehouseScopedQuerysetMixin` n'a aucune branche caissier), et
    // `stock_transfers` n'est délibérément pas borné au tirage : lui retirer
    // son dépôt ici lui ouvrirait les transferts de toute l'organisation.
    const o = offre({
      membre: m("cashier", [A]),
      moi: "u-cai",
      avecAuteur: false,
    });
    expect(o.applique).toEqual(app(A, null));
    // Et le motif dit la vérité : ces données n'ont jamais eu d'auteur, pour
    // personne - ce n'est pas un droit qu'on lui refuse.
    expect(o.utilisateurVerrouille).toBe("sans-auteur");
  });

  it("un rôle borné à un seul dépôt se voit toujours imposer CE dépôt", () => {
    // Le pendant du caissier : lui, le serveur le borne bien par entrepôt, et
    // `cash_movements` / `expenses` n'ayant aucun `warehouse_path` au tirage,
    // c'est la SEULE borne qui les tienne en base locale.
    const o = offre({ membre: m("manager", [A]), moi: "u-ger" });
    expect(o.entrepotVerrouille).toBe("un-seul-entrepot");
    expect(o.applique.entrepot).toBe(A);
  });

  it("un gérant ne se voit proposer que ses entrepôts", () => {
    const o = offre({ membre: m("manager", [A]), moi: "u-ger" });
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
      membre: m("manager", [A]),
      moi: "u-ger",
      choix: { entrepot: A, utilisateur: null },
    });
    expect(o.utilisateurs.map((x) => x.valeur)).toContain("u-own");
  });

  it("on se propose toujours soi-même, même hors de son dépôt", () => {
    const o = offre({
      membre: m("manager", [A]),
      moi: "u-ger",
      choix: { entrepot: A, utilisateur: null },
    });
    expect(o.utilisateurs.map((x) => x.valeur)).toContain("u-ger");
  });

  it("un gérant ne se voit pas proposer les membres d'une autre boutique", () => {
    const o = offre({ membre: m("manager", [A]), moi: "u-ger" });
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
    expect(o.applique).toEqual(app(A, null));
  });

  it("un rôle borné à un seul dépôt l'applique sans le faire choisir", () => {
    const o = offre({ membre: m("manager", [A]), moi: "u-ger" });
    expect(o.entrepotVerrouille).toBe("un-seul-entrepot");
    expect(o.applique.entrepot).toBe(A);
  });

  it("un rôle borné SANS affectation le dit, au lieu de laisser croire à tout", () => {
    // Le serveur ne lui rend plus rien (`.none()`, tirage compris) : sans ce
    // message, l'écran vide se lirait comme une organisation sans données.
    const o = offre({ membre: m("manager", []), moi: "u-ger" });
    expect(o.entrepotVerrouille).toBe("aucun-entrepot");
    expect(o.entrepots).toEqual([]);
  });

  it("un entrepôt hors périmètre est écarté, jamais appliqué", () => {
    const o = offre({
      membre: m("manager", [A]),
      moi: "u-ger",
      choix: { entrepot: B, utilisateur: null },
    });
    expect(o.applique.entrepot).toBe(A);
  });

  it("un utilisateur devenu hors périmètre est écarté", () => {
    const o = offre({ choix: { entrepot: A, utilisateur: "u-cbi" } });
    expect(o.applique.utilisateur).toBeNull();
  });
});

describe("la case « Consulter tous » et la permission « Voir tout »", () => {
  const FERME: EntrepotNomme = { id: "wh-z", nom: "Dépôt fermé", parDefaut: false, actif: false };

  it("un caissier qui a « Voir tout » choisit ses collègues", () => {
    // La permission, pas le rôle : sans elle, cocher la case au back-office ne
    // changeait rien au terminal du caissier.
    const o = offre({
      membre: m("cashier", [A], { voitCollegues: true }),
      moi: "u-cai",
    });
    expect(o.utilisateurVerrouille).toBeNull();
    const ids = o.utilisateurs.map((x) => x.valeur);
    // « Tous les utilisateurs » en tête : c'est le seul moyen d'élargir.
    expect(ids[0]).toBe("*");
    expect(ids).toContain("u-ger");
    // Lui-même n'est pas proposé : « Moi uniquement » est déjà le défaut.
    expect(ids).not.toContain("u-cai");
    expect(o.libelleDefautUtilisateur).toBe("Moi uniquement");
    // Mais jamais au-delà de ses entrepôts.
    expect(ids).not.toContain("u-cbi");
  });

  it("« Consulter tous » ouvre la LECTURE de tous les entrepôts et de tous les auteurs", () => {
    const o = offre({
      membre: m("cashier", [A], { consulteTout: true }),
      moi: "u-cai",
    });
    expect(o.entrepotVerrouille).toBeNull();
    expect(o.entrepots.map((x) => x.valeur)).toEqual(["*", A, B]);
    expect(o.utilisateurVerrouille).toBeNull();
    // ⚠ Par DÉFAUT, ses seules données dans ses entrepôts : les collègues du
    // dépôt B ne se proposent qu'une fois l'entrepôt élargi.
    expect(o.utilisateurs.map((x) => x.valeur)).not.toContain("u-cbi");
    const tous = offre({
      membre: m("cashier", [A], { consulteTout: true }),
      moi: "u-cai",
      choix: { entrepot: "*", utilisateur: null },
    });
    expect(tous.utilisateurs.map((x) => x.valeur)).toContain("u-cbi");
  });

  it("« Consulter tous » propose les collègues d'un dépôt pas encore descendu", () => {
    // Juste après que la case est cochée, la table locale ne porte encore que
    // les dépôts d'avant : le re-tirage n'a pas eu lieu. Croiser l'équipe avec
    // cette liste ferait disparaître les collègues du dépôt B, que le serveur
    // laisse pourtant lire.
    const o = offre({
      membre: m("manager", [A], { consulteTout: true }),
      moi: "u-ger",
      tousLesEntrepots: [depots[0]],
      choix: { entrepot: "*", utilisateur: null },
    });
    expect(o.utilisateurs.map((x) => x.valeur)).toContain("u-cbi");
  });

  it("un entrepôt désactivé reste dans les filtres, et le dit", () => {
    // Il disparaissait, même pour le propriétaire : son passé ne se relisait
    // plus. C'est l'ACTION qui lui est fermée, pas la lecture.
    const o = offre({ tousLesEntrepots: [...depots, FERME] });
    const option = o.entrepots.find((x) => x.valeur === FERME.id);
    expect(option?.label).toBe("Dépôt fermé (inactif)");
  });

  it("un caissier borné par auteur ne se voit pas imposer son dépôt sur une donnée qui a un auteur", () => {
    // Ses lignes SANS entrepôt sont à lui (règle du serveur) : lui imposer son
    // dépôt les cacherait. Le filtre reste fermé, et il le dit.
    const o = offre({ membre: m("cashier", [A]), moi: "u-cai" });
    expect(o.entrepotVerrouille).toBe("un-seul-entrepot");
    expect(o.applique).toEqual(app(null, "u-cai"));
  });
});

describe("la pastille et les puces", () => {
  it("un filtre verrouillé ne compte pas dans la pastille", () => {
    const o = offre({ membre: m("cashier", [A]), moi: "u-cai" });
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
      "propres-donnees",
      "un-seul-entrepot",
      "aucun-entrepot",
      "entrepot-inactif",
      "sans-auteur",
      "equipe-inconnue",
    ] as const) {
      expect(libelleDuVerrou(motif).length).toBeGreaterThan(10);
    }
  });

  it("aucun verrou n'invite à un geste qui n'y changerait rien", () => {
    // « Synchronisez » sur un verrou de rôle enverrait le marchand chercher du
    // réseau pendant des jours. Seul `equipe-inconnue` se règle ainsi.
    for (const motif of [
      "propres-donnees",
      "un-seul-entrepot",
      "entrepot-inactif",
      "sans-auteur",
    ] as const) {
      expect(libelleDuVerrou(motif).toLowerCase()).not.toContain("synchronis");
      expect(libelleDuVerrou(motif).toLowerCase()).not.toContain("réessay");
    }
  });
});

describe("entrepotInconnuAdmis", () => {
  it("un VERROU tolère une ligne dont on ignore le dépôt", () => {
    // Un verrou est le périmètre du RÔLE : la ligne ne peut appartenir qu'à
    // lui. L'écarter ferait disparaître ce que le marchand vient de saisir.
    const caissier = offre({ membre: m("cashier", [A]), moi: "u-cai" });
    const monoDepot = offre({ membre: m("manager", [A]), moi: "u-ger" });
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
    const o = offre({ membre: m("manager", [A]), moi: "u-ger" });
    expect(contexteFileDe(o, "u-ger")).toEqual({
      moi: "u-ger",
      entrepotInconnuAdmis: true,
    });
  });
});

describe("ce que l'écran affiche (décision du 2026-11-15)", () => {
  const champs = (o: ReturnType<typeof offre>) => ({
    entrepot: o.champEntrepot,
    utilisateur: o.champUtilisateur,
    bouton: afficheFiltresDePerimetre(o),
  });

  it("le propriétaire a les deux champs", () => {
    expect(champs(offre())).toEqual({ entrepot: true, utilisateur: true, bouton: true });
  });

  it("un caissier sans aucune case n'a AUCUN filtre de périmètre", () => {
    const o = offre({ membre: m("cashier", [A]), moi: "u-cai" });
    expect(champs(o)).toEqual({ entrepot: false, utilisateur: false, bouton: false });
    // ⚠ Masquer n'est pas lever : il reste borné à ses propres lignes.
    expect(o.applique.utilisateur).toBe("u-cai");
  });

  it("« Voir tout dans son entrepôt » ouvre l'utilisateur, jamais l'entrepôt", () => {
    const o = offre({ membre: m("cashier", [A], { voitCollegues: true }), moi: "u-cai" });
    expect(champs(o)).toEqual({ entrepot: false, utilisateur: true, bouton: true });
  });

  it("« Consulter tous les entrepôts » ouvre les deux", () => {
    const o = offre({ membre: m("cashier", [A], { consulteTout: true }), moi: "u-cai" });
    expect(champs(o)).toEqual({ entrepot: true, utilisateur: true, bouton: true });
  });

  it("un gérant de deux dépôts choisit l'un des SIENS, jamais « Tous »", () => {
    // Décision du 2026-11-16 : il garde le filtre, limité à ses entrepôts.
    const o = offre({
      membre: m("manager", [A, B]),
      moi: "u-ger",
      choix: { entrepot: B, utilisateur: null },
    });
    expect(champs(o)).toEqual({ entrepot: true, utilisateur: true, bouton: true });
    expect(o.entrepots.map((x) => x.valeur)).toEqual([A, B]);
    expect(o.libelleDefautEntrepot).toBe("Mes entrepôts");
    expect(o.applique.entrepot).toBe(B);
    expect(resumeDuPerimetre(o).map((p) => p.label)).toEqual(["Dépôt B"]);
  });

  it("un gérant d'UN seul dépôt n'a pas le champ entrepôt, ni de choix fantôme", () => {
    // Un choix resté dans l'état de l'écran deviendrait un filtre INVISIBLE,
    // que le gérant n'aurait aucun moyen de retirer.
    const o = offre({
      membre: m("manager", [A]),
      moi: "u-ger",
      choix: { entrepot: B, utilisateur: null },
    });
    expect(champs(o)).toEqual({ entrepot: false, utilisateur: true, bouton: true });
    expect(resumeDuPerimetre(o)).toEqual([]);
  });

  it("une donnée sans auteur ne propose jamais le champ utilisateur", () => {
    const o = offre({ avecAuteur: false });
    expect(champs(o)).toEqual({ entrepot: true, utilisateur: false, bouton: true });
    const caissier = offre({ membre: m("cashier", [A], { voitCollegues: true }), avecAuteur: false });
    expect(afficheFiltresDePerimetre(caissier)).toBe(false);
  });
});

describe("le défaut, et l'élargissement explicite (décision du 2026-11-16)", () => {
  it("le propriétaire voit tout l'établissement sans rien choisir", () => {
    const o = offre();
    expect(o.applique).toEqual(app(null, null));
    expect(o.libelleDefautEntrepot).toBe("Tous les entrepôts");
    // « Tous » serait une seconde façon de dire le défaut.
    expect(o.entrepots.map((x) => x.valeur)).not.toContain("*");
    expect(o.utilisateurs.map((x) => x.valeur)).not.toContain("*");
  });

  it("un gérant voit par défaut tout le travail de SES entrepôts", () => {
    const o = offre({ membre: m("manager", [A, B]), moi: "u-ger" });
    // Sa base locale ne contient que ses entrepôts : aucune borne à poser.
    expect(o.applique).toEqual(app(null, null));
    expect(o.libelleDefautUtilisateur).toBe("Tous les utilisateurs");
  });

  it("un caissier ne voit que ses données, partout, sans rien choisir", () => {
    for (const membre of [
      m("cashier", [A]),
      m("cashier", [A], { voitCollegues: true }),
      m("cashier", [A], { consulteTout: true }),
    ]) {
      expect(offre({ membre, moi: "u-cai" }).applique.utilisateur).toBe("u-cai");
    }
  });

  it("un caissier qui a une case élargit par « Tous les utilisateurs »", () => {
    const o = offre({
      membre: m("cashier", [A], { voitCollegues: true }),
      moi: "u-cai",
      choix: { entrepot: null, utilisateur: "*" },
    });
    expect(o.applique).toEqual(app(A, null, { tousUtilisateurs: true }));
    expect(nombreDeFiltresPerimetre(o)).toBe(1);
    expect(resumeDuPerimetre(o).map((p) => p.label)).toEqual(["Tous les utilisateurs"]);
  });

  it("un caissier sans case ne peut rien élargir, même en le demandant", () => {
    const o = offre({
      membre: m("cashier", [A]),
      moi: "u-cai",
      choix: { entrepot: "*", utilisateur: "*" },
    });
    expect(o.applique).toEqual(app(null, "u-cai"));
  });

  it("« Consulter tous » : par défaut SES entrepôts, « Tous les entrepôts » sur demande", () => {
    const membre = m("manager", [A], { consulteTout: true });
    const parDefaut = offre({ membre, moi: "u-ger" });
    expect(parDefaut.applique).toEqual(app(null, null, { entrepots: [A] }));
    expect(parDefaut.libelleDefautEntrepot).toBe("Mes entrepôts");

    const tous = offre({ membre, moi: "u-ger", choix: { entrepot: "*", utilisateur: null } });
    expect(tous.applique).toEqual(app(null, null, { tousEntrepots: true }));
    expect(resumeDuPerimetre(tous).map((p) => p.label)).toEqual(["Tous les entrepôts"]);

    // Et un dépôt précis hors des siens se lit aussi.
    const enFace = offre({ membre, moi: "u-ger", choix: { entrepot: B, utilisateur: null } });
    expect(enFace.applique.entrepot).toBe(B);
  });

  it("un gérant sans case ne se voit jamais proposer « Tous les entrepôts »", () => {
    const o = offre({
      membre: m("manager", [A, B]),
      moi: "u-ger",
      choix: { entrepot: "*", utilisateur: null },
    });
    expect(o.entrepots.map((x) => x.valeur)).not.toContain("*");
    expect(o.applique).toEqual(app(null, null));
  });

  it("un collègue choisi qui ne relève pas de l'entrepôt retenu est écarté", () => {
    const o = offre({
      membre: m("manager", [A], { consulteTout: true }),
      moi: "u-ger",
      choix: { entrepot: null, utilisateur: "u-cbi" },
    });
    // Sous le défaut « Mes entrepôts », le caissier du dépôt B ne se lit pas.
    expect(o.applique.utilisateur).toBeNull();
    expect(o.choisi.utilisateur).toBeNull();
  });
});

