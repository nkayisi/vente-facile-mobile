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

import { formatDateTimeFr, formatTimeFr } from "@vente-facile/core";
import type { Saisie } from "@vente-facile/core/pos";

import {
  articleParCodeBarres,
  categoriesVendables,
  chercherArticles,
  type ArticlePos,
} from "@/features/pos/catalogue";
import { compterEnAttente } from "@/features/pos/attente";
import { libelleEnvoi } from "@/data/envoi";
import { arreteA } from "@/features/pos/verrou-inventaire";
import { ouvrirSession, sessionOuverte, caissesDisponibles, type CaissePos, type SessionCaisse } from "@/features/pos/caisse";
import { CarteArticle } from "@/features/pos/carte-article";
import { SelecteurQuantite } from "@/features/pos/selecteur-quantite";
import { usePanier } from "@/features/pos/panier";
import { useSession } from "@/session/provider";
import {
  Banner, Button, EmptyState, FormField, Icon, Input, Pressable, Screen, Spinner, Text,
} from "@/ui";

export default function Comptoir() {
  const { snapshot } = useSession();
  const panier = usePanier();

  const [session, setSession] = useState<SessionCaisse | null | undefined>(undefined);
  const [articles, setArticles] = useState<ArticlePos[]>([]);
  const [rubriques, setRubriques] = useState<{ id: string; name: string }[]>([]);
  const [terme, setTerme] = useState("");
  const [rubrique, setRubrique] = useState<string | null>(null);
  const [chargement, setChargement] = useState(true);
  const [choisi, setChoisi] = useState<ArticlePos | null>(null);
  const [paniersRanges, setPaniersRanges] = useState(0);
  // Depuis quand l'état des inventaires est-il celui qu'on oppose ? Un verrou
  // est l'instantané d'un état concurrent, pas une autorité : le dire est ce
  // qui distingue « attendez la fin du comptage » de « votre appareil est en
  // retard, synchronisez ».
  const [verrouArreteA, setVerrouArreteA] = useState<Date | null>(null);

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

  // Recherche différée : à chaque frappe, la requête part 250 ms plus tard, et
  // une frappe suivante annule la précédente. Sans cela, taper « coca » lance
  // quatre requêtes dont trois seront jetées.
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (session === undefined) return;
    setChargement(true);
    if (minuteur.current) clearTimeout(minuteur.current);
    minuteur.current = setTimeout(() => {
      chercherArticles({ warehouseId: entrepot, terme, categoryId: rubrique })
        .then(setArticles)
        .finally(() => setChargement(false));
    }, 250);
    return () => {
      if (minuteur.current) clearTimeout(minuteur.current);
    };
  }, [terme, rubrique, entrepot, session]);

  const quantitesAuPanier = useMemo(() => {
    const carte = new Map<string, number>();
    for (const l of panier.etat.lignes) carte.set(l.product.id, l.quantity);
    return carte;
  }, [panier.etat.lignes]);

  if (session === undefined) {
    return (
      <Screen>
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

  return (
    // Le comptoir est un ONGLET : il n'a plus de bouton « quitter », on en
    // sort en touchant un autre onglet. Et il ne consomme plus l'encoche, que
    // la barre du haut prend déjà.
    <Screen edges={[]}>
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
          className="h-11 w-11 items-center justify-center rounded-full active:bg-muted"
          accessibilityLabel="Scanner un code-barres"
        >
          <Icon name="ion:barcode-outline" size={24} />
        </Pressable>
      </View>

      <View className="mt-2">
        <Input
          value={terme}
          onChangeText={setTerme}
          placeholder="Nom, code ou référence"
          leading={<Icon name="Search" size={18} color="mutedForeground" />}
          autoCorrect={false}
          returnKeyType="search"
        />
      </View>

      {rubriques.length > 0 ? (
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={[{ id: "", name: "Tout" }, ...rubriques]}
          keyExtractor={(r) => r.id || "tout"}
          className="mt-2 max-h-11 grow-0"
          contentContainerClassName="gap-2 py-1"
          renderItem={({ item }) => {
            const actif = (item.id || null) === rubrique;
            return (
              <Pressable
                onPress={() => setRubrique(item.id || null)}
                className={`h-9 justify-center rounded-full border px-3 ${
                  actif ? "border-primary bg-primary" : "border-border"
                }`}
              >
                <Text
                  variant="bodySmall"
                  className={actif ? "text-primary-foreground" : "text-muted-foreground"}
                >
                  {item.name}
                </Text>
              </Pressable>
            );
          }}
        />
      ) : null}

      <BandeauInventaire articles={articles} arrete={verrouArreteA} />

      {chargement && articles.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : articles.length === 0 ? (
        <EmptyState
          icon="Package"
          title={terme ? "Aucun article trouvé" : "Catalogue vide"}
          message={
            terme
              ? "Essayez un autre mot, ou scannez le code-barres."
              : "Synchronisez pour recevoir le catalogue de votre organisation."
          }
        />
      ) : (
        <FlatList
          data={articles}
          keyExtractor={(a) => a.id}
          numColumns={2}
          columnWrapperClassName="gap-3"
          contentContainerClassName="gap-3 pb-40 pt-3"
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <CarteArticle
              article={item}
              prix={panier.argent(Number(item.selling_price), panier.devises.primary)}
              prixGros={
                item.wholesale_price
                  ? panier.argent(Number(item.wholesale_price), panier.devises.primary)
                  : null
              }
              auPanier={quantitesAuPanier.get(item.id) ?? 0}
              epuise={estEpuise(item)}
              onPress={() => setChoisi(item)}
            />
          )}
        />
      )}

      {nbLignes > 0 ? (
        <View className="absolute inset-x-0 bottom-0 border-t border-border bg-card px-4 pb-6 pt-3">
          <View className="mb-2 flex-row items-baseline justify-between">
            <Text variant="bodySmall" className="text-muted-foreground">
              {nbLignes} article{nbLignes > 1 ? "s" : ""}
            </Text>
            <Text variant="h3">{panier.argent(panier.totaux.totalFacture)}</Text>
          </View>
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Button variant="secondary" onPress={() => router.push("/pos/panier")} fullWidth>
                Voir le panier
              </Button>
            </View>
            <View className="flex-1">
              <Button onPress={() => router.push("/pos/encaissement")} fullWidth>
                Encaisser
              </Button>
            </View>
          </View>
        </View>
      ) : null}

      <SelecteurQuantite
        article={choisi}
        visible={!!choisi}
        onFermer={() => setChoisi(null)}
        scellesDisponibles={choisi?.stock_packages}
        vracDisponible={choisi?.stock_loose}
        // Le motif du refus s'AFFICHE, et le bouton se ferme. Il était calculé
        // puis jeté : l'appui restait sans effet et sans explication.
        verifier={(saisie: Saisie) => (choisi ? panier.verifier(choisi, saisie) : null)}
        onValider={(saisie: Saisie) => {
          if (!choisi) return;
          const refus = panier.verifier(choisi, saisie);
          if (refus) return;
          panier.envoyer({
            type: "ajouter",
            article: choisi,
            saisie,
            prix: Number(choisi.selling_price) || 0,
          });
          setChoisi(null);
        }}
      />
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
function BandeauInventaire({
  articles,
  arrete,
}: {
  articles: ArticlePos[];
  arrete: Date | null;
}) {
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
        title={`${bloques.length} article${bloques.length > 1 ? "s" : ""} bloqué${
          bloques.length > 1 ? "s" : ""
        } par un inventaire`}
        message={`${references.join(", ")} : état ${quand}. Synchronisez si le comptage est terminé.`}
        action={{
          label: "Synchroniser",
          onPress: () => router.push("/appareil/synchronisation"),
        }}
      />
    </View>
  );
}

