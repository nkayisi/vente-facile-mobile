/**
 * Enveloppe d'écran.
 *
 * Regroupe quatre corvées que chaque écran refaisait à sa façon dans l'ancienne
 * application, avec des résultats différents d'un écran à l'autre :
 * zones sûres, évitement du clavier, tirer pour rafraîchir, et le fond du
 * thème. Un écran qui les oublie se voit tout de suite sur un terminal à barre
 * de navigation logicielle, ce que sont la plupart des POS Android.
 */
import type { ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  View,
} from "react-native";
import { useSafeAreaInsets, type Edge } from "react-native-safe-area-context";

import { useTheme } from "./theme";

/**
 * Les deux fonds possibles d'un ecran, et ce que chacun fait du pied.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UNE TABLE, JAMAIS `bg-${fond}`.                                         │
 * │                                                                          │
 * │ NativeWind extrait les classes du CODE a la compilation : une classe     │
 * │ fabriquee au vol n'existe dans aucune feuille, et elle est simplement    │
 * │ ignoree - pas d'erreur, pas d'avertissement, juste un ecran qui garde    │
 * │ le fond d'avant. Meme motif que la table `TONS` des apercus.             │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ LE PIED PERD SON FILET ET SA PLAQUE EN `card`, ET C'EST TOUT L'OBJET.
 * Le filet et le fond de carte DETACHENT la barre du contenu qui defile
 * dessous. Quand la page EST deja la surface carte, ils separent une chose
 * d'elle-meme : c'est trait pour trait la couture que ce prop existe pour
 * supprimer.
 */
const FONDS = {
  background: { page: "bg-background", pied: "border-t border-border bg-card" },
  card: { page: "bg-card", pied: "" },
} as const;

export interface ScreenProps {
  children: ReactNode;
  /**
   * Bords où appliquer la zone sûre.
   *
   * ┌────────────────────────────────────────────────────────────────────────┐
   * │ LE BAS EN FAIT PARTIE PAR DÉFAUT, et ne l'a pas toujours fait.         │
   * │                                                                        │
   * │ Sans lui, la dernière ligne d'un écran plein - le bouton « Enregistrer │
   * │ » de tous les formulaires - se pose sur l'indicateur d'accueil d'un    │
   * │ iPhone et sur la barre gestuelle d'un Android récent, là où le système │
   * │ intercepte le geste. Le bouton devient dur à presser, sans que rien ne │
   * │ le signale sur un émulateur à boutons logiciels.                       │
   * └────────────────────────────────────────────────────────────────────────┘
   *
   * Un écran d'ONGLET passe `edges={[]}` : la barre d'onglets porte déjà les
   * deux bords, et les cumuler laisserait une bande vide au-dessus d'elle.
   */
  edges?: Edge[];
  /** Enveloppe le contenu dans un défilement. */
  scroll?: boolean;
  /** Tirer pour rafraîchir : déclenche un cycle de synchronisation, pas un appel. */
  onRefresh?: () => void;
  refreshing?: boolean;
  /** Retire la marge intérieure par défaut, pour un POS pleine largeur. */
  padded?: boolean;
  /**
   * Barre d'actions FIXE, posée sous le contenu.
   *
   * ┌────────────────────────────────────────────────────────────────────────┐
   * │ ELLE VIT DANS `Screen`, ET C'EST OBLIGATOIRE.                          │
   * │                                                                        │
   * │ La zone sûre a un seul propriétaire par bord. Une barre fixe écrite    │
   * │ dans un écran devrait lire les insets pour ne pas se poser sur la      │
   * │ barre gestuelle - et deux composants qui ajoutent le même inset        │
   * │ donnent une marge double. Ici elle est SOUS le rembourrage de zone     │
   * │ sûre déjà appliqué, donc elle est juste, et le prochain écran qui en   │
   * │ voudra une n'aura pas à le redécouvrir.                                │
   * │                                                                        │
   * │ Elle est un FRÈRE du défilement, jamais une surcouche : le contenu se  │
   * │ réduit d'autant et rien ne passe dessous. Une barre en `absolute`      │
   * │ obligerait chaque écran à réserver sa hauteur en bas de liste, et      │
   * │ celui qui l'oublie cache sa dernière ligne.                            │
   * │                                                                        │
   * │ Elle est DANS l'évitement du clavier : une barre d'action qui reste    │
   * │ sous un clavier ouvert n'est pas une barre d'action.                   │
   * └────────────────────────────────────────────────────────────────────────┘
   */
  pied?: ReactNode;
  /**
   * Centre le contenu verticalement TANT QU'IL TIENT, et le laisse défiler
   * depuis le haut dès qu'il dépasse.
   *
   * ┌────────────────────────────────────────────────────────────────────────┐
   * │ C'EST `flexGrow` QUI REND LE CENTRAGE SANS RISQUE, PAS `justifyContent`.│
   * │                                                                        │
   * │ `flexGrow: 1` porte la hauteur du conteneur au MINIMUM de la fenêtre : │
   * │ `justifyContent` n'a donc d'espace libre à répartir que lorsqu'il en   │
   * │ reste. Un contenu plus haut que l'écran remplit son conteneur          │
   * │ exactement, il n'y a plus rien à centrer, et aucune ligne ne sort du   │
   * │ défilement. Les deux vont ENSEMBLE :                                   │
   * │                                                                        │
   * │   - `justifyContent` seul, sur un conteneur dimensionné par son        │
   * │     contenu, ne centre jamais rien - il n'y a pas d'espace libre ;     │
   * │   - poser une marge de tête à la main (`mt-10`) centre à l'oeil sur le │
   * │     terminal du développeur et décale tous les autres, un formulaire   │
   * │     court sur un écran haut restant collé en haut.                     │
   * └────────────────────────────────────────────────────────────────────────┘
   *
   * À réserver aux écrans dont le contenu EST la page - connexion,
   * inscription, choix d'établissement, code de déverrouillage. Une LISTE ne
   * se centre pas : son premier élément doit toujours se trouver au même
   * endroit, quel que soit le nombre de lignes.
   */
  centre?: boolean;
  /**
   * Le fond de l'ecran, pied compris.
   *
   * `"background"` (defaut) : le gris de page, avec un pied blanc detache par
   * un filet. C'est la disposition de tous les ecrans de l'application.
   *
   * `"card"` : la surface carte, d'un seul tenant, sans couture entre le corps
   * et la barre d'actions.
   *
   * ⚠ `card`, ET SURTOUT PAS UN BLANC EN DUR. En theme clair le jeton vaut
   * `#ffffff`, donc l'ecran est blanc ; en theme sombre il vaut `#1a1a1d`,
   * donc il reste sombre. Deux raisons, et la seconde est mecanique :
   *
   *  - un blanc integral au premier lancement, en soiree, sur le terminal d'un
   *    marchand qui a choisi le theme sombre ;
   *  - `app/_layout.tsx` monte `<StatusBar style="auto" />`, qui decide d'apres
   *    le `colorScheme` et NON d'apres ce qui est derriere. Sur un ecran forme
   *    blanc en theme sombre, les icones de statut sortiraient BLANCHES SUR
   *    BLANC, donc invisibles. Les rattraper demanderait un second `StatusBar`
   *    propre a cet ecran, soit un deuxieme proprietaire pour une ressource
   *    globale - exactement le motif que ce fichier combat pour les zones
   *    sures.
   */
  fond?: keyof typeof FONDS;
  className?: string;
}

