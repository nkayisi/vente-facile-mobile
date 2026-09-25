/**
 * La mécanique de la présentation, et ce qu'elle rend.
 *
 * Trois pièces, parce que la barre d'actions doit vivre dans le `pied` de
 * `Screen` et le pager dans son corps : un hook porte l'état commun, et les
 * composants le consomment. La route n'a plus qu'à les assembler.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UNE PAGE, QUATRE BLOCS, TOUJOURS DANS LE MÊME ORDRE.                    │
 * │                                                                          │
 * │   la pile de cartes · le rang et la rubrique · le titre · le corps       │
 * │                                                                          │
 * │ La pile prend la hauteur qui reste, donc les trois blocs de texte        │
 * │ tombent au MÊME endroit sur les quatre pages : c'est ce qui rend les     │
 * │ vues superposables au balayage, et ce qu'un centrage vertical ne         │
 * │ garantirait que tant que les corps font le même nombre de lignes.        │
 * │                                                                          │
 * │ ⚠ LE TEXTE EST ALIGNÉ À GAUCHE. Il a été centré, du temps où la vue      │
 * │ n'avait qu'un titre et deux lignes. Un texte centré se relit mal dès la  │
 * │ troisième ligne - l'œil doit rechercher le début de chacune - et le      │
 * │ bandeau de rang, lui, ne se centre pas du tout : c'est un repère, il se  │
 * │ lit dans la marge.                                                       │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN `ScrollView` PAGINÉ, PAS UNE LISTE VIRTUALISÉE.                      │
 * │                                                                          │
 * │ Il y a QUATRE vues, connues à l'avance et jamais rechargées. Une         │
 * │ `FlashList` y apporterait une mesure asynchrone qui se dispute avec      │
 * │ `pagingEnabled`, pour économiser le montage de trois vues - et une       │
 * │ mesure asynchrone qui se bat avec la pagination est la dernière chose    │
 * │ qu'on veut sur l'écran d'un premier lancement.                           │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ LA LARGEUR VIENT DE `useWindowDimensions`, JAMAIS DE `Dimensions.get`.
 * La seconde est lue une fois et ne bouge plus : à la rotation, ou en écran
 * partagé, les pages garderaient la largeur d'avant et la pagination
 * s'arrêterait entre deux vues.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  ScrollView,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";

import { Apparition, Button, Pressable, Text, useMouvementReduit } from "@/ui";
import { styleDeLaPage } from "./geometrie";
import { PileCartes } from "./pile-cartes";
import {
  VUES,
  indexDeLOffset,
  indexSuivant,
  libelleBouton,
  libelleEntete,
  libellePoint,
  libelleRang,
} from "./vues";

/**
 * ⚠ LE HOOK NE REND AUCUN `ref`, ET C'EST STRUCTUREL.
 *
 * Il en portait un sur le pager, pour que le bouton « Suivant » puisse
 * appeler `scrollTo`. Conséquence : l'objet rendu devenait tout entier
 * « contaminé » pour la règle `react-hooks/refs`, et lire `c.width` au rendu
 * était signalé comme la lecture d'un ref. La règle a raison sur le fond - un
 * ref lu au rendu ne redéclenche rien - même si le cas précis était bénin.
 *
 * Le pager garde donc son ref chez lui, et le bouton DEMANDE une page par
 * l'état. Le défilement se fait dans un effet, ce qui répare au passage la
 * rotation : la page demandée se réaligne sur la nouvelle largeur.
 */