function estEpuise(article: ArticlePos): boolean {
  if (!article.track_inventory || article.allow_negative_stock) return false;
  // `null` vaut « inconnu », jamais « épuisé » : barrer un article sur une
  // donnée absente ferait refuser des ventes possibles.
  if (article.stock_quantity === null) return false;
  return article.stock_quantity <= 0;
}

/**
 * Aucune session de caisse : on ne peut pas vendre.
 *
 * L'ouverture est un acte comme un autre, elle part au journal. Le fond de
 * caisse est demandé mais pas exigé : le refuser bloquerait un comptoir pour
 * une valeur que le gérant corrigera à la clôture.
 */
function OuvertureCaisse({ onOuverte }: { onOuverte: (s: SessionCaisse) => void }) {
  const [caisses, setCaisses] = useState<CaissePos[] | null>(null);
  const [choisie, setChoisie] = useState<string | null>(null);
  const [fond, setFond] = useState("");
  const [enCours, setEnCours] = useState(false);
  const verrou = useRef(false);

  useEffect(() => {
    caissesDisponibles().then((liste) => {
      setCaisses(liste);
      if (liste.length === 1) setChoisie(liste[0].id);
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
      onOuverte(await ouvrirSession(choisie, fond));
    } finally {
      verrou.current = false;
      setEnCours(false);
    }
  };

  if (caisses === null) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center">
          <Spinner />
        </View>
      </Screen>
    );
  }

  if (caisses.length === 0) {
    return (
      <Screen>
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
            onPress={() => setChoisie(c.id)}
            className={`flex-row items-center rounded-xl border p-4 ${
              choisie === c.id ? "border-primary bg-primary/5" : "border-border"
            }`}
          >
            <View className="flex-1">
              <Text variant="body">{c.name}</Text>
              <Text variant="caption" className="text-muted-foreground">
                {c.warehouseName ?? "Aucun entrepôt associé"}
              </Text>
            </View>
            {choisie === c.id ? <Icon name="CheckCircle2" size={22} color="primary" /> : null}
          </Pressable>
        ))}
      </View>

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
        <FormField label="Fond de caisse" hint="Corrigeable à la clôture.">
          <Input
            value={fond}
            onChangeText={setFond}
            keyboardType="decimal-pad"
            placeholder="0"
          />
        </FormField>
      </View>

      <View className="mt-6">
        <Button onPress={ouvrir} disabled={!choisie} loading={enCours} fullWidth>
          Ouvrir la caisse
        </Button>
      </View>
    </Screen>
  );
}
