/**
 * Créer un transfert de stock, dans une FEUILLE plutôt que dans un écran.
 *
 * Même motif que la feuille de mouvement : créer n'est pas naviguer, et un
 * seul `Sheet` porte tous les panneaux - le formulaire, le choix d'un article
 * et les listes de choix - parce qu'un `Modal` ne s'empile pas sur un `Modal`.
 * Voir `feuille-mouvement.tsx` pour les deux encadrés.
 *
 * **Le transfert est créé en BROUILLON, il n'expédie rien.** C'est le
 * comportement du back-office, et il est protecteur : le stock ne quitte
 * l'entrepôt qu'à l'expédition, un geste distinct et confirmé. Créer et
 * expédier d'un même bouton ferait sortir du stock sur une faute de frappe.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ON TRANSFÈRE DES CASIERS, PAS DES BOUTEILLES.                           │
 * │                                                                          │
 * │ Le formulaire n'offrait qu'une case, « Quantité à transférer (unités) », │
 * │ alors que le serveur accepte les deux compteurs depuis toujours et les   │
 * │ recompose lui-même. Un magasinier qui charge trois casiers devait donc   │
 * │ poser 3 × 12 de tête, et une erreur de facteur sur un transfert vide un  │
 * │ rayon entier. Les règles vivent dans `lignes-conditionnees.ts`, avec     │
 * │ leurs tests ; la saisie dans `saisie-quantite.tsx`, partagée avec        │
 * │ l'ajustement.                                                            │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Le disponible affiché est celui de l'entrepôt SOURCE, réservations imputées
 * comme au comptoir. Il AVERTIT sans refuser : le serveur ne contrôle le stock
 * qu'à l'expédition, et préparer le matin un transfert qu'on charge l'après-midi
 * est le cas ordinaire. Voir `alerteDisponible`.
 */
import { useCallback, useMemo, useState } from "react";
import { View } from "react-native";
import { type Packaging } from "@vente-facile/core";

import { chercherArticlesPourTransfert } from "@/data/articles";
import { entrepotParDefaut } from "@/data/entrepot-defaut";
import { useLecture } from "@/data/live";
import { lireNombre } from "@/data/nombres";
import { entrepotsSansValorisation } from "@/data/stock";
import { creerTransfert, type LigneSaisie } from "@/features/stock/actes";
import {
  afficherPartage,
  alerteDisponible,
  ligneTransfert,
  resumeConversion,
  verifierQuantite,
  type ErreursQuantite,
  type PartageStock,
  type SaisieQuantite,
} from "@/features/stock/lignes-conditionnees";
import { SaisieQuantiteConditionnee } from "@/features/stock/saisie-quantite";
import {
  Banner, Button, CardHeader, DataRow, DeclencheurSelect, Divider, FormField,
  Icon, IconButton, Input, ListeChoix, SearchInput, Sheet, Text, useToast,
  type DemandeChoix, type OptionSelect,
} from "@/ui";

/** Une ligne du bordereau, telle qu'elle se relit sur le formulaire. */
interface LigneTransfert extends LigneSaisie {
  nom: string;
  sku: string | null;
  conditionnement: Packaging | null;
  /**
   * Le disponible RELEVÉ au moment de l'ajout, porté par la ligne.
   *
   * Le catalogue n'est chargé QUE pendant que le panneau de recherche est
   * ouvert : le relire au moment de rouvrir une ligne depuis le formulaire
   * rendrait `undefined`, et le panneau annoncerait « Aucune ligne de stock
   * dans ce dépôt » sur un article qui en a. `null` n'est pas zéro, et un faux
   * `null` est pire qu'un chiffre périmé.
   */
  disponible: PartageStock | null;
}

/** L'article en cours d'ajout, avec ce que la source en porte. */
interface ArticleEnCours {
  id: string;
  nom: string;
  sku: string | null;
  conditionnement: Packaging | null;
  disponible: PartageStock | null;
}

