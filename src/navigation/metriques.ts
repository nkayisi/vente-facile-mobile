/**
 * Mesures de la coquille, à un seul endroit.
 */

/**
 * Hauteur de la barre d'onglets, HORS zone sûre.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ 56 ÉTAIT FAUX DE SEPT POINTS, ET LA VALEUR ÉTAIT ÉCRITE DEUX FOIS.      │
 * │                                                                          │
 * │ `expo-router` vendorise `bottom-tabs` depuis le SDK 57, et sa constante  │
 * │ vaut 49 (`TABBAR_HEIGHT_UIKIT`, `views/BottomTabBar.js`) ;               │
 * │ `getTabBarHeight` rend `49 + insets.bottom`. Le `Fab` ajoutant son       │
 * │ propre écart de seize points, le bouton flottait à vingt-trois points de │
 * │ la barre : assez pour qu'on le lise détaché de l'écran plutôt que posé   │
 * │ dessus. La valeur vivait en outre dans deux fichiers, qui pouvaient      │
 * │ diverger sans que rien ne le signale.                                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ Ce n'est PAS la hauteur totale : la zone sûre s'y ajoute, et sur un iPhone
 * elle vaut trente-quatre points de plus. C'est donc à l'APPELANT d'ajouter
 * `insets.bottom`.
 *
 * ⚠ ET ELLE NE SERT QU'À CE QUI EST MONTÉ AU-DESSUS DU NAVIGATEUR D'ONGLETS.
 * Le `Toast` en est le seul cas : son fournisseur sert aussi les écrans plein
 * écran du comptoir, donc son cadre est la fenêtre entière. Un composant posé
 * DANS un écran d'onglet - un `Fab`, par exemple - n'a rien à ajouter : le
 * navigateur dimensionne la scène au-dessus de sa barre, et l'ajouter compte
 * la barre deux fois. Mesuré : quatre-vingt-neuf points de vide sous le `Fab`
 * de l'onglet Inventaire, contre seize après retrait. Voir `ui/fab.tsx`.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ POURQUOI PAS `useBottomTabBarHeight`, pour que le prochain ne le refasse │
 * │ pas.                                                                     │
 * │                                                                          │
 * │ Il est techniquement joignable - `expo-router/build/react-navigation/    │
 * │ bottom-tabs`, sans champ `exports`, donc sans dépendance nouvelle et     │
 * │ sans la seconde copie de react-navigation que `(tabs)/_layout.tsx`       │
 * │ interdit. Écarté quand même :                                            │
 * │                                                                          │
 * │  - `expo-router/build/**` est un chemin de BUILD privé, qui a déjà       │
 * │    changé de forme entre SDK. Une mise à jour d'Expo casserait l'import  │
 * │    à la compilation, sur un écran d'onglet, sans qu'aucun test le voie.  │
 * │  - la valeur qu'il rend INCLUT DÉJÀ `insets.bottom` : il faudrait donc   │
 * │    retirer l'addition chez l'appelant, croisement facile à rater qui     │
 * │    doublerait la zone sûre. `ui/doctrine.test.ts` porte une section      │
 * │    entière « un seul propriétaire par bord » parce que ce piège a déjà   │
 * │    été payé ici.                                                         │
 * │  - sa seule variabilité (`isCompact`) n'est vraie qu'en PAYSAGE sur      │
 * │    iPhone. Un POS Android en portrait, l'usage entier de ce produit,     │
 * │    rend toujours 49.                                                     │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export const HAUTEUR_ONGLETS = 49;
