/**
 * Quelle session de caisse le comptoir considère comme ouverte.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UNE CAISSE CLÔTURÉE HORS LIGNE RESTAIT OUVERTE AU COMPTOIR.             │
 * │                                                                          │
 * │ La clôture passe par le journal, et c'est délibéré : le Z se tire à la   │
 * │ fermeture, souvent avant que le réseau ne revienne. Mais `sessionOuverte`│
 * │ ne lisait que la table tirée, où la session reste `open` tant que le     │
 * │ serveur n'a pas vu la clôture.                                           │
 * │                                                                          │
 * │ Le caissier comptait donc son tiroir, imprimait son Z, rangeait, puis    │
 * │ le comptoir lui proposait de continuer à vendre SUR LA SESSION QU'IL     │
 * │ VENAIT DE FERMER. Chaque vente d'après s'y rattachait, et le serveur les │
 * │ refuserait toutes à la poussée : la session est close, elle n'accepte    │
 * │ plus rien. Le Z imprimé, lui, ne les compte pas.                         │
 * │                                                                          │
 * │ C'est la règle du dépôt appliquée à l'envers : ce qui n'est pas encore   │
 * │ confirmé se lit dans le JOURNAL, jamais dans sa table. Le motif existait │
 * │ déjà sur l'écran de clôture (`enAttenteCaisse().clotures`).              │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/** Réponses SQL, dans l'ordre où les requêtes les demandent. */
const mockLignes: unknown[][] = [];
/** Opérations du journal, par type. */
const mockJournal = new Map<
  string,
  { id: string; payload: unknown; occurredAt: Date; envoi: string }[]
>();

jest.mock("expo-crypto", () => ({ randomUUID: () => "uuid-neuf" }));
jest.mock("@/db/client", () => ({
  db: {
    select: () => {
      const chaine: Record<string, unknown> = {};
      const suite = () => chaine;
      chaine.from = suite;
      chaine.innerJoin = suite;
      chaine.leftJoin = suite;
      chaine.where = suite;
      chaine.orderBy = suite;
      chaine.limit = async () => mockLignes.shift() ?? [];
      chaine.then = (resoudre: (v: unknown) => void) => resoudre(mockLignes.shift() ?? []);
      return chaine;
    },
  },
}));
jest.mock("@/db/schema", () => ({
  registerSessions: { id: "id", registerId: "register_id", status: "status",
                      openingBalance: "opening_balance", openedAt: "opened_at",
                      openedById: "opened_by_id" },
  registers: { id: "id", name: "name", warehouseId: "warehouse_id", isActive: "is_active" },
  warehouses: { id: "id", name: "name" },
  users: { id: "id", firstName: "first_name", lastName: "last_name" },
}));
/** L'instantané de session : `null` = aucun vendeur connu, donc aucun filtre. */
let mockSnapshot: unknown = null;
jest.mock("@/session/storage", () => ({ readSnapshot: async () => mockSnapshot }));
jest.mock("drizzle-orm", () => ({ desc: () => ({}), eq: () => ({}) }));
jest.mock("@/sync", () => ({
  enqueue: jest.fn(),
  enAttenteParType: jest.fn(async (kind: string, options?: { avecBloquees?: boolean }) =>
    (mockJournal.get(kind) ?? []).filter(
      (o) => options?.avecBloquees || o.envoi !== "bloque"
    )),
}));

import { caissesDisponibles, sessionOuverte } from "./caisse";

const SESSION_TIREE = {
  id: "s-serveur",
  registerId: "r1",
  registerName: "Caisse 1",
  warehouseId: "w1",
  openingBalance: "0",
  openedAt: new Date(2026, 7, 31, 8, 0),
  openedById: "u-patron",
  ouvreurPrenom: "Nelson",
  ouvreurNom: "Kayisi",
};

/**
 * En production, l'identifiant de l'OPÉRATION est celui de la SESSION :
 * `ouvrirSession` tire un UUID et le pose des deux côtés, c'est ce qui porte
 * l'idempotence et ce qui permet aux ventes de référencer une session que le
 * serveur n'a pas encore vue. Le simulateur le reflète, sans quoi le test
 * vérifierait un appariement qui n'existe pas.
 */
