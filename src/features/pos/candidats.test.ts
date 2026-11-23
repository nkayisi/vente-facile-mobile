import { chercherLesCandidats } from "./candidats";

/** Une base qui ne connaît que les codes donnés, et note ce qu'on lui demande. */
function base(connus: Record<string, string>) {
  const demandes: string[] = [];
  return {
    demandes,
    chercher: async (code: string) => {
      demandes.push(code);
      return connus[code] ?? null;
    },
  };
}

describe("chercher les candidats d'un scan", () => {
  it("le premier trouvé l'emporte, et on s'arrête là", async () => {
    const b = base({ "7687GJHGD": "A", "87687GJHGD": "B" });
    expect(await chercherLesCandidats(["7687GJHGD", "87687GJHGD"], b.chercher)).toEqual({ article: "A" });
    expect(b.demandes).toEqual(["7687GJHGD"]);
  });

  it("un scan tronqué en tête trouve l'article par le champ entier", async () => {
    const b = base({ "87687GJHGD": "B" });
    expect(await chercherLesCandidats(["7687GJHGD", "87687GJHGD"], b.chercher)).toEqual({ article: "B" });
  });

  it("introuvable : le DERNIER essayé est nommé, le plus complet", async () => {
    const b = base({});
    expect(await chercherLesCandidats(["7687GJHGD", "87687GJHGD"], b.chercher)).toEqual({
      introuvable: "87687GJHGD",
    });
  });

  it("aucun candidat : rien", async () => {
    expect(await chercherLesCandidats([], base({}).chercher)).toBeNull();
  });
});
