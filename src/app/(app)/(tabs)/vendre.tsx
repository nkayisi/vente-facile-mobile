/**
 * Le comptoir : chercher un article, le mettre au panier, encaisser.
 *
 * Tout se lit dans la base locale. Aucun appel réseau n'est fait ici, et aucun
 * n'est attendu : c'est la promesse de l'application, et c'est aussi ce qui
 * rend la grille instantanée quand le réseau est mauvais plutôt qu'absent.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, View } from "react-native";
import { router, useFocusEffect } from "expo-router";

import { formatDateTimeFr, formatTimeFr, litTousLesEntrepots } from "@vente-facile/core";

import {
  articleParCodeBarres,
  categoriesVendables,
  chercherArticles,
  diagnostiquerCatalogue,
  type ArticlePos,
} from "@/features/pos/catalogue";
import { messageGrilleVide, type DiagnosticCatalogue } from "@/features/pos/etat-catalogue";
import { membreDeLaSession } from "@/features/perimetre/entrepots";
import { accord, pluriel } from "@/data/accord";
import { prixAvecEquivalent } from "@/features/pos/affichage-devise";
import { useMonnaie } from "@/data/devises";
import { ChampsFonds } from "@/features/caisse/champs-fonds";
import { devisesDuFonds, lireFonds } from "@/features/caisse/fond";
import { compterEnAttente } from "@/features/pos/attente";
import { libelleEnvoi } from "@/data/envoi";
import { arreteA } from "@/features/pos/verrou-inventaire";
import { ouvrirSession, sessionOuverte, caissesDisponibles, type CaissePos, type SessionCaisse } from "@/features/pos/caisse";
import { CarteArticle } from "@/features/pos/carte-article";
import { FeuilleEncaissement } from "@/features/pos/feuille-encaissement";
import { SelecteurDuComptoir } from "@/features/pos/selecteur-du-comptoir";
import { aLaFormeDUnCode, BandeauCodeIntrouvable } from "@/features/pos/bandeau-code-introuvable";
import { CHAMP_RECHERCHE_COMPTOIR } from "@/features/pos/lecteur-codes";
import { useScanComptoir } from "@/features/pos/use-scan-comptoir";
import {
  phraseDejaEnFile,
  usePropositionCreation,
} from "@/features/inventaire/use-proposition-creation";
import { usePanier } from "@/features/pos/panier";
import {
  colonnesDeLaGrille,
  completerRangee,
  formeDeLaCarte,
  panneauDuComptoir,
} from "@/features/pos/disposition-comptoir";
import { PanneauPanier } from "@/features/pos/panneau-panier";
import { useSynchronisation } from "@/features/sync/provider";
import { useSession } from "@/session/provider";
import {
  Banner, Button, Chip, ChipRow, EmptyState, Icon, Input, Pressable, Screen, Spinner, Text,
  afficheLibelles, useDisposition,
} from "@/ui";
import { LARGEUR_PANNEAU_PANIER } from "@/ui/disposition-regles";

export default function Comptoir() {
  const { snapshot } = useSession();
  const panier = usePanier();
  // La largeur de la PAGE, navigation retirée : c'est elle qui dit si le
  // panier tient à côté de la grille, et combien de colonnes la grille porte.
  const { largeur: largeurPage } = useDisposition();
  const avecPanneau = panneauDuComptoir(largeurPage);
  const colonnes = colonnesDeLaGrille(largeurPage);
  const formeCarte = formeDeLaCarte(largeurPage);

  const [session, setSession] = useState<SessionCaisse | null | undefined>(undefined);
  const [articles, setArticles] = useState<ArticlePos[]>([]);
  // Ce que la table CONTIENT, relevé seulement quand la grille sort vide : sur
  // une grille pleine il n'y a rien à expliquer, et ce comptage balaie tout.
  const [diagnostic, setDiagnostic] = useState<DiagnosticCatalogue | null>(null);
  const [rubriques, setRubriques] = useState<{ id: string; name: string }[]>([]);
  const [terme, setTerme] = useState("");
  const [rubrique, setRubrique] = useState<string | null>(null);
  const [chargement, setChargement] = useState(true);
  const [choisi, setChoisi] = useState<ArticlePos | null>(null);
  const [encaissement, setEncaissement] = useState(false);
  const [paniersRanges, setPaniersRanges] = useState(0);
  // Depuis quand l'état des inventaires est-il celui qu'on oppose ? Un verrou
  // est l'instantané d'un état concurrent, pas une autorité : le dire est ce
  // qui distingue « attendez la fin du comptage » de « votre appareil est en
  // retard, synchronisez ».
  const [verrouArreteA, setVerrouArreteA] = useState<Date | null>(null);
  // Une vente vient d'être mise en file : la grille doit relire le stock que
  // la réserve locale en déduit. Voir `onVenteEnregistree`.
  const [relecture, setRelecture] = useState(0);
  // Le champ de recherche a-t-il le focus ? Ce qu'un lecteur de codes « tape »
  // y est alors ajouté, comme le navigateur le fait sur le web.
  const [rechercheFocalisee, setRechercheFocalisee] = useState(false);
  // Le dernier code scanné qu'aucun article ne porte.
  const [introuvable, setIntrouvable] = useState<string | null>(null);

  // Rechargement au retour sur l'écran : une synchronisation a pu passer, et
  // un stock périmé fait refuser des ventes possibles.
  useFocusEffect(
    useCallback(() => {
      sessionOuverte().then(setSession);
      // Le compteur se relit au retour sur la grille : on vient peut-être d'y
      // ranger un panier, ou d'en reprendre un.
      compterEnAttente().then(setPaniersRanges);
      arreteA().then(setVerrouArreteA);
    }, [])
  );

  useEffect(() => {
    categoriesVendables().then(setRubriques);
  }, []);

  const entrepot = session?.warehouseId ?? null;

  // ┌──────────────────────────────────────────────────────────────────────┐
  // │ UN CODE EXACT VALIDÉ DANS LA RECHERCHE OUVRE LA SAISIE DE QUANTITÉ.  │
  // │                                                                      │
  // │ Les terminaux à lecteur intégré « tapent » le code puis valident :   │
  // │ sans ce chemin, le scan y aboutissait à une grille filtrée d'un seul │
  // │ article, qu'il fallait encore toucher. Un terme qui n'est pas un     │
  // │ code exact ne fait rien de plus que la recherche.                    │
  // └──────────────────────────────────────────────────────────────────────┘
  const validerTerme = async () => {
    const code = terme.trim();
    if (!code) return;
    const article = await articleParCodeBarres(code, entrepot);
    if (article) {
      setTerme("");
      setIntrouvable(null);
      setChoisi(article);
      return;
    }
    // Comme l'Entrée de la recherche du web : un terme qui a la forme d'un
    // code-barres et que rien ne porte le DIT, et propose de créer l'article.
    if (aLaFormeDUnCode(code)) {
      setTerme("");
      setIntrouvable(code);
    }
  };

  // ┌──────────────────────────────────────────────────────────────────────┐
  // │ LE LECTEUR DE CODES INTÉGRÉ, COMME LA DOUCHETTE DU BACK-OFFICE.      │
  // │                                                                      │
  // │ Un scan, où que soit le doigt, ouvre la saisie de l'article. Un code │
  // │ inconnu le dit. Rien pendant l'encaissement. Voir                    │
  // │ `features/pos/use-scan-comptoir.ts`, et la règle dans le noyau.      │
  // └──────────────────────────────────────────────────────────────────────┘
  useScanComptoir({
    actif: session != null,
    entrepot,
    recherche: () => ({ focalisee: rechercheFocalisee, terme }),
    surTerme: setTerme,
    surValider: () => void validerTerme(),
    surTrouve: (article) => {
      setIntrouvable(null);
      setChoisi(article);
    },
    surIntrouvable: setIntrouvable,
  });

  // Au retour sur l'écran, le code introuvable est cherché de nouveau : on
  // revient peut-être de le créer (le web : `visibilitychange`). Une création
  // encore en file ne se trouve qu'après la synchronisation, et le bandeau le
  // dit d'ici là.
  const introuvableRelu = useRef(introuvable);
  useEffect(() => {
    introuvableRelu.current = introuvable;
  });
  useFocusEffect(
    useCallback(() => {
      const code = introuvableRelu.current;
      if (!code) return;
      void articleParCodeBarres(code, entrepot).then((article) => {
        if (!article || introuvableRelu.current !== code) return;
        setIntrouvable(null);
        setChoisi(article);
      });
    }, [entrepot, setChoisi, setIntrouvable])
  );
  // ┌──────────────────────────────────────────────────────────────────────┐
  // │ TOUT LE CATALOGUE VENDABLE ; LE STOCK EST CELUI DE LA CAISSE.       │
  // │                                                                      │
  // │ Le comptoir bornait sa grille au périmètre du membre : un article du │
  // │ dépôt d'en face était introuvable, donc impossible à chiffrer. Seul  │
  // │ un membre qui lit TOUS les entrepôts (propriétaire, case « Consulter │
  // │ tous ») voit en plus où l'article reste disponible - décision 4.     │
  // └──────────────────────────────────────────────────────────────────────┘
  const avecAilleurs = useMemo(
    () => litTousLesEntrepots(membreDeLaSession(snapshot?.membership)),
    [snapshot?.membership]
  );

  // ┌──────────────────────────────────────────────────────────────────────┐
  // │ CHAQUE PRIX PORTE SON ÉQUIVALENT, ET IL N'Y A PLUS RIEN À CHOISIR.   │
  // │                                                                      │
  // │ T10 du retour de test : un marchand dont le catalogue est tenu en    │
  // │ dollars doit pouvoir annoncer un prix en francs sans calculer de     │
  // │ tête. La rangée « Afficher en » faisait choisir la devise de cet     │
  // │ affichage ; la carte écrit désormais « 1 150 $ (2 645 000 FC) »      │
  // │ d'elle-même. La FACTURE reste en devise principale, le ticket n'est  │
  // │ pas touché, et le converti ne paraît jamais seul.                    │
  // │                                                                      │
  // │ `useMonnaie()` et non `panier.devises` : la seconde est la table      │
  // │ d'ARITHMÉTIQUE du panier, celle-ci l'aide d'AFFICHAGE, et elle seule │
  // │ porte la liste des devises actives.                                  │
  // └──────────────────────────────────────────────────────────────────────┘
  const money = useMonnaie();

  // Recherche différée : à chaque frappe, la requête part 250 ms plus tard, et
  // une frappe suivante annule la précédente. Sans cela, taper « coca » lance
  // quatre requêtes dont trois seront jetées.
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (session === undefined) return;
    setChargement(true);
    if (minuteur.current) clearTimeout(minuteur.current);

    // ┌──────────────────────────────────────────────────────────────────────┐
    // │ UNE RÉPONSE PÉRIMÉE NE DOIT PAS VIDER UNE GRILLE JUSTE.             │
    // │                                                                      │
    // │ Le nettoyage n'annulait QUE le minuteur : une requête déjà partie    │
    // │ n'était gardée par rien. Taper « co » sur un catalogue où « co » ne  │
    // │ trouve rien lance le diagnostic, qui BALAIE toute la table ;         │
    // │ pendant ce temps « coca » résout vite et peuple la grille ; le       │
    // │ rappel périmé finit EN DERNIER et appelle `setArticles([])` plus     │
    // │ `setDiagnostic(...)`. Il vide donc une grille qui venait d'afficher  │
    // │ les bons articles, et y attache une cause mesurée pour une autre     │
    // │ requête.                                                             │
    // │                                                                      │
    // │ ⚠ LA GARDE EST LUE APRÈS L'`await`, pas seulement avant : c'est     │
    // │   l'attente du diagnostic qui ouvre la fenêtre.                      │
    // └──────────────────────────────────────────────────────────────────────┘
    let annule = false;

    minuteur.current = setTimeout(() => {
      chercherArticles({ warehouseId: entrepot, terme, categoryId: rubrique, avecAilleurs })
        .then(async (trouves) => {
          if (annule) return;
          setArticles(trouves);
          // ┌──────────────────────────────────────────────────────────────┐
          // │ LE DIAGNOSTIC NE SE PAIE QUE SUR UNE GRILLE VIDE.           │
          // │                                                              │
          // │ Et il doit être posé AVANT que l'état vide ne s'affiche,     │
          // │ sinon l'écran rend un message par défaut le temps d'un       │
          // │ aller-retour - c'est-à-dire qu'il affirme une cause qu'il    │
          // │ n'a pas encore mesurée, le défaut même qu'on referme.        │
          // └──────────────────────────────────────────────────────────────┘
          if (trouves.length !== 0) {
            setDiagnostic(null);
            return;
          }
          const compte = await diagnostiquerCatalogue();
          if (annule) return;
          setDiagnostic({
            ...compte,
            recherche: terme.trim().length > 0,
            rubrique: rubrique !== null,
          });
        })
        .finally(() => {
          if (!annule) setChargement(false);
        });
    }, 250);

    return () => {
      annule = true;
      if (minuteur.current) clearTimeout(minuteur.current);
    };
  }, [terme, rubrique, entrepot, session, avecAilleurs, relecture]);

  const quantitesAuPanier = useMemo(() => {
    const carte = new Map<string, number>();
    for (const l of panier.etat.lignes) carte.set(l.product.id, l.quantity);
    return carte;
  }, [panier.etat.lignes]);

  if (session === undefined) {
    return (
      <Screen edges={[]}>
        <View className="flex-1 items-center justify-center">
          <Spinner />
        </View>
      </Screen>
    );
  }

  if (session === null) {
    return <OuvertureCaisse onOuverte={setSession} />;
  }

  const nbLignes = panier.etat.lignes.length;
  const ruptures = panier.ruptures;

  const corps = (
    <>
      <View className="flex-row items-center gap-2 pt-2">
        <View className="flex-1">
          <Text variant="h4" numberOfLines={1}>
            {session.registerName}
          </Text>
          {/* Une ouverture BLOQUÉE ne part pas d'elle-même : le dire ici est
              le seul endroit où le caissier peut l'apprendre avant de vendre
              toute la journée sur une session que le serveur refusera. */}
          {libelleEnvoi(session.envoi) ? (
            <Text
              variant="caption"
              className={
                session.envoi === "bloque"
                  ? "text-warning"
                  : "text-muted-foreground"
              }
            >
              {session.envoi === "bloque"
                ? "Ouverture bloquée : abonnement ou droit manquant"
                : "Ouverture en attente d'envoi"}
            </Text>
          ) : null}
        </View>
        {paniersRanges > 0 ? (
          <Pressable
            onPress={() => router.push("/pos/attente")}
            className="h-11 w-11 items-center justify-center rounded-full active:bg-muted"
            accessibilityLabel={`${paniersRanges} panier${paniersRanges > 1 ? "s" : ""} en attente`}
          >
            <Icon name="PauseCircle" size={24} />
            <View className="absolute right-1 top-1 h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1">
              <Text variant="caption" className="text-primary-foreground">
                {paniersRanges}
              </Text>
            </View>
          </Pressable>
        ) : null}
        <Pressable
          onPress={() => router.push("/pos/scan")}
          className={`h-11 ${
            afficheLibelles(largeurPage) ? "flex-row gap-2 px-3" : "w-11"
          } items-center justify-center rounded-full active:bg-muted`}
          accessibilityLabel="Scanner un code-barres"
        >
          {/* La police d'icônes arrive après le premier rendu : la boîte réserve
              sa place, sinon le libellé sauterait à son chargement. */}
          <View className="h-7 w-7 items-center justify-center">
            <Icon name="ion:barcode-outline" size={24} />
          </View>
          {afficheLibelles(largeurPage) ? (
            <Text variant="bodySmall" numberOfLines={1} className="font-sans-medium">
              Scanner
            </Text>
          ) : null}
        </Pressable>
      </View>

      <View className="mt-2">
        <Input
          // Le seul champ dont le lecteur de codes prend les touches.
          nativeID={CHAMP_RECHERCHE_COMPTOIR}
          value={terme}
          onChangeText={setTerme}
          onFocus={() => setRechercheFocalisee(true)}
          onBlur={() => setRechercheFocalisee(false)}
          placeholder="Nom, code ou référence"
          leading={<Icon name="Search" size={18} color="mutedForeground" />}
          autoCorrect={false}
          returnKeyType="search"
          onSubmitEditing={() => void validerTerme()}
        />
      </View>

      {introuvable ? (
        <View className="mt-2">
          <BandeauCodeIntrouvable code={introuvable} onFermer={() => setIntrouvable(null)} />
        </View>
      ) : null}

      {rubriques.length > 0 ? (
        <View className="mt-2">
          <ChipRow>
            <Chip label="Tout" actif={rubrique === null} onPress={() => setRubrique(null)} />
            {rubriques.map((r) => (
              <Chip
                key={r.id}
                label={r.name}
                actif={r.id === rubrique}
                onPress={() => setRubrique(r.id)}
              />
            ))}
          </ChipRow>
        </View>
      ) : null}

      <BandeauInventaire articles={articles} arrete={verrouArreteA} />

      {chargement && articles.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : articles.length === 0 ? (
        <GrilleVide diagnostic={diagnostic} terme={terme} />
      ) : (
        <FlatList
          // ┌──────────────────────────────────────────────────────────────┐
          // │ LES COLONNES SUIVENT LA LARGEUR DE LA GRILLE.               │
          // │                                                              │
          // │ Deux sur un téléphone, jusqu'à six sur le rk3568, chaque    │
          // │ carte gardant la largeur d'un nom sur deux lignes et d'un    │
          // │ prix écrit en entier. ⚠ La `key` suit le nombre de colonnes : │
          // │ une `FlatList` refuse qu'on change `numColumns` à chaud, et  │
          // │ une tablette qu'on tourne en change.                         │
          // └──────────────────────────────────────────────────────────────┘
          key={`grille-${colonnes}`}
          data={completerRangee(articles, colonnes)}
          keyExtractor={(a, i) => a?.id ?? `vide-${i}`}
          numColumns={colonnes}
          columnWrapperClassName="gap-3"
          // La barre du bas d'un téléphone recouvre la fin de la grille : on
          // lui réserve sa hauteur. Sur une tablette, l'encaissement vit dans
          // le panneau, et rien ne recouvre la grille.
          contentContainerClassName={avecPanneau ? "gap-3 pb-4 pt-3" : "gap-3 pb-40 pt-3"}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) =>
            // Une cellule vide complète la dernière rangée : sans elle, une
            // carte isolée s'étirerait sur toute la largeur.
            item === null ? (
              <View className="flex-1" />
            ) : (
              <CarteArticle
                article={item}
                prix={panier.argent(Number(item.selling_price), panier.devises.primary)}
                prixEquivalent={
                  // Vendu en gros seulement, c'est le prix du contenant qu'on
                  // annonce : l'équivalent doit suivre celui-là.
                  prixAvecEquivalent(
                    Number(
                      item.selling_mode === "wholesale_only"
                        ? item.wholesale_price
                        : item.selling_price
                    ),
                    money
                  ).equivalent
                }
                prixGros={
                  item.wholesale_price
                    ? panier.argent(Number(item.wholesale_price), panier.devises.primary)
                    : null
                }
                auPanier={quantitesAuPanier.get(item.id) ?? 0}
                entrepot={session.warehouseName}
                forme={formeCarte}
                onPress={() => setChoisi(item)}
              />
            )
          }
        />
      )}
    </>
  );

  // ┌──────────────────────────────────────────────────────────────────────┐
  // │ UN SEUL ARBRE POUR LES DEUX DISPOSITIONS, ET C'EST VOULU.            │
  // │                                                                      │
  // │ Une tablette qu'on tourne passe de l'une à l'autre. Si la feuille    │
  // │ d'encaissement vivait dans deux branches différentes, elle se        │
  // │ refermerait au milieu d'un paiement, montant reçu perdu, client      │
  // │ devant le comptoir. Elle garde donc son rang dans `Screen` quelle    │
  // │ que soit la disposition, et c'est le comptoir qui l'ouvre, panneau   │
  // │ compris (`onEncaisser`).                                             │
  // └──────────────────────────────────────────────────────────────────────┘
  return (
    // Le comptoir est un ONGLET : il n'a plus de bouton « quitter », on en
    // sort en touchant un autre onglet. Et il ne consomme plus l'encoche, que
    // la barre du haut prend déjà. Aucun gabarit (`plein`) : au comptoir,
    // chaque point sert.
    <Screen edges={[]} padded={!avecPanneau} gabarit="plein">
      {avecPanneau ? (
        // TABLETTE : la grille à gauche, le panier toujours visible à droite,
        // comme le point de vente du back-office. Le panneau porte le
        // récapitulatif, la remise, la mise en attente et l'encaissement : il
        // n'y a donc ni barre du bas ni « Voir le panier ».
        <View className="flex-1 flex-row">
          <View className="min-w-0 flex-1 px-4 pt-2">{corps}</View>
          <View
            className="border-l border-border bg-card"
            style={{ width: LARGEUR_PANNEAU_PANIER }}
          >
            <PanneauPanier mode="panneau" onEncaisser={() => setEncaissement(true)} />
          </View>
        </View>
      ) : (
        corps
      )}

      {!avecPanneau && nbLignes > 0 ? (
        <View className="absolute inset-x-0 bottom-0 border-t border-border bg-card px-4 pb-6 pt-3">
          <View className="mb-2 flex-row items-baseline justify-between">
            <Text variant="bodySmall" className="text-muted-foreground">
              {nbLignes} article{nbLignes > 1 ? "s" : ""}
            </Text>
            <Text variant="h3">{panier.argent(panier.totaux.totalFacture)}</Text>
          </View>
          {/* LA MÊME PORTE QUE SUR LE PANIER, SINON ELLE NE SERT À RIEN.
              Fermer l'encaissement dans le panier et le laisser ouvert ici
              rendrait le garde-fou contournable d'un écran, et le refus
              tomberait au moment de rendre la monnaie. La phrase, elle, vit
              sur le panier : c'est là qu'on voit QUELLE ligne manque. */}
          {ruptures.length > 0 ? (
            <View className="mb-2 flex-row items-center gap-1.5">
              <Icon name="AlertCircle" size={14} color="destructive" />
              <Text variant="caption" className="flex-1 text-destructive">
                {/* Stock ou inventaire : la cause est sur le panier, ligne par
                    ligne. Ici, ce qui compte est le nombre et la sortie. */}
                {`${pluriel(ruptures.length, "ligne", "lignes")} ${accord(
                  ruptures.length,
                  "ne s'encaisse pas",
                  "ne s'encaissent pas"
                )} : proforma possible, encaissement non.`}
              </Text>
            </View>
          ) : null}
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Button variant="secondary" onPress={() => router.push("/pos/panier")} fullWidth>
                Voir le panier
              </Button>
            </View>
            <View className="flex-1">
              <Button
                onPress={() => setEncaissement(true)}
                disabled={ruptures.length > 0}
                fullWidth
              >
                Encaisser
              </Button>
            </View>
          </View>
        </View>
      ) : null}

      {/* Rendue CONDITIONNELLEMENT : chaque ouverture est un montage, donc un
          formulaire vierge, sans effet de remise a zero a tenir en phase avec
          les champs qu'on y ajoutera. */}
      {encaissement ? (
        <FeuilleEncaissement
          onFermer={() => setEncaissement(false)}
          onVenteEnregistree={() => setRelecture((n) => n + 1)}
        />
      ) : null}

      {/* Le même sélecteur que l'écran de scan, câblé une seule fois. */}
      <SelecteurDuComptoir article={choisi} onFermer={() => setChoisi(null)} />
    </Screen>
  );
}