export function useCarrousel() {
  // ⚠ LA HAUTEUR SERT AUSSI, et pas seulement la largeur : c'est elle qui dit
  // si la page a de quoi porter le titre des maquettes. Voir `styleDeLaPage`.
  const { width, height } = useWindowDimensions();
  const reduit = useMouvementReduit();
  const [index, setIndex] = useState(0);
  /**
   * ⚠ UN JETON, PAS SEULEMENT UN NUMÉRO DE PAGE.
   *
   * Avec le seul numéro, la suite « appuyer sur Suivant pour aller en 1, puis
   * revenir en 0 au doigt, puis appuyer sur Suivant » laisse la demande à 1 :
   * elle ne CHANGE pas, l'effet ne se rejoue pas, et le bouton devient inerte
   * sans que rien ne le signale. Le jeton rend chaque appui distinct.
   */
  const [demande, setDemande] = useState({ page: 0, jeton: 0 });
  /**
   * ⚠ UN RAPPEL ORDINAIRE, PLUS UN `Animated.event`.
   *
   * Les cartes sont fixes dans leur page : il n'y a rien à animer au doigt,
   * il ne reste qu'à savoir SUR QUELLE PAGE on est. Garder une
   * `Animated.Value` pour cela ferait franchir le pont natif à chaque image
   * affichée, pour une valeur que personne ne lit.
   *
   * Le point actif change dès que la page franchit sa moitié, et non à la fin
   * du glissement : attendre l'arrêt le ferait retarder d'un cran sur ce
   * qu'on voit. React ne rend rien quand la valeur ne change pas.
   */
  const surDefilement = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) =>
      setIndex(indexDeLOffset(e.nativeEvent.contentOffset.x, width)),
    [width],
  );

  const allerA = useCallback((cible: number) => {
    setDemande((d) => ({ page: cible, jeton: d.jeton + 1 }));
    // On pose l'index tout de suite : un défilement non animé n'émet aucun
    // évènement de défilement, donc les points resteraient en arrière.
    setIndex(cible);
  }, []);

  return {
    width,
    height,
    reduit,
    index,
    demande,
    surDefilement,
    allerA,
  };
}

type Carrousel = ReturnType<typeof useCarrousel>;

export function PagesCarrousel({ c }: { c: Carrousel }) {
  const pager = useRef<ScrollView>(null);
  // ⚠ UNE SEULE FOIS POUR LES QUATRE PAGES. Le calculer dans la boucle
  // donnerait quatre résultats identiques, et surtout laisserait croire qu'une
  // page pourrait se resserrer sans les autres - ce qui casserait la
  // superposition des vues au balayage.
  const style = styleDeLaPage(c.height);

  // La page demandée par le bouton, et le réalignement après une rotation :
  // les deux se réduisent à « amener le pager là où l'état le dit ».
  useEffect(() => {
    pager.current?.scrollTo({
      x: c.demande.page * c.width,
      animated: !c.reduit,
    });
  }, [c.demande, c.width, c.reduit]);

  return (
    <ScrollView
      ref={pager}
      horizontal
      pagingEnabled
      showsHorizontalScrollIndicator={false}
      onScroll={c.surDefilement}
      scrollEventThrottle={16}
      // Chaque page fait exactement la fenêtre : c'est ce qui fait que la
      // pagination s'arrête sur une vue et non entre deux.
      contentContainerStyle={{ width: c.width * VUES.length }}
    >
      {VUES.map((vue, i) => (
        <View
          key={vue.cle}
          style={{ width: c.width }}
          // ⚠ LA PAGE N'EST PAS `flex-1`. Elle s'étire déjà sur toute la
          // hauteur du pager - le travers d'un défilement horizontal est la
          // verticale - et `flex-1` remettrait sa LARGEUR en jeu sur l'axe
          // principal, alors que c'est elle qui fait la pagination. C'est
          // `Apparition` qui porte le `flex-1`, et son prop `className`
          // existe pour ce cas précis.
          //
          // ⚠ AUCUN REMBOURRAGE HORIZONTAL ICI : la pile MORD les deux bords,
          // comme sur les maquettes. C'est le bloc de texte qui porte sa
          // marge, et c'est lui seul qui doit s'aligner sur le pied.
          className="pb-2 pt-2"
        >
          {/* ┌──────────────────────────────────────────────────────────┐
              │ DEUX ENTRÉES DÉCALÉES, PAS UN SEUL BLOC.                │
              │                                                          │
              │ La page entrait d'une pièce. Découpée en deux morceaux   │
              │ SÉMANTIQUES - l'illustration, puis ce qu'elle raconte -   │
              │ elle se lit dans l'ordre où on la comprend, et le        │
              │ décalage de quarante millisecondes suffit à le dire. Un  │
              │ conteneur unique qui monte d'un bloc paraît toujours     │
              │ plus lourd que la somme de ses parties.                  │
              └──────────────────────────────────────────────────────────┘ */}
          <Apparition index={1} className="flex-1">
            <PileCartes cartes={vue.cartes} />
          </Apparition>

          <Apparition index={2}>
            <View className={`px-6 ${style.espace}`}>
              {/* Le repère : où l'on en est, et de quoi on parle. Il est en
                  couleur de marque parce qu'il est le seul élément de la page
                  dont le rôle est de se REPÉRER, jamais de se lire en entier. */}
              <Text
                variant="caption"
                numeric
                className="font-sans-semibold uppercase text-primary"
                // Points, et non `tracking-*` : les valeurs de Tailwind sont
                // en `em`, et une classe que NativeWind ne sait pas traduire
                // est ignorée SANS avertissement.
                style={{ letterSpacing: 1.6 }}
              >
                {`${libelleRang(i)} · ${vue.rubrique}`}
              </Text>
              <Text variant={style.titre}>{vue.titre}</Text>
              <Text variant={style.corps} className="text-muted-foreground">
                {vue.corps}
              </Text>
            </View>
          </Apparition>
        </View>
      ))}
    </ScrollView>
  );
}