function journal(
  kind: string,
  payloads: Record<string, unknown>[],
  envoi: "en_attente" | "bloque" = "en_attente"
) {
  mockJournal.set(
    kind,
    payloads.map((payload, i) => ({
      id: (payload.id as string | undefined) ?? `op${i}`,
      payload,
      occurredAt: new Date(),
      envoi,
    }))
  );
}

beforeEach(() => {
  mockLignes.length = 0;
  mockJournal.clear();
  mockSnapshot = null;
});

function connecte(id: string, role: string) {
  mockSnapshot = { user: { id }, membership: { role } };
}

describe("sessionOuverte", () => {
  it("rend la session tirée quand rien n'attend au journal", async () => {
    mockLignes.push([SESSION_TIREE]);

    const s = await sessionOuverte();
    expect(s?.id).toBe("s-serveur");
    expect(s?.envoi).toBe("envoye");
  });

  it("ÉCARTE une session dont la clôture attend son envoi", async () => {
    mockLignes.push([SESSION_TIREE]);
    journal("register_session.close", [{ session: "s-serveur" }]);
    // Pas d'ouverture en file non plus : le comptoir doit conclure « aucune
    // caisse ouverte » et proposer d'en ouvrir une.
    journal("register_session.open", []);

    expect(await sessionOuverte()).toBeNull();
  });

  it("garde une session que la clôture ne VISE PAS", async () => {
    mockLignes.push([SESSION_TIREE]);
    journal("register_session.close", [{ session: "une-autre" }]);

    // Deux comptoirs dans la même boutique : fermer l'un ne ferme pas l'autre.
    expect((await sessionOuverte())?.id).toBe("s-serveur");
  });

  it("écarte aussi une OUVERTURE en file déjà clôturée", async () => {
    // Ouvrir et fermer dans la même journée hors ligne : les deux actes sont
    // en file, et le second annule le premier pour le comptoir.
    mockLignes.push([]);
    journal("register_session.open", [{ id: "s-locale", register: "r1" }]);
    journal("register_session.close", [{ session: "s-locale" }]);

    expect(await sessionOuverte()).toBeNull();
  });

  it("retient l'ouverture en file quand aucune clôture ne la vise", async () => {
    mockLignes.push([]);
    journal("register_session.open", [{ id: "s-locale", register: "r1" }]);
    mockLignes.push([{ name: "Caisse 2", warehouseId: "w2" }]);

    const s = await sessionOuverte();
    expect(s?.id).toBe("s-locale");
    expect(s?.envoi).toBe("en_attente");
  });
});

describe("une ouverture BLOQUÉE reste une session", () => {
  /**
   * ┌────────────────────────────────────────────────────────────────────────┐
   * │ L'IGNORER PROVOQUAIT UN REFUS EN CASCADE, POUR UN ABONNEMENT EN        │
   * │ RETARD.                                                                │
   * │                                                                        │
   * │ `blocked` n'est pas `quarantined` : l'acte est CONSERVÉ et partira dès │
   * │ que la porte se rouvre. Le lire comme inexistant renvoyait le caissier │
   * │ sur « Ouvrir la caisse » en pleine journée ; la seconde session qu'il  │
   * │ ouvre porte un autre identifiant, et au déblocage c'est ELLE que le    │
   * │ serveur refuse - avec toutes les ventes qui s'y rattachaient, pendant  │
   * │ que la première passe.                                                 │
   * └────────────────────────────────────────────────────────────────────────┘
   */
  it("la rend, et DIT qu'elle est bloquée", async () => {
    mockLignes.push([]);
    journal("register_session.open", [{ id: "s-bloquee", register: "r1" }], "bloque");
    mockLignes.push([{ name: "Caisse 1", warehouseId: "w1" }]);

    const s = await sessionOuverte();
    expect(s?.id).toBe("s-bloquee");
    // « Attend son envoi » enverrait le marchand chercher du réseau qui ne
    // débloquera rien : l'écran doit pouvoir nommer la vraie raison.
    expect(s?.envoi).toBe("bloque");
  });

  it("une CLÔTURE bloquée ferme quand même le tiroir", async () => {
    // Le caissier a compté, imprimé son Z et rangé. Que le serveur ne l'ait pas
    // encore accepté ne rouvre pas la caisse : lui reproposer de vendre sur une
    // session dont le Z est sorti est exactement ce qu'on interdit.
    mockLignes.push([SESSION_TIREE]);
    journal("register_session.close", [{ session: "s-serveur" }], "bloque");
    journal("register_session.open", []);

    expect(await sessionOuverte()).toBeNull();
  });
});

