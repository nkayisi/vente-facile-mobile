/**
 * Créer un ajustement de stock, dans une FEUILLE plutôt que dans un écran.
 *
 * Même motif que la feuille de mouvement : créer n'est pas naviguer, et un
 * seul `Sheet` porte tous les panneaux, parce qu'un `Modal` ne s'empile pas sur
 * un `Modal`. Voir `feuille-mouvement.tsx` pour les deux encadrés.
 *
 * **L'attendu est RELEVÉ, pas saisi.** Il vient de la base locale au moment de
 * l'ajout de la ligne, comme le serveur le relève à la création : c'est le
 * stock théorique, et le laisser saisir permettrait d'écrire un écart qui
 * n'existe pas.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ON COMPTE DES CASIERS ET DES BOUTEILLES, PAS UN TOTAL.                   │
 * │                                                                          │
 * │ Le formulaire n'offrait qu'une case, « Quantité comptée (unités) ».      │
 * │ Devant un rayon, personne ne compte 43 : on compte trois casiers et sept │
 * │ bouteilles, et c'est ce partage-là que le serveur enregistre depuis      │
 * │ toujours (`counted_package_quantity` / `counted_loose_quantity`), lui    │
 * │ recomposant le total. Faire poser la multiplication au magasinier, c'est │
 * │ lui faire écrire un écart qu'il n'a pas constaté.                        │
 * │                                                                          │
 * │ Et c'est pire ici qu'ailleurs : sans les deux compteurs, un manquant de  │
 * │ scellés et un surplus d'unités isolées SE COMPENSENT dans le total et    │
 * │ disparaissent. L'écart est donc ventilé par canal, comme le serveur le   │
 * │ rend (`_difference_display`) : « -2 casiers, +5 bouteilles ».            │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * **L'ajustement est créé en BROUILLON.** Le stock ne bouge qu'à l'approbation,
 * un geste distinct et confirmé.
 */
import { useCallback, useMemo, useState } from "react";
import { View } from "react-native";
import { type Packaging } from "@vente-facile/core";

