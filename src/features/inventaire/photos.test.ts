/**
 * La file des photos d'articles.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UNE PHOTO NE PART QU'APRÈS SON ARTICLE, ET L'ORDRE EST OBLIGÉ.          │
 * │                                                                          │
 * │ `PATCH /products/{id}/` vise un article qui doit EXISTER. Envoyée tant   │
 * │ que `product.create` est encore dans le journal, la photo reçoit un 404, │
 * │ qui compte comme un échec : au bout de cinq cycles elle serait           │
 * │ abandonnée, alors que rien n'avait échoué - l'article n'était simplement │
 * │ pas encore parti.                                                        │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * La base et le journal sont simulés : `@/db/client` ouvre SQLite au
 * chargement, et ce contrat doit s'éprouver sans appareil. Motif de
 * `features/pos/caisse.test.ts`.
 */
type Ligne = {
  productId: string;
  uri: string;
  fileName: string;
  mimeType: string;
  attempts: number;
  lastError: string | null;
};

const mockLignes: Ligne[] = [];
const mockCreationsEnFile: { payload: { id?: string } }[] = [];
const mockEnvois: string[] = [];
let mockEchecs = new Set<string>();

jest.mock("@/db/client", () => ({
  db: {
    // ⚠ `from()` doit être À LA FOIS attendable et porteur de `.where()` :
    // `envoyerPhotosEnAttente` lit sans filtre, `oublierPhoto` lit avec. Un
    // simple `Promise` ferait échouer la seconde, et l'échec serait compté
    // comme un refus du serveur - le test passerait alors pour la mauvaise
    // raison.
    select: () => ({
      from: () => {
        const p = Promise.resolve(mockLignes);
        return Object.assign(p, {
          where: () => Promise.resolve(mockLignes.slice(0, 1)),
        });
      },
    }),
    update: () => ({
      set: (v: Partial<Ligne>) => ({
        where: () => {
          // La simulation n'a qu'une ligne fautive à la fois : on applique la
          // mise à jour à celle qui vient d'échouer.
          const cible = mockLignes.find((l) => mockEchecs.has(l.productId));
          if (cible) Object.assign(cible, v);
          return Promise.resolve();
        },
      }),
    }),
    delete: () => ({ where: () => Promise.resolve() }),
  },
}));

jest.mock("@/db/schema", () => ({
  pendingProductPhotos: { productId: "product_id" },
}));

jest.mock("@/sync", () => ({
  enAttenteParType: () => Promise.resolve(mockCreationsEnFile),
}));

jest.mock("expo-file-system", () => ({
  Directory: class {
    exists = true;
    create() {}
  },
  File: class {
    exists = false;
    uri = "file:///x";
    constructor(..._a: unknown[]) {}
    copy() {}
    delete() {}
  },
  Paths: { document: "file:///doc" },
}));

jest.mock("@/api/config", () => ({ API_BASE_URL: "http://x/api/v1" }));
jest.mock("@/api/client", () => ({
  ensureFreshTokens: () => Promise.resolve({ access: "jeton" }),
  currentOrganizationId: () => "org",
}));
// ⚠ Pas de propriété de paramètre TypeScript (`public kind: string`) dans une
// fabrique `jest.mock` : Babel la voit comme une variable hors portée et refuse
// tout le fichier.
jest.mock("@/api/errors", () => ({
  ApiError: class extends Error {},
}));

global.fetch = jest.fn(async (url: unknown) => {
  const id = String(url).split("/products/")[1]?.replace("/", "") ?? "";
  if (mockEchecs.has(id)) {
    return { ok: false, status: 500, text: async () => "" } as Response;
  }
  mockEnvois.push(id);
  return { ok: true, status: 200, text: async () => "{}" } as Response;
}) as unknown as typeof fetch;

import { ESSAIS_MAX, envoyerPhotosEnAttente } from "./photos";

function ligne(productId: string, attempts = 0): Ligne {
  return {
    productId,
    uri: `file:///doc/${productId}.jpg`,
    fileName: `${productId}.jpg`,
    mimeType: "image/jpeg",
    attempts,
    lastError: null,
  };
}

beforeEach(() => {
  mockLignes.length = 0;
  mockCreationsEnFile.length = 0;
  mockEnvois.length = 0;
  mockEchecs = new Set();
  (global.fetch as jest.Mock).mockClear();
});

describe("envoyerPhotosEnAttente", () => {
  it("ne fait AUCUN appel quand la file est vide", async () => {
    const r = await envoyerPhotosEnAttente();
    expect(r).toEqual({ envoyees: 0, differees: 0, abandonnees: 0 });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("envoie la photo d'un article que le serveur a déjà", async () => {
    mockLignes.push(ligne("art-1"));
    const r = await envoyerPhotosEnAttente();

    expect(r.envoyees).toBe(1);
    expect(mockEnvois).toEqual(["art-1"]);
  });

  it("DIFFÈRE la photo d'un article encore en file, sans brûler d'essai", async () => {
    mockLignes.push(ligne("art-1"));
    mockCreationsEnFile.push({ payload: { id: "art-1" } });

    const r = await envoyerPhotosEnAttente();

    expect(r.envoyees).toBe(0);
    expect(r.differees).toBe(1);
    // Aucun appel : un 404 compterait comme un échec, et cinq cycles plus tard
    // la photo serait abandonnée sans que rien n'ait vraiment échoué.
    expect(global.fetch).not.toHaveBeenCalled();
    expect(mockLignes[0].attempts).toBe(0);
  });

  it("compte l'essai et RETIENT le motif quand le serveur refuse", async () => {
    mockLignes.push(ligne("art-1"));
    mockEchecs.add("art-1");

    const r = await envoyerPhotosEnAttente();

    expect(r.envoyees).toBe(0);
    expect(r.differees).toBe(1);
    expect(mockLignes[0].attempts).toBe(1);
    expect(mockLignes[0].lastError).toBeTruthy();
  });

  it("cesse de réessayer au-delà du plafond", async () => {
    mockLignes.push(ligne("art-1", ESSAIS_MAX));

    const r = await envoyerPhotosEnAttente();

    expect(r.abandonnees).toBe(1);
    // Un refus qui se répète n'est pas transitoire : marteler le serveur n'y
    // changerait rien, et la file doit rester libre pour les ventes.
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("une photo différée n'empêche PAS les autres de partir", async () => {
    mockLignes.push(ligne("art-en-file"), ligne("art-pret"));
    mockCreationsEnFile.push({ payload: { id: "art-en-file" } });

    const r = await envoyerPhotosEnAttente();

    expect(r.envoyees).toBe(1);
    expect(r.differees).toBe(1);
    expect(mockEnvois).toEqual(["art-pret"]);
  });

  it("n'impose JAMAIS le Content-Type du multipart", async () => {
    // `fetch` doit poser lui-même `multipart/form-data; boundary=…` : la
    // frontière n'est connue que de lui. L'imposer produit un corps que Django
    // ne sait pas découper, et le champ arrive vide, sans erreur.
    mockLignes.push(ligne("art-1"));
    await envoyerPhotosEnAttente();

    const options = (global.fetch as jest.Mock).mock.calls[0][1] as RequestInit;
    const entetes = options.headers as Record<string, string>;
    expect(Object.keys(entetes).map((k) => k.toLowerCase())).not.toContain(
      "content-type"
    );
    expect(options.method).toBe("PATCH");
  });
});