/**
 * Ce que l'inventaire en cours retire du comptoir, et depuis quand.
 *
 * Les cartes le disent déjà une par une ; ce bandeau donne la vue d'ensemble et
 * l'ISSUE. Sans lui, un caissier devant trois articles grisés conclut que son
 * appareil est cassé plutôt qu'à un comptage en cours dans le dépôt.
 */
/**
 * L'état vide de la grille, qui DIT sa cause.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ « CATALOGUE VIDE · SYNCHRONISEZ » ÉTAIT FAUX DÈS QUE LES ARTICLES       │
 * │ ÉTAIENT LÀ MAIS HORS VENTE.                                              │
 * │                                                                          │
 * │ Le caissier synchronisait, tout réussissait, la grille restait vide, et  │
 * │ il recommençait. Un message qui désigne le mauvais geste coûte plus      │
 * │ qu'un message absent : il occupe la seule piste que le caissier ait.     │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Le bouton ne paraît que là où le geste ABOUTIT, et c'est le drapeau du
 * module pur qui le décide, jamais la prose - le message d'« aucun article en
 * vente » parle lui aussi de synchronisation, pour dire qu'elle est inutile.
 */
function GrilleVide({
  diagnostic,
  terme,
}: {
  diagnostic: DiagnosticCatalogue | null;
  terme: string;
}) {
  const { enCours, lancer } = useSynchronisation();
  const proposer = usePropositionCreation();

  // Pas encore mesuré : on n'affirme aucune cause. Le cas ne dure qu'un
  // aller-retour, et inventer une explication en attendant est précisément ce
  // que ce composant existe pour empêcher.
  if (!diagnostic) {
    return <EmptyState icon="Package" title="Aucun article à afficher" />;
  }

  const { icone, titre, message, leveParSynchronisation, proposeCreation } =
    messageGrilleVide(diagnostic);
  // Le panier survit à la création : `PanierProvider` vit dans le layout du
  // groupe, pas dans cet écran, et la pile garde le comptoir monté.
  const creation = proposeCreation ? proposer(terme) : null;

  return (
    <EmptyState
      icon={icone}
      title={titre}
      message={creation?.dejaEnFile ? phraseDejaEnFile(creation.dejaEnFile) : message}
      action={
        leveParSynchronisation
          ? {
              label: enCours ? "Synchronisation…" : "Synchroniser",
              onPress: () => void lancer("bandeau"),
            }
          : (creation?.action ?? undefined)
      }
    />
  );
}

