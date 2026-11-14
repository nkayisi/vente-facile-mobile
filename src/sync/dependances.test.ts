import { envoyables as filtrer } from "./dependances";

const envoyables = <T extends { id: string; seq: number; dependsOn: string[] }>(
  c: T[],
  e: ReadonlySet<string>
) => filtrer(c, e, (o) => o.dependsOn);

const op = (id: string, seq: number, dependsOn: string[] = []) => ({ id, seq, dependsOn });

describe("envoyables", () => {
  it("fait partir ensemble la création d'un client et la vente faite à son nom", () => {
    const creation = op("client", 1);
    const vente = op("vente", 2, ["client"]);
    const lot = envoyables([vente, creation], new Set(["client", "vente"]));
    expect(lot.map((o) => o.id)).toEqual(["client", "vente"]);
  });

  it("retient la vente tant que la création temporisée n'est pas prête", () => {
    // La création attend son prochain essai : elle n'est pas candidate, mais
    // elle est toujours dans le journal.
    const vente = op("vente", 2, ["client"]);
    expect(envoyables([vente], new Set(["client", "vente"]))).toEqual([]);
  });

  it("retient la vente tant que la création est bloquée", () => {
    const vente = op("vente", 2, ["client"]);
    expect(envoyables([vente], new Set(["client", "vente"]))).toEqual([]);
  });

  it("laisse partir ce dont la dépendance est déjà acquise", () => {
    const reglement = op("reglement", 3, ["vente"]);
    expect(envoyables([reglement], new Set(["reglement"]))).toEqual([reglement]);
  });

  it("retient en chaîne : ce qui dépend d'une opération retenue est retenu aussi", () => {
    const vente = op("vente", 2, ["client"]);
    const reglement = op("reglement", 3, ["vente"]);
    expect(envoyables([vente, reglement], new Set(["client", "vente", "reglement"]))).toEqual([]);
  });

  it("une opération sans dépendance part toujours", () => {
    const a = op("a", 1);
    expect(envoyables([a], new Set(["a", "autre"]))).toEqual([a]);
  });
});
