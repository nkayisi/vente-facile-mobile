import { classerEnTete } from "./sniff";

const octets = (texte: string): Uint8Array =>
  new Uint8Array([...texte].map((c) => c.charCodeAt(0)));

describe("reconnaître un corps d'erreur dans un fichier téléchargé", () => {
  it("laisse passer un vrai document", () => {
    // Ne rien reconnaître n'est PAS une erreur : bloquer un téléchargement
    // légitime serait pire que le défaut qu'on ferme.
    expect(classerEnTete(octets("%PDF-1.4"))).toBe("document");
    // Un classeur : `PK\x03\x04`, l'en-tête d'une archive ZIP.
    expect(classerEnTete(new Uint8Array([0x50, 0x4b, 0x03, 0x04]))).toBe("document");
    expect(classerEnTete(octets("Référence;Date;Total"))).toBe("document");
  });

  it("reconnaît un corps JSON", () => {
    expect(classerEnTete(octets('{"detail":"Introuvable."}'))).toBe("json");
    expect(classerEnTete(octets('  \n[{"x":1}]'))).toBe("json");
  });

  it("saute un BOM UTF-8 avant de classer", () => {
    // Sans cela, une erreur parfaitement lisible sortirait en « document ».
    const bom = new Uint8Array([0xef, 0xbb, 0xbf, ...octets('{"detail":"non"}')]);
    expect(classerEnTete(bom)).toBe("json");
  });

  it("reconnaît une PAGE, que seul `{` laissait passer", () => {
    // ┌──────────────────────────────────────────────────────────────────┐
    // │ LE DÉFAUT QUE CE TEST FERME.                                     │
    // │                                                                  │
    // │ Page de débogage Django, 502 d'un proxy inverse, portail captif  │
    // │ d'hôtel : tous arrivent en HTML, et tous se partageaient sous le │
    // │ nom d'un PDF.                                                    │
    // └──────────────────────────────────────────────────────────────────┘
    expect(classerEnTete(octets("<!DOCTYPE html>"))).toBe("html");
    expect(classerEnTete(octets("<html><head>"))).toBe("html");
    expect(classerEnTete(octets("\n  <!DOCTYPE html>"))).toBe("html");
  });

  it("ne se noie pas sur un fichier vide ou tout blanc", () => {
    expect(classerEnTete(new Uint8Array([]))).toBe("document");
    expect(classerEnTete(octets("    \n\r\t"))).toBe("document");
  });
});
