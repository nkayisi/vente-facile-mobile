/**
 * La densité d'impression, et la seule chose qu'un test sans imprimante peut
 * en prouver : qu'on n'envoie jamais au service une valeur qu'il refuse.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UNE DENSITÉ HORS PLAGE EST REFUSÉE EN SILENCE.                          │
 * │                                                                          │
 * │ `setPrinterDensity` rend un code que l'appel tolère - il DOIT le         │
 * │ tolérer, la méthode datant de `PrinterService v1.9.2` et un service plus │
 * │ ancien imprimant très bien sans elle. Un réglage hors plage se           │
 * │ confondrait donc avec un service ancien : l'impression sortirait à la    │
 * │ densité d'usine, et l'écran annoncerait une valeur qui n'a jamais servi. │
 * │                                                                          │
 * │ Le cas n'est pas théorique : les deux plages DIFFÈRENT. Un terminal      │
 * │ réglé à 80 sur un rouleau de 58 mm, puis passé en 80 mm, porte une       │
 * │ valeur que le service n'accepte plus.                                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import { DENSITE_PAR_DEFAUT, DENSITES, densiteValide } from "./densite";

describe("densiteValide", () => {
  it("laisse intacte une valeur que la largeur accepte", () => {
    for (const largeur of [58, 80] as const) {
      for (const d of DENSITES[largeur]) {
        expect(densiteValide(d, largeur)).toBe(d);
      }
    }
  });

  it("ramène dans la plage la valeur d'une AUTRE largeur", () => {
    // 80 et 90 n'existent pas sur un rouleau de 80 mm : c'est le cas qui se
    // produit quand le marchand change de papier sans retoucher la densité.
    expect(densiteValide(80, 80)).toBe(100);
    expect(densiteValide(90, 80)).toBe(100);
  });

  it("choisit la plus PROCHE, jamais la plus haute", () => {
    // On ne noircit pas plus qu'on ne l'a demandé - un papier bon marché bave -
    // et on ne retombe pas au minimum d'un réglage qui visait le haut.
    expect(densiteValide(125, 58)).toBe(120);
    expect(densiteValide(200, 58)).toBe(130);
    expect(densiteValide(10, 58)).toBe(80);
  });

  it("rend toujours une valeur du service, quelle que soit l'entrée", () => {
    // Un réglage illisible relu depuis la base, un zéro, un nombre absurde :
    // rien ne doit sortir de la plage, sinon le réglage devient inerte.
    for (const largeur of [58, 80] as const) {
      for (const entree of [0, -5, 1, 97, 111, 129, 9999, Number.NaN]) {
        expect(DENSITES[largeur]).toContain(densiteValide(entree, largeur));
      }
    }
  });

  it("part d'un défaut valide sur les DEUX largeurs", () => {
    // Le défaut améliore le papier de tous les terminaux sans réglage : il doit
    // donc être accepté quel que soit le rouleau chargé, sans passer par la
    // borne.
    expect(DENSITES[58]).toContain(DENSITE_PAR_DEFAUT);
    expect(DENSITES[80]).toContain(DENSITE_PAR_DEFAUT);
  });
});
