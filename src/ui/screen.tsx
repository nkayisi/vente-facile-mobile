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
  RefreshControl,
  ScrollView,
  View,
} from "react-native";
import type { Edge } from "react-native-safe-area-context";

import { RetraitDesRangees, useDisposition, Volet } from "./disposition";
import {
  LARGEUR_MAX_PIED,
  classeDeFenetre,
  largeurMaxDe,
  margePage,
  type Gabarit,
} from "./disposition-regles";
import { useBordsDuVolet, useDansVoletDeListe } from "./volet-fiche";
import { useTheme } from "./theme";
import {
  BORDS_PAR_DEFAUT,
  rembourrageZoneSure,
  useMargesSysteme,
} from "./zone-sure";

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
   *
   * Le défaut est `BORDS_PAR_DEFAUT`, dans `zone-sure.ts` : la valeur et sa
   * raison vivent au même endroit que la marge qu'elle consomme.
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
  /**
   * La largeur maximale du contenu : `lecture` (défaut), `large`, `etroit`,
   * `plein`. Voir `disposition-regles.ts`.
   *
   * ┌────────────────────────────────────────────────────────────────────────┐
   * │ LE CONTENU EST CENTRÉ À SA LARGEUR, LE FOND RESTE PLEINE LARGEUR.      │
   * │                                                                        │
   * │ Sur le rk3568 (1 920 points), l'écran Imprimante étirait chaque rangée │
   * │ sur toute la largeur : le libellé à gauche, sa valeur à 1 900 points à │
   * │ droite, et l'oeil devait traverser l'écran pour les relier. Un         │
   * │ formulaire, une fiche ou une liste se lisent sur une colonne ; un      │
   * │ tableau de bord sur une grille plus large ; le comptoir prend tout.    │
   * └────────────────────────────────────────────────────────────────────────┘
   *
   * ⚠ RIEN NE CHANGE SUR UN TÉLÉPHONE, et c'est vérifié : la contrainte ne
   * s'écrit que lorsqu'elle MORD (volet plus large que le gabarit), et la
   * gouttière vaut zéro en `compact`. Les 115 écrans gardent leur géométrie.
   */
  gabarit?: Gabarit;
  className?: string;
}

