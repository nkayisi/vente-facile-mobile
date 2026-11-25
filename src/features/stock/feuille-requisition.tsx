/**
 * Demander ce qui manque, dans une FEUILLE plutôt que dans un écran.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ELLE S'OUVRE DÉJÀ REMPLIE, ET C'EST LE RETOUR DE TEST MOT POUR MOT :   │
 * │ « proposer d'emblée les articles déjà sous leur seuil ».                 │
 * │                                                                          │
 * │ Un formulaire vide obligerait le magasinier à chercher un par un les     │
 * │ articles qu'il vient de voir manquer en rayon - c'est-à-dire à refaire à │
 * │ la main le travail que `reorder_point` existe pour faire.                │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ LA PROPOSITION EST LOCALE. `lignesProposees` lit la base du terminal, pas
 * `GET /requisitions/proposer/` : un rayon vide se constate au fond du dépôt,
 * là où il n'y a pas de réseau. Les deux surfaces partent du MÊME critère
 * (`proposerDepuisRayons`, miroir de `lignes_proposees`).
 *
 * ⚠ ET ELLE SE CORRIGE. La quantité suggérée remonte au seuil ; le magasinier
 * sait qu'un carton en contient vingt-quatre et que le fournisseur ne vend pas
 * à l'unité. Une proposition qu'on ne peut pas corriger est un ordre.
 */
import { useCallback, useMemo, useState } from "react";
import { View } from "react-native";
import { formatNumberFr } from "@vente-facile/core";

import { chercherArticlesPourTransfert } from "@/data/articles";
import { useLecture } from "@/data/live";
import { lireNombre } from "@/data/nombres";
import { lignesProposees, type LigneProposee } from "@/data/requisitions";
import { garderBrouillon } from "@/features/brouillons/brouillon-feuille";
import { CreationDepuisRecherche } from "@/features/inventaire/creation-depuis-recherche";
import { usePropositionCreation } from "@/features/inventaire/use-proposition-creation";
import { creerRequisition } from "@/features/stock/actes-requisition";
import {
  composerBordereau,
  filtrerAffichage,
  ligneAjoutee,
  lignesRetenues,
  nombreDeRefus,
  type LigneRequise,
} from "@/features/stock/bordereau-requisition";
import { afficherPartage } from "@/features/stock/lignes-conditionnees";
import { useEntrepotsDuMembre } from "@/features/perimetre/use-entrepots";
import { useSession } from "@/session/provider";
import {
  Banner, Button, Checkbox, DataRow, DeclencheurSelect, Divider, EmptyState, FormField,
  IconButton, Input, ListeChoix, SearchInput, Sheet, Spinner, Text, useToast,
  type DemandeChoix, VignetteArticle } from "@/ui";

/** La clé du brouillon : la feuille se rouvre telle quelle après une création. */
export const BROUILLON_REQUISITION = "requisition";

/** Ce que la feuille garde le temps d'aller créer un article. */
export interface BrouillonRequisition {
  entrepot: string | null;
  notes: string;
  rupturesSeules: boolean;
  lignes: LigneRequise[];
}

/** Ce que `lireNombre` refuse, dit dans les mots de cet écran. */
function lire(saisie: string): { valeur: number | null; erreur?: string } {
  if (!saisie.trim()) return { valeur: null };
  const l = lireNombre(saisie);
  if (l.ok) return { valeur: l.valeur ?? null };
  return {
    valeur: null,
    erreur:
      l.motif === "negatif"
        ? "Une quantité négative ne se demande pas."
        : "Quantité illisible. Écrivez par exemple 24 ou 1,5.",
  };
}

