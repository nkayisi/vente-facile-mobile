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

## Démarrer sur un émulateur ou un appareil

### Ce qu'il faut avoir

| | |
| --- | --- |
| Node | 22 ou plus |
| pnpm | 10 ou plus (`corepack enable`) |
| JDK | 17 (celui d'Android Studio convient) |
| Android SDK | `ANDROID_HOME` posé, un AVD ou un appareil en débogage USB |
| Xcode | pour iOS seulement, cible de déploiement iOS 16.4 |

**`pnpm` est obligatoire**, avec `node-linker=hoisted` (déjà dans `.npmrc`) :
l'autolinking natif de React Native parcourt `node_modules` à plat et ne suit
pas les liens symboliques. Un `npm install` produit un arbre que le build
Android ne sait pas lire, et l'erreur ne le dit pas.

**Le niveau d'API Android est choisi par le greffon `expo-root-project`**, pas
par ce dépôt : laissez Android Studio installer ce que le build réclame plutôt
que de le figer ici. Côté iOS, le composant de plateforme correspondant doit
être installé (Xcode > Settings > Components), faute de quoi le lien échoue sur
une erreur qui ne parle pas de code.

### Le backend doit tourner d'abord

L'application est hors-ligne d'abord, mais **l'enrôlement du premier appareil
exige le réseau** : sans backend, on ne dépasse pas l'écran de connexion. Depuis
la racine du dépôt :

```bash
docker compose up -d          # db, redis, vf_backend, celery, frontend
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8005/api/v1/
# 401 = debout (l'API exige un jeton), 000 = pas encore prêt
```

### Première fois : construire et installer

```bash
pnpm install
pnpm android                  # ou `pnpm ios`
```

`pnpm android` **construit ET installe** le client de développement, puis lance
Metro. Ce n'est pas Expo Go : le projet embarque des modules natifs (SQLite,
Bluetooth, SVG) qu'Expo Go ne porte pas. Comptez plusieurs minutes la première
fois, quelques secondes ensuite.

L'application s'installe sous le nom **VF (dev)**, identifiant
`com.ventefacile.app.dev`. Le suffixe existe pour que la préproduction et la
production cohabitent sur le même terminal (voir « Profils de compilation »).

### Ensuite : Metro seul suffit

Le binaire natif ne change que si une dépendance NATIVE bouge. Au quotidien :

```bash
pnpm start                    # puis ouvrir « VF (dev) » sur l'appareil
```

Si l'application s'ouvre sur l'écran de choix du bundler, elle est déjà prête :
saisissez l'adresse affichée par Metro. Pour éviter la saisie, on peut la lui
passer par lien profond :

```bash
# Émulateur Android : 10.0.2.2 est la machine hôte vue depuis l'émulateur
adb shell am start -a android.intent.action.VIEW \
  -d "ventefacile://expo-development-client/?url=http%3A%2F%2F10.0.2.2%3A8081"
```

### ⚠ L'adresse de l'API se DÉDUIT de l'hôte Metro

C'est le point qui coûte le plus de temps quand on ne le sait pas.
[src/api/config.ts](src/api/config.ts) ne code aucune adresse en dur : en
développement il prend l'hôte du bundler et y ajoute le port `8005`. L'adresse
du backend suit donc celle de Metro, et une erreur sur l'une se voit sur
l'autre.

| Cible | Hôte Metro à donner | API jointe |
| --- | --- | --- |
| Émulateur Android | `10.0.2.2:8081` | `http://10.0.2.2:8005/api/v1` |
| Appareil physique (même Wi-Fi) | l'IP LAN de la machine, `192.168.x.y:8081` | `http://192.168.x.y:8005/api/v1` |
| Appareil physique (USB) | `localhost:8081` après `adb reverse` | `http://localhost:8005/api/v1` |

```bash
# Appareil branché en USB : les deux ports, pas seulement celui de Metro
adb reverse tcp:8081 tcp:8081
adb reverse tcp:8005 tcp:8005
```

⚠ **`localhost` désigne l'appareil, pas votre machine.** Le donner à un
émulateur sans `adb reverse` le fait chercher Metro et l'API chez lui, où il n'y
a rien. Le bundle peut alors se charger depuis le cache et donner l'illusion que
tout va bien, jusqu'à ce que la première requête échoue : on croit à une panne
du backend là où c'est l'adresse qui est fausse.

### Premier lancement de l'application

1. **Connexion** : l'adresse et le mot de passe d'un compte du back-office.
2. **Choix de l'organisation**, si le compte en sert plusieurs.
3. **Enrôlement** : le serveur attribue à l'appareil son code de quatre
   caractères, celui qui numérote les documents (`VT-20260909-Q5L8-0001`).
4. **Code de verrouillage** de quatre à six chiffres, saisi deux fois puis
   redemandé à chaque ouverture. Il est LOCAL : il ne déverrouille pas le
   compte, il déverrouille ce terminal.

