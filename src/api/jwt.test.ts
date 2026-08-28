/**
 * Lecture de l'échéance d'un JWT.
 *
 * Ce module existe parce que Hermes ne fournit pas `atob`, alors que
 * TypeScript l'accepte : l'appel aurait compilé et échoué seulement sur
 * l'appareil, dans un `catch` qui l'aurait rendu muet. On aurait perdu le
 * rafraîchissement anticipé sans qu'aucun signal ne le dise.
 */
import { decodeBase64Url, tokenExpiry } from "./jwt";

const encode = (value: unknown) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");

const jwt = (payload: unknown) => `entete.${encode(payload)}.signature`;

describe("decodeBase64Url", () => {
  it("décode les trois longueurs de reste", () => {
    for (const source of ["a", "ab", "abc", "abcd", "abcde", "abcdef"]) {
      const encoded = Buffer.from(source).toString("base64url");
      expect(decodeBase64Url(encoded)).toBe(source);
    }
  });

  it("restitue l'UTF-8, accents compris", () => {
    const source = "Marie Kalumé, Établissement à Goma";
    expect(decodeBase64Url(Buffer.from(source).toString("base64url"))).toBe(source);
  });

  it("accepte l'alphabet base64url, avec - et _", () => {
    // base64url remplace + par - et / par _ : il faut du contenu qui produise
    // ces deux signes, sinon le test ne prouve rien. Un emoji et un caractere
    // latin etendu suffisent.
    for (const source of ["\u{1F642} ferme", "\u00FF\u00BF ouvert"]) {
      const encoded = Buffer.from(source).toString("base64url");
      expect(encoded).toMatch(/[-_]/);
      expect(decodeBase64Url(encoded)).toBe(source);
    }
  });

  it("leve sur une entree qui n'est pas de l'UTF-8 valide", () => {
    // Contrat assume : la fonction rend du texte. `tokenExpiry` l'enveloppe
    // dans un try/catch, et une charge utile de JWT est toujours du JSON.
    const invalide = Buffer.from([0xfb, 0xff, 0xbf]).toString("base64url");
    expect(() => decodeBase64Url(invalide)).toThrow();
  });
});

describe("tokenExpiry", () => {
  it("rend l'échéance en millisecondes", () => {
    expect(tokenExpiry(jwt({ exp: 1788000000 }))).toBe(1788000000000);
  });

  it("rend null plutôt que d'échouer sur un jeton illisible", () => {
    expect(tokenExpiry("pas-un-jwt")).toBeNull();
    expect(tokenExpiry("")).toBeNull();
    expect(tokenExpiry("a.b.c")).toBeNull();
    expect(tokenExpiry(jwt({ sub: "sans-exp" }))).toBeNull();
  });
});
