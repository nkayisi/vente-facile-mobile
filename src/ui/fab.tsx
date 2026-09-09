/**
 * Bouton d'action flottant.
 *
 * **Ajout mobile assumé, aucun miroir sur le web.** Le back-office pose son
 * action primaire orange en haut à droite de la page ; sur un téléphone tenu
 * d'une main, ce coin est hors de portée du pouce. L'action descend donc ici.
 * C'est un écart au web, volontaire, listé dans la check-list de parité.
 *
 * **`Fab` ne pose AUCUNE zone sûre**, c'est `Screen` qui s'en charge - même
 * partage que `AppBar`, et pour la même raison : deux composants qui ajoutent
 * `insets.bottom` font flotter le bouton à quatre-vingts points du bord, et
 * cela ne se voit que sur un terminal à indicateur d'accueil.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ IL N'Y A RIEN À AJOUTER POUR LA BARRE D'ONGLETS. MESURÉ.                 │
 * │                                                                          │
 * │ Le composant portait un `offsetBas`, « la hauteur de la barre d'onglets  │
 * │ pour un écran qui vit dedans, sans quoi le bouton se pose dessus ». La   │
 * │ prémisse est FAUSSE : le navigateur d'onglets dimensionne la scène       │
 * │ AU-DESSUS de sa barre, donc `bottom: 0` dans un écran d'onglet touche    │
 * │ déjà le haut de la barre. L'ajout comptait la barre une seconde fois.    │
 * │                                                                          │
 * │ Mesuré sur l'émulateur (1344 × 2992, 480 dpi, facteur 3), onglet         │
 * │ Inventaire : bas du bouton à 89 points de la barre AVEC l'offset, à      │
 * │ 16,0 points sans. Soixante-treize points de vide, soit très exactement   │
 * │ la hauteur de la barre plus sa zone sûre.                                │
 * │                                                                          │
 * │ ⚠ La règle vaut pour ce qui est monté SOUS le navigateur. Un composant   │
 * │ monté AU-DESSUS - le `Toast`, dont le fournisseur sert aussi les écrans  │
 * │ plein écran du comptoir - a bien la fenêtre entière pour cadre, et doit  │
 * │ ajouter `HAUTEUR_ONGLETS + insets.bottom` lui-même.                      │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import { View } from "react-native";

import { Icon, type IconName } from "./icon";
import { Pressable } from "./pressable";
import { Text } from "./text";
import { HIT } from "./tokens";

/**
 * Action SECONDAIRE, posée sur la même ligne que l'action primaire.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN CERCLE À CÔTÉ D'UNE PASTILLE, ET JAMAIS DEUX PASTILLES.              │
 * │                                                                          │
 * │ Deux boutons de même forme et de même taille au même endroit n'ont plus  │
 * │ d'action primaire : le magasinier doit LIRE pour savoir lequel saisit un │
 * │ mouvement. Le secondaire est donc plus petit (44 contre 56), rond, sur   │
 * │ fond de carte et sans libellé - il se lit comme un outil, pas comme le   │
 * │ geste attendu. Son nom vit dans `accessibilityLabel`, que le lecteur     │
 * │ d'écran annonce et qu'une icône seule ne dirait pas.                     │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export interface ActionSecondaire {
  icon: IconName;
  /** Ce que fait le bouton, en clair : il n'a pas de libellé visible. */
  label: string;
  onPress: () => void;
  /** Présent : grisé, non pressable, et la raison s'écrit au-dessus. */
  raison?: string;
}