import { entrepotParDefaut } from "@/data/entrepot-defaut";
import { useLecture } from "@/data/live";
import { lireNombre } from "@/data/nombres";
import { entrepots } from "@/data/stock";
import { niveauxDeStock } from "@/data/stock-niveaux";
import { TYPE_AJUSTEMENT } from "@/data/stock-operations";
import { creerAjustement } from "@/features/stock/actes";
import {
  afficherPartage,
  ecartDuComptage,
  ligneAjustement,
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

const OPTIONS_MOTIF: OptionSelect[] = Object.entries(TYPE_AJUSTEMENT).map(
  ([valeur, label]) => ({ valeur, label })
);

/** Une ligne de comptage, telle qu'elle se relit sur le formulaire. */
interface LigneComptage {
  produit: string;
  nom: string;
  conditionnement: Packaging | null;
  /** Le THÉORIQUE, relevé sur la ligne de stock. Ses deux compteurs sont LUS. */
  attendu: PartageStock;
  /** Ce qui a été compté, dans les deux canaux. */
  contenantsComptes: number | null;
  vracCompte: number | null;
  /** Total compté, recomposé pour l'affichage seul. */
  compte: number;
}

/** L'article en cours de comptage, avec son théorique. */
interface ArticleEnCours {
  id: string;
  nom: string;
  sku: string | null;
  conditionnement: Packaging | null;
  attendu: PartageStock;
}

function lire(saisie: string): { valeur: number | null; erreur?: string } {
  if (!saisie.trim()) return { valeur: null };
  const l = lireNombre(saisie);
  if (l.ok) return { valeur: l.valeur ?? null };
  return {
    valeur: null,
    erreur:
      l.motif === "negatif"
        ? "Un comptage négatif ne se relève pas : on compte ce qu'on voit."
        : "Comptage illisible. Écrivez par exemple 12 ou 1,5.",
  };
}

export function FeuilleNouvelAjustement({
  onFermer,
  onCree,
}: {
  onFermer: () => void;
  /** L'ajustement est au journal : à l'appelant d'ouvrir sa fiche. */
  onCree: (id: string) => void;
}) {
  const toast = useToast();

  const [entrepotChoisi, setEntrepotChoisi] = useState<string | null>(null);
  const [type, setType] = useState("count");
  const [motif, setMotif] = useState("");
  const [lignes, setLignes] = useState<LigneComptage[]>([]);
  const [envoi, setEnvoi] = useState(false);

  const [choix, setChoix] = useState<DemandeChoix | null>(null);
  const [panneauArticle, setPanneauArticle] = useState(false);
  const [recherche, setRecherche] = useState("");
  const [choisi, setChoisi] = useState<ArticleEnCours | null>(null);
  const [contenants, setContenants] = useState("");
  const [vrac, setVrac] = useState("");
  const [erreurs, setErreurs] = useState<ErreursQuantite>({});

  const { donnees: depots } = useLecture(entrepots, { tables: ["warehouses"] });

  /**
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ LE DÉFAUT SE DÉRIVE, IL NE SE POSE PAS DANS UN EFFET.               │
   * │                                                                      │
   * │ Un `setState` synchrone dans un effet est un rendu de plus à chaque  │
   * │ arrivée de données, et une règle qui dépend de l'ORDRE des effets.   │
   * │ Dérivée, la valeur est juste dès le premier rendu où les dépôts sont │
   * │ là, et un choix explicite l'emporte.                                  │
   * │                                                                      │
   * │ Un choix unique n'est pas un choix : l'entrepôt principal (ou        │
   * │ l'unique) est proposé d'emblée. La règle vit dans `entrepotParDefaut`,│
   * │ avec son test.                                                        │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  const entrepot = entrepotChoisi ?? entrepotParDefaut(depots);

  const chargerLignes = useCallback(
    () =>
      panneauArticle && entrepot
        ? niveauxDeStock({ entrepot, recherche, limite: 40 })
        : Promise.resolve({ elements: [], total: 0 }),
    [panneauArticle, entrepot, recherche]
  );
  const { donnees: niveaux } = useLecture(chargerLignes, {
    tables: ["stocks", "products", "units"],
    deps: [panneauArticle, entrepot, recherche],
  });

  const optionsEntrepot: OptionSelect[] = (depots ?? []).map((d) => ({
    valeur: d.id,
    label: d.nom,
  }));
  const nomEntrepot = optionsEntrepot.find((o) => o.valeur === entrepot)?.label;

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

  const recap = resumeConversion(saisie, "comptez");
  // L'écart se lit PENDANT la saisie, pas après l'ajout : c'est lui qui dit au
  // magasinier s'il doit recompter, et le découvrir une ligne plus bas est déjà
  // trop tard.
  const ecartEnCours =
    choisi && (nContenants.valeur != null || nVrac.valeur != null)
      ? ecartDuComptage(choisi.conditionnement, choisi.attendu, saisie)
      : null;

  const bloque =
    envoi || !entrepot || motif.trim().length === 0 || lignes.length === 0;

  /** Ouvre le panneau de comptage sur un article, vierge ou en reprise. */
  const ouvrirArticle = (a: ArticleEnCours, reprise?: LigneComptage) => {
    setChoisi(a);
    setContenants(
      reprise?.contenantsComptes != null ? String(reprise.contenantsComptes) : ""
    );
    setVrac(
      reprise
        ? a.conditionnement
          ? String(reprise.vracCompte ?? "")
          : String(reprise.compte)
        : ""
    );
    setErreurs({});
    setPanneauArticle(true);
  };

  const ajouter = () => {
    if (!choisi) return;

    const mauvais: ErreursQuantite = {};
    if (nContenants.erreur) mauvais.contenants = nContenants.erreur;
    if (nVrac.erreur) mauvais.vrac = nVrac.erreur;
    // ZÉRO EST UNE VALEUR ICI, et une valeur qui compte : un rayon vide face à
    // un théorique de dix est précisément l'écart qu'un ajustement existe pour
    // écrire. C'est la saisie VIDE qui est refusée, pas le zéro.
    const metier = verifierQuantite(saisie, { zeroAccepte: true });
    if (!mauvais.contenants && metier.contenants) mauvais.contenants = metier.contenants;
    if (!mauvais.vrac && metier.vrac) mauvais.vrac = metier.vrac;
    setErreurs(mauvais);
    if (Object.keys(mauvais).length > 0) return;

    const ligne = ligneAjustement(choisi.id, choisi.attendu, saisie);
    setLignes((l) => [
      // Le même article deux fois n'est pas deux comptages : le second REMPLACE
      // le premier, et l'écran l'a rouvert avec ses valeurs.
      ...l.filter((x) => x.produit !== choisi.id),
      {
        produit: choisi.id,
        nom: choisi.nom,
        conditionnement: choisi.conditionnement,
        attendu: choisi.attendu,
        contenantsComptes: ligne.contenantsComptes ?? null,
        vracCompte: choisi.conditionnement ? (ligne.vracCompte ?? null) : (saisie.vrac ?? 0),
        compte: ligne.compte,
      },
    ]);
    setChoisi(null);
    setContenants("");
    setVrac("");
    setErreurs({});
    setPanneauArticle(false);
  };

  const valider = async () => {
    if (bloque || !entrepot) return;
    setEnvoi(true);
    try {
      const id = await creerAjustement({
        entrepot,
        type,
        motif: motif.trim(),
        lignes: lignes.map((l) =>
          ligneAjustement(l.produit, l.attendu, {
            conditionnement: l.conditionnement,
            contenants: l.contenantsComptes,
            vrac: l.vracCompte,
          })
        ),
      });
      toast.succes("Ajustement créé en brouillon. Il partira à la prochaine synchronisation.");
      onCree(id);
    } catch (e) {
      toast.erreur(e instanceof Error ? e.message : "L'ajustement n'a pas pu être enregistré.");
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
      ? (choisi?.nom ?? "Compter un article")
      : "Nouvel ajustement";

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
      ) : panneauArticle ? (
        choisi ? (
          <>
            {/* Le théorique est RELEVÉ, jamais saisi : le laisser modifiable
                permettrait d'écrire un écart qui n'existe pas. Ses deux
                compteurs sont LUS sur la ligne de stock, jamais redécoupés
                depuis leur somme. */}
            <View className="mb-4 flex-row items-center gap-2 rounded-lg bg-muted px-3 py-2.5">
              <Icon name="Boxes" size={16} color="mutedForeground" />
              <Text variant="caption" className="flex-1">
                {`Le système attend : ${afficherPartage(
                  choisi.conditionnement,
                  choisi.attendu
                )}`}
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
              libelleSimple="Quantité comptée"
              recapitulatif={recap}
            />

            {ecartEnCours ? (
              <View className="mb-4 flex-row items-center justify-between rounded-lg border border-border px-3 py-2.5">
                <Text variant="caption">Écart constaté</Text>
                <Text
                  variant="bodySmall"
                  numeric
                  className={`font-sans-semibold ${
                    ecartEnCours.signe < 0
                      ? "text-destructive"
                      : ecartEnCours.signe > 0
                        ? "text-success"
                        : "text-muted-foreground"
                  }`}
                >
                  {/* Un écart NUL reste neutre : le peindre en vert ferait du
                      vert la couleur ordinaire de l'écran, et on ne verrait
                      plus le vrai. Même règle que partout ailleurs. */}
                  {ecartEnCours.signe === 0 ? "Conforme" : ecartEnCours.texte}
                </Text>
              </View>
            ) : null}

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
            {(niveaux?.elements ?? []).length === 0 ? (
              <Text variant="caption">
                {recherche
                  ? "Aucun article ne correspond dans cet entrepôt."
                  : "Cherchez un article par son nom ou son code."}
              </Text>
            ) : (
              <View>
                {(niveaux?.elements ?? []).map((n) => (
                  <DataRow
                    key={n.id}
                    principal={n.produit}
                    secondaire={n.sku}
                    chevron={false}
                    valeur={
                      <Text variant="caption" numeric>
                        {n.quantiteAffichee}
                      </Text>
                    }
                    onPress={() =>
                      ouvrirArticle(
                        {
                          id: n.produitId,
                          nom: n.produit,
                          sku: n.sku,
                          conditionnement: n.conditionnement,
                          attendu: {
                            contenants: n.contenants,
                            vrac: n.vrac,
                            total: n.total,
                          },
                        },
                        lignes.find((l) => l.produit === n.produitId)
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
          <FormField label="Entrepôt" required>
            <DeclencheurSelect
              libelle={nomEntrepot ?? "Choisir un entrepôt"}
              actif={Boolean(nomEntrepot)}
              accessibilityLabel="Entrepôt"
              onPress={() =>
                setChoix({
                  titre: "Entrepôt",
                  options: optionsEntrepot,
                  valeur: entrepot,
                  onChoisir: (v) => {
                    // L'entrepôt décide du THÉORIQUE de chaque ligne : garder
                    // les comptages ferait écrire des écarts contre le stock
                    // d'un autre dépôt.
                    if (v !== entrepot) setLignes([]);
                    setEntrepotChoisi(v);
                  },
                  messageVide: "Aucun entrepôt n'est encore descendu sur ce terminal.",
                })
              }
            />
          </FormField>

          <FormField label="Motif de l'ajustement" required>
            <DeclencheurSelect
              libelle={TYPE_AJUSTEMENT[type] ?? type}
              actif
              accessibilityLabel="Motif de l'ajustement"
              onPress={() =>
                setChoix({
                  titre: "Motif de l'ajustement",
                  options: OPTIONS_MOTIF,
                  valeur: type,
                  // Le motif a toujours une valeur : le remettre à `null`
                  // ferait un ajustement que le serveur refuse.
                  onChoisir: (v) => setType(v ?? type),
                })
              }
            />
          </FormField>

          <FormField
            label="Explication"
            required
            hint="Elle figure sur la pièce et dans l'historique."
          >
            <Input
              value={motif}
              onChangeText={setMotif}
              placeholder="Comptage du 30/08, casse en réserve…"
            />
          </FormField>

          <View className="mb-4 overflow-hidden rounded-xl border border-border">
            <View className="px-4 pt-3">
              <CardHeader
                title={`Comptage (${lignes.length})`}
                right={
                  <Button
                    size="sm"
                    variant="outline"
                    leftIcon="Plus"
                    disabled={!entrepot}
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
                  {entrepot ? "Aucune ligne comptée." : "Choisissez d'abord l'entrepôt."}
                </Text>
              </View>
            ) : (
              lignes.map((l, i) => {
                const ecart = ecartDuComptage(l.conditionnement, l.attendu, {
                  conditionnement: l.conditionnement,
                  contenants: l.contenantsComptes,
                  vrac: l.vracCompte,
                });
                return (
                  <View key={l.produit}>
                    {i > 0 ? <Divider /> : null}
                    <DataRow
                      principal={l.nom}
                      // Les deux quantités sont rendues depuis les compteurs
                      // LUS et SAISIS, jamais redécoupées depuis leur somme.
                      secondaire={`Attendu ${afficherPartage(
                        l.conditionnement,
                        l.attendu
                      )} · Compté ${afficherPartage(l.conditionnement, {
                        contenants: l.contenantsComptes ?? 0,
                        vrac: l.vracCompte ?? 0,
                        total: l.compte,
                      })}`}
                      chevron={false}
                      // TOUCHER MODIFIE, IL NE SUPPRIME PAS : le geste naturel
                      // pour corriger un comptage effaçait la ligne en silence.
                      onPress={() =>
                        ouvrirArticle(
                          {
                            id: l.produit,
                            nom: l.nom,
                            sku: null,
                            conditionnement: l.conditionnement,
                            attendu: l.attendu,
                          },
                          l
                        )
                      }
                      valeur={
                        <View className="flex-row items-center gap-1">
                          <Text
                            variant="bodySmall"
                            numeric
                            className={`font-sans-medium ${
                              ecart.signe < 0
                                ? "text-destructive"
                                : ecart.signe > 0
                                  ? "text-success"
                                  : ""
                            }`}
                          >
                            {ecart.signe === 0 ? "Conforme" : ecart.texte}
                          </Text>
                          <IconButton
                            name="Trash2"
                            variant="ghost"
                            label={`Retirer ${l.nom}`}
                            onPress={() =>
                              setLignes((x) => x.filter((y) => y.produit !== l.produit))
                            }
                          />
                        </View>
                      }
                    />
                  </View>
                );
              })
            )}
          </View>

          <Banner
            tone="info"
            title="Le stock ne bouge pas encore"
            message="L'ajustement est créé en brouillon. Les écarts s'appliqueront à l'approbation, depuis sa fiche."
          />

          <Button fullWidth size="lg" disabled={bloque} onPress={() => void valider()}>
            {envoi ? "Enregistrement…" : "Créer l'ajustement"}
          </Button>
        </>
      )}
    </Sheet>
  );
}