export function Screen({
  children,
  edges = ["top", "bottom"],
  scroll = false,
  onRefresh,
  refreshing = false,
  padded = true,
  pied,
  centre = false,
  fond = "background",
  className = "",
}: ScreenProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  const pad = {
    paddingTop: edges.includes("top") ? insets.top : 0,
    paddingBottom: edges.includes("bottom") ? insets.bottom : 0,
    paddingLeft: edges.includes("left") ? insets.left : 0,
    paddingRight: edges.includes("right") ? insets.right : 0,
  };

  const contenu = {
    ...(padded ? { padding: 16 } : null),
    ...(centre ? { flexGrow: 1, justifyContent: "center" as const } : null),
  };

  const body = scroll ? (
    <ScrollView
      className={`flex-1 ${className}`}
      contentContainerStyle={contenu}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  ) : (
    <View
      className={`flex-1 ${padded ? "p-4" : ""} ${centre ? "justify-center" : ""} ${className}`}
    >
      {children}
    </View>
  );

  const f = FONDS[fond];

  return (
    <View className={`flex-1 ${f.page}`} style={pad}>
      <KeyboardAvoidingView
        className="flex-1"
        // `padding` sur iOS, `height` sur Android : le comportement natif du
        // clavier diffère, et un seul réglage laisse un champ sous le clavier
        // sur l'une des deux plateformes.
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        {body}
        {pied ? (
          // Le filet et le fond de carte DÉTACHENT la barre du contenu qui
          // défile dessous. Sans eux, un texte qui passe derrière donne
          // l'impression que la page s'arrête là où elle continue. En `card`
          // ils disparaissent : voir la table `FONDS`.
          <View className={`px-4 py-3 ${f.pied}`}>{pied}</View>
        ) : null}
      </KeyboardAvoidingView>
    </View>
  );
}