function BandeauInventaire({
  articles,
  arrete,
}: {
  articles: ArticlePos[];
  arrete: Date | null;
}) {
  const { enCours, lancer } = useSynchronisation();
  const bloques = articles.filter((a) => a.verrou_inventaire !== null);
  if (bloques.length === 0) return null;

  const references = [...new Set(bloques.map((a) => a.verrou_inventaire!))].filter(Boolean);
  const quand = arrete
    ? // L'heure seule si c'est aujourd'hui : « arrêté à 14:07 » se lit d'un coup
      // d'œil, là où une date complète oblige à la déchiffrer.
      arrete.toDateString() === new Date().toDateString()
      ? `arrêté à ${formatTimeFr(arrete)}`
      : `arrêté au ${formatDateTimeFr(arrete)}`
    : "jamais synchronisé";

  return (
    <View className="mt-2">
      <Banner
        tone="warning"
        title={`${pluriel(bloques.length, "article", "articles")} sous inventaire`}
        // Ils s'ajoutent au panier (proforma, devis), mais ne s'encaissent pas :
        // le dire ici évite de le découvrir en rendant la monnaie.
        message={`${references.join(", ")} : ${accord(
          bloques.length,
          "il s'ajoute au panier mais ne s'encaisse pas",
          "ils s'ajoutent au panier mais ne s'encaissent pas"
        )} tant que le comptage dure. État ${quand} ; synchronisez si le comptage est terminé.`}
        action={{
          // ┌──────────────────────────────────────────────────────────────┐
          // │ ON SYNCHRONISE ICI, ON NE PART PLUS L'ÉCRAN CHERCHER.        │
          // │                                                              │
          // │ Le verrou est une donnée TIRÉE : le cycle le lève sur place, │
          // │ et les articles se dégrisent sous les yeux du caissier, qui  │
          // │ a un client devant lui. L'aller-retour vers l'écran          │
          // │ Synchronisation lui faisait perdre sa grille et sa           │
          // │ recherche, au pire moment.                                   │
          // └──────────────────────────────────────────────────────────────┘
          label: enCours ? "Synchronisation…" : "Synchroniser",
          loading: enCours,
          onPress: () => void lancer("bandeau"),
        }}
      />
    </View>
  );
}

