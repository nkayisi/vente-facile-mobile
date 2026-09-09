/**
 * Appeler un client depuis l'application.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ON OUVRE LE COMPOSEUR, ON NE COMPOSE JAMAIS.                            │
 * │                                                                          │
 * │ `tel:` remplit le clavier du téléphone et s'arrête là ; l'appel part au  │
 * │ geste suivant, celui du marchand. Le schéma qui appelle directement      │
 * │ (`telprompt:` sur iOS, l'intention `CALL` sur Android) demande une       │
 * │ permission d'appel, et surtout il déclenche un appel sur un doigt qui    │
 * │ glisse dans une liste. Un appel parti par erreur à un client qu'on       │
 * │ relance pour une dette n'est pas une maladresse anodine.                 │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * La normalisation est PURE et testée ; seule l'ouverture touche au système.
 */
import { Linking } from "react-native";

/**
 * Le numéro sous la forme que le composeur accepte, ou `null`.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ RENDRE `null` PLUTÔT QUE D'ESSAYER QUAND MÊME.                          │
 * │                                                                          │
 * │ Le champ `phone` d'un client est libre : il porte parfois « voir Papa    │
 * │ Jean » ou « bureau ». Ouvrir un composeur sur une chaîne pareille rend   │
 * │ un clavier vide, et le marchand croit que son téléphone est cassé. Un    │
 * │ bouton qui ne s'affiche pas est plus honnête qu'un bouton qui ne fait    │
 * │ rien - c'est la règle déjà posée sur les boutons de transition, dont     │
 * │ l'écran DIT pourquoi ils manquent.                                       │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Ce qui est conservé : les chiffres, et le `+` s'il est en TÊTE. Espaces,
 * points, tirets et parenthèses sont du décor de saisie. Un indicatif entre
 * parenthèses (« +243 (0)99... ») garde donc ses chiffres, ce qui est le
 * comportement du composeur du système.
 *
 * Le plancher est de six chiffres : un numéro congolais en compte neuf après
 * le zéro, et cinq chiffres désignent presque toujours un code interne saisi
 * dans le mauvais champ.
 */
export function numeroAppelable(brut: string | null | undefined): string | null {
  const s = (brut ?? "").trim();
  if (!s) return null;

  const international = s.startsWith("+");
  const chiffres = s.replace(/\D/g, "");
  if (chiffres.length < 6) return null;

  return international ? `+${chiffres}` : chiffres;
}

/**
 * Ouvre le composeur du système. Rend `false` si rien ne s'est ouvert.
 *
 * L'appelant DIT l'échec plutôt que de le taire : sur un terminal de point de
 * vente sans carte SIM - ils existent, l'appareil ne sert qu'à encaisser -
 * aucune application ne répond à `tel:`, et un bouton muet ferait chercher la
 * panne du mauvais côté.
 */
export async function ouvrirComposeur(
  brut: string | null | undefined
): Promise<boolean> {
  const numero = numeroAppelable(brut);
  if (!numero) return false;
  try {
    await Linking.openURL(`tel:${numero}`);
    return true;
  } catch {
    return false;
  }
}