export function Fab({
  icon,
  label,
  onPress,
  raison,
  ecart = 16,
  secondaire,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  /** Présent : le bouton est grisé, non pressable, et la raison s'écrit dessous. */
  raison?: string;
  /**
   * Ce qui SÉPARE le bouton du bas de son écran. Seize points par défaut, la
   * valeur Material, et c'est tout ce qu'il faut : voir la mesure ci-dessus.
   *
   * ⚠ Ne pas descendre sous huit : le bouton fait cinquante-six points de haut
   * et son ombre déborde de plusieurs points. Collé à la barre d'onglets, il
   * se lit comme un bout de la barre et non comme une action.
   */
  ecart?: number;
  /**
   * Un second geste, sur la même ligne.
   *
   * L'export d'une liste en est le cas : il n'est pas l'action primaire de
   * l'écran, mais le coin haut droit d'un téléphone de six pouces est hors de
   * portée du pouce, exactement le motif qui a fait descendre le `Fab` ici.
   */
  secondaire?: ActionSecondaire;
}) {
  const desactive = Boolean(raison);
  const secondaireDesactive = Boolean(secondaire?.raison);
  return (
    <View className="absolute inset-x-0 items-end px-4" style={{ bottom: ecart }}>
      {/* Les raisons s'empilent, chacune au-dessus de la rangée. Elles ne se
          présentent pas ensemble aujourd'hui ; le jour où cela arriverait,
          deux bulles valent mieux qu'une bulle ambiguë. */}
      {secondaire?.raison ? <Bulle texte={secondaire.raison} /> : null}
      {raison ? <Bulle texte={raison} /> : null}

      <View className="flex-row items-center gap-2">
        {secondaire ? (
          <Pressable
            onPress={secondaireDesactive ? undefined : secondaire.onPress}
            disabled={secondaireDesactive}
            haptic={secondaireDesactive ? "none" : "selection"}
            accessibilityRole="button"
            accessibilityLabel={secondaire.label}
            className={`items-center justify-center rounded-full border border-border bg-card shadow-lg${
              secondaireDesactive ? " opacity-50" : ""
            }`}
            style={{ width: HIT.min, height: HIT.min }}
          >
            <Icon name={secondaire.icon} size={20} />
          </Pressable>
        ) : null}

        <Pressable
          onPress={desactive ? undefined : onPress}
          disabled={desactive}
          haptic={desactive ? "none" : "selection"}
          accessibilityRole="button"
          accessibilityLabel={label}
          className={`flex-row items-center gap-2 rounded-full bg-primary px-5 shadow-lg${
            desactive ? " opacity-50" : ""
          }`}
          style={{ height: HIT.pos }}
        >
          <Icon name={icon} size={20} color="primaryForeground" />
          <Text className="font-sans-semibold text-primary-foreground">{label}</Text>
        </Pressable>
      </View>
    </View>
  );
}

/**
 * La raison d'un bouton fermé. Un bouton grisé muet est un cul-de-sac.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ELLE FLOTTE AU-DESSUS D'UNE LISTE QUI DÉFILE, DONC ELLE EST OPAQUE.     │
 * │                                                                          │
 * │ Deux états mesurés sur l'émulateur, tous deux illisibles :               │
 * │                                                                          │
 * │  - `bg-card` avec un filet `border-border`, posée sur une liste          │
 * │    elle-même en `bg-card` : plus de contour du tout. La phrase se lit    │
 * │    comme la ligne qu'elle recouvre à moitié, et le magasinier cherche à  │
 * │    quel mouvement elle appartient. C'est le piège du ton « info » du     │
 * │    `Toast`, qui s'en tire parce qu'il flotte sur un fond gris.           │
 * │  - un fond TEINTÉ à quinze pour cent, la grammaire du `Toast` : le       │
 * │    contour revient, mais le nom du produit et sa quantité TRAVERSENT la  │
 * │    bulle. Deux textes superposés, ce qui est pire qu'un contour absent.  │
 * │                                                                          │
 * │ D'où l'infobulle classique : `bg-foreground` et `text-background`. Elle  │
 * │ est pleine, elle ne ressemble à aucune surface de la liste, et elle      │
 * │ s'inverse toute seule en thème sombre - deux jetons, pas de variante.    │
 * │                                                                          │
 * │ ⚠ La couleur du TEXTE doit être écrite : la variante de `Text` en pose   │
 * │ une, et `fusionner` ne la retire que si l'appelant en fournit une autre. │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
function Bulle({ texte }: { texte: string }) {
  return (
    <View className="mb-2 max-w-[80%] rounded-xl bg-foreground px-3 py-2">
      <Text variant="bodySmall" className="text-right text-background">
        {texte}
      </Text>
    </View>
  );
}
