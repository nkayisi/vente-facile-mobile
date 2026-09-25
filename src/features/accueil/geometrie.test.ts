import {
  CARTE,
  ENCOMBREMENT,
  HAUTEUR_AMPLE,
  PLAFOND,
  PLANCHER,
  POSES,
  RAYON_INTERIEUR,
  echelleDeLaPile,
  placement,
  styleDeLaPage,
} from "./geometrie";

/**
 * Une boîte englobante calculée à la main, pour n'avoir pas à croire celle du
 * module : c'est la seule façon d'éprouver une géométrie sans la recopier.
 */
function boite(i: 0 | 1) {
  const p = POSES[i];
  const { left, top } = placement(p);
  const r = (Math.abs(p.angle) * Math.PI) / 180;
  const l = CARTE.largeur * Math.cos(r) + CARTE.hauteur * Math.sin(r);
  const h = CARTE.largeur * Math.sin(r) + CARTE.hauteur * Math.cos(r);
  // `left`/`top` désignent le coin de la carte NON tournée ; la rotation se
  // fait autour de son centre, donc la boîte s'étale de part et d'autre.
  const cx = left + CARTE.largeur / 2;
  const cy = top + CARTE.hauteur / 2;
  return { gauche: cx - l / 2, droite: cx + l / 2, haut: cy - h / 2, bas: cy + h / 2 };
}

describe("l'encombrement de la pile", () => {
  it("contient les deux cartes, rotations comprises", () => {
    // ⚠ C'EST L'INVARIANT QUI PORTE TOUT. Si la boîte est trop étroite, un
    // bord de carte sort du cadre et se fait rogner ; trop large, la pile
    // rapetisse pour rien. Aucun des deux ne lève quoi que ce soit.
    for (const i of [0, 1] as const) {
      const b = boite(i);
      expect(b.gauche).toBeGreaterThanOrEqual(-0.5);
      expect(b.haut).toBeGreaterThanOrEqual(-0.5);
      expect(b.droite).toBeLessThanOrEqual(ENCOMBREMENT.largeur + 0.5);
      expect(b.bas).toBeLessThanOrEqual(ENCOMBREMENT.hauteur + 0.5);
    }
  });

  it("colle aux cartes : aucun des quatre bords n'est du vide", () => {
    // Sans cela, un encombrement généreux passerait le test précédent tout en
    // faisant rapetisser la pile d'autant.
    const b = [boite(0), boite(1)];
    expect(Math.min(...b.map((x) => x.gauche))).toBeLessThan(0.5);
    expect(Math.min(...b.map((x) => x.haut))).toBeLessThan(0.5);
    expect(Math.max(...b.map((x) => x.droite))).toBeGreaterThan(ENCOMBREMENT.largeur - 1.5);
    expect(Math.max(...b.map((x) => x.bas))).toBeGreaterThan(ENCOMBREMENT.hauteur - 1.5);
  });
});

describe("la pose des deux cartes", () => {
  it("les deux cartes se recouvrent, sans se superposer", () => {
    // Une pile dit « il y en a d'autres » ; deux cartes disjointes diraient
    // « il y en a exactement deux », et deux cartes confondues n'en montrent
    // qu'une.
    const [a, b] = [boite(0), boite(1)];
    const recouvrement = Math.min(a.droite, b.droite) - Math.max(a.gauche, b.gauche);
    expect(recouvrement).toBeGreaterThan(20);
    expect(recouvrement).toBeLessThan(CARTE.largeur * 0.75);
  });

  it("les deux angles diffèrent, et penchent du même côté", () => {
    // À angle égal, les bords sont parallèles et la pile paraît dessinée d'un
    // trait. En sens opposés, elle se lit comme un éventail et non comme deux
    // cartes posées l'une sur l'autre.
    expect(POSES[0].angle).not.toBe(POSES[1].angle);
    expect(Math.sign(POSES[0].angle)).toBe(Math.sign(POSES[1].angle));
    // Négatif = antihoraire : le haut de la carte monte vers la droite, comme
    // sur les maquettes.
    expect(POSES[0].angle).toBeLessThan(0);
  });

  it("l'avant est posé plus haut et plus à droite que l'arrière", () => {
    expect(POSES[1].x).toBeGreaterThan(POSES[0].x);
    expect(POSES[1].y).toBeLessThan(POSES[0].y);
  });
});

