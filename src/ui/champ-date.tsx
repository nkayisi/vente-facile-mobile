/**
 * Champ de DATE : on ne tape pas une date, on la choisit.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ TAPER « 2026-09-02 » AU POUCE EST UNE MAUVAISE DEMANDE.                 │
 * │                                                                          │
 * │ Dix caractères dont deux tirets, sur un clavier numérique où le tiret    │
 * │ n'est pas sous le doigt, pour une valeur que l'appareil connaît déjà.    │
 * │ Et une faute de frappe ne se voit pas : « 2026-09-32 » a la bonne forme, │
 * │ le contrôle d'expression régulière la laisse passer, et c'est le serveur │
 * │ qui refuse - après le voyage, avec un message de champ que l'écran doit  │
 * │ retraduire.                                                              │
 * │                                                                          │
 * │ Le sélecteur du système ne peut PAS produire de date invalide, il connaît│
 * │ les mois courts et les années bissextiles, et il s'ouvre sur la valeur   │
 * │ courante. C'est ce que fait `<input type="date">` du back-office sur un  │
 * │ téléphone : la parité est donc dans le sélecteur, pas dans le clavier.   │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA VALEUR VOYAGE EN `AAAA-MM-JJ`, L'AFFICHAGE EST EN FRANÇAIS.          │
 * │                                                                          │
 * │ C'est ce que l'API attend (`date_from`, `date_to`, `valid_until`), et    │
 * │ `jourISO` la construit sur les composantes LOCALES : `toISOString()`     │
 * │ bascule en UTC, et une date choisie le soir à Kinshasa s'y daterait du   │
 * │ lendemain. Ce qui s'affiche, lui, passe par le noyau (`formatDateFr`) :  │
 * │ `Intl` est proscrit, et une locale non reconnue se replie sur l'anglais  │
 * │ SANS lever - jamais sur la machine du développeur.                       │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import { useState } from "react";
import { View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { formatDateFr } from "@vente-facile/core";

import { dateDepuisJourISO, jourISO } from "@/data/dates";

import { Icon } from "./icon";
import { Pressable } from "./pressable";
import { Text } from "./text";
import { useTheme } from "./theme";

export function ChampDate({
  valeur,
  onChange,
  placeholder = "Choisir une date",
  invalid = false,
  minimum,
  maximum,
  accessibilityLabel,
}: {
  /** `AAAA-MM-JJ`, ou vide tant que rien n'est choisi. */
  valeur: string;
  onChange: (jour: string) => void;
  placeholder?: string;
  invalid?: boolean;
  /** Bornes, en `AAAA-MM-JJ`. Le sélecteur ferme ce qui est hors de portée,
   *  ce qu'un champ de texte ne sait pas faire. */
  minimum?: string;
  maximum?: string;
  accessibilityLabel?: string;
}) {
  const [ouvert, setOuvert] = useState(false);
  const { scheme } = useTheme();
  const choisie = dateDepuisJourISO(valeur);

  return (
    <>
      <Pressable
        onPress={() => setOuvert(true)}
        haptic="selection"
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? placeholder}
        // Même hauteur et même bordure qu'`Input` : deux champs voisins dont
        // l'un serait plus haut que l'autre se lisent comme un défaut.
        className={`h-12 flex-row items-center rounded-lg border bg-card px-3 ${
          invalid ? "border-destructive" : "border-input"
        }`}
      >
        <View className="min-w-0 flex-1">
          <Text
            variant="body"
            numberOfLines={1}
            // Le gris du placeholder, jamais celui d'un champ rempli : sans
            // cette distinction, une date absente se lit comme une date lue.
            className={choisie ? "" : "text-muted-foreground"}
          >
            {choisie ? formatDateFr(choisie) : placeholder}
          </Text>
        </View>
        <Icon name="Calendar" size={18} color="mutedForeground" />
      </Pressable>

      {ouvert ? (
        <DateTimePicker
          // Sans valeur choisie, on ouvre sur AUJOURD'HUI : c'est la date que
          // le marchand veut neuf fois sur dix, et elle est alors à un appui.
          value={choisie ?? new Date()}
          mode="date"
          display="default"
          themeVariant={scheme}
          minimumDate={dateDepuisJourISO(minimum) ?? undefined}
          maximumDate={dateDepuisJourISO(maximum) ?? undefined}
          onChange={(evenement, date) => {
            // Android ferme le sélecteur lui-même ; iOS le garde ouvert. On le
            // referme dans les deux cas, sinon il resterait posé sur l'écran.
            setOuvert(false);
            // « dismissed » : le marchand a annulé. Écrire quand même la date
            // par défaut lui ferait choisir sans l'avoir voulu.
            if (evenement.type === "dismissed" || !date) return;
            onChange(jourISO(date));
          }}
        />
      ) : null}
    </>
  );
}
