import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  VUES,
  indexDeLOffset,
  indexSuivant,
  libelleBouton,
  libelleEntete,
  libellePoint,
  libelleRang,
  type Carte,
} from "./vues";

/* ────────────────────────────────────────────────────── le miroir du site */

/**
 * ┌────────────────────────────────────────────────────────────────────────┐
 * │ ON LIT LA SOURCE DU SITE, ON NE RECOPIE PAS SA COPIE.                 │
 * │                                                                        │
 * │ Les huit cartes disent au marchand ce que le produit fait. Le site le  │
 * │ lui a déjà dit, dans `CAPACITES` : deux vocabulaires pour un seul      │
 * │ produit, et celui qui a lu la page d'accueil croit avoir téléchargé    │
 * │ autre chose. Une copie tenue à la main dérive en silence - c'est ce    │
 * │ qui a produit trois codes de permission fantômes ailleurs dans ce      │
 * │ dépôt - donc on croise avec le FICHIER, dans les DEUX sens.            │
 * │                                                                        │
 * │ C'est le motif de `data/types-caisse.test.ts`, qui lit les modèles du  │
 * │ backend pour la même raison. Un fichier introuvable fait ÉCHOUER le    │
 * │ test en nommant le chemin ; il ne le fait pas passer.                  │
 * └────────────────────────────────────────────────────────────────────────┘
 */
const SITE = resolve(__dirname, "../../../../../frontend");
const CONTENU = join(SITE, "lib/marketing/content.ts");
const GRILLE = join(SITE, "components/marketing/capability-grid.tsx");

interface ItemSite {
  icone: string;
  label: string;
  ligne: string;
  details: string[];
}

function itemsDuSite(): ItemSite[] {
  const source = readFileSync(CONTENU, "utf8");
  const bloc = source.match(/export const CAPACITES = \{[\s\S]*?\n\} as const;/);
  if (!bloc) throw new Error(`CAPACITES introuvable dans ${CONTENU}`);
  const items: ItemSite[] = [];
  const motif =
    /icone:\s*"([^"]*)",\s*label:\s*"([^"]*)",\s*ligne:\s*\n?\s*"([^"]*)",\s*details:\s*\[([\s\S]*?)\],/g;
  for (const m of bloc[0].replace(/\n\s*/g, " ").matchAll(motif)) {
    items.push({
      icone: m[1],
      label: m[2],
      ligne: m[3],
      details: [...m[4].matchAll(/"([^"]*)"/g)].map((d) => d[1]),
    });
  }
  return items;
}

/** `{ panier: "ShoppingCart", … }` : la table de glyphes de la grille du site. */
function glyphesDuSite(): Record<string, string> {
  const source = readFileSync(GRILLE, "utf8");
  const bloc = source.match(/const GLYPHES[^=]*= \{\n([\s\S]*?)\n\};/);
  if (!bloc) throw new Error(`GLYPHES introuvable dans ${GRILLE}`);
  const table: Record<string, string> = {};
  for (const m of bloc[1].matchAll(/^\s*"?([\w-]+)"?\s*:\s*(\w+),/gm)) table[m[1]] = m[2];
  return table;
}

const cartes = (): Carte[] => VUES.flatMap((v) => [...v.cartes]);