export function FeuilleNouvelleRequisition({
  onFermer,
  onCree,
  brouillon = null,
}: {
  onFermer: () => void;
  /** La réquisition est au journal : à l'appelant d'ouvrir sa fiche. */
  onCree: (id: string) => void;
  /** La saisie d'avant une création d'article, à reprendre telle quelle. */
  brouillon?: BrouillonRequisition | null;
}) {
  const toast = useToast();
  const { snapshot } = useSession();
  // Une réquisition est une ACTION : seuls les entrepôts où le membre agit,
  // actifs, sont proposés. Un dépôt seulement lisible (case « Consulter
  // tous ») ou désactivé ferait revenir la demande en quarantaine.
  const { actionnables: accessibles, parDefaut } = useEntrepotsDuMembre();

  const [entrepotChoisi, setEntrepotChoisi] = useState<string | null>(brouillon?.entrepot ?? null);
  const [notes, setNotes] = useState(brouillon?.notes ?? "");
  const [recherche, setRecherche] = useState("");
  const [rupturesSeules, setRupturesSeules] = useState(brouillon?.rupturesSeules ?? false);
  const [lignes, setLignes] = useState<LigneRequise[]>(brouillon?.lignes ?? []);
  const [choix, setChoix] = useState<DemandeChoix | null>(null);
  const [envoi, setEnvoi] = useState(false);
  // Le panneau « Ajouter un article », dans la MÊME feuille : `Sheet` est un
  // `Modal`, on n'en empile pas un second.
  const [ajout, setAjout] = useState(false);
  const [termeAjout, setTermeAjout] = useState("");
  const proposer = usePropositionCreation();

  /**
   * Le défaut se DÉRIVE, il ne se pose pas dans un effet - motif de
   * `feuille-transfert`. Et il se prend dans les entrepôts ACTIONNABLES :
   * `create_requisition` oppose `exiger_entrepot_actionnable`, donc proposer
   * le dépôt principal à un magasinier qui ne l'a pas enverrait sa demande en
   * quarantaine.
   */
  const entrepot = entrepotChoisi ?? parDefaut;

  // La proposition se lit ENTIÈRE : la recherche ne filtre que l'affichage.
  const chargerProposition = useCallback(
    () =>
      entrepot
        ? lignesProposees(entrepot, { rupturesSeules })
        : Promise.resolve([] as LigneProposee[]),
    [entrepot, rupturesSeules]
  );
  const { donnees: proposition, chargement } = useLecture(chargerProposition, {
    tables: ["stocks", "products"],
    deps: [entrepot, rupturesSeules],
  });

  // Le catalogue n'est lu QUE pendant que le panneau d'ajout est ouvert.
  const chargerCatalogue = useCallback(
    () =>
      ajout && entrepot
        ? chercherArticlesPourTransfert(entrepot, termeAjout, 30)
        : Promise.resolve([]),
    [ajout, entrepot, termeAjout]
  );
  const { donnees: trouves } = useLecture(chargerCatalogue, {
    tables: ["products", "stocks"],
    deps: [ajout, entrepot, termeAjout],
  });

  /**
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ CE QUI EST SAISI PRIME SUR CE QUI EST PROPOSÉ.                      │
   * │                                                                      │
   * │ La proposition se relit dès qu'une vente bouge le stock - `stocks`   │
   * │ est dans les tables surveillées, et c'est voulu : un rayon qui vient │
   * │ de se vider doit apparaître. Mais la relecture ne doit JAMAIS        │
   * │ écraser une quantité que le magasinier a corrigée, ni décocher une   │
   * │ ligne qu'il a retirée. Les lignes saisies sont donc fusionnées PAR    │
   * │ ARTICLE, et c'est la saisie qui gagne.                               │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  const bordereau = useMemo(
    () => composerBordereau(proposition ?? [], lignes),
    [proposition, lignes]
  );
  const affichees = filtrerAffichage(bordereau, recherche);

  const modifier = useCallback((produitId: string, patch: Partial<LigneRequise>) => {
    setLignes((avant) => {
      const base = bordereau.find((l) => l.produit === produitId);
      if (!base) return avant;
      const sans = avant.filter((l) => l.produit !== produitId);
      return [...sans, { ...base, ...patch }];
    });
  }, [bordereau]);

  const retirer = useCallback((produitId: string) => {
    setLignes((avant) => avant.filter((l) => !(l.ajoutee && l.produit === produitId)));
  }, []);

  const retenues = lignesRetenues(bordereau);
  const refus = nombreDeRefus(bordereau);

  /** Créer un article : la feuille garde sa saisie, se ferme, et se rouvrira. */
  const avantCreation = useCallback(() => {
    garderBrouillon<BrouillonRequisition>(BROUILLON_REQUISITION, {
      entrepot,
      notes,
      rupturesSeules,
      lignes,
    });
    onFermer();
  }, [entrepot, notes, rupturesSeules, lignes, onFermer]);

  const enregistrer = useCallback(async () => {
    if (!entrepot || retenues.length === 0 || refus > 0) return;
    setEnvoi(true);
    try {
      const { id, reference } = await creerRequisition({
        entrepot,
        notes,
        codeAppareil: snapshot?.device?.device_code ?? "",
        lignes: retenues.map((l) => ({
          produit: l.produit,
          quantite: l.quantite,
        })),
      });
      toast.succes(`Réquisition ${reference} enregistrée. Elle partira à la prochaine synchronisation.`);
      onCree(id);
    } catch {
      // Un échec d'enfilement est une panne locale, pas un refus métier : on le
      // DIT, et on laisse le formulaire ouvert avec sa saisie.
      toast.erreur("La réquisition n'a pas pu être enregistrée.");
    } finally {
      setEnvoi(false);
    }
  }, [entrepot, retenues, refus, notes, snapshot, toast, onCree]);

  if (choix) {
    return (
      <Sheet ouvert titre={choix.titre} onFermer={() => setChoix(null)} retour={() => setChoix(null)}>
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
      </Sheet>
    );
  }

  if (ajout) {
    const fermerAjout = () => {
      setAjout(false);
      setTermeAjout("");
    };
    return (
      <Sheet ouvert titre="Ajouter un article" onFermer={fermerAjout} retour={fermerAjout}>
        <View className="gap-3">
          <SearchInput
            valeur={termeAjout}
            onChange={setTermeAjout}
            placeholder="Nom, code ou code-barres..."
          />
          {(trouves ?? []).length === 0 ? (
            termeAjout.trim() ? (
              <CreationDepuisRecherche
                creation={proposer(termeAjout, { avant: avantCreation })}
              />
            ) : (
              <Text variant="caption">
                Un article qui n&apos;est pas sous son seuil, ou jamais reçu dans ce dépôt.
              </Text>
            )
          ) : (
            <View>
              {(trouves ?? []).map((a) => {
                const deja = bordereau.some((l) => l.produit === a.id);
                return (
                  <DataRow
                    key={a.id}
                    principal={a.nom}
                    vignette={<VignetteArticle uri={a.image} />}
                    secondaire={deja ? "Déjà dans la demande" : a.sku}
                    chevron={false}
                    valeur={
                      <Text variant="caption" numeric>
                        {/* `null` n'est PAS zéro : aucun rayon ici. */}
                        {a.rayon ? afficherPartage(a.conditionnement, a.rayon) : "Aucun stock ici"}
                      </Text>
                    }
                    onPress={() => {
                      // Un article déjà au bordereau n'y entre pas deux fois :
                      // le serveur refuserait la demande entière.
                      if (!deja) {
                        setLignes((avant) => [
                          ...avant,
                          ligneAjoutee({
                            produit: a.id,
                            nom: a.nom,
                            sku: a.sku,
                            unite: a.conditionnement?.retailWord ?? null,
                            stockAffiche: a.rayon
                              ? afficherPartage(a.conditionnement, a.rayon)
                              : "aucun stock ici",
                          }),
                        ]);
                      }
                      fermerAjout();
                    }}
                  />
                );
              })}
            </View>
          )}
        </View>
      </Sheet>
    );
  }

  return (
    <Sheet
      ouvert
      titre="Nouvelle réquisition"
      onFermer={onFermer}
      pied={
        <View className="gap-2">
          <Text variant="caption" className="text-muted-foreground">
            {refus > 0
              ? `${refus} ${refus > 1 ? "quantités ne se lisent pas" : "quantité ne se lit pas"} : corrigez-${refus > 1 ? "les" : "la"} avant d'enregistrer.`
              : retenues.length === 0
              ? "Cochez au moins un article à demander."
              : `${retenues.length} ${retenues.length > 1 ? "articles" : "article"} à demander`}
          </Text>
          <Button
            fullWidth
            size="lg"
            onPress={() => void enregistrer()}
            disabled={retenues.length === 0 || refus > 0 || !entrepot || envoi}
          >
            {envoi ? "Enregistrement…" : "Enregistrer la demande"}
          </Button>
        </View>
      }
    >
      <View className="gap-4">
        {/* ⚠ `DeclencheurSelect` et non `ChampSelect` : ce dernier ouvre SA
            feuille, et `Sheet` est un `Modal` qu'on n'empile pas. */}
        <FormField label="Entrepôt" required>
          <DeclencheurSelect
            libelle={accessibles.find((d) => d.id === entrepot)?.nom ?? "Choisir un entrepôt"}
            actif={Boolean(entrepot)}
            accessibilityLabel="Entrepôt"
            onPress={() =>
              setChoix({
                titre: "Entrepôt",
                options: accessibles.map((d) => ({ valeur: d.id, label: d.nom })),
                valeur: entrepot,
                onChoisir: (v) => {
                  // La saisie appartient à l'entrepôt : la garder ferait
                  // demander pour le dépôt B des quantités relevées sur A.
                  if (v !== entrepot) setLignes([]);
                  setEntrepotChoisi(v);
                },
                messageVide: "Aucun entrepôt ne vous est assigné.",
              })
            }
          />
        </FormField>

        {!entrepot ? (
          /**
           * Un rôle borné SANS affectation le DIT. Le serveur refuserait la
           * demande, et un formulaire qui laisse saisir ce qui sera refusé est
           * pire qu'un formulaire fermé.
           */
          <Banner
            tone="warning"
            title="Aucun entrepôt ne vous est assigné"
            message="Une réquisition porte sur un dépôt. Demandez à votre gérant de vous en assigner un."
          />
        ) : null}

        <View className="flex-row items-center gap-2">
          <View className="flex-1">
            <SearchInput
              valeur={recherche}
              onChange={setRecherche}
              placeholder="Filtrer les articles..."
            />
          </View>
        </View>

        <Checkbox
          coche={rupturesSeules}
          onBasculer={() => setRupturesSeules((v) => !v)}
          label="Ruptures seulement"
          accessibilityHint="Ce qu'on emporte au marché quand on n'a pas le temps de tout racheter."
        />

        {/* Un article hors des suggestions : stock suffisant, ou jamais reçu
            dans ce dépôt. Le serveur l'accepte, la feuille le permet. */}
        {entrepot ? (
          <Button variant="outline" leftIcon="Plus" onPress={() => setAjout(true)}>
            Ajouter un article
          </Button>
        ) : null}

        <Divider />

        {chargement && bordereau.length === 0 ? (
          <View className="items-center py-8">
            <Spinner />
          </View>
        ) : affichees.length === 0 ? (
          <EmptyState
            variante="carte"
            title={recherche ? "Aucune ligne ne correspond" : "Rien ne manque"}
            message={
              recherche
                ? "La recherche ne filtre que l'affichage : les lignes cochées partent quand même."
                : "Aucun article n'est sous son point de réapprovisionnement dans ce dépôt. Ajoutez-en un ci-dessus."
            }
          />
        ) : (
          affichees.map((l, i) => (
            <View key={l.produit}>
              {i > 0 ? <Divider /> : null}
              <View className="gap-2 py-3">
                <View className="flex-row items-start gap-3">
                  <Checkbox
                    coche={l.retenue}
                    onBasculer={() => modifier(l.produit, { retenue: !l.retenue })}
                    label=""
                    accessibilityHint={`Demander ${l.nom}`}
                  />
                  <View className="flex-1">
                    <Text variant="body" className="font-sans-medium">
                      {l.nom}
                    </Text>
                    {/* Le stock ET le seuil : c'est ce qui JUSTIFIE la demande,
                        et c'est ce que le document imprimera. Le taire ferait
                        cocher à l'aveugle. */}
                    <Text variant="caption" className="text-muted-foreground">
                      {l.seuil == null
                        ? `En rayon ${l.stockAffiche} · ajouté à la main`
                        : `En rayon ${l.stockAffiche} · seuil ${formatNumberFr(l.seuil, 0)}`}
                    </Text>
                  </View>
                  {l.ajoutee ? (
                    <IconButton
                      name="X"
                      variant="ghost"
                      label={`Retirer ${l.nom}`}
                      onPress={() => retirer(l.produit)}
                    />
                  ) : null}
                </View>
                {l.retenue ? (
                  <View className="pl-8">
                    <FormField
                      label={l.unite ? `Quantité à demander (${l.unite})` : "Quantité à demander"}
                      error={lire(l.saisie).erreur}
                    >
                      <Input
                        value={l.saisie}
                        onChangeText={(v) =>
                          modifier(l.produit, {
                            saisie: v,
                            quantite: lire(v).valeur ?? 0,
                          })
                        }
                        keyboardType="decimal-pad"
                        placeholder="0"
                      />
                    </FormField>
                  </View>
                ) : null}
              </View>
            </View>
          ))
        )}

        <FormField label="Note">
          <Input
            value={notes}
            onChangeText={setNotes}
            placeholder="Chez qui l'acheter, pour quand…"
            multiline
          />
        </FormField>

        {/* ⚠ LE DOCUMENT VIENT DU SERVEUR, et l'écran le dit AVANT d'enregistrer.
            C'est la règle des documents A4 de ce dépôt : les recalculer sur le
            terminal donnerait deux papiers pour la même demande. */}
        <Banner
          tone="info"
          title="Elle s'enregistre hors ligne"
          message="La demande part à la prochaine synchronisation. Son bordereau à imprimer, lui, demande une connexion."
        />
      </View>
    </Sheet>
  );
}
