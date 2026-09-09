/**
 * Les filtres du journal, dans une feuille.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ POURQUOI UNE FEUILLE, ET NON UNE RANGÉE DE PLUS.                        │
 * │                                                                          │
 * │ Le back-office aligne cinq filtres sur une barre large. Sur un téléphone │
 * │ il faudrait caser recherche, sens, type, entrepôt, catégorie et période  │
 * │ sur une rangée qui défile : les derniers ne seraient jamais vus, et un   │
 * │ filtre qu'on ne voit pas est un filtre qui ne sert pas.                  │
 * │                                                                          │
 * │ Et surtout la PLAGE PERSONNALISÉE demande DEUX sélecteurs de date, ce    │
 * │ qu'aucune puce ne peut porter.                                           │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ Même contrainte que la feuille de saisie : `ChampSelect` ouvrirait SA
 * feuille par-dessus celle-ci. Les quatre champs de choix posent donc
 * `DeclencheurSelect`, et `retour` recule d'un panneau. Les deux `ChampDate`,
 * eux, passent sans détour : leur sélecteur est NATIF.
 *
 * **Les filtres s'appliquent immédiatement**, sans brouillon validé au pied :
 * la liste derrière se relit, le décompte du bouton « Voir » est vrai, et
 * fermer n'annule rien. C'est la grammaire des filtres du back-office.
 */
import { View } from "react-native";

import {
  MODES_PERIODE,
  moisRecents,
  PERIODE_TOUT,
  type ModePeriode,
} from "@/data/periode-filtre";
import { TYPE_MOUVEMENT_STOCK } from "@/data/types-mouvement";
import {
  aDesFiltres,
  type FiltresEcran,
} from "@/features/stock/filtres-mouvements";
import {
  Button, ChampDate, DeclencheurSelect, FormField, ListeChoix, Sheet, Text,
  type DemandeChoix, type OptionSelect,
} from "@/ui";
import { useState } from "react";

const OPTIONS_TYPE: OptionSelect[] = Object.entries(TYPE_MOUVEMENT_STOCK).map(
  ([code, t]) => ({ valeur: code, label: t.label })
);

const OPTIONS_MODE: OptionSelect[] = MODES_PERIODE.map((m) => ({
  valeur: m.valeur,
  label: m.label,
}));

