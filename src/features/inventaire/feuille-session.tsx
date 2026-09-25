/**
 * Créer une session d'inventaire, dans une FEUILLE plutôt que dans un écran.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CRÉER N'EST PAS NAVIGUER.                                               │
 * │                                                                          │
 * │ Le bouton poussait un écran entier : la liste disparaissait, le retour   │
 * │ arrière devenait le seul moyen d'abandonner, et le magasinier perdait de │
 * │ vue ce qu'il était en train de faire. Une feuille qui monte du bas dit   │
 * │ ce qu'elle est - une parenthèse par-dessus la liste. C'est le motif      │
 * │ retenu pour le devis, le retour, le transfert et l'ajustement.           │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN SEUL `Sheet`, DES PANNEAUX QU'ON ÉCHANGE.                            │
 * │                                                                          │
 * │ `Sheet` est un `Modal` : en empiler un second donne un voile sur un      │
 * │ voile et deux `onRequestClose` qui se disputent le bouton retour         │
 * │ d'Android. Le formulaire, les deux listes de choix et les deux panneaux  │
 * │ de périmètre échangent donc le CONTENU de la même feuille, et la flèche  │
 * │ de retour RECULE d'un panneau au lieu de tout fermer. C'est aussi        │
 * │ pourquoi les champs de choix posent `DeclencheurSelect` et non           │
 * │ `ChampSelect` : ce dernier ouvre SA feuille, et un garde-fou de doctrine │
 * │ l'interdit ici.                                                          │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * **La feuille de comptage est ENGENDRÉE PAR LE SERVEUR au démarrage**, avec
 * le stock théorique du moment : c'est cet instantané qui sert de référence à
 * l'écart. Une session créée hors ligne n'a donc rien à compter avant d'avoir
 * synchronisé, et l'écran le DIT plutôt que d'afficher une feuille vide.
 */
import { useCallback, useMemo, useState } from "react";
import { View } from "react-native";

import { dateLongueFr } from "@/data/dates";
import { entrepotParDefaut } from "@/data/entrepot-defaut";
import {
  PERIMETRE_INVENTAIRE,
  articlesInventoriables,
  categoriesInventoriables,
  entrepotADuStock,
} from "@/data/inventaire";
import { useLecture } from "@/data/live";
import { entrepotsSansValorisation } from "@/data/stock";
import { creerSession } from "@/features/inventaire/actes";
import {
  verifierSaisie,
  type ErreursSession,
  type Perimetre,
  type SaisieSession,
} from "@/features/inventaire/nouvelle-session";
import {
  Banner, Button, DeclencheurSelect, FormField, Icon, Input, ListeChoix,
  ListeChoixMultiple, SearchInput, Sheet, Text, useToast,
  type DemandeChoix, type OptionSelect,
} from "@/ui";

const OPTIONS_PERIMETRE: OptionSelect[] = Object.entries(PERIMETRE_INVENTAIRE).map(
  ([valeur, label]) => ({ valeur, label })
);

/** Le panneau ouvert par-dessus le formulaire. `null` : le formulaire. */
type Panneau = "categories" | "produits";