describe("les huit cartes sont celles du site", () => {
  it("la source du site est là où on la cherche", () => {
    // Sans cette assertion, un chemin faux ferait comparer deux listes vides
    // et le garde-fou passerait au vert sans rien démontrer.
    expect(existsSync(CONTENU)).toBe(true);
    expect(existsSync(GRILLE)).toBe(true);
    expect(itemsDuSite()).toHaveLength(8);
    expect(Object.keys(glyphesDuSite())).toHaveLength(8);
  });

  it("chaque module du site est montré une fois, et une seule", () => {
    const labels = cartes().map((c) => c.label);
    // Une carte en double dirait deux fois la même chose et en tairait une
    // autre, sans que rien ne le signale : les deux listes ont la même
    // longueur.
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels.slice().sort()).toEqual(
      itemsDuSite()
        .map((i) => i.label)
        .sort(),
    );
  });

  it("la phrase et les trois puces sont celles du site, au mot près", () => {
    const parLabel = new Map(itemsDuSite().map((i) => [i.label, i]));
    for (const c of cartes()) {
      const site = parLabel.get(c.label);
      expect(site).toBeDefined();
      expect(c.ligne).toBe(site!.ligne);
      expect([...c.puces]).toEqual(site!.details);
    }
  });

  it("le glyphe est celui que le site dessine pour ce module", () => {
    // Le registre d'icônes est engendré depuis les DEUX paquets lucide et
    // compare les tracés : le même nom garantit donc le même dessin, et non un
    // équivalent approchant.
    const glyphes = glyphesDuSite();
    const parLabel = new Map(itemsDuSite().map((i) => [i.label, i]));
    for (const c of cartes()) {
      expect(c.icone).toBe(glyphes[parLabel.get(c.label)!.icone]);
    }
  });

  it("chaque carte porte exactement trois puces", () => {
    // C'est la hauteur pour laquelle la carte est dessinée : une quatrième
    // déborderait du filet, une deuxième laisserait un blanc en bas.
    for (const c of cartes()) expect(c.puces).toHaveLength(3);
  });
});

/* ──────────────────────────────────────────────────────────── les quatre vues */

describe("les vues de la présentation", () => {
  it("il y en a quatre, et leurs clés sont distinctes", () => {
    // Un balayage qui ne balaie rien passe au vert et ne prouve rien.
    expect(VUES).toHaveLength(4);
    expect(new Set(VUES.map((v) => v.cle)).size).toBe(4);
  });

  it("chaque vue montre deux cartes", () => {
    for (const v of VUES) expect(v.cartes).toHaveLength(2);
  });

  it("le titre promet un résultat, il ne nomme pas une rubrique", () => {
    // ⚠ C'EST LA GRAMMAIRE QUI FAIT LIRE CETTE PAGE, PAS SON DESSIN.
    // « Point de vente » ou « Gestion des stocks » décrivent une catégorie de
    // logiciel que tout concurrent possède, et n'apprennent rien à qui hésite.
    // La rubrique a sa place - le bandeau, où elle sert de repère - et le
    // titre doit dire ce que le marchand y gagne.
    const rubriques =
      /^(point de vente|gestion|stock|clients?|rapports?|caisse|inventaire|équipe)$/i;
    for (const v of VUES) {
      expect(v.titre.replace(/[.!?]$/, "")).not.toMatch(rubriques);
      // Une promesse se termine par un point : c'est une phrase, pas une
      // étiquette.
      expect(v.titre.endsWith(".")).toBe(true);
    }
  });

  it("la rubrique ne se déduit PAS de la clé, et c'est pour un accent", () => {
    // `"equipe"` mis en capitales rend « EQUIPE ». La clé reste en ASCII
    // parce qu'elle sert d'identifiant ; le bandeau, lui, doit écrire
    // « ÉQUIPE ». Un accent perdu ne lève rien et ne se voit qu'à l'écran.
    const equipe = VUES.find((v) => v.cle === "equipe");
    expect(equipe?.rubrique.toUpperCase()).toBe("ÉQUIPE");
    for (const v of VUES) expect(v.rubrique.trim().length).toBeGreaterThan(0);
  });

  it("aucun titre ne dépasse deux lignes pleines", () => {
    // Au-delà, il mange la hauteur de la pile, qui est ce qu'on vient montrer.
    for (const v of VUES) expect(v.titre.length).toBeLessThanOrEqual(35);
  });

  it("aucun corps ne dépasse le budget de deux lignes", () => {
    // La borne s'est desserrée avec l'alignement à gauche - un bord fixe se
    // relit mieux qu'un texte centré - mais elle a toujours des dents : une
    // troisième ligne prend sa hauteur à la pile.
    for (const v of VUES) expect(v.corps.length).toBeLessThanOrEqual(95);
  });

  it("chacune porte un titre et un corps non vides", () => {
    for (const v of VUES) {
      expect(v.titre.trim().length).toBeGreaterThan(0);
      expect(v.corps.trim().length).toBeGreaterThan(0);
    }
  });
});