/**
 * Lire une saisie de quantité, et la phrase à écrire si elle ne vaut rien.
 *
 * `lireNombre` rend un MOTIF et non une phrase : la phrase qu'un marchand lit
 * appartient à l'écran qui la lui montre.
 */
function lire(saisie: string): { valeur: number | null; erreur?: string } {
  if (!saisie.trim()) return { valeur: null };
  const l = lireNombre(saisie);
  if (l.ok) return { valeur: l.valeur ?? null };
  return {
    valeur: null,
    erreur:
      l.motif === "negatif"
        ? "Une quantité négative ne se transfère pas."
        : "Quantité illisible. Écrivez par exemple 3 ou 1,5.",
  };
}

export function FeuilleNouveauTransfert({
  onFermer,
  onCree,
}: {
  onFermer: () => void;
  /** Le transfert est au journal : à l'appelant d'ouvrir sa fiche. */
  onCree: (id: string) => void;
}) {
  const toast = useToast();

  const [sourceChoisie, setSourceChoisie] = useState<string | null>(null);
  const [destination, setDestination] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [lignes, setLignes] = useState<LigneTransfert[]>([]);
  const [envoi, setEnvoi] = useState(false);

  const [choix, setChoix] = useState<DemandeChoix | null>(null);
  const [panneauArticle, setPanneauArticle] = useState(false);
  const [recherche, setRecherche] = useState("");
  const [choisi, setChoisi] = useState<ArticleEnCours | null>(null);
  const [contenants, setContenants] = useState("");
  const [vrac, setVrac] = useState("");
  const [erreurs, setErreurs] = useState<ErreursQuantite>({});

  const { donnees: depots } = useLecture(entrepotsSansValorisation, { tables: ["warehouses"] });

  /**
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ LE DÉFAUT SE DÉRIVE, IL NE SE POSE PAS DANS UN EFFET.               │
   * │                                                                      │
   * │ L'ancien écran attendait les entrepôts dans un `useEffect` puis      │
   * │ appelait `setEntrepot` : un `setState` synchrone dans un effet, donc │
   * │ un rendu de plus à chaque arrivée de données, et une règle qui       │
   * │ dépendait de l'ORDRE des effets. Dérivée, la valeur est juste dès le │
   * │ premier rendu où les dépôts sont là, et un choix explicite l'emporte │
   * │ - ce que l'état ne portait qu'implicitement.                          │
   * │                                                                      │
   * │ Un choix unique n'est pas un choix : l'entrepôt principal (ou        │
   * │ l'unique) est proposé d'emblée. La règle vit dans `entrepotParDefaut`,│
   * │ avec son test.                                                        │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  // Seule la SOURCE est proposée : la destination est le choix qui compte, et
  // la deviner ferait expédier ailleurs qu'on ne voulait.
  const source = sourceChoisie ?? entrepotParDefaut(depots);
  const depotSource = (depots ?? []).find((d) => d.id === source) ?? null;

  const chargerArticles = useCallback(
    () =>
      panneauArticle && source
        ? chercherArticlesPourTransfert(source, recherche, 30)
        : Promise.resolve([]),
    [panneauArticle, source, recherche]
  );
  const { donnees: articles } = useLecture(chargerArticles, {
    tables: ["products", "stocks", "units"],
    deps: [panneauArticle, source, recherche],
  });

  const optionsEntrepot: OptionSelect[] = (depots ?? []).map((d) => ({
    valeur: d.id,
    label: d.nom,
  }));
  const nomDe = (id: string | null) =>
    optionsEntrepot.find((o) => o.valeur === id)?.label;

  const nContenants = lire(contenants);
  const nVrac = lire(vrac);
  const saisie: SaisieQuantite = useMemo(
    () => ({
      conditionnement: choisi?.conditionnement ?? null,
      contenants: nContenants.valeur,
      vrac: nVrac.valeur,
    }),
    [choisi, nContenants.valeur, nVrac.valeur]
  );

  const recap = resumeConversion(saisie, "transférez");
  const alerte = alerteDisponible(saisie, choisi?.disponible ?? null, {
    negatifAutorise: Boolean(depotSource?.stockNegatifAutorise),
  });

  // Les deux entrepôts doivent DIFFÉRER : un transfert sur place ne veut rien
  // dire, et le serveur le refuserait après coup, hors ligne, en quarantaine.
  const memeEntrepot = Boolean(source && destination && source === destination);
  const bloque =
    envoi || !source || !destination || memeEntrepot || lignes.length === 0;

  /** Ouvre le panneau de saisie sur un article, vierge ou en reprise. */
  const ouvrirArticle = (a: ArticleEnCours, reprise?: LigneTransfert) => {
    setChoisi(a);
    setContenants(reprise?.contenants != null ? String(reprise.contenants) : "");
    setVrac(
      reprise
        ? a.conditionnement
          ? String(reprise.vrac ?? "")
          : String(reprise.quantite)
        : ""
    );
    setErreurs({});
    setPanneauArticle(true);
  };

  const ajouter = () => {
    if (!choisi) return;

    // Une saisie illisible RÉPONDAIT en ne faisant rien : « 12 500 » avec son
    // séparateur donnait `NaN` puis zéro, et le bouton restait inerte.
    const mauvais: ErreursQuantite = {};
    if (nContenants.erreur) mauvais.contenants = nContenants.erreur;
    if (nVrac.erreur) mauvais.vrac = nVrac.erreur;
    const metier = verifierQuantite(saisie);
    if (!mauvais.contenants && metier.contenants) mauvais.contenants = metier.contenants;
    if (!mauvais.vrac && metier.vrac) mauvais.vrac = metier.vrac;
    setErreurs(mauvais);
    if (Object.keys(mauvais).length > 0) return;

    const ligne = ligneTransfert(choisi.id, saisie);
    setLignes((l) => [
      // Le même article deux fois n'est pas deux lignes : la seconde saisie
      // REMPLACE la première, et l'écran l'a rouverte avec ses valeurs.
      ...l.filter((x) => x.produit !== choisi.id),
      {
        ...ligne,
        nom: choisi.nom,
        sku: choisi.sku,
        conditionnement: choisi.conditionnement,
        disponible: choisi.disponible,
      },
    ]);
    setChoisi(null);
    setContenants("");
    setVrac("");
    setErreurs({});
    setPanneauArticle(false);
  };

  const valider = async () => {
    if (bloque || !source || !destination) return;
    setEnvoi(true);
    try {
      const id = await creerTransfert({
        source,
        destination,
        notes,
        lignes: lignes.map(({ produit, quantite, contenants: c, vrac: v }) => ({
          produit,
          quantite,
          contenants: c,
          vrac: v,
        })),
      });
      toast.succes("Transfert créé en brouillon. Il partira à la prochaine synchronisation.");
      onCree(id);
    } catch (e) {
      toast.erreur(
        e instanceof Error ? e.message : "Le transfert n'a pas pu être enregistré."
      );
    } finally {
      setEnvoi(false);
    }
  };

  const reculer = () => {
    if (choix) return setChoix(null);
    if (panneauArticle) {
      setChoisi(null);
      setErreurs({});
      return setPanneauArticle(false);
    }
    onFermer();
  };

  const surLeFormulaire = !choix && !panneauArticle;
  const titre = choix
    ? choix.titre
    : panneauArticle
      ? (choisi?.nom ?? "Ajouter un article")
      : "Nouveau transfert";

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
          libelleVide={choix.libelleVide}
          messageVide={choix.messageVide}
        />
      ) : panneauArticle ? (
        choisi ? (
          <>
            {/* Le disponible est RELEVÉ : il vient de la base locale, avec la
                même imputation des réservations que le contrôle du serveur.
                `null` n'est PAS zéro : sans ligne de stock dans ce dépôt, on
                ne fabrique pas un « 0 » qui crierait la rupture. */}
            <View className="mb-4 flex-row items-center gap-2 rounded-lg bg-muted px-3 py-2.5">
              <Icon name="Warehouse" size={16} color="mutedForeground" />
              <Text variant="caption" className="flex-1">
                {choisi.disponible
                  ? `Disponible dans ${nomDe(source) ?? "la source"} : ${afficherPartage(
                      choisi.conditionnement,
                      choisi.disponible
                    )}`
                  : `Aucune ligne de stock dans ${nomDe(source) ?? "la source"}.`}
              </Text>
            </View>

            <SaisieQuantiteConditionnee
              conditionnement={choisi.conditionnement}
              contenants={contenants}
              onContenants={(v) => {
                setContenants(v);
                if (erreurs.contenants) setErreurs({ ...erreurs, contenants: undefined });
              }}
              vrac={vrac}
              onVrac={(v) => {
                setVrac(v);
                if (erreurs.vrac) setErreurs({ ...erreurs, vrac: undefined });
              }}
              erreurs={erreurs}
              libelleSimple="Quantité à transférer"
              recapitulatif={recap}
              alerte={alerte}
            />

            <View className="flex-row gap-2">
              <Button variant="outline" className="flex-1" onPress={() => setChoisi(null)}>
                Changer
              </Button>
              <Button className="flex-1" leftIcon="Plus" onPress={ajouter}>
                Ajouter
              </Button>
            </View>
          </>
        ) : (
          <>
            <SearchInput
              valeur={recherche}
              onChange={setRecherche}
              placeholder="Rechercher un produit..."
            />
            {(articles ?? []).length === 0 ? (
              <Text variant="caption">
                {recherche
                  ? "Aucun article ne correspond."
                  : "Cherchez un article par son nom, son code ou son code-barres."}
              </Text>
            ) : (
              <View>
                {(articles ?? []).map((a) => (
                  <DataRow
                    key={a.id}
                    principal={a.nom}
                    secondaire={a.sku}
                    // Pas de chevron : l'appui REVIENT à la saisie, il n'avance
                    // pas. `ListItem` réserve le chevron à une destination.
                    chevron={false}
                    valeur={
                      <Text variant="caption" numeric>
                        {/* `null` n'est PAS zéro : un article sans ligne dans ce
                            dépôt affiche « Aucun stock ici », jamais « 0 » qui
                            affirmerait une rupture qu'on n'a pas constatée. */}
                        {a.disponible
                          ? afficherPartage(a.conditionnement, a.disponible)
                          : "Aucun stock ici"}
                      </Text>
                    }
                    onPress={() =>
                      ouvrirArticle(
                        {
                          id: a.id,
                          nom: a.nom,
                          sku: a.sku,
                          conditionnement: a.conditionnement,
                          disponible: a.disponible,
                        },
                        lignes.find((l) => l.produit === a.id)
                      )
                    }
                  />
                ))}
              </View>
            )}
          </>
        )
      ) : (
        <>
          <FormField label="Entrepôt source" required>
            <DeclencheurSelect
              libelle={nomDe(source) ?? "Choisir un entrepôt"}
              actif={Boolean(nomDe(source))}
              accessibilityLabel="Entrepôt source"
              onPress={() =>
                setChoix({
                  titre: "Entrepôt source",
                  options: optionsEntrepot,
                  valeur: source,
                  onChoisir: (v) => {
                    // La source décide du DISPONIBLE de chaque ligne : garder
                    // les lignes ferait expédier d'un dépôt des articles
                    // relevés dans un autre, avec un disponible qui n'a jamais
                    // été le sien.
                    if (v !== source) setLignes([]);
                    setSourceChoisie(v);
                  },
                  messageVide: "Aucun entrepôt n'est encore descendu sur ce terminal.",
                })
              }
            />
          </FormField>

          <FormField
            label="Entrepôt de destination"
            required
            error={memeEntrepot ? "Choisissez deux entrepôts différents." : undefined}
          >
            <DeclencheurSelect
              libelle={nomDe(destination) ?? "Choisir un entrepôt"}
              actif={Boolean(nomDe(destination))}
              invalid={memeEntrepot}
              accessibilityLabel="Entrepôt de destination"
              onPress={() =>
                setChoix({
                  titre: "Entrepôt de destination",
                  // La SOURCE est retirée de la liste : proposer un transfert
                  // sur place, que le serveur refuse, c'est laisser le
                  // magasinier découvrir le refus après coup.
                  options: optionsEntrepot.filter((o) => o.valeur !== source),
                  valeur: destination,
                  onChoisir: setDestination,
                  messageVide:
                    "Il n'y a qu'un entrepôt : un transfert demande deux dépôts.",
                })
              }
            />
          </FormField>

          <View className="mb-4 overflow-hidden rounded-xl border border-border">
            <View className="px-4 pt-3">
              <CardHeader
                title={`Articles (${lignes.length})`}
                right={
                  <Button
                    size="sm"
                    variant="outline"
                    leftIcon="Plus"
                    disabled={!source}
                    onPress={() => setPanneauArticle(true)}
                  >
                    Ajouter
                  </Button>
                }
              />
            </View>
            {lignes.length === 0 ? (
              <View className="px-4 pb-4">
                <Text variant="caption">
                  {source
                    ? "Aucun article. Ajoutez ce qui doit partir."
                    : "Choisissez d'abord l'entrepôt source."}
                </Text>
              </View>
            ) : (
              lignes.map((l, i) => (
                <View key={l.produit}>
                  {i > 0 ? <Divider /> : null}
                  <DataRow
                    principal={l.nom}
                    // La quantité est rendue depuis les DEUX compteurs saisis,
                    // jamais redécoupée depuis leur somme : « 1 casier + 30
                    // bouteilles » resterait sinon « 3 casiers + 6 bouteilles ».
                    secondaire={afficherPartage(l.conditionnement, {
                      contenants: l.contenants ?? 0,
                      vrac: l.vrac ?? 0,
                      total: l.quantite,
                    })}
                    chevron={false}
                    // TOUCHER MODIFIE, IL NE SUPPRIME PAS. Une rangée sans
                    // chevron ne promet rien, et le geste naturel pour corriger
                    // une quantité effaçait la ligne en silence : il fallait
                    // refaire la recherche. Le retrait a sa propre cible.
                    onPress={() =>
                      ouvrirArticle(
                        {
                          id: l.produit,
                          nom: l.nom,
                          sku: l.sku,
                          conditionnement: l.conditionnement,
                          disponible: l.disponible,
                        },
                        l
                      )
                    }
                    valeur={
                      <IconButton
                        name="Trash2"
                        variant="ghost"
                        label={`Retirer ${l.nom}`}
                        onPress={() =>
                          setLignes((x) => x.filter((y) => y.produit !== l.produit))
                        }
                      />
                    }
                  />
                </View>
              ))
            )}
          </View>

          <FormField label="Notes">
            <Input value={notes} onChangeText={setNotes} placeholder="Motif, transporteur…" />
          </FormField>

          <Banner
            tone="info"
            title="Le stock ne bouge pas encore"
            message="Le transfert est créé en brouillon. Il quittera l'entrepôt source à l'expédition, depuis sa fiche."
          />

          <Button fullWidth size="lg" disabled={bloque} onPress={() => void valider()}>
            {envoi ? "Enregistrement…" : "Créer le transfert"}
          </Button>
        </>
      )}
    </Sheet>
  );
}
