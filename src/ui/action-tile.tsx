/**
 * Raccourci de navigation.
 *
 * Porté du back-office, mais **repensé pour le tactile**. Toute la doctrine du
 * composant web tient dans le survol : la tuile se soulève, la flèche avance.
 * **Il n'y a pas de survol sur un doigt.** L'affordance migre donc entièrement
 * dans l'état pressé, et le chevron reste immobile, comme repère de direction.
 *
 * Ce qui est conservé parce que c'est la doctrine : la pastille colorée est un
 * repère de RUBRIQUE et non un signal d'interactivité (c'est le défaut que le
 * commentaire du composant web décrit, « neuf boîtes de même taille dont quatre
 * seulement réagissaient au clic »), et les rayons concentriques, tuile en
 * `rounded-xl` et pastille en `rounded-lg`.
 *
 * **Trois formes.**
 *
 *   `ligne`   pleine largeur : pastille, titre, description, chevron.
 *   `grille`  deux par rangée, pour un concentrateur qui EXPLIQUE ses
 *             destinations. Sans description, elle se replie sur une seule
 *             ligne, pastille à gauche du titre - empiler une pastille au
 *             dessus d'un titre qu'aucune description ne suit laisse un vide au
 *             milieu, et ce vide se lit comme une donnée manquante.
 *   `action`  trois par rangée, sur la carte commune : pastille ronde centrée,
 *             libellé d'un mot dessous, décompte en pastille de coin.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ `action` EXISTE PARCE QU'UNE TUILE ENCADRÉE SE LIT COMME UN RELEVÉ.      │
 * │                                                                          │
 * │ La forme `grille` sans description donne un rectangle à bordure, à fond  │
 * │ de carte, portant une icône, un libellé et - pour « Règlements en        │
 * │ attente » - un NOMBRE. C'est trait pour trait la grammaire d'une cellule │
 * │ de `StatStrip`, posée quarante points sous un `StatStrip`. La frontière  │
 * │ que le dépôt a payé cher (« deux registres, deux formes ») tenait alors  │
 * │ au seul intitulé de section, ce qui ne suffit pas : on lit une forme     │
 * │ avant de lire un titre.                                                  │
 * │                                                                          │
 * │ CE N'EST PAS LA SURFACE QUI DISTINGUE, C'EST CE QU'ELLE PORTE. Une      │
 * │ première version retirait aussi la carte ; elle se lisait bien, mais     │
 * │ elle sortait du dessin de la page - tout le reste, cadran compris, vit   │
 * │ sur un fond de carte à filet. La carte est donc CONSERVÉE, avec le même  │
 * │ fond, le même filet et le même rayon qu'ailleurs, et c'est le CONTENU    │
 * │ qui change : une pastille RONDE, centrée, surmontant un libellé d'un     │
 * │ mot, et pas de valeur du tout. Un relevé n'est jamais rond, jamais       │
 * │ centré, et il porte toujours un chiffre à la place du libellé.           │
 * │                                                                          │
 * │ Le décompte devient une PASTILLE DE COIN, la grammaire du badge d'onglet │
 * │ - « il y a trois choses à traiter ici », et non « la valeur du relevé    │
 * │ est trois ».                                                             │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * **Trois accents seulement**, pris sur des jetons existants. Le web en a cinq
 * (`purple`, `indigo`, `cyan`, `amber`, `orange`) mais aucun n'a de jeton chez
 * nous et aucun ne basculerait en sombre ; et cinq pastilles colorées sur un
 * écran de 390 points, c'est du bruit.
 */
import { View } from "react-native";
import { router } from "expo-router";

import { Icon, type IconName } from "./icon";
import { Pressable } from "./pressable";
import { Text } from "./text";

export type AccentTuile = "primary" | "chart2" | "chart3";
export type FormeTuile = "ligne" | "grille" | "action";

const ACCENTS: Record<AccentTuile, { fond: string; jeton: "primary" | "chart2" | "chart3" }> = {
  primary: { fond: "bg-primary/10", jeton: "primary" },
  chart2: { fond: "bg-chart-2/10", jeton: "chart2" },
  chart3: { fond: "bg-chart-3/10", jeton: "chart3" },
};