/* ─────────────────────────────────────────── la pile est bien RENDUE */

describe("la pile de cartes est rendue par le carrousel", () => {
  /**
   * ┌────────────────────────────────────────────────────────────────────────┐
   * │ ⚠ LE DÉFAUT QUI A LAISSÉ UN MODULE ORPHELIN PENDANT DEUX COMMITS.     │
   * │                                                                        │
   * │ Trois cents lignes de maquettes finies sont restées sans aucun         │
   * │ importateur, et l'écran du premier lancement s'est vidé : ni type, ni  │
   * │ lint, ni test ne dit qu'un module n'est appelé par personne.           │
   * │                                                                        │
   * │ ⚠ ON LIT LA SOURCE, ON N'IMPORTE PAS. `carrousel.tsx` tire `@/ui`, qui │
   * │ tire le thème, qui tire les réglages, qui OUVRE SQLite au chargement.  │
   * └────────────────────────────────────────────────────────────────────────┘
   */
  const source = (nom: string) => readFileSync(join(__dirname, nom), "utf8");

  it("le carrousel importe la pile et lui passe les cartes DE SA VUE", () => {
    const carrousel = source("carrousel.tsx");
    expect(carrousel).toContain('from "./pile-cartes"');
    // Ancré sur l'élément : une recherche de `vue.cartes` n'importe où dans le
    // fichier passerait au vert sur un rendu qui ne s'en sert pas. C'est le
    // piège que ce dépôt a déjà payé plusieurs fois - un balayage vert pour
    // une raison qui n'est pas la sienne.
    expect(carrousel).toMatch(/<PileCartes\s+cartes=\{vue\.cartes\}\s*\/>/);
  });

  it("la pile rend les deux cartes, et le bandeau son rang", () => {
    expect(source("pile-cartes.tsx")).toMatch(/cartes\.map\(/);
    expect(source("carrousel.tsx")).toMatch(/libelleRang\(i\)/);
  });

  it("l'illustration et son texte entrent SÉPARÉMENT", () => {
    // Un conteneur unique qui monte d'un bloc paraît toujours plus lourd que
    // la somme de ses parties. Deux morceaux sémantiques - ce qu'on montre,
    // puis ce qu'il raconte - se lisent dans l'ordre où on les comprend.
    const carrousel = source("carrousel.tsx");
    const rangs = [...carrousel.matchAll(/<Apparition index=\{(\d)\}/g)].map((m) => m[1]);
    expect(rangs).toEqual(["1", "2"]);
  });

  it("le titre et le corps SUIVENT la place que la page a", () => {
    // ⚠ CE N'EST PAS DU CONFORT. Sur un écran de 640 points - le terminal de
    // comptoir - les garnitures fixes et un titre de trente points ne
    // laissaient que 36 % de la hauteur à la pile, contre 42 % sur la
    // référence des maquettes : l'échelle tombait à 0,64 et les cartes
    // devenaient des vignettes. Une variante écrite en dur ici rouvrirait le
    // défaut sans que rien ne le signale.
    const carrousel = source("carrousel.tsx");
    expect(carrousel).toMatch(/styleDeLaPage\(c\.height\)/);
    expect(carrousel).toMatch(/variant=\{style\.titre\}/);
    expect(carrousel).toMatch(/variant=\{style\.corps\}/);
  });
});

/* ────────────────────────────────────────────────────────── les libellés */

describe("le bandeau de rang", () => {
  it("compte sur deux chiffres", () => {
    // « 1 / 4 » n'a pas la même assise qu'un « 01 / 04 » : le bandeau se lit
    // comme un compteur, et un compteur garde sa largeur.
    expect(libelleRang(0)).toBe("01 / 04");
    expect(libelleRang(3)).toBe("04 / 04");
  });
});

describe("le libellé du bouton", () => {
  it("promet la suite tant qu'il y en a une", () => {
    expect(libelleBouton(0)).toBe("Suivant");
    expect(libelleBouton(2)).toBe("Suivant");
  });

  it("annonce l'entrée dans l'application sur la dernière vue", () => {
    // « Suivant » sur la dernière promettrait une page de plus, et le
    // marchand appuierait une fois de plus pour rien.
    expect(libelleBouton(VUES.length - 1)).toBe("Commencer");
  });

  it("ne promet rien au-delà de la dernière", () => {
    expect(libelleBouton(99)).toBe("Commencer");
  });
});

describe("le libellé de l'action d'en-tête", () => {
  it("offre de passer tant qu'il reste quelque chose à passer", () => {
    expect(libelleEntete(0)).toBe("Passer");
    expect(libelleEntete(2)).toBe("Passer");
  });

  it("offre de revoir une fois au bout", () => {
    // « Passer » n'y passerait plus rien : le bouton principal dit déjà
    // « Commencer ». Un bouton qui reste affiché sans plus rien faire est
    // pire qu'un bouton qui disparaît.
    expect(libelleEntete(VUES.length - 1)).toBe("Revoir");
    expect(libelleEntete(99)).toBe("Revoir");
  });
});

describe("le libellé d'un point de pagination", () => {
  it("se prononce, là où un point ne se prononce pas", () => {
    expect(libellePoint(0)).toBe("Vue 1 sur 4");
    expect(libellePoint(3)).toBe("Vue 4 sur 4");
  });
});

describe("avancer d'une vue", () => {
  it("avance", () => {
    expect(indexSuivant(0)).toBe(1);
    expect(indexSuivant(2)).toBe(3);
  });

  it("ne sort jamais de la liste", () => {
    // Le bouton reste pressable sur la dernière vue : sans ce bornage, le
    // pager viserait une page qui n'existe pas.
    expect(indexSuivant(3)).toBe(3);
    expect(indexSuivant(99)).toBe(3);
  });
});

describe("l'index que désigne un défilement", () => {
  const L = 390;

  it("désigne la page sur laquelle le défilement s'est arrêté", () => {
    expect(indexDeLOffset(0, L)).toBe(0);
    expect(indexDeLOffset(L, L)).toBe(1);
    expect(indexDeLOffset(3 * L, L)).toBe(3);
  });

  /**
   * ⚠ C'EST LA MUTATION QUI COMPTE.
   *
   * Un `Math.floor` rend la vue PRÉCÉDENTE tant que le doigt n'a pas franchi
   * la page entière : les points de pagination retardent alors d'un cran sur
   * ce qu'on voit, et le bouton annonce « Suivant » sur la dernière vue.
   */
  it("arrondit, il ne tronque pas", () => {
    expect(indexDeLOffset(L * 0.6, L)).toBe(1);
    expect(indexDeLOffset(L * 1.7, L)).toBe(2);
    // Et l'inverse : un défilement à peine entamé reste sur sa page.
    expect(indexDeLOffset(L * 0.4, L)).toBe(0);
  });

  it("supporte le premier rendu, où la fenêtre n'est pas encore mesurée", () => {
    // Diviser par zéro rendrait `NaN`, et `NaN` borné reste `NaN` : l'écran
    // n'afficherait alors aucun point actif, sans la moindre erreur.
    expect(indexDeLOffset(0, 0)).toBe(0);
    expect(indexDeLOffset(120, 0)).toBe(0);
    expect(indexDeLOffset(Number.NaN, L)).toBe(0);
  });

  it("ne sort pas de la liste sur un rebond élastique", () => {
    // iOS laisse dépasser au-delà de la dernière page, et en deçà de la
    // première : les deux donneraient un index hors bornes.
    expect(indexDeLOffset(-40, L)).toBe(0);
    expect(indexDeLOffset(4.4 * L, L)).toBe(3);
  });
});