describe("on n'encaisse que sur SA session, quel que soit le rôle", () => {
  /**
   * Relevé sur l'émulateur le 2026-11-14 : le comptoir d'un caissier s'ouvrait
   * sur la session du propriétaire, et la vente revenait `rejected` (« Cette
   * session a été ouverte par un autre utilisateur ») après le ticket.
   */
  it("écarte la session d'un autre, et rend la main à l'ouverture", async () => {
    connecte("u-caisse", "cashier");
    mockLignes.push([SESSION_TIREE]);
    journal("register_session.open", []);

    expect(await sessionOuverte()).toBeNull();
  });

  it("retient sa propre session, même plus ancienne qu'une autre", async () => {
    connecte("u-caisse", "cashier");
    mockLignes.push([
      SESSION_TIREE,
      { ...SESSION_TIREE, id: "s-sienne", registerId: "r2", openedById: "u-caisse" },
    ]);

    expect((await sessionOuverte())?.id).toBe("s-sienne");
  });

  it("le gérant et le propriétaire ne vendent plus sur la session d'un autre", async () => {
    // ⚠ L'ancienne règle les laissait faire : le serveur refuse désormais à
    // TOUS (`session_d_un_autre`). Les y laisser vendre ferait imprimer un
    // ticket pour une vente qu'il rejettera.
    connecte("u-gerant", "manager");
    mockLignes.push([SESSION_TIREE]);
    journal("register_session.open", []);
    expect(await sessionOuverte()).toBeNull();

    connecte("u-proprio", "owner");
    mockLignes.push([SESSION_TIREE]);
    journal("register_session.open", []);
    expect(await sessionOuverte()).toBeNull();
  });
});

describe("caissesDisponibles dit qui occupe une caisse", () => {
  it("nomme qui a ouvert la session, et laisse libre une caisse sans session", async () => {
    mockLignes.push([
      { id: "r1", name: "Caisse 1", warehouseId: "w1", warehouseName: "Entrepôt" },
      { id: "r2", name: "Caisse 2", warehouseId: "w1", warehouseName: "Entrepôt" },
    ]);
    mockLignes.push([SESSION_TIREE]);

    const [c1, c2] = await caissesDisponibles();
    expect(c1.occupee).toEqual({ par: "Nelson Kayisi", depuis: SESSION_TIREE.openedAt });
    // Le serveur refuse une seconde session sur une même caisse : la proposer
    // ferait vendre une journée entière sur une session refusée.
    expect(c2.occupee).toBeNull();
  });

  it("une caisse dont la clôture attend son envoi est de nouveau libre", async () => {
    mockLignes.push([{ id: "r1", name: "Caisse 1", warehouseId: "w1", warehouseName: "E" }]);
    mockLignes.push([SESSION_TIREE]);
    journal("register_session.close", [{ session: "s-serveur" }]);

    expect((await caissesDisponibles())[0].occupee).toBeNull();
  });

  it("un ouvreur absent de la base locale ne cache pas l'occupation", async () => {
    mockLignes.push([{ id: "r1", name: "Caisse 1", warehouseId: "w1", warehouseName: "E" }]);
    mockLignes.push([{ ...SESSION_TIREE, ouvreurPrenom: null, ouvreurNom: null }]);

    expect((await caissesDisponibles())[0].occupee?.par).toBeNull();
  });
});