/**
 * Le point de la vue courante s'allonge en pilule ; les autres restent des
 * anneaux.
 *
 * ⚠ UN ANNEAU, ET NON UN POINT PLEIN. Un point gris plein a le même poids
 * qu'un point orange plein : la rangée se lit alors comme quatre états
 * équivalents dont un coloré. Vidé, il dit « pas encore » d'un coup d'œil.
 */
function Point({ actif, libelle }: { actif: boolean; libelle: string }) {
  const reduit = useMouvementReduit();
  const [progression] = useState(() => new Animated.Value(actif ? 1 : 0));

  // `useState` d'initialisation paresseuse puis une animation à chaque
  // changement : la largeur n'est pas une propriété que le fil natif sache
  // animer, et c'est assumé - un point se déplace de seize points, sur
  // quatre éléments, au rythme d'un balayage.
  const cible = actif ? 1 : 0;
  useEffect(() => {
    if (reduit) {
      // Le repli n'est jamais « pas d'animation puis un saut » : c'est le
      // point DÉJÀ à sa taille.
      progression.setValue(cible);
      return;
    }
    const animation = Animated.timing(progression, {
      toValue: cible,
      duration: 180,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [cible, reduit, progression]);

  return (
    <Animated.View
      className={`h-2 rounded-full ${actif ? "bg-primary" : "border border-border"}`}
      style={{
        width: progression.interpolate({
          inputRange: [0, 1],
          outputRange: [8, 24],
        }),
      }}
      accessibilityRole="text"
      accessibilityLabel={libelle}
    />
  );
}

export function PiedCarrousel({
  c,
  onTerminer,
}: {
  c: Carrousel;
  onTerminer: () => void;
}) {
  const dernier = c.index >= VUES.length - 1;

  return (
    // ┌──────────────────────────────────────────────────────────────────────┐
    // │ UNE SEULE RANGÉE : LA PROGRESSION À GAUCHE, L'ACTION À DROITE.      │
    // │                                                                      │
    // │ Les points étaient empilés AU-DESSUS d'un bouton pleine largeur, ce  │
    // │ qui coûtait une soixantaine de points de hauteur à un écran dont la  │
    // │ pile de cartes est l'argument principal. Mis sur la même ligne, ils  │
    // │ rendent cette hauteur sans rien retirer : la progression se lit      │
    // │ toujours d'un coup d'œil, et le pouce retrouve l'action là où il la  │
    // │ cherche en premier sur un grand écran.                               │
    // └──────────────────────────────────────────────────────────────────────┘
    <View className="flex-row items-center justify-between gap-4 px-2">
      <View className="flex-row items-center gap-2">
        {VUES.map((vue, i) => (
          <Point
            key={vue.cle}
            actif={i === c.index}
            libelle={libellePoint(i)}
          />
        ))}
      </View>

      {/* ⚠ LE BALAYAGE NE PEUT PAS ÊTRE LE SEUL CHEMIN. Ce bouton avance d'une
          vue, donc un marchand qui ne devine pas le geste arrive quand même au
          bout - et un lecteur d'écran a une cible à activer. */}
      {/* ⚠ `rounded-full` NE MARCHAIT PAS avant que `Button` ne fusionne ses
          classes : en NativeWind, `.rounded-full` perd contre le `.rounded-lg`
          du composant par ordre alphabétique, et le bouton restait carré sans
          le moindre avertissement. Voir `ui/classes.ts`. */}
      {/* ┌──────────────────────────────────────────────────────────────────┐
          │ L'ENVELOPPE N'EST PAS DÉCORATIVE.                               │
          │                                                                  │
          │ Hors `fullWidth`, `Button` pose `self-start`. Dans une rangée,   │
          │ `align-self` porte sur la VERTICALE : le bouton se collerait en  │
          │ haut au lieu de s'aligner sur les points. On ne peut pas le      │
          │ corriger depuis `className` - `self-*` n'appartient à AUCUN      │
          │ groupe de `fusionner`, donc les deux classes survivraient et     │
          │ l'ordre alphabétique de NativeWind trancherait : « self-center » │
          │ perd contre « self-start », sans le moindre avertissement.       │
          │ L'enveloppe rend le `self-start` inoffensif, ce qui est plus sûr │
          │ que d'élargir `fusionner` pour un seul appelant.                 │
          └──────────────────────────────────────────────────────────────────┘ */}
      <View>
        <Button
          size="pos"
          className="rounded-full px-7"
          // ⚠ LA FLÈCHE RESTE SUR LA DERNIÈRE VUE. Elle y disparaissait, au
          // motif que « Commencer » ne doit pas promettre une page de plus.
          // C'est justement ce qu'une flèche ne dit pas : elle dit qu'on
          // AVANCE, et on avance bien - dans l'application.
          rightIcon="ArrowRight"
          onPress={() =>
            dernier ? onTerminer() : c.allerA(indexSuivant(c.index))
          }
        >
          {libelleBouton(c.index)}
        </Button>
      </View>
    </View>
  );
}

/**
 * L'action d'en-tête : la seconde sortie, puis le retour au début.
 *
 * ⚠ ELLE CHANGE DE SENS SUR LA DERNIÈRE VUE, et c'est ce qui la garde utile :
 * « Passer » n'y passerait plus rien, le bouton principal disant déjà
 * « Commencer ». Un bouton qui reste affiché sans plus rien faire est pire
 * qu'un bouton qui disparaît, et la place sert à revenir au début pour qui a
 * balayé trop vite.
 */
export function ActionEntete({
  c,
  onTerminer,
}: {
  c: Carrousel;
  onTerminer: () => void;
}) {
  const dernier = c.index >= VUES.length - 1;
  const libelle = libelleEntete(c.index);

  return (
    <Pressable
      onPress={() => (dernier ? c.allerA(0) : onTerminer())}
      accessibilityRole="button"
      accessibilityLabel={
        dernier ? "Revoir la présentation" : "Passer la présentation"
      }
      className="min-h-11 justify-center px-3"
    >
      <Text variant="label" className="text-muted-foreground">
        {libelle}
      </Text>
    </Pressable>
  );
}
