/**
 * La bascule de thème, posée dans le pied du tiroir, à côté du compte.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN RÉGLAGE SE CHANGE LÀ OÙ LE BESOIN NAÎT.                              │
 * │                                                                          │
 * │ C'était un écran entier, « Apparence », au fond d'un menu, pour UN seul  │
 * │ réglage. Or on change de thème au moment où la lumière change - le soir  │
 * │ au comptoir, en plein soleil sur le trottoir - pas au moment où l'on     │
 * │ ouvre des réglages. L'écran est supprimé, rien n'est perdu : ses trois   │
 * │ choix nommés vivent dans la feuille qu'ouvre une pression longue.        │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * **L'icône dit l'état COURANT, jamais le prochain.** Un bouton dont le glyphe
 * annonce ce qu'on obtiendra en appuyant se lit à l'envers une fois sur deux :
 * un soleil peut aussi bien vouloir dire « c'est clair » que « passe en
 * clair ». Ici il dit toujours la première chose, et l'étiquette
 * d'accessibilité porte la seconde.
 *
 * **lucide et non Ionicons**, alors que le back-office n'a aucun sélecteur de
 * thème à mettre en miroir : la bascule se pose à quelques points du `LogOut`,
 * et deux familles d'icônes côte à côte font changer l'épaisseur de trait au
 * milieu d'une rangée - le défaut visuel le plus visible et le plus difficile
 * à nommer.
 */
import { Fragment, useState } from "react";
import { View } from "react-native";

import { Divider } from "./divider";
import { Icon } from "./icon";
import { ListItem } from "./list-item";
import { Pressable } from "./pressable";
import { Sheet } from "./sheet";
import { Text } from "./text";
import { useTheme } from "./theme";
import { LIBELLE_THEME, ORDRE_THEME, themeSuivant, type ModeTheme } from "./theme-cycle";
import { HIT } from "./tokens";

export function BasculeTheme() {
  const { preference, setPreference, scheme } = useTheme();
  const [feuille, setFeuille] = useState(false);

  const mode = preference as ModeTheme;
  const courant = LIBELLE_THEME[mode] ?? LIBELLE_THEME.system;
  const prochain = LIBELLE_THEME[themeSuivant(mode)] ?? LIBELLE_THEME.system;

  return (
    <>
      <Pressable
        onPress={() => setPreference(themeSuivant(mode))}
        // La pression longue est un RACCOURCI vers les noms, jamais le seul
        // chemin : les trois modes s'atteignent déjà en trois appuis, et un
        // geste que personne ne devine ne doit rien garder pour lui.
        onLongPress={() => setFeuille(true)}
        accessibilityRole="button"
        // L'étiquette dit l'état PUIS le geste. Un lecteur d'écran qui
        // n'annoncerait que « Thème » laisserait l'utilisateur appuyer pour
        // savoir où il en est, c'est-à-dire changer ce qu'il voulait lire.
        accessibilityLabel={`Thème : ${courant.titre}. Appuyer pour passer en ${prochain.titre.toLowerCase()}.`}
        accessibilityHint="Pression longue pour choisir parmi les trois thèmes"
        // ┌──────────────────────────────────────────────────────────────────┐
        // │ AUCUN DÉBORDEMENT DE CIBLE : LE VOISIN EST « SE DÉCONNECTER ».   │
        // │                                                                  │
        // │ `Pressable` étend sa cible de 8 points par défaut, et le pied du │
        // │ tiroir laisse 12 points entre les deux boutons : les deux zones  │
        // │ se recouvriraient sur 4 points de part et d'autre, et le doigt   │
        // │ qui tombe dans cette couture déconnecterait le caissier en       │
        // │ pleine journée. La boîte fait DÉJÀ 44 points, la cible tactile   │
        // │ du produit : il n'y a rien à étendre.                            │
        // └──────────────────────────────────────────────────────────────────┘
        hitSlop={0}
        className="items-center justify-center rounded-lg"
        style={{ width: HIT.min, height: HIT.min }}
      >
        <Icon name={courant.icon} size={20} color="mutedForeground" />
      </Pressable>

      <Sheet ouvert={feuille} onFermer={() => setFeuille(false)} titre="Thème">
        <View className="gap-3 pb-2">
          {/* Un groupe, un seul bord gauche et un seul bord droit : une liste
              de choix se lit en balayant une colonne. Filets DÉCALÉS pour que
              la colonne d'icônes reste continue. Même grammaire que la feuille
              de choix de format. */}
          <View className="overflow-hidden rounded-xl border border-border">
            {ORDRE_THEME.map((m, i) => (
              <Fragment key={m}>
                {i > 0 ? <Divider inset /> : null}
                <ListItem
                  icon={LIBELLE_THEME[m].icon}
                  title={LIBELLE_THEME[m].titre}
                  subtitle={LIBELLE_THEME[m].aide}
                  onPress={() => {
                    setPreference(m);
                    setFeuille(false);
                  }}
                  trailing={
                    mode === m ? (
                      <Icon name="CheckCircle2" size={20} color="primary" />
                    ) : undefined
                  }
                />
              </Fragment>
            ))}
          </View>

          {/* « Automatique » ne dit pas CE QU'IL DONNE ce soir : sans cette
              ligne, le marchand qui le choisit ne sait pas s'il vient de
              passer en clair ou en sombre. */}
          <Text variant="caption">
            {`Thème appliqué : ${scheme === "dark" ? "sombre" : "clair"}.`}
          </Text>
        </View>
      </Sheet>
    </>
  );
}
