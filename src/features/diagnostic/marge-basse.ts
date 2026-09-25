/**
 * Ce qu'on peut CONCLURE des mesures de zone sûre, et rien d'autre.
 *
 * Module PUR : ni composant, ni base, ni navigation. C'est ce qui permet
 * d'éprouver le verdict sans appareil - et un verdict faux ne lève rien, il
 * envoie simplement corriger au mauvais endroit.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UNE MARGE BASSE À ZÉRO NE VEUT RIEN DIRE TOUTE SEULE.                   │
 * │                                                                          │
 * │ Elle se lit aussi bien « tout va bien » que « tout est cassé », et c'est │
 * │ précisément pourquoi ce défaut est resté invisible :                     │
 * │                                                                          │
 * │  - si le SYSTÈME insère lui-même la fenêtre, l'application ne dessine    │
 * │    jamais sous la barre de navigation. Zéro est alors la bonne valeur,   │
 * │    et poser une marge ajouterait une bande morte.                        │
 * │  - si la fenêtre est BORD-À-BORD, l'application dessine sous la barre.   │
 * │    Zéro veut alors dire que personne ne réserve la place, et tout ce qui │
 * │    est en bas passe dessous.                                             │
 * │                                                                          │
 * │ Les deux cas se distinguent par UNE comparaison : la hauteur de l'écran  │
 * │ physique contre celle de la fenêtre applicative. Sans elle, on corrige   │
 * │ au hasard.                                                               │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

export type Verdict =
  /** Bord-à-bord, marge rapportée : rien à faire. */
  | "conforme"
  /** Le système insère la fenêtre. Zéro est juste, ne rien ajouter. */
  | "fenetre_inseree"
  /** Bord-à-bord SANS marge rapportée : c'est le défaut. */
  | "marge_absente";

export interface Mesures {
  /** `Dimensions.get("screen").height` : l'écran physique. */
  hauteurEcran: number;
  /** `useSafeAreaFrame().height` : la fenêtre applicative. */
  hauteurFenetre: number;
  /** `useSafeAreaInsets().bottom`. */
  margeBasse: number;
}

/**
 * ⚠ UNE TOLÉRANCE, PAS UNE ÉGALITÉ STRICTE.
 *
 * Les deux hauteurs viennent de sources différentes et passent par une
 * conversion en points : elles peuvent différer d'une unité par arrondi sans
 * que la fenêtre soit insérée pour autant. Comparer à l'identique classerait
 * un appareil parfaitement bord-à-bord en « fenêtre insérée », donc
 * exactement à l'envers.
 */
const TOLERANCE = 2;

export function verdict({
  hauteurEcran,
  hauteurFenetre,
  margeBasse,
}: Mesures): Verdict {
  // Des mesures absentes ou aberrantes ne se tranchent pas : on retombe sur le
  // cas où il n'y a rien à corriger, parce qu'inventer un défaut ferait poser
  // une bande morte sur un appareil sain.
  if (!(hauteurEcran > 0) || !(hauteurFenetre > 0)) return "conforme";

  if (hauteurEcran - hauteurFenetre > TOLERANCE) return "fenetre_inseree";
  return margeBasse > 0 ? "conforme" : "marge_absente";
}

/** Ce que le verdict veut dire, en clair, pour l'écran de relevé. */
export const LIBELLES: Record<Verdict, { titre: string; detail: string }> = {
  conforme: {
    titre: "Rien à signaler",
    detail:
      "La fenêtre va jusqu'au bord de l'écran et le système annonce bien la place que prend sa barre. Les éléments du bas sont posés au-dessus d'elle.",
  },
  fenetre_inseree: {
    titre: "Rien à signaler",
    detail:
      "Le système réserve lui-même la place de sa barre : l'application ne dessine jamais dessous. Une marge de zéro est normale ici, et en ajouter une laisserait une bande vide.",
  },
  marge_absente: {
    titre: "C'est le défaut",
    detail:
      "La fenêtre va jusqu'au bord de l'écran, mais le système n'annonce aucune place pour sa barre. Tout ce qui est en bas passe donc dessous. Envoyez cette capture.",
  },
};

/**
 * Ce qu'on reserve en bas quand le systeme ne reserve rien.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ 48, ET C'EST UNE DÉCISION SOUS INCERTITUDE, PAS UNE MESURE.             │
 * │                                                                          │
 * │ Dans le cas `marge_absente`, le mode de navigation est INCONNAISSABLE    │
 * │ depuis JavaScript. En bord-à-bord, `Dimensions.get("screen")`,           │
 * │ `.get("window")` et `useSafeAreaFrame()` rendent le MÊME rectangle -     │
 * │ `DeviceInfoModule.kt` remplace les bornes de la fenêtre par celles de    │
 * │ l'écran, barres comprises. Le seul chiffre qui décrirait la barre est    │
 * │ l'inset, et c'est précisément lui qui ment ici.                          │
 * │                                                                          │
 * │ Restent deux valeurs possibles : 24 pour une poignée gestuelle, 48 pour  │
 * │ une barre à trois boutons (`navigation_bar_height` d'AOSP). ON PREND LA  │
 * │ GRANDE, et l'argument est asymétrique :                                  │
 * │                                                                          │
 * │  - trop peu, sur un terminal à trois boutons - le parc de ce produit -   │
 * │    c'est « Encaisser » à moitié recouvert, donc une vente perdue ;       │
 * │  - trop, c'est vingt-quatre points de bande morte SUR UN APPAREIL QUI    │
 * │    EST DÉJÀ EN DÉFAUT. Le reproche de bande morte écrit en tête de ce    │
 * │    fichier vise `conforme` et `fenetre_inseree` : il ne porte pas ici.   │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export const PLANCHER_BARRE_SYSTEME = 48;

/**
 * La marge basse à POSER, plancher compris. C'est la seule valeur qu'un écran
 * doit employer ; `Mesures.margeBasse` est ce que le système ANNONCE.
 *
 * ⚠ UNE FONCTION, ET SURTOUT PAS UN `Math.max` CHEZ L'APPELANT. C'est la
 * condition `marge_absente` qui fait tout le travail : recopiée, elle se perdra
 * une fois, et cet appel-là posera une bande morte sur un appareil sain.
 */
export function margeBasseEffective(m: Mesures): number {
  return verdict(m) === "marge_absente" ? PLANCHER_BARRE_SYSTEME : m.margeBasse;
}