export function ActionTile({
  href,
  title,
  description,
  icon,
  accent = "primary",
  forme = "ligne",
  badge,
  raison,
}: {
  href: string;
  title: string;
  /**
   * Omise en `grille` quand la destination se passe d'explication.
   *
   * En `action` elle n'est PAS dessinée - la cellule fait cent dix points de
   * large : elle complète le libellé lu par le lecteur d'écran, à qui
   * « Règlements » seul ne dit pas de quels règlements il s'agit.
   */
  description?: string;
  icon: IconName;
  accent?: AccentTuile;
  forme?: FormeTuile;
  /**
   * Décompte porté par la destination : « 3 règlements attendent ».
   *
   * Il est sur la TUILE et non sur un relevé, parce qu'un nombre qui appelle
   * une action doit être là où l'on tape. Absent ou nul, rien ne s'affiche :
   * une pastille « 0 » attire l'œil pour dire qu'il n'y a rien à faire.
   */
  badge?: number | null;
  /** Présent : la tuile est grisée, non pressable, et dit pourquoi. */
  raison?: string;
}) {
  const a = ACCENTS[accent];
  const desactive = Boolean(raison);
  const grille = forme === "grille";
  const compte = badge && badge > 0 ? badge : null;
  // Sans description, rien ne justifie d'empiler : voir l'en-tête de fichier.
  const empile = grille && Boolean(description);

  const aller = desactive ? undefined : () => router.push(href as never);
  const etiquette = [
    title,
    compte === null ? null : `${compte} en attente`,
    description,
    raison,
  ]
    .filter(Boolean)
    .join(". ");

  if (forme === "action") {
    // `flex-1` avec `basis-[30%]` : trois par rangée, qui se PARTAGENT la
    // largeur restante. Une base fixe laisserait une bande vide à droite, et
    // la grille ne serait plus alignée sur les cartes de la page.
    return (
      <View className="min-w-0 flex-1 basis-[30%]">
        <Pressable
          onPress={aller}
          haptic={desactive ? "none" : "selection"}
          disabled={desactive}
          accessibilityRole="link"
          accessibilityLabel={etiquette}
          // La CARTE est celle de toute la page : même fond, même filet, même
          // rayon que le cadran et les listes. Ce qui distingue un raccourci
          // d'un relevé n'est donc pas la SURFACE mais ce qu'elle porte : une
          // pastille RONDE centrée, un libellé d'un mot, aucune valeur - et un
          // décompte en pastille de coin, jamais là où un relevé écrit son
          // chiffre.
          className={`items-center gap-2 rounded-xl border border-border bg-card px-2 py-3${
            desactive ? " opacity-50" : ""
          }`}
          // 0,96 et pas moins : en deçà, l'appui a l'air d'un rebond.
          pressedClassName="active:opacity-90 active:scale-[0.96]"
        >
          {/* Le rembourrage de quatre points sert à poser la pastille de coin
              SANS décalage négatif : la cellule reste centrée, et le badge
              déborde dans un espace prévu pour lui. */}
          <View className="p-1">
            <View className={`h-12 w-12 items-center justify-center rounded-full ${a.fond}`}>
              <Icon name={icon} size={20} color={a.jeton} />
            </View>
            {compte === null ? null : (
              // Le liseré couleur de fond détache la pastille de l'icône, comme
              // un badge d'onglet : sans lui, les deux ronds se touchent et se
              // lisent comme un seul dessin.
              <View className="absolute right-0 top-0 h-5 min-w-5 items-center justify-center rounded-full border-2 border-background bg-warning px-1">
                <Text variant="caption" numeric className="font-sans-medium text-warning-foreground">
                  {String(compte)}
                </Text>
              </View>
            )}
          </View>
          <Text
            variant="bodySmall"
            numberOfLines={1}
            className="text-center font-sans-medium"
          >
            {title}
          </Text>
        </Pressable>
        {raison ? (
          <Text variant="caption" numberOfLines={2} className="mt-0.5 text-center">
            {raison}
          </Text>
        ) : null}
      </View>
    );
  }

  const pastille = (
    <View className={`h-9 w-9 items-center justify-center rounded-lg ${a.fond}`}>
      <Icon name={icon} size={18} color={a.jeton} />
    </View>
  );

  const decompte =
    compte === null ? null : (
      <View className="h-6 min-w-6 items-center justify-center rounded-full bg-warning/15 px-1.5">
        <Text variant="caption" numeric className="font-sans-medium text-warning">
          {String(compte)}
        </Text>
      </View>
    );

  return (
    <View className={grille ? "min-w-0 flex-1 basis-[45%]" : undefined}>
      <Pressable
        onPress={aller}
        haptic={desactive ? "none" : "selection"}
        disabled={desactive}
        accessibilityRole="link"
        accessibilityLabel={etiquette}
        className={`rounded-xl border border-border bg-card p-3.5${
          empile ? "" : " flex-row items-center gap-3"
        }${desactive ? " opacity-50" : ""}`}
        pressedClassName="active:opacity-90 active:scale-[0.98]"
      >
        {empile ? (
          <View className="flex-row items-start justify-between">
            {pastille}
            {decompte}
          </View>
        ) : (
          pastille
        )}
        <View className={empile ? "mt-2.5" : "min-w-0 flex-1"}>
          <Text
            variant="bodySmall"
            numberOfLines={2}
            className="font-sans-medium"
          >
            {title}
          </Text>
          {description ? (
            <Text variant="caption" numberOfLines={2}>
              {description}
            </Text>
          ) : null}
        </View>
        {empile ? null : decompte}
        {/* Le chevron est le repère de direction de la forme PLEINE LARGEUR.
            Dans une cellule de grille il mangerait la largeur du titre, et la
            tuile entière dit déjà qu'elle mène ailleurs. */}
        {grille ? null : <Icon name="ChevronRight" size={16} color="mutedForeground" />}
      </Pressable>
      {raison ? (
        <Text variant="caption" className="mt-1 px-1">
          {raison}
        </Text>
      ) : null}
    </View>
  );
}