/**
 * Aucune session de caisse : on ne peut pas vendre.
 *
 * L'ouverture est un acte comme un autre, elle part au journal. Le fond de
 * caisse est demandé mais pas exigé : le refuser bloquerait un comptoir pour
 * une valeur que le gérant corrigera à la clôture.
 */
function OuvertureCaisse({ onOuverte }: { onOuverte: (s: SessionCaisse) => void }) {
  const money = useMonnaie();
  const [caisses, setCaisses] = useState<CaissePos[] | null>(null);
  const [choisie, setChoisie] = useState<string | null>(null);
  const { snapshot } = useSession();
  // Un champ PAR DEVISE, le même composant que le parc de caisses.
  const [fonds, setFonds] = useState<Record<string, string>>({});
  const [erreursFonds, setErreursFonds] = useState<Record<string, string>>({});
  const [enCours, setEnCours] = useState(false);
  const verrou = useRef(false);

  useEffect(() => {
    caissesDisponibles().then((liste) => {
      setCaisses(liste);
      // Un choix unique n'est pas un choix - mais seulement parmi les caisses
      // LIBRES : présélectionner une caisse déjà ouverte par un autre ferait
      // ouvrir une seconde session que le serveur refuserait.
      const libres = liste.filter((c) => !c.occupee);
      if (libres.length === 1) setChoisie(libres[0].id);
    });
  }, []);

  const ouvrir = async () => {
    // Verrou synchrone AVANT tout `setState` : deux appuis rapprochés
    // ouvriraient deux sessions, dont l'une serait refusée avec toutes les
    // ventes qui s'y rattachent.
    if (verrou.current || !choisie) return;
    verrou.current = true;
    setEnCours(true);
    try {
      // La saisie passe par le MÊME lecteur que le parc de caisses : une
      // virgule non normalisée partait telle quelle et le serveur la refusait,
      // et un champ vide envoyait « 0 », qui écrase le fonds hérité de la
      // dernière clôture. Deux formulaires pour le même acte doivent lire la
      // saisie de la même façon, sinon l'un des deux redevient faux tout seul.
      const lu = lireFonds(fonds, money.primaryCode);
      if (!lu.ok) {
        setErreursFonds(lu.erreurs);
        return;
      }
      setErreursFonds({});
      onOuverte(await ouvrirSession(choisie, lu.principal, lu.autres));
    } finally {
      verrou.current = false;
      setEnCours(false);
    }
  };

  if (caisses === null) {
    return (
      <Screen edges={[]}>
        <View className="flex-1 items-center justify-center">
          <Spinner />
        </View>
      </Screen>
    );
  }

  if (caisses.length === 0) {
    return (
      <Screen edges={[]}>
        <EmptyState
          icon="Lock"
          title="Aucune caisse"
          message="Aucune caisse active n'est enregistrée pour cette organisation. Demandez au gérant d'en créer une, puis synchronisez."
        />
      </Screen>
    );
  }

  return (
    <Screen scroll edges={[]}>
      <View className="mt-4">
        <Text variant="h2">Ouvrir la caisse</Text>
        <Text variant="muted" className="mt-1">
          Une vente s'attache à une session de caisse : c'est elle qui dit d'où
          sort le stock et où entre l'argent.
        </Text>
      </View>

      <View className="mt-6 gap-2">
        {caisses.map((c) => (
          <Pressable
            key={c.id}
            // Une caisse déjà ouverte par un autre ne se choisit pas : le
            // serveur refuse une seconde session sur la même caisse, et un
            // caissier ne peut pas encaisser sur celle d'un autre. On l'AFFICHE
            // quand même, avec qui l'occupe : une caisse qui disparaît de la
            // liste ferait chercher une panne là où il n'y a qu'un tiroir ouvert.
            disabled={c.occupee !== null}
            onPress={() => setChoisie(c.id)}
            accessibilityState={{ disabled: c.occupee !== null, selected: choisie === c.id }}
            className={`flex-row items-center rounded-xl border p-4 ${
              choisie === c.id ? "border-primary bg-primary/5" : "border-border"
            } ${c.occupee ? "opacity-60" : ""}`}
          >
            <View className="flex-1">
              <Text variant="body">{c.name}</Text>
              <Text variant="caption" className="text-muted-foreground">
                {c.warehouseName ?? "Aucun entrepôt associé"}
              </Text>
              {c.occupee ? (
                <Text variant="caption" className="mt-1 text-warning">
                  {`Déjà ouverte par ${c.occupee.par ?? "un autre utilisateur"}${
                    c.occupee.depuis ? ` depuis le ${formatDateTimeFr(c.occupee.depuis)}` : ""
                  }`}
                </Text>
              ) : null}
            </View>
            {choisie === c.id ? <Icon name="CheckCircle2" size={22} color="primary" /> : null}
          </Pressable>
        ))}
      </View>

      {caisses.some((c) => c.occupee) ? (
        <View className="mt-4">
          <Banner
            tone="info"
            title="Une caisse est déjà ouverte par un collègue"
            message={
              caisses.every((c) => c.occupee)
                ? "Toutes les caisses sont occupées. Vous n'encaissez que sur une session que vous avez ouverte : faites clôturer l'une d'elles (Caisses), puis synchronisez."
                : "Vous n'encaissez que sur une session que vous avez ouverte : choisissez une caisse libre, ou faites clôturer l'autre (Caisses)."
            }
          />
        </View>
      ) : null}

      {choisie && !caisses.find((c) => c.id === choisie)?.warehouseId ? (
        <View className="mt-4">
          <Banner
            tone="warning"
            title="Caisse sans entrepôt"
            message="Le stock ne pourra pas être vérifié au comptoir, et le serveur refusera peut-être la vente."
          />
        </View>
      ) : null}

      <View className="mt-6">
        {/* Un champ par devise, chacun NOMMANT la sienne. Un champ vide reprend
            la dernière clôture pour cette devise ; voir `ChampsFonds`. */}
        <ChampsFonds
          devises={devisesDuFonds(snapshot?.currencies ?? [], money.primaryCode)}
          valeurs={fonds}
          erreurs={erreursFonds}
          onChange={(devise, v) => {
            setFonds((f) => ({ ...f, [devise]: v }));
            setErreursFonds((e) => {
              if (!e[devise]) return e;
              const { [devise]: _retire, ...reste } = e;
              return reste;
            });
          }}
          money={money}
        />
      </View>

      <View className="mt-6">
        <Button onPress={ouvrir} disabled={!choisie} loading={enCours} fullWidth>
          Ouvrir la caisse
        </Button>
      </View>
    </Screen>
  );
}
