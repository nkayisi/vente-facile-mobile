import { decouper, tailleDeMorceau } from "./flux";

const recoller = (morceaux: Uint8Array[]) => {
  const total = morceaux.reduce((n, m) => n + m.length, 0);
  const sortie = new Uint8Array(total);
  let i = 0;
  for (const m of morceaux) {
    sortie.set(m, i);
    i += m.length;
  }
  return sortie;
};

const flux = (n: number) => Uint8Array.from({ length: n }, (_, i) => i % 256);

describe("tailleDeMorceau", () => {
  it("retranche l'en-tête ATT du MTU accordé", () => {
    expect(tailleDeMorceau(185)).toBe(182);
    expect(tailleDeMorceau(512)).toBe(509);
  });

  it("rend 20 octets sur le MTU minimal du GATT", () => {
    expect(tailleDeMorceau(23)).toBe(20);
  });

  it.each([0, -1, 5, NaN, Number.POSITIVE_INFINITY])(
    "retombe sur le minimum garanti quand la pile rend %p",
    (mtu) => {
      // Une négociation refusée est lente mais entière ; découper plus large
      // que ce qui a été accordé ferait tomber la fin du ticket en silence.
      expect(tailleDeMorceau(mtu)).toBe(20);
    }
  );
});

describe("decouper", () => {
  it("recolle EXACTEMENT le flux d'origine", () => {
    // Un octet ESC/POS perdu ou dupliqué ne se lit pas comme une erreur : il
    // se lit comme une ligne en gras qui ne s'arrête plus.
    const octets = flux(1301);
    expect(recoller(decouper(octets, 512))).toEqual(octets);
  });

  it("n'émet jamais un morceau plus large que la taille demandée", () => {
    for (const m of decouper(flux(1301), 182)) {
      expect(m.length).toBeLessThanOrEqual(182);
    }
  });

  it("découpe un ticket de deux kilo-octets en paquets de vingt", () => {
    expect(decouper(flux(2048), 20)).toHaveLength(103);
  });

  it("n'émet rien sur un flux vide", () => {
    expect(decouper(new Uint8Array(0), 512)).toEqual([]);
  });

  it("ne boucle pas sur une taille absurde", () => {
    expect(decouper(flux(3), 0)).toHaveLength(3);
  });
});
