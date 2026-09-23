/**
 * Le logo de la marque, en un seul endroit.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ IL LIT `logo-trim.png`, PAS `logo.png`, ET C'EST CE QUI REND LA TAILLE   │
 * │ HONNÊTE.                                                                 │
 * │                                                                          │
 * │ Le fichier source est un carré de 500 points dont l'encre n'occupe que   │
 * │ 263 x 373 : plus de la moitié de la largeur est du vide transparent. Un  │
 * │ `Image` de 68 x 68 y rendait donc un logo de 35 points, et le tiroir a   │
 * │ vécu ainsi depuis le lot 5bis - la marque y paraissait timide sans que   │
 * │ personne puisse dire pourquoi. `logo-trim.png` est l'encre seule,        │
 * │ engendrée par `scripts/derive-brand-assets.mjs` : `hauteur` désigne      │
 * │ alors la hauteur RÉELLE du dessin.                                       │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * On pilote par la HAUTEUR : le logo est en portrait, et c'est sa hauteur qui
 * décide de la place qu'il prend dans une colonne.
 *
 * ⚠ `largeur` existe pour UN seul appelant, l'écran de démarrage, et il faut
 * qu'il existe : le splash natif se dimensionne par `imageWidth` dans
 * `app.config.ts`. Écrire le même nombre des deux côtés est ce qui rend le
 * raccord invisible ; le recalculer à la main depuis une hauteur y
 * introduirait un arrondi, donc un saut de quelques points au moment précis
 * où le splash se lève.
 */
import { View } from "react-native";
import { Image } from "expo-image";

import { Text } from "./text";
import { useTheme } from "./theme";

const LOGO = require("../../assets/images/logo-trim.png");

/** Rapport de l'encre, mesuré sur l'asset engendré : 263 x 373. */
const RAPPORT = 263 / 373;

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE FOND DERRIÈRE LE LOGO EST TOUJOURS CELUI DE LA PAGE. JAMAIS UNE      │
 * │ PLAQUE D'UNE AUTRE COULEUR.                                              │
 * │                                                                          │
 * │ Ce composant posait une plaque `bg-splash` (blanc dans les deux thèmes)  │
 * │ pour sauver la lisibilité de nuit. Elle dessinait un carré blanc sur le  │
 * │ `#f3f4f6` de la page en thème clair, et sur le `#0f0f11` en sombre :     │
 * │ deux couleurs qui ne sont celles d'aucune des deux pages. La règle est   │
 * │ venue de l'utilisateur, capture à l'appui, et elle est absolue.          │
 * │                                                                          │
 * │ Mais le problème que la plaque réglait est RÉEL, et mesuré : posé sur    │
 * │ `#0f0f11`, le tourbillon orange tient 5,38:1, le bleu du mot « Vente »   │
 * │ tombe à 1,61:1 et le contour noir du téléphone à 1,01:1. Il ne resterait │
 * │ que l'orange : un logo amputé, qui se lit comme un défaut d'affichage.   │
 * │                                                                          │
 * │ D'où la seule sortie qui n'enfreint ni la règle ni la mesure : LE DESSIN │
 * │ NE SE POSE QUE SUR UN FOND CLAIR. En thème sombre, la marque passe en    │
 * │ TYPOGRAPHIE. On ne montre donc jamais ni plaque rapportée, ni logo       │
 * │ amputé. C'est la réponse déjà retenue pour le pied de page du site web,  │
 * │ dont la bande encre a le même problème.                                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function Logo({
  hauteur,
  largeur,
  fondClair = false,
  nomAilleurs = false,
  className,
}: {
  hauteur?: number;
  /** Ne sert qu'à recopier l'`imageWidth` du splash. Voir la note ci-dessus. */
  largeur?: number;
  /**
   * L'écran est CLAIR quel que soit le thème, donc le dessin y tient.
   * Un seul appelant : l'écran de démarrage, dont le fond est `bg-splash`.
   * Partout ailleurs le fond suit le thème, et c'est le thème qui décide.
   */
  fondClair?: boolean;
  /**
   * Le nom de la marque est DÉJÀ écrit en texte juste à côté.
   * Sans cela, le mot-symbole de secours ferait doublon en thème sombre :
   * la connexion porte son titre « Vente Facile », le tiroir porte
   * « Vente » + « Facile ». À ne poser que si c'est vrai dans le fichier.
   */
  nomAilleurs?: boolean;
  className?: string;
}) {
  const { scheme } = useTheme();
  const h = hauteur ?? (largeur !== undefined ? largeur / RAPPORT : 72);
  const l = largeur ?? h * RAPPORT;

  if (fondClair || scheme === "light") {
    return (
      <Image
        source={LOGO}
        // `contentFit="contain"` reste, même avec un cadre au bon rapport : un
        // arrondi d'un point sur la largeur déformerait sinon le dessin.
        contentFit="contain"
        style={{ height: Math.round(h), width: Math.round(l) }}
        className={className}
        // Le mot-symbole est DANS l'image : sans cette étiquette, un lecteur
        // d'écran passerait sur le nom de l'application sans le prononcer.
        accessible
        accessibilityRole="image"
        accessibilityLabel="Vente Facile"
        // Le logo est empaqueté dans le bundle, donc déjà là : la transition
        // n'est pas un chargement, c'est ce qui évite le à-coup du premier rendu.
        transition={120}
      />
    );
  }

  // Le nom est déjà là, en texte : un second mot-symbole ferait doublon.
  if (nomAilleurs) return null;

  // Le mot-symbole est le DÉFAUT en thème sombre, et non une option : un
  // appelant qui n'aurait pas le nom à côté perdrait sinon toute la marque,
  // et rien ne lèverait. C'est le traitement du tiroir, repris tel quel.
  return (
    <View className={className} style={{ height: Math.round(h) }}>
      <Text variant={variantePourHauteur(h)}>
        Vente<Text className="text-primary">Facile</Text>
      </Text>
    </View>
  );
}

/** Le mot-symbole occupe la place que le dessin aurait prise. */
function variantePourHauteur(h: number) {
  if (h >= 88) return "h1" as const;
  if (h >= 56) return "h2" as const;
  return "h4" as const;
}