export function FeuilleFiltresMouvements({
  ouvert,
  onFermer,
  valeur,
  onChanger,
  nombreDeResultats,
  entrepots,
  categories,
}: {
  ouvert: boolean;
  onFermer: () => void;
  valeur: FiltresEcran;
  onChanger: (f: FiltresEcran) => void;
  nombreDeResultats: number;
  entrepots: OptionSelect[];
  /** Déjà indentées par profondeur : « Sodas » se lit sous « Boissons ». */
  categories: OptionSelect[];
}) {
  const [choix, setChoix] = useState<DemandeChoix | null>(null);

  const reculer = () => {
    if (choix) return setChoix(null);
    onFermer();
  };

  const nomEntrepot = entrepots.find((o) => o.valeur === valeur.entrepot)?.label;
  const nomCategorie = categories.find((o) => o.valeur === valeur.categorie)?.label;
  const p = valeur.periode;
  const nomMode = MODES_PERIODE.find((m) => m.valeur === p.mode)?.label;
  const nomMois = p.mois
    ? moisRecents().find((m) => m.valeur === p.mois)?.label ?? p.mois
    : undefined;

  return (
    <Sheet
      ouvert={ouvert}
      onFermer={reculer}
      titre={choix ? choix.titre : "Filtres"}
      retour={choix ? reculer : undefined}
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
      ) : (
        <>
          <FormField label="Entrepôt">
            <DeclencheurSelect
              libelle={nomEntrepot ?? "Tous les entrepôts"}
              actif={Boolean(nomEntrepot)}
              accessibilityLabel="Entrepôt"
              onPress={() =>
                setChoix({
                  titre: "Entrepôt",
                  options: entrepots,
                  valeur: valeur.entrepot,
                  onChoisir: (v) => onChanger({ ...valeur, entrepot: v }),
                  messageVide: "Aucun entrepôt n'est encore descendu sur ce terminal.",
                })
              }
            />
          </FormField>

          <FormField
            label="Catégorie"
            // Le serveur filtre sur le sous-arbre entier, et son document
            // l'écrit : le taire ici ferait croire à un total de la seule
            // catégorie choisie.
            hint="Les sous-catégories sont incluses."
          >
            <DeclencheurSelect
              libelle={nomCategorie ?? "Toutes les catégories"}
              actif={Boolean(nomCategorie)}
              accessibilityLabel="Catégorie"
              onPress={() =>
                setChoix({
                  titre: "Catégorie",
                  options: categories,
                  valeur: valeur.categorie,
                  onChoisir: (v) => onChanger({ ...valeur, categorie: v }),
                  messageVide: "Aucune catégorie.",
                })
              }
            />
          </FormField>

          <FormField label="Type de mouvement">
            <DeclencheurSelect
              libelle={
                valeur.type
                  ? (TYPE_MOUVEMENT_STOCK[valeur.type]?.label ?? valeur.type)
                  : "Tous les types"
              }
              actif={Boolean(valeur.type)}
              accessibilityLabel="Type de mouvement"
              onPress={() =>
                setChoix({
                  titre: "Type de mouvement",
                  options: OPTIONS_TYPE,
                  valeur: valeur.type,
                  onChoisir: (v) => onChanger({ ...valeur, type: v }),
                })
              }
            />
          </FormField>

          <FormField label="Période">
            <DeclencheurSelect
              libelle={nomMode ?? "Tout l'historique"}
              actif={p.mode !== "tout"}
              accessibilityLabel="Période"
              onPress={() =>
                setChoix({
                  titre: "Période",
                  options: OPTIONS_MODE,
                  valeur: p.mode,
                  onChoisir: (v) => {
                    const mode = (v ?? "tout") as ModePeriode;
                    // Le mois se propose d'emblée : un mode « mois » sans mois
                    // retomberait sur le courant en silence, et l'écran
                    // n'annoncerait pas la période qu'il applique.
                    onChanger({
                      ...valeur,
                      periode:
                        mode === "mois"
                          ? { mode, mois: p.mois ?? moisRecents()[0].valeur }
                          : mode === "personnalisee"
                            ? { mode, debut: p.debut, fin: p.fin }
                            : { mode },
                    });
                  },
                })
              }
            />
          </FormField>

          {p.mode === "mois" ? (
            <FormField label="Mois">
              <DeclencheurSelect
                libelle={nomMois ?? "Choisir un mois"}
                actif={Boolean(nomMois)}
                accessibilityLabel="Mois"
                onPress={() =>
                  setChoix({
                    titre: "Mois",
                    // Douze entrées, une colonne, un coup d'oeil : il n'y a pas
                    // de sélecteur de mois natif, et aller au-delà se fait par
                    // la plage personnalisée.
                    options: moisRecents(),
                    valeur: p.mois ?? null,
                    onChoisir: (v) =>
                      onChanger({ ...valeur, periode: { mode: "mois", mois: v ?? undefined } }),
                  })
                }
              />
            </FormField>
          ) : null}

          {p.mode === "personnalisee" ? (
            <View className="flex-row gap-3">
              <View className="flex-1">
                <FormField label="Du">
                  <ChampDate
                    valeur={p.debut ?? ""}
                    onChange={(v) =>
                      onChanger({ ...valeur, periode: { ...p, mode: "personnalisee", debut: v } })
                    }
                    maximum={p.fin}
                    accessibilityLabel="Date de début"
                  />
                </FormField>
              </View>
              <View className="flex-1">
                <FormField label="Au">
                  <ChampDate
                    valeur={p.fin ?? ""}
                    onChange={(v) =>
                      onChanger({ ...valeur, periode: { ...p, mode: "personnalisee", fin: v } })
                    }
                    minimum={p.debut}
                    accessibilityLabel="Date de fin"
                  />
                </FormField>
              </View>
            </View>
          ) : null}

          {aDesFiltres(valeur) ? (
            <Button
              variant="ghost"
              fullWidth
              onPress={() =>
                onChanger({
                  recherche: "",
                  sens: null,
                  type: null,
                  entrepot: null,
                  categorie: null,
                  periode: PERIODE_TOUT,
                })
              }
            >
              Réinitialiser les filtres
            </Button>
          ) : null}

          <Button fullWidth size="lg" onPress={onFermer}>
            {nombreDeResultats === 1
              ? "Voir le mouvement"
              : `Voir les ${nombreDeResultats} mouvements`}
          </Button>
          <Text variant="caption">
            Les filtres s&apos;appliquent aussitôt : fermer n&apos;annule rien.
          </Text>
        </>
      )}
    </Sheet>
  );
}
