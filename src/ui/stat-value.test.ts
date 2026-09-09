/**
 * Les deux échelles de montant, et la frontière entre elles.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UNE ÉCHELLE MAL ORDONNÉE NE LÈVE RIEN.                                  │
 * │                                                                          │
 * │ Un palier posé dans le désordre rendrait un montant LONG plus grand      │
 * │ qu'un court : le nombre à sept chiffres déborderait sa colonne, et       │
 * │ c'est le seul cas où la doctrine du dépôt est vraiment en jeu - « quand  │
 * │ la place manque, c'est la TAILLE qui cède, jamais le nombre de           │
 * │ chiffres ». Rien à l'exécution ne le signalerait : le montant sortirait  │
 * │ simplement tronqué, donc faux, comme sur un ticket mal mesuré.           │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import { mesureSize, statValueSize } from "./stat-value";

/** Les tailles Tailwind employées par les deux échelles, en points. */
const POINTS: Record<string, number> = {
  "text-2xl": 24,
  "text-xl": 20,
  "text-lg": 18,
  "text-base": 16,
  "text-sm": 14,
  "text-xs": 12,
};

const pt = (classe: string): number => {
  const p = POINTS[classe];
  if (p === undefined) throw new Error(`Taille inconnue : ${classe}`);
  return p;
};

/** Des montants réels du terrain, du plus court au plus long. */
const MONTANTS = [
  "84 $",
  "112 240 $",
  "292 870,5 $",
  "17 775 090 FC",
  "1 250 036,40 FC",
  "132 775 090,40 FC",
  "2 330 813 250,36 FC",
];

describe("échelle des montants", () => {
  it.each([
    ["relevé", statValueSize],
    ["mesure", mesureSize],
  ])("l'échelle « %s » ne grandit jamais quand le montant s'allonge", (_nom, echelle) => {
    const tailles = MONTANTS.map((m) => pt(echelle(m)));
    for (let i = 1; i < tailles.length; i += 1) {
      expect(tailles[i]).toBeLessThanOrEqual(tailles[i - 1]);
    }
  });

  /**
   * C'est le défaut mesuré à l'écran : « 84 $ » sortait à vingt-quatre points
   * en gras dans une rangée dont la référence est à quatorze. Le montant
   * criait, la référence disparaissait, et une liste de vingt ventes devenait
   * une colonne de chiffres qu'on ne pouvait plus relier à rien.
   */
  it("une mesure de rangée n'est JAMAIS plus grande qu'un relevé de cadran", () => {
    for (const m of MONTANTS) {
      expect(pt(mesureSize(m))).toBeLessThanOrEqual(pt(statValueSize(m)));
    }
  });

  it("une mesure part du corps de texte, pas d'un titre", () => {
    // 16 points : la valeur accompagne une identité à quatorze, elle ne la
    // remplace pas. Vingt-quatre est la taille d'un titre de section.
    expect(mesureSize("84 $")).toBe("text-base");
  });

  it("un montant en CDF à sept chiffres reste sur une seule taille lisible", () => {
    // Il tient quinze caractères. Il doit rétrécir, jamais se tronquer : c'est
    // `DataRow` qui laisse l'identité céder, pas la mesure.
    expect(pt(mesureSize("1 250 036,40 FC"))).toBeGreaterThanOrEqual(12);
  });

  it("les deux échelles rendent toujours une classe connue", () => {
    for (const m of [...MONTANTS, "", "0"]) {
      expect(() => pt(statValueSize(m))).not.toThrow();
      expect(() => pt(mesureSize(m))).not.toThrow();
    }
  });
});