La première synchronisation tire une trentaine de tables et peut prendre une
minute. Les suivantes ne coûtent qu'une requête quand rien n'a changé.

### Recharger, inspecter

```bash
adb shell input keyevent 82        # menu développeur (Reload, DevTools…)
adb logcat -s ReactNativeJS        # les journaux de l'application
adb exec-out screencap -p > /tmp/ecran.png
```

### Vérifier avant de livrer

```bash
pnpm type-check            # tsc sur DEUX configurations : le code applicatif
                           # ne voit ni les types de Jest ni ceux de Node
pnpm test                  # Jest
pnpm lint
```

### Quand ça ne démarre pas

| Symptôme | Cause la plus fréquente |
| --- | --- |
| « Aucune connexion » à l'écran de connexion | l'hôte Metro n'est pas joignable depuis l'appareil (voir le tableau ci-dessus) |
| L'application se charge mais l'API répond en erreur | le backend n'écoute pas sur `8005`, ou `adb reverse tcp:8005` manque |
| Le build Android échoue sur un module natif | l'arbre `node_modules` a été installé par npm ou yarn : `rm -rf node_modules && pnpm install` |
| Un module natif ajouté n'est pas trouvé | il faut reconstruire : `pnpm android`, pas `pnpm start` |
| La base locale refuse de migrer | désinstaller l'application efface la base et repart de zéro (les opérations non poussées sont PERDUES) |

Les dossiers `ios/` et `android/` ne sont pas versionnés : ils se régénèrent par
`npx expo prebuild --clean`. Cette commande **écrase** toute modification faite à
la main dedans.

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

**Les treize lots sont livrés**, du socle à la mise en production :

| Lot | Contenu |
| --- | --- |
| 0 | Socle : thème clair et sombre, design system, base locale migrée, profils de compilation |
| 1 | Session : connexion, enrôlement, verrou par code, démarrage hors ligne, garde de navigation |
| 2 | Schéma local complet (31 tables engendrées) et tirage par curseurs |
| 3 | Journal d'opérations : file d'attente, verdict par opération, quarantaine |
| 4 | Le comptoir : POS, sélecteur de quantité gros/détail, scan, encaissement, numérotation, mise en attente de panier |
| 5 | Impression : ESC/POS, quatre transports, documents, file d'impression |
| 6 à 8 | Ventes et clients, stock, inventaire et catalogue |
| 9 à 11 | Caisse et tableau de bord, rapports et administration, retours, devis, abonnement |
| 12 | iOS, mises à jour par-dessus l'air, rapport de plantage, bascule depuis l'ancienne application |

Ce qui reste avant la mise en production ne tient pas à du code : un compte EAS,
un DSN Sentry, le composant de plateforme Xcode, la revue App Store, le portage
du module natif de l'imprimante intégrée, et la calibration papier sur un POS
physique.

Le détail de chaque lot est dans le message de son commit : motif, défauts de
l'ancienne application évités, et vérification sur émulateur contre le vrai
backend. **`git log` est la source de vérité** ; ce tableau n'en est que
l'index, et le suivi complet est tenu dans le `CLAUDE.md` racine, section 5.4.

## Impression

ESC/POS est le dénominateur commun des imprimantes thermiques, tous fabricants
et tous transports confondus. On l'encode **une fois** (`render-escpos.ts`, via
`@point-of-sale/receipt-printer-encoder`, un paquet sans code natif), puis on se
contente d'**acheminer** les octets. Ajouter un transport ne touche aucun écran.

| Transport | Matériel | Paquet |
| --- | --- | --- |
| `embedded` | imprimante intégrée d'un terminal (NYX, Sunmi…) | module Expo local, à porter |
| `bluetooth` | Bluetooth classique (SPP), la majorité des 58 mm | `react-native-bluetooth-classic` |
| `ble` | Bluetooth basse consommation, modèles récents | `react-native-ble-plx` |
| `pdf` | repli universel, et envoi au client | `expo-print` + `expo-sharing` |

Une seule mise en page (`render-text.ts`, 42 colonnes mesurées sur 58 mm), deux
encodages : le ticket d'une imprimante Bluetooth et celui du terminal ne peuvent
pas diverger.

**Avant de toucher aux 42 colonnes** : imprimer la règle de calibration depuis
l'écran Imprimante, la photographier, compter. Ne jamais déduire la largeur d'un
calcul.

Restent au transport `embedded` : le portage du module natif du terminal (il
exige une reconstruction native, et sa source est dans l'archive git de
l'ancienne application), et la calibration à la photo sur un POS physique. Ces
deux points demandent du matériel, pas du code.

**Sur iOS, le Bluetooth CLASSIQUE n'existe pas**, et l'écran le dit : le module
passe par `ExternalAccessory`, qui n'expose que les accessoires certifiés MFi
par Apple, ce que les 58 mm du marché ne sont pas. La chaîne descend au BLE puis
au PDF, ce dernier étant toujours disponible.
