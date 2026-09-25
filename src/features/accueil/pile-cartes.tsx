/**
 * La pile de deux cartes qui illustre une vue de la présentation.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE SONT DES CARTES DU PRODUIT, PAS UNE DÉCORATION.                      │
 * │                                                                          │
 * │ Chacune porte le glyphe, le nom, la phrase et les trois puces d'un       │
 * │ module, dans les mots du site. C'est ce qui distingue cette pile d'une   │
 * │ capture rétrécie : on peut la LIRE, et ce qu'on y lit est vrai.          │
 * │                                                                          │
 * │ L'arrière est partiellement recouvert par l'avant, et c'est voulu : une  │
 * │ pile dit « il y en a d'autres » là où deux cartes côte à côte diraient   │
 * │ « il y en a exactement deux ». Le texte caché n'est jamais TRONQUÉ - pas │
 * │ d'ellipse - il est masqué, comme sur une vraie pile de papier.           │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ AUCUNE ANIMATION ICI. Les quatre pages sont montées d'un coup par le pager
 * - c'est un `ScrollView`, pas une liste virtualisée - donc une scène qui
 * tournerait par vue ferait tourner quatre minuteurs en permanence, dont trois
 * hors de l'écran, sur le tout premier écran de l'application. L'entrée est
 * portée par `Apparition`, au montage et une seule fois.
 */
import { useState } from "react";
import { View, type LayoutChangeEvent } from "react-native";

import { Icon, Text, useTheme } from "@/ui";
import {
  CARTE,
  ENCOMBREMENT,
  POSES,
  RAYON_INTERIEUR,
  echelleDeLaPile,
  placement,
  type Pose,
} from "./geometrie";
import type { Carte } from "./vues";

