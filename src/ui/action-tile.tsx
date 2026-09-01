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
 * **Deux formes.** `ligne` occupe la largeur : pastille à gauche, titre et
 * description, chevron. `grille` en tient deux par rangée : pastille au-dessus
 * du titre, description sous lui. La seconde est celle des concentrateurs, où
 * l'on balaie des destinations plutôt qu'on ne lit des explications.
 *
 * **Une tuile de grille SANS description se replie sur une seule ligne**,
 * pastille à gauche du titre. C'est la disposition exacte des raccourcis du
 * back-office (`flex items-center gap-3 p-3`), et elle rend une trentaine de
 * points par tuile : sur les six raccourcis de la page Ventes, c'est presque
 * un tiers d'écran repris à des blancs qui ne disaient rien. Empiler la
 * pastille au-dessus d'un titre qu'aucune description ne suit laisse un vide
 * au milieu de la tuile, et ce vide se lit comme une donnée manquante.
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
export type FormeTuile = "ligne" | "grille";

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
  /** Omise en `grille` quand la destination se passe d'explication. */
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
        onPress={desactive ? undefined : () => router.push(href as never)}
        haptic={desactive ? "none" : "selection"}
        disabled={desactive}
        accessibilityRole="link"
        accessibilityLabel={[
          title,
          compte === null ? null : `${compte} en attente`,
          description,
          raison,
        ]
          .filter(Boolean)
          .join(". ")}
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
