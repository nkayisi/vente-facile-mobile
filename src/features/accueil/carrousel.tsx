/**
 * La mécanique de la présentation, et ce qu'elle rend.
 *
 * Trois pièces, parce que la barre d'actions doit vivre dans le `pied` de
 * `Screen` et le pager dans son corps : un hook porte l'état commun, et les
 * deux composants le consomment. La route n'a plus qu'à les assembler.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN `ScrollView` PAGINÉ, PAS UNE LISTE VIRTUALISÉE.                      │
 * │                                                                          │
 * │ Il y a QUATRE vues, connues à l'avance et jamais rechargées. Une          │
 * │ `FlashList` y apporterait une mesure asynchrone qui se dispute avec      │
 * │ `pagingEnabled`, pour économiser le montage de deux vues.                │
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
import {
  VUES,
  indexDeLOffset,
  indexSuivant,
  libelleBouton,
  libellePoint,
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
  const { width } = useWindowDimensions();
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
   * Le pager n'a plus rien à animer au doigt depuis que les maquettes sont
   * parties : il ne reste qu'à savoir SUR QUELLE PAGE on est. Garder une
   * `Animated.Value` pour cela ferait franchir le pont natif à chaque image
   * affichée, pour une valeur que plus personne ne lit.
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
      {VUES.map((vue) => (
        <View
          key={vue.cle}
          style={{ width: c.width }}
          // ┌──────────────────────────────────────────────────────────────┐
          // │ LE TEXTE EST CENTRÉ DANS LA PAGE, PARCE QU'IL EST LA PAGE.  │
          // │                                                              │
          // │ Il était aligné en HAUT, et c'était juste tant qu'une        │
          // │ maquette le précédait : elle portait le regard, et la        │
          // │ laisser flotter au milieu l'aurait fait monter ou descendre  │
          // │ selon la longueur du texte, si bien que les quatre vues ne   │
          // │ se superposaient plus au balayage. Sans elle, il ne reste    │
          // │ rien à quoi s'aligner : un titre posé en haut d'une page     │
          // │ vide se lit comme un écran qui n'a pas fini de charger. Et   │
          // │ le centre est stable d'une vue à l'autre, donc le titre ne   │
          // │ saute toujours pas au balayage.                              │
          // │                                                              │
          // │ ⚠ LA PAGE N'EST PAS `flex-1`. Elle s'étire déjà sur toute la │
          // │ hauteur du pager - le travers d'un défilement horizontal est │
          // │ la verticale - et `flex-1` remettrait sa LARGEUR en jeu sur  │
          // │ l'axe principal, alors que c'est elle qui fait la            │
          // │ pagination.                                                  │
          // └──────────────────────────────────────────────────────────────┘
          className="justify-center px-8"
        >
          {/* ┌────────────────────────────────────────────────────────────┐
              │ CENTRÉ, ET LA COPIE EST COURTE. LES DEUX VONT ENSEMBLE.   │
              │                                                            │
              │ Un texte centré se relit mal dès la quatrième ligne : l'œil │
              │ doit rechercher le début de chacune, là où un texte aligné  │
              │ à gauche lui donne un bord fixe. Le centrage ne se tient    │
              │ donc QUE sur une copie courte, et `vues.ts` porte cette     │
              │ contrainte au-dessus de `corps`. La rallonger là-bas        │
              │ rouvrirait le défaut ici, en silence - et il coûte plus     │
              │ cher depuis que ce texte est SEUL sur sa page.              │
              └────────────────────────────────────────────────────────────┘

              ⚠ LE TITRE PORTE `foreground`, PLUS LA COULEUR DE MARQUE. Il la
              portait, et il la disputait au bouton posé quelques dizaines de
              points plus bas : deux oranges sur un écran qui n'a qu'UNE
              action. L'accent revient au seul élément sur lequel on appuie,
              ce qui est aussi ce que dit la règle du produit - une seule
              action primaire par écran.

              ⚠ LA MESURE EST BORNÉE. Sans `max-w`, une tablette étire les
              lignes jusqu'au bord et le texte centré devient illisible bien
              avant que la copie ne soit en cause. */}
          <Apparition index={1} className="items-center gap-3">
            <Text variant="h1" className="text-center">
              {vue.titre}
            </Text>
            <Text
              variant="bodyLarge"
              className="max-w-[360px] text-center text-muted-foreground"
            >
              {vue.corps}
            </Text>
          </Apparition>
        </View>
      ))}
    </ScrollView>
  );
}

/** Le point de la vue courante s'allonge en pilule. */
function Point({ actif, libelle }: { actif: boolean; libelle: string }) {
  const reduit = useMouvementReduit();
  const [progression] = useState(() => new Animated.Value(actif ? 1 : 0));

  // `useState` d'initialisation paresseuse puis une animation à chaque
  // changement : la largeur n'est pas une propriété que le fil natif sache
  // animer, et c'est assumé - un point se déplace de quatorze points, sur
  // trois éléments, au rythme d'un balayage.
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
      className={`h-1.5 rounded-full ${actif ? "bg-primary" : "bg-border"}`}
      style={{
        width: progression.interpolate({
          inputRange: [0, 1],
          outputRange: [6, 20],
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
    // │ maquette est l'argument principal. Mis sur la même ligne, ils        │
    // │ rendent cette hauteur à l'illustration sans rien retirer : la        │
    // │ progression se lit toujours d'un coup d'œil, et le pouce retrouve    │
    // │ l'action là où il la cherche en premier sur un grand écran.          │
    // └──────────────────────────────────────────────────────────────────────┘
    <View className="flex-row items-center justify-between gap-4">
      <View className="flex-row items-center gap-1.5">
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
          // Le chevron dit « il y a une suite », ce que « Commencer » ne doit
          // justement plus promettre : il disparaît sur la dernière vue.
          rightIcon={dernier ? undefined : "ChevronRight"}
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

/** « Passer » : la seconde sortie, et elle mène au même endroit. */
export function BoutonPasser({ onTerminer }: { onTerminer: () => void }) {
  return (
    <Pressable
      onPress={onTerminer}
      accessibilityRole="button"
      accessibilityLabel="Passer la présentation"
      className="min-h-11 justify-center px-3"
    >
      <Text variant="label" className="text-muted-foreground">
        Passer
      </Text>
    </Pressable>
  );
}