describe("l'échelle de la pile", () => {
  it("REMPLIT la place qu'on lui donne, au lieu de s'arrêter à sa taille", () => {
    // ⚠ C'EST LE DÉFAUT QUI A FAIT ROUVRIR CE LOT. Le plafond était à 1 :
    // sur un grand écran la pile ne grandissait plus, occupait 82 % de la
    // largeur et laissait 39 points de marge de chaque côté, là où les
    // maquettes la montrent à 95 %. Vérifié en échec en le rétablissant à 1.
    const dispo = { largeur: 448, hauteur: 580 };
    const e = echelleDeLaPile(dispo);
    expect(e).toBeGreaterThan(1);
    expect(ENCOMBREMENT.largeur * e).toBeGreaterThan(dispo.largeur * 0.9);
  });

  it("ne grossit pas au-delà du plafond, où le texte s'adoucirait", () => {
    // La mise à l'échelle est une transformation de COUCHE : au-delà d'un
    // certain facteur, le contenu dessiné à sa taille propre puis agrandi
    // s'adoucit. C'est un défaut qu'aucun test ne peut voir, d'où la borne.
    expect(echelleDeLaPile({ largeur: 4000, hauteur: 4000 })).toBe(PLAFOND);
    expect(PLAFOND).toBeLessThanOrEqual(1.35);
  });

  it("rend à la carte une part franche de la hauteur de la pile", () => {
    // ⚠ QUAND LA HAUTEUR BORNE - c'est le cas ordinaire - la pile remplit
    // EXACTEMENT la place reçue, et la taille rendue d'une carte ne dépend
    // plus que de sa part dans l'encombrement. Agrandir la carte sans toucher
    // à l'écartement ne change donc RIEN : ce sont l'angle et le décalage
    // vertical qui gonflent la boîte et rapetissent les cartes.
    expect(CARTE.hauteur / ENCOMBREMENT.hauteur).toBeGreaterThan(0.84);
  });

  it("suit la dimension la plus contrainte", () => {
    // Suivre la largeur seule ferait déborder la pile sous le titre sur un
    // écran court, et c'est la collision la plus laide des deux.
    // ⚠ ON RESTE AU-DESSUS DU PLANCHER, sinon c'est lui qu'on mesure et non
    // le choix de la dimension : la première écriture de ce test demandait la
    // moitié de la hauteur, se faisait plafonner à `PLANCHER`, et échouait
    // pour une raison qui n'était pas la sienne.
    const e = echelleDeLaPile({
      largeur: ENCOMBREMENT.largeur,
      hauteur: ENCOMBREMENT.hauteur * 0.8,
    });
    expect(e).toBeCloseTo(0.8, 2);
  });

  it("fait tenir la pile dans la place reçue", () => {
    for (const dispo of [
      { largeur: 320, hauteur: 300 },
      { largeur: 360, hauteur: 340 },
      { largeur: 390, hauteur: 360 },
      { largeur: 430, hauteur: 420 },
    ]) {
      const e = echelleDeLaPile(dispo);
      expect(ENCOMBREMENT.largeur * e).toBeLessThanOrEqual(dispo.largeur + 0.5);
      expect(ENCOMBREMENT.hauteur * e).toBeLessThanOrEqual(dispo.hauteur + 0.5);
    }
  });

  it("ne descend pas sous le plancher", () => {
    // Mieux vaut laisser la pile mordre les bords - elle les mord déjà par
    // construction - que rendre une vignette dont plus une puce ne se lit.
    expect(echelleDeLaPile({ largeur: 40, hauteur: 40 })).toBe(PLANCHER);
  });

  it("survit à une mesure absente ou absurde", () => {
    // C'est le premier rendu, avant la mesure : une division par zéro rendrait
    // `NaN`, et une échelle `NaN` fait disparaître la pile sans erreur.
    expect(echelleDeLaPile({ largeur: 0, hauteur: 0 })).toBe(PLANCHER);
    expect(echelleDeLaPile({ largeur: Number.NaN, hauteur: 300 })).toBe(PLANCHER);
    expect(echelleDeLaPile({ largeur: -10, hauteur: 300 })).toBe(PLANCHER);
  });
});

describe("les rayons concentriques", () => {
  it("la pastille d'icône vaut le rayon de la carte moins sa marge", () => {
    // Deux rayons égaux sur des boîtes imbriquées est la chose qui fait
    // « sonner faux » une interface sans qu'on sache la nommer.
    expect(RAYON_INTERIEUR).toBe(CARTE.rayon - CARTE.marge);
    // Et il reste un rayon, pas un angle droit : c'est ce qui a fait relever
    // le rayon de la carte de 22 à 28.
    expect(RAYON_INTERIEUR).toBeGreaterThanOrEqual(10);
  });
});

describe("les deux paliers de la page", () => {
  it("garde le dessin des maquettes sur l'écran qui leur sert de référence", () => {
    // 854 points : c'est la hauteur sur laquelle les maquettes sont dessinées.
    const ample = styleDeLaPage(854);
    expect(ample.titre).toBe("h1");
    expect(ample.corps).toBe("bodyLarge");
  });

  it("resserre le texte là où le dessin d'origine ne tient pas", () => {
    // 640 points : le terminal de comptoir. Les garnitures fixes n'y laissent
    // que 36 % de la hauteur à la pile contre 42 % sur la référence, et
    // l'échelle tombait à 0,64 - les cartes devenaient des vignettes.
    const serre = styleDeLaPage(640);
    expect(serre.titre).toBe("h2");
    expect(serre.corps).toBe("body");
    expect(serre.espace).not.toBe(styleDeLaPage(854).espace);
  });

  it("bascule sur un seuil, et des deux côtés", () => {
    expect(styleDeLaPage(HAUTEUR_AMPLE).titre).toBe("h1");
    expect(styleDeLaPage(HAUTEUR_AMPLE - 1).titre).toBe("h2");
    // Une hauteur absente au premier rendu ne doit pas rendre la page ample
    // puis la resserrer sous les yeux du marchand.
    expect(styleDeLaPage(0).titre).toBe("h2");
  });
});