export function FeuilleNouvelInventaire({
  onFermer,
  onCree,
}: {
  onFermer: () => void;
  /** La session est au journal : à l'appelant d'ouvrir sa fiche. */
  onCree: (id: string) => void;
}) {
  const toast = useToast();

  const [entrepotChoisi, setEntrepotChoisi] = useState<string | null>(null);
  const [perimetre, setPerimetre] = useState<Perimetre>("full");
  const [categoriesChoisies, setCategories] = useState<string[]>([]);
  const [produitsChoisis, setProduits] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [erreurs, setErreurs] = useState<ErreursSession>({});

  const [choix, setChoix] = useState<DemandeChoix | null>(null);
  const [panneau, setPanneau] = useState<Panneau | null>(null);
  const [recherche, setRecherche] = useState("");

  const { donnees: depots } = useLecture(entrepotsSansValorisation, { tables: ["warehouses"] });

  /**
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ LE DÉFAUT SE DÉRIVE, IL NE SE POSE PAS DANS UN EFFET.               │
   * │                                                                      │
   * │ L'ancien écran attendait les entrepôts dans un `useEffect` puis      │
   * │ appelait `setEntrepot` : un `setState` synchrone dans un effet, donc │
   * │ un rendu de plus à chaque arrivée de données, et une règle qui       │
   * │ dépendait de l'ORDRE des effets. Dérivée, la valeur est juste dès le │
   * │ premier rendu où les dépôts sont là, et un choix explicite l'emporte.│
   * └──────────────────────────────────────────────────────────────────────┘
   */
  const entrepot = entrepotChoisi ?? entrepotParDefaut(depots);

  const chargerStock = useCallback(
    () => (entrepot ? entrepotADuStock(entrepot) : Promise.resolve(true)),
    [entrepot]
  );
  const { donnees: aDuStock } = useLecture(chargerStock, {
    tables: ["stocks"],
    deps: [entrepot],
  });

  const chargerCategories = useCallback(
    () =>
      entrepot && perimetre === "category"
        ? categoriesInventoriables(entrepot)
        : Promise.resolve([]),
    [entrepot, perimetre]
  );
  const { donnees: lesCategories } = useLecture(chargerCategories, {
    tables: ["stocks", "products", "categories"],
    deps: [entrepot, perimetre],
  });

  const chargerProduits = useCallback(
    () =>
      entrepot && perimetre === "product"
        ? articlesInventoriables(entrepot, recherche)
        : Promise.resolve([]),
    [entrepot, perimetre, recherche]
  );
  const { donnees: lesProduits } = useLecture(chargerProduits, {
    tables: ["stocks", "products"],
    deps: [entrepot, perimetre, recherche],
  });

  const optionsEntrepot: OptionSelect[] = (depots ?? []).map((d) => ({
    valeur: d.id,
    label: d.nom,
  }));
  const nomEntrepot = optionsEntrepot.find((o) => o.valeur === entrepot)?.label;

  const saisie: SaisieSession = useMemo(
    () => ({
      entrepot,
      perimetre,
      categories: categoriesChoisies,
      produits: produitsChoisis,
      notes,
    }),
    [entrepot, perimetre, categoriesChoisies, produitsChoisis, notes]
  );

  // La date n'est PAS un champ : il n'y a rien à choisir. C'est la lecture du
  // back-office, et `ChampDate` serait ici une promesse d'édition qui n'existe
  // pas. Elle se recompose à chaque rendu, donc elle reste juste passé minuit.
  const aujourdhui = dateLongueFr(new Date());

  // Le serveur refuse un entrepôt sans stock disponible. Le dire ici évite une
  // quarantaine dont le magasinier ne saurait quoi faire.
  const depotVide = aDuStock === false;
  const bloque = envoi || !entrepot || depotVide;

  const basculer = (liste: string[], id: string) =>
    liste.includes(id) ? liste.filter((x) => x !== id) : [...liste, id];

  const valider = async () => {
    if (bloque || !entrepot) return;

    // Le bouton reste pressable tant qu'il ne manque qu'un choix : un appui
    // doit RÉPONDRE par un message sous le champ fautif plutôt que de ne rien
    // faire. Le back-office rend ces refus en toasts, qui disparaissent avant
    // qu'on ait relu le formulaire et ne désignent aucun champ.
    const mauvais = verifierSaisie(saisie);
    setErreurs(mauvais);
    if (Object.keys(mauvais).length > 0) return;

    setEnvoi(true);
    try {
      const id = await creerSession(saisie);
      toast.succes("Inventaire créé. Il partira à la prochaine synchronisation.");
      onCree(id);
    } catch (e) {
      toast.erreur(
        e instanceof Error ? e.message : "L'inventaire n'a pas pu être enregistré."
      );
    } finally {
      setEnvoi(false);
    }
  };

  /** Le voile et le bouton retour reculent d'un panneau, puis ferment. */
  const reculer = () => {
    if (choix) return setChoix(null);
    if (panneau) {
      setRecherche("");
      return setPanneau(null);
    }
    onFermer();
  };

  const surLeFormulaire = !choix && !panneau;
  const titre = choix
    ? choix.titre
    : panneau === "categories"
      ? "Catégories à compter"
      : panneau === "produits"
        ? "Articles à compter"
        : "Nouvel inventaire";

  return (
    <Sheet
      ouvert
      onFermer={reculer}
      titre={titre}
      retour={surLeFormulaire ? undefined : reculer}
    >
      {choix ? (
        <ListeChoix
          options={choix.options}
          valeur={choix.valeur}
          onChoisir={(v) => {
            choix.onChoisir(v);
            setChoix(null);
          }}
          messageVide={choix.messageVide}
        />
      ) : panneau === "categories" ? (
        <ListeChoixMultiple
          options={(lesCategories ?? []).map((c) => ({
            valeur: c.id,
            label: c.nom,
            detail: c.detail,
          }))}
          valeurs={categoriesChoisies}
          onBasculer={(v) => {
            setCategories((l) => basculer(l, v));
            if (erreurs.perimetre) setErreurs({});
          }}
          // Une liste vide DIT pourquoi : le serveur refuse une catégorie sans
          // stock, donc on ne propose que celles qui en ont.
          messageVide="Aucune catégorie n'a de stock dans cet entrepôt."
        />
      ) : panneau === "produits" ? (
        <>
          <SearchInput
            valeur={recherche}
            onChange={setRecherche}
            placeholder="Rechercher un article..."
          />
          <ListeChoixMultiple
            options={(lesProduits ?? []).map((p) => ({
              valeur: p.id,
              label: p.nom,
              detail: p.detail,
            }))}
            valeurs={produitsChoisis}
            onBasculer={(v) => {
              setProduits((l) => basculer(l, v));
              if (erreurs.perimetre) setErreurs({});
            }}
            messageVide={
              recherche
                ? "Aucun article ne correspond dans cet entrepôt."
                : "Aucun article n'a de stock dans cet entrepôt."
            }
          />
        </>
      ) : (
        <>
          {/* LA DATE EST LUE, PAS SAISIE. Le serveur n'a d'ailleurs aucun champ
              de date : elle vit dans le NOM de la session, comme sur le web. */}
          <FormField label="Date de l'inventaire">
            <View className="h-12 flex-row items-center gap-2 rounded-lg border border-input bg-muted px-3">
              <Icon name="Calendar" size={16} color="mutedForeground" />
              <Text variant="bodySmall" className="font-sans-medium">
                {aujourdhui}
              </Text>
            </View>
          </FormField>

          <FormField label="Entrepôt" required error={erreurs.entrepot}>
            <DeclencheurSelect
              libelle={nomEntrepot ?? "Choisir un entrepôt"}
              actif={Boolean(nomEntrepot)}
              invalid={Boolean(erreurs.entrepot)}
              accessibilityLabel="Entrepôt"
              onPress={() =>
                setChoix({
                  titre: "Entrepôt",
                  options: optionsEntrepot,
                  valeur: entrepot,
                  onChoisir: (v) => {
                    // L'entrepôt décide de ce qu'il y a à compter : garder les
                    // catégories et les articles ferait viser un périmètre
                    // relevé dans un autre dépôt, que le serveur refuserait.
                    if (v !== entrepot) {
                      setCategories([]);
                      setProduits([]);
                    }
                    setEntrepotChoisi(v);
                    setErreurs({});
                  },
                  messageVide: "Aucun entrepôt n'est encore descendu sur ce terminal.",
                })
              }
            />
          </FormField>

          {depotVide ? (
            <Banner
              tone="destructive"
              title="Cet entrepôt ne contient aucun produit en stock"
              message="Le serveur refuse d'ouvrir un inventaire sur un dépôt vide. Choisissez-en un autre."
            />
          ) : null}

          <FormField
            label="Type d'inventaire"
            required
            error={erreurs.perimetre}
            // Le type se choisit APRÈS l'entrepôt, comme sur le web : c'est
            // l'entrepôt qui décide des catégories et des articles offerts.
            hint={
              entrepot
                ? undefined
                : "Choisissez d'abord un entrepôt : c'est lui qui dit ce qu'il y a à compter."
            }
          >
            <DeclencheurSelect
              libelle={PERIMETRE_INVENTAIRE[perimetre] ?? perimetre}
              actif={Boolean(entrepot)}
              invalid={Boolean(erreurs.perimetre)}
              // FERMÉ tant qu'aucun entrepôt n'est choisi, comme le `Select`
              // du back-office. Un déclencheur qui répond en ne faisant rien
              // laisserait croire à une panne ; grisé, il dit qu'il attend.
              disabled={!entrepot}
              accessibilityLabel="Type d'inventaire"
              onPress={() =>
                setChoix({
                  titre: "Type d'inventaire",
                  options: OPTIONS_PERIMETRE,
                  valeur: perimetre,
                  // Le périmètre a toujours une valeur : le remettre à `null`
                  // ferait une session que le serveur refuse.
                  onChoisir: (v) => {
                    setPerimetre((v as Perimetre) ?? perimetre);
                    setErreurs({});
                  },
                })
              }
            />
          </FormField>

          {entrepot && perimetre === "category" ? (
            <FormField label="Catégories à compter" required error={erreurs.perimetre}>
              <DeclencheurSelect
                libelle={
                  categoriesChoisies.length > 0
                    ? `${categoriesChoisies.length} ${
                        categoriesChoisies.length === 1 ? "catégorie" : "catégories"
                      }`
                    : "Choisir des catégories"
                }
                actif={categoriesChoisies.length > 0}
                invalid={Boolean(erreurs.perimetre)}
                accessibilityLabel="Catégories à compter"
                onPress={() => setPanneau("categories")}
              />
            </FormField>
          ) : null}

          {entrepot && perimetre === "product" ? (
            <FormField label="Articles à compter" required error={erreurs.perimetre}>
              <DeclencheurSelect
                libelle={
                  produitsChoisis.length > 0
                    ? `${produitsChoisis.length} ${
                        produitsChoisis.length === 1 ? "article" : "articles"
                      }`
                    : "Choisir des articles"
                }
                actif={produitsChoisis.length > 0}
                invalid={Boolean(erreurs.perimetre)}
                accessibilityLabel="Articles à compter"
                onPress={() => setPanneau("produits")}
              />
            </FormField>
          ) : null}

          <FormField label="Notes">
            <Input
              value={notes}
              onChangeText={setNotes}
              placeholder="Équipe, allée…"
            />
          </FormField>

          <Banner
            tone="info"
            title="La feuille est engendrée au démarrage"
            message="Elle fige alors le stock théorique. C'est cet instantané qui sert de référence à l'écart, et non le stock d'aujourd'hui."
          />

          <Button fullWidth size="lg" disabled={bloque} onPress={() => void valider()}>
            {envoi ? "Enregistrement…" : "Créer l'inventaire"}
          </Button>
        </>
      )}
    </Sheet>
  );
}