export function PileCartes({ cartes }: { cartes: readonly [Carte, Carte] }) {
  /**
   * ⚠ ON MESURE, ON NE DEVINE PAS.
   *
   * La place laissée à la pile dépend du titre, du corps, du pied et des zones
   * sûres : la déduire de la seule fenêtre reviendrait à recopier ici la mise
   * en page de la page, et à la voir dériver au premier changement de copie.
   *
   * Rien n'est rendu avant la mesure, et cela ne fait AUCUN saut : ce cadre
   * est `flex-1`, sa hauteur ne dépend donc pas de son contenu. Le premier
   * rendu est de toute façon invisible, `Apparition` ouvrant à opacité nulle.
   */
  const [dispo, setDispo] = useState<{
    largeur: number;
    hauteur: number;
  } | null>(null);
  const mesurer = (e: LayoutChangeEvent) =>
    setDispo({
      largeur: e.nativeEvent.layout.width,
      hauteur: e.nativeEvent.layout.height,
    });

  return (
    <View className="flex-1 items-center justify-center" onLayout={mesurer}>
      {dispo ? (
        <View
          style={{
            width: ENCOMBREMENT.largeur,
            height: ENCOMBREMENT.hauteur,
            // La mise à l'échelle porte sur la PILE ENTIÈRE, donc les angles,
            // le recouvrement et le rapport des deux cartes ne bougent pas.
            transform: [{ scale: echelleDeLaPile(dispo) }],
          }}
        >
          <Halo />
          {cartes.map((carte, i) => (
            <CarteModule
              key={carte.label}
              carte={carte}
              pose={POSES[i]}
              rang={i}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

/**
 * La tache chaude posée derrière la pile.
 *
 * Elle fait le travail que le fond de page ne peut pas faire ici : la page est
 * blanche (voir `bienvenue.tsx`, qui unifie le corps et le pied pour n'avoir
 * aucune couture), et des cartes blanches sur du blanc n'auraient que leur
 * filet pour exister. La tache leur rend la profondeur, sans repeindre l'écran.
 *
 * ⚠ `bg-primary/15` ET NON UN LITTÉRAL. C'est un jeton : il suit le thème, et
 * la même tache reste discrète sur le fond sombre. Une valeur en dur y
 * resterait claire, ce que le garde-fou des couleurs interdit.
 */
function Halo() {
  return (
    <View
      className="absolute rounded-full bg-primary/15"
      style={{
        // Les trois valeurs sont des FRACTIONS de l'encombrement : la tache
        // suit la pile quand celle-ci grandit, au lieu de rétrécir contre elle.
        width: ENCOMBREMENT.largeur * 0.46,
        height: ENCOMBREMENT.largeur * 0.46,
        left: ENCOMBREMENT.largeur * 0.17,
        top: ENCOMBREMENT.hauteur * 0.03,
      }}
    />
  );
}

function CarteModule({
  carte,
  pose,
  rang,
}: {
  carte: Carte;
  pose: Pose;
  /** 0 = arrière, 1 = avant. */
  rang: number;
}) {
  const { colors } = useTheme();
  const { left, top } = placement(pose);

  return (
    <View
      className="absolute border border-border bg-card"
      style={{
        left,
        top,
        // Le rayon et la marge viennent de `geometrie.ts` : c'est là que la
        // relation concentrique avec la pastille d'icône est écrite, et un
        // `rounded-[…]` en dur ici la romprait au premier ajustement.
        borderRadius: CARTE.rayon,
        padding: CARTE.marge,
        width: CARTE.largeur,
        height: CARTE.hauteur,
        // RN tourne autour du CENTRE de la vue : c'est ce qui rend le calcul
        // de `placement` exact.
        transform: [{ rotate: `${pose.angle}deg` }],
        /**
         * ⚠ L'OMBRE EST LA SEULE DU DÉPÔT, ET ELLE EST MOTIVÉE. `Card` n'en
         * pose aucune, à raison : dans une liste elle coûte un rendu par
         * carte et ne se voit pas en thème sombre. Ici il n'y en a que deux,
         * et c'est elle qui fait lire « posées l'une sur l'autre ». Le filet
         * prend le relais en sombre, où l'ombre disparaît.
         *
         * ⚠ `elevation` DOIT SUIVRE LE RANG. Sur Android, elle décide AUSSI
         * de l'ordre d'empilement : à valeur égale, deux vues qui se
         * recouvrent peuvent s'inverser, et la carte d'arrière-plan passerait
         * devant.
         */
        shadowColor: colors.foreground,
        shadowOpacity: 0.12,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 8 },
        elevation: 3 + rang * 4,
      }}
    >
      {/* ⚠ LE ROGNAGE VIT SUR UNE VUE INTÉRIEURE, PAS SUR LA CARTE.
        La hauteur de la carte est FIXE - c'est elle qui sert à calculer
        l'échelle - donc une puce qui se replierait sur une troisième ligne
        déborderait du filet, ce qui se lit comme une mise en page cassée là où
        un mot coupé au bas de la carte passe pour le bas d'une pile.
        Mais sur Android, `overflow: hidden` posé sur la vue qui porte
        l'`elevation` lui fait perdre son ombre : le rognage descend donc d'un
        cran, et la carte garde la sienne. */}
      <View className="flex-1 overflow-hidden">
        <View
          className="h-12 w-12 items-center justify-center bg-accent"
          style={{ borderRadius: RAYON_INTERIEUR }}
        >
          <Icon name={carte.icone} size={24} color="primary" />
        </View>

        <Text
          variant="caption"
          numberOfLines={1}
          className="mt-3 font-sans-semibold uppercase text-foreground"
          // ⚠ L'ESPACEMENT EST EN POINTS, PAS EN `tracking-*`. Les valeurs de
          // Tailwind sont en `em`, et rien ne garantit que NativeWind les
          // traduise : une classe qu'il ne sait pas traduire est ignorée SANS
          // avertissement, et l'étiquette perdrait ce qui la distingue d'une
          // ligne de texte ordinaire.
          style={{ letterSpacing: 1.2 }}
        >
          {carte.label}
        </Text>

        <Text
          variant="bodySmall"
          numberOfLines={2}
          className="mt-2 text-muted-foreground"
        >
          {carte.ligne}
        </Text>

        <View className="my-3.5 h-px bg-border" />

        <View className="gap-2">
          {carte.puces.map((puce) => (
            <View key={puce} className="flex-row gap-2">
              {/* Le trait est épaissi : à douze points, une coche de trait 2
                disparaît à côté du texte qu'elle accompagne. */}
              <View className="pt-0.5">
                <Icon name="Check" size={12} color="primary" strokeWidth={3} />
              </View>
              <Text variant="caption" className="flex-1 text-foreground">
                {puce}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}
