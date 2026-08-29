# Vente Facile, application marchand

Back-office marchand sur Android et iOS, **utilisable sans réseau**.

C'est la condition d'usage en RDC : une boutique peut passer plusieurs jours
sans connexion, et le point de vente doit continuer d'encaisser, d'imprimer et
de tenir sa caisse. Tout ce qui est écrit hors ligne part ensuite au serveur par
le même chemin métier que le back-office web, jamais par un chemin parallèle.

## Socle

| | |
| --- | --- |
| Expo SDK | 57 (React Native 0.86, nouvelle architecture) |
| Navigation | expo-router, routes typées |
| Base locale | expo-sqlite + Drizzle ORM |
| Style | NativeWind, jetons partagés avec le web |
| Règles métier | `@vente-facile/core`, le même paquet que le back-office |

**expo-sqlite plutôt que WatermelonDB** : WatermelonDB n'a plus été publié
depuis juillet 2025 et sa dernière version est antérieure à trois versions de
React Native. Pour la colonne vertébrale du hors-ligne, un paquet maintenu en
phase avec le SDK vaut mieux qu'un paquet éprouvé mais figé. Le coût est faible :
l'architecture de synchronisation n'utilisait de toute façon pas son
`synchronize()`, seulement son schéma et ses observables, remplacés par les
migrations Drizzle et `useLiveQuery`.

## Démarrer

```bash
pnpm install
pnpm start                 # serveur de développement
pnpm android               # sur un appareil ou un émulateur
pnpm type-check
```

`pnpm` est obligatoire, avec `node-linker=hoisted` (déjà dans `.npmrc`) :
l'autolinking natif de React Native parcourt `node_modules` à plat et ne suit
pas les liens symboliques.

Les dossiers `ios/` et `android/` ne sont pas versionnés : ils se régénèrent par
`npx expo prebuild --clean`.

## Base locale

```bash
pnpm db:generate           # apres toute modification de src/db/schema/
pnpm db:studio             # inspecter la base
```

Les migrations sont **embarquées dans le bundle** (`drizzle/migrations.js`, via
`babel-plugin-inline-import`) : rien à lire sur le disque, donc rien qui puisse
manquer sur un appareil hors ligne. Elles s'appliquent au démarrage dans
`src/db/provider.tsx`, et une migration en échec affiche un écran explicite
plutôt que de laisser l'application démarrer sur une base à moitié transformée.

Trois familles de tables, déclarées et alignées sur le serveur :

| Famille | Écriture locale | Synchronisation |
| --- | --- | --- |
| `pulled` | interdite | tirée du serveur |
| `writable` | autorisée | poussée par le journal d'opérations |
| `local` | autorisée | jamais synchronisée |

L'ancienne application laissait cet alignement implicite et il avait divergé :
elle poussait des catégories que le serveur jetait en silence, tout en les
marquant « synchronisées ».

## Profils de compilation

`app.config.ts` calcule le nom, l'identifiant natif et l'URL d'API depuis
`EAS_BUILD_PROFILE`, pour que les trois variantes cohabitent sur un même
terminal :

| Profil | Nom affiché | Identifiant |
| --- | --- | --- |
| `development` | VF (dev) | `com.ventefacile.app.dev` |
| `preview` | VF (préprod) | `com.ventefacile.app.preview` |
| `production` | Vente Facile | `com.ventefacile.app` |

Le profil `preview` produit un **APK** et non un AAB : on l'installe à la main
sur un POS, sans passer par le Play Store.

## Conventions

- **Aucun écran n'importe `react-native` pour du style.** Texte, bouton, carte
  et couleur passent par `src/ui/`. C'est ce qui tient les jetons, les cibles
  tactiles et le thème à un seul endroit.
- **Aucune variante `dark:`.** Les composants lisent `bg-card`,
  `text-muted-foreground` ; `ThemeProvider` décide ce que ces noms valent.
- **Aucune couleur en dur.** `<Icon color="mutedForeground" />`, jamais
  `#6b7280` : une couleur écrite en dur reste claire en thème sombre.
- **Les montants s'écrivent en entier**, jamais abrégés. Quand la place manque,
  c'est la taille du texte qui cède. Règle portée par `@vente-facile/core`.
- **Les décimales voyagent en chaîne de caractères**, jamais en `number` : un
  panier en francs congolais à sept chiffres perd ses unités en virgule
  flottante.
- **Cibles tactiles** : 44 points partout, 56 au point de vente.
- Libellés d'interface et commentaires métier **en français**, identifiants en
  anglais. Pas de tiret cadratin.

## État

Cinq lots livrés, du socle au comptoir :

| Lot | Contenu |
| --- | --- |
| 0 | Socle : thème clair et sombre, design system, base locale migrée, profils de compilation |
| 1 | Session : connexion, enrôlement, verrou par code, démarrage hors ligne, garde de navigation |
| 2 | Schéma local complet (31 tables engendrées) et tirage par curseurs |
| 3 | Journal d'opérations : file d'attente, verdict par opération, quarantaine |
| 4 | Le comptoir : POS, sélecteur de quantité gros/détail, scan, encaissement, numérotation |

Le détail de chaque lot est dans le message de son commit : motif, défauts de
l'ancienne application évités, et vérification sur émulateur contre le vrai
backend.

Le découpage complet (13 lots, 0 à 12) vient du plan approuvé
`maintenant-dans-ce-projet-polished-seahorse.md`, à la racine du dépôt, et son
suivi est tenu dans le `CLAUDE.md` racine, section 5.4. Une réserve sur le lot 4 :
la **mise en attente de panier** n'est pas livrée.

Prochain lot : **le lot 5, l'impression** (`src/printing/` est encore vide, alors
que `@vente-facile/core` décrit déjà les documents en blocs). Il ferme le jalon
pilote : à l'issue des lots 0 à 5, un caissier travaille toute la journée hors
ligne et imprime.
