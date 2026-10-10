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

import { entrepotParDefaut } from "@/data/entrepot-defaut";
import { useLecture } from "@/data/live";
import { lireNombre } from "@/data/nombres";
import { lignesProposees, type LigneProposee } from "@/data/requisitions";
import { entrepotsSansValorisation } from "@/data/stock";
import { creerRequisition, type LigneSaisie } from "@/features/stock/actes-requisition";
import { entrepotsAccessibles } from "@/features/perimetre/entrepots";
import { useSession } from "@/session/provider";
import {
  Banner, Button, Checkbox, DeclencheurSelect, Divider, EmptyState, FormField,
  Input, ListeChoix, SearchInput, Sheet, Spinner, Text, useToast,
  type DemandeChoix,
} from "@/ui";

/** Une ligne du bordereau, telle qu'elle se relit sur le formulaire. */
interface LigneRequise extends LigneSaisie {
  nom: string;
  sku: string | null;
  unite: string | null;
  stockAffiche: string;
  seuil: number;
  /** La saisie BRUTE : le champ garde ce qui est tapé, pas ce qu'on en déduit. */
  saisie: string;
  retenue: boolean;
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
}: {
  onFermer: () => void;
  /** La réquisition est au journal : à l'appelant d'ouvrir sa fiche. */
  onCree: (id: string) => void;
}) {
  const toast = useToast();
  const { snapshot } = useSession();
  const role = snapshot?.membership.role ?? null;
  // Mémoïsé : un `?? []` fabrique un tableau NEUF à chaque rendu, et le
  // `useMemo` qui suit se recalculerait donc toujours - la famille de défaut
  // qui a fait tourner l'écran d'encaissement en boucle.
  const assignes = useMemo(
    () => snapshot?.membership.assigned_warehouses ?? [],
    [snapshot?.membership.assigned_warehouses]
  );

  const [entrepotChoisi, setEntrepotChoisi] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [recherche, setRecherche] = useState("");
  const [rupturesSeules, setRupturesSeules] = useState(false);
  const [lignes, setLignes] = useState<LigneRequise[]>([]);
  const [choix, setChoix] = useState<DemandeChoix | null>(null);
  const [envoi, setEnvoi] = useState(false);

  const { donnees: depots } = useLecture(entrepotsSansValorisation, {
    tables: ["warehouses"],
  });

  /**
   * Le défaut se DÉRIVE, il ne se pose pas dans un effet - motif de
   * `feuille-transfert`. Et il se prend dans les entrepôts ACCESSIBLES :
   * `create_requisition` oppose `assert_warehouse_allowed_for_request`, donc
   * proposer le dépôt principal à un magasinier qui ne l'a pas enverrait sa
   * demande en quarantaine.
   */
  const accessibles = useMemo(
    () => entrepotsAccessibles(role, assignes, depots ?? []),
    [role, assignes, depots]
  );
  const entrepot = entrepotChoisi ?? entrepotParDefaut(accessibles);

  const chargerProposition = useCallback(
    () =>
      entrepot
        ? lignesProposees(entrepot, { rupturesSeules, recherche })
        : Promise.resolve([] as LigneProposee[]),
    [entrepot, rupturesSeules, recherche]
  );
  const { donnees: proposition, chargement } = useLecture(chargerProposition, {
    tables: ["stocks", "products"],
    deps: [entrepot, rupturesSeules, recherche],
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
  const bordereau = useMemo<LigneRequise[]>(() => {
    const saisies = new Map(lignes.map((l) => [l.produit, l]));
    return (proposition ?? []).map((p) => {
      const deja = saisies.get(p.produitId);
      if (deja) return deja;
      return {
        produit: p.produitId,
        nom: p.produit,
        sku: p.sku,
        unite: p.unite,
        stockAffiche: p.stockAffiche,
        seuil: p.seuil,
        quantite: p.suggere,
        saisie: String(p.suggere),
        retenue: true,
      };
    });
  }, [proposition, lignes]);

  const modifier = useCallback((produitId: string, patch: Partial<LigneRequise>) => {
    setLignes((avant) => {
      const base = bordereau.find((l) => l.produit === produitId);
      if (!base) return avant;
      const sans = avant.filter((l) => l.produit !== produitId);
      return [...sans, { ...base, ...patch }];
    });
  }, [bordereau]);

  const retenues = bordereau.filter((l) => l.retenue && l.quantite > 0);

  const enregistrer = useCallback(async () => {
    if (!entrepot || retenues.length === 0) return;
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
  }, [entrepot, retenues, notes, snapshot, toast, onCree]);

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

  return (
    <Sheet
      ouvert
      titre="Nouvelle réquisition"
      onFermer={onFermer}
      pied={
        <View className="gap-2">
          <Text variant="caption" className="text-muted-foreground">
            {retenues.length === 0
              ? "Cochez au moins un article à demander."
              : `${retenues.length} ${retenues.length > 1 ? "articles" : "article"} à demander`}
          </Text>
          <Button
            fullWidth
            size="lg"
            onPress={() => void enregistrer()}
            disabled={retenues.length === 0 || !entrepot || envoi}
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

        <Divider />

        {chargement && bordereau.length === 0 ? (
          <View className="items-center py-8">
            <Spinner />
          </View>
        ) : bordereau.length === 0 ? (
          <EmptyState
            variante="carte"
            title="Rien ne manque"
            message={
              recherche
                ? "Aucun article sous son seuil ne correspond à votre recherche."
                : "Aucun article n'est sous son point de réapprovisionnement dans ce dépôt."
            }
          />
        ) : (
          bordereau.map((l, i) => (
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
                      {`En rayon ${l.stockAffiche} · seuil ${formatNumberFr(l.seuil, 0)}`}
                    </Text>
                  </View>
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