export function Screen({
  children,
  edges = BORDS_PAR_DEFAUT,
  scroll = false,
  onRefresh,
  refreshing = false,
  padded = true,
  pied,
  centre = false,
  fond = "background",
  gabarit = "page",
  className = "",
}: ScreenProps) {
  const marges = useMargesSysteme();
  const { colors } = useTheme();
  const { largeur } = useDisposition();

  // Le calcul vit dans `zone-sure.ts`, et c'est ce qui le rend eprouvable sans
  // rendre un composant. `Screen` DELEGUE : s'il recalculait ici, le test pur
  // resterait vert sur un code que plus personne n'appellerait.
  //
  // ⚠ DANS UN VOLET DE FICHE, LES BORDS SONT CEUX DE L'ÉCRAN HÔTE (voir
  // `liste-fiche.tsx`) : une fiche posée à côté d'un onglet garde ainsi la
  // barre du haut de l'onglet pour seule marge, au lieu d'en ajouter une.
  const bordsDuVolet = useBordsDuVolet();
  const dansLaListe = useDansVoletDeListe();
  const pad = rembourrageZoneSure(bordsDuVolet ?? edges, marges);

  // ┌──────────────────────────────────────────────────────────────────────┐
  // │ LA GOUTTIÈRE S'AJOUTE AUX SEIZE POINTS QUE TOUT ÉCRAN POSE DÉJÀ.     │
  // │                                                                      │
  // │ 71 écrans sur 115 passent `padded={false}` et écrivent leur propre   │
  // │ `px-4`. Changer la marge de page écran par écran laisserait des      │
  // │ seize et des vingt-quatre côte à côte. Ici, la gouttière (8 points   │
  // │ hors téléphone) se pose AUTOUR de la boîte de contenu : seize plus   │
  // │ huit donnent les vingt-quatre du `lg:p-6` du web, partout à la fois. │
  // └──────────────────────────────────────────────────────────────────────┘
  //
  // ⚠ LA MARGE SUIT LA LARGEUR DU VOLET, PAS CELLE DE LA FENÊTRE. Une liste
  // posée dans un volet de 360 points, à côté de sa fiche, est un téléphone :
  // la gouttière de tablette y ajoutait huit points de chaque côté, pris sur
  // une colonne qui n'en a déjà pas assez.
  const max = largeurMaxDe(gabarit);
  const gouttiere = gabarit === "plein" ? 0 : margePage(classeDeFenetre(largeur)) - 16;
  const contraint = max !== null && largeur > max;
  const boite = {
    ...(contraint ? { width: "100%" as const, maxWidth: max, alignSelf: "center" as const } : null),
    ...(gouttiere > 0 ? { paddingHorizontal: gouttiere } : null),
  };
  // La largeur que les ENFANTS ont pour eux : une grille, un graphique ou un
  // volet lisent CETTE valeur, pas celle de la fenêtre.
  const largeurEnfants =
    Math.min(largeur, max ?? Number.POSITIVE_INFINITY) - 2 * gouttiere - (padded ? 32 : 0);

  const contenu = {
    ...boite,
    ...(padded
      ? gouttiere > 0
        ? { padding: 16, paddingHorizontal: 16 + gouttiere }
        : { padding: 16 }
      : null),
    ...(centre ? { flexGrow: 1, justifyContent: "center" as const } : null),
  };
  const enfants = (
    <RetraitDesRangees actif={(gouttiere > 0 || dansLaListe) && !padded}>
      <Volet largeur={largeurEnfants}>{children}</Volet>
    </RetraitDesRangees>
  );
  // Le comptoir et le scan gardent leur barre pleine largeur : c'est leur geste
  // principal, et le gabarit `plein` existe pour eux.
  const piedBorne = gabarit !== "plein" && largeurEnfants > LARGEUR_MAX_PIED;
  const actions = piedBorne ? (
    <View style={{ width: "100%", maxWidth: LARGEUR_MAX_PIED, alignSelf: "flex-end" }}>{pied}</View>
  ) : (
    pied
  );

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
      {enfants}
    </ScrollView>
  ) : (
    <View
      className={`flex-1 ${padded ? "p-4" : ""} ${centre ? "justify-center" : ""} ${className}`}
      style={
        gouttiere > 0 || contraint
          ? { ...boite, ...(padded ? { paddingHorizontal: 16 + gouttiere } : null) }
          : undefined
      }
    >
      {enfants}
    </View>
  );

  const f = FONDS[fond];

  return (
    <View className={`flex-1 ${f.page}`} style={pad}>
      <KeyboardAvoidingView
        className="flex-1"
        // ┌──────────────────────────────────────────────────────────────┐
        // │ `padding` SUR LES DEUX PLATEFORMES, comme `Sheet` (lot L6).  │
        // │                                                              │
        // │ `height` comptait sur Android pour redimensionner la         │
        // │ fenêtre (`adjustResize`), ce que le bord-à-bord n'assure     │
        // │ plus. Relevé sur l'émulateur le 2026-11-14 : clavier ouvert, │
        // │ tout le pied du panier - récapitulatif et champ de remise -  │
        // │ passait SOUS le clavier, et le caissier tapait une remise    │
        // │ qu'il ne voyait pas. `padding` se calcule depuis la position │
        // │ du clavier par rapport à la vue : si la fenêtre se           │
        // │ redimensionne malgré tout, l'écart vaut zéro.                │
        // └──────────────────────────────────────────────────────────────┘
        behavior="padding"
      >
        {body}
        {pied ? (
          // Le filet et le fond de carte DÉTACHENT la barre du contenu qui
          // défile dessous. Sans eux, un texte qui passe derrière donne
          // l'impression que la page s'arrête là où elle continue. En `card`
          // ils disparaissent : voir la table `FONDS`.
          <View className={`px-4 py-3 ${f.pied}`}>
            {/* Le fond et le filet restent pleine largeur ; les boutons, eux, se
                rangent à droite (`LARGEUR_MAX_PIED`). Étirés sur 1 600 points,
                ils se liraient comme un bandeau. */}
            {gouttiere > 0 || contraint ? (
              // ⚠ Dans une colonne CONTRAINTE, le `px-4` de la barre ne compte
              // plus (la boîte est centrée à sa largeur max) : sans les seize
              // points rendus ici, les boutons débordaient les cartes au-dessus
              // de quatorze points de chaque côté.
              <View style={contraint ? { ...boite, paddingHorizontal: gouttiere + 16 } : boite}>
                {actions}
              </View>
            ) : (
              actions
            )}
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </View>
  );
}
