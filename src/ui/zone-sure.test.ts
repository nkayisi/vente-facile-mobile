/**
 * Le rembourrage d'un écran, éprouvé SANS rendre un composant.
 *
 * C'est ce que le lot a acheté en sortant le calcul de la JSX : les deux regex
 * qu'il remplace figeaient la GRAPHIE de `screen.tsx` (`/edges = \["top",
 * "bottom"\]/`) et cassaient à la moindre réécriture, y compris légitime.
 * Ici on teste la RÈGLE.
 */
import { BORDS_PAR_DEFAUT, rembourrageZoneSure, type MargesSysteme } from "./zone-sure";

const MARGES: MargesSysteme = {
  haut: 24,
  bas: 48,
  gauche: 3,
  droite: 5,
  brut: { top: 24, bottom: 0, left: 3, right: 5 },
  fenetre: { largeur: 400, hauteur: 800 },
  ecran: { largeur: 400, hauteur: 800 },
  verdict: "marge_absente",
};

describe("le rembourrage de zone sûre", () => {
  it("le BAS fait partie des bords par défaut", () => {
    // Les 95 écrans qui ne passent pas `edges` en dépendent : c'est là que le
    // bouton « Enregistrer » se posait sur la barre gestuelle.
    expect(BORDS_PAR_DEFAUT).toContain("bottom");
    expect(BORDS_PAR_DEFAUT).toContain("top");
  });

  it("réserve la marge POSÉE, jamais celle que le système annonce", () => {
    // `bas` porte le plancher ; `brut.bottom` est le mensonge du système.
    expect(rembourrageZoneSure(BORDS_PAR_DEFAUT, MARGES)).toEqual({
      paddingTop: 24,
      paddingBottom: 48,
      paddingLeft: 0,
      paddingRight: 0,
    });
  });

  it("`edges={[]}` renonce à TOUT : la barre d'onglets porte déjà les bords", () => {
    expect(rembourrageZoneSure([], MARGES)).toEqual({
      paddingTop: 0,
      paddingBottom: 0,
      paddingLeft: 0,
      paddingRight: 0,
    });
  });

  it("chaque bord est indépendant", () => {
    expect(rembourrageZoneSure(["left", "right"], MARGES)).toEqual({
      paddingTop: 0,
      paddingBottom: 0,
      paddingLeft: 3,
      paddingRight: 5,
    });
  });
});
