/**
 * Les filtres du livre de caisse et des dépenses, dans une feuille.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ POURQUOI UNE FEUILLE, ET NON UNE RANGÉE DE PLUS.                        │
 * │                                                                          │
 * │ Le back-office aligne cinq filtres sur une barre large. Sur un téléphone │
 * │ il faudrait caser recherche, sens, type, devise et période sur une       │
 * │ rangée qui défile : les derniers ne seraient jamais vus, et un filtre    │
 * │ qu'on ne voit pas est un filtre qui ne sert pas. Et surtout la PLAGE     │
 * │ PERSONNALISÉE demande DEUX sélecteurs de date, ce qu'aucune puce ne      │
 * │ peut porter.                                                             │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ `ChampSelect` ouvrirait SA feuille par-dessus celle-ci, et `Sheet` est un
 * `Modal` : on n'en empile pas deux. Les champs de choix posent donc
 * `DeclencheurSelect` et `retour` recule d'un panneau. Les deux `ChampDate`,
 * eux, passent sans détour : leur sélecteur est NATIF.
 *
 * **Les filtres s'appliquent immédiatement**, sans brouillon validé au pied :
 * la liste derrière se relit, le décompte du bouton « Voir » est vrai, et
 * fermer n'annule rien. C'est la grammaire des filtres du back-office.
 */
import { ChampsPerimetre } from "@/features/perimetre/champs-perimetre";
import type { OffrePerimetre } from "@/features/perimetre/filtre-perimetre";
import { useState } from "react";
import { View } from "react-native";

import {
  MODES_PERIODE,
  moisRecents,
  type ModePeriode,
  type PeriodeFiltre,
} from "@/data/periode-filtre";
import { TYPE_MOUVEMENT_CAISSE, libelleTypeCaisse } from "@/data/types-caisse";
import {
  aDesFiltresCaisse,
  aDesFiltresDepense,
  FILTRES_CAISSE_VIDES,
  FILTRES_DEPENSE_VIDES,
  type FiltresCaisse,
  type FiltresDepense,
} from "@/features/caisse/filtres";
import {
  Button, ChampDate, DeclencheurSelect, FormField, ListeChoix, Sheet, Text,
  type DemandeChoix, type OptionSelect,
} from "@/ui";

const OPTIONS_TYPE: OptionSelect[] = Object.entries(TYPE_MOUVEMENT_CAISSE).map(
  ([code, t]) => ({ valeur: code, label: t.label })
);

const OPTIONS_MODE: OptionSelect[] = MODES_PERIODE.map((m) => ({
  valeur: m.valeur,
  label: m.label,
}));

/**
 * Le bloc de période, partagé par les deux feuilles.
 *
 * Il était sur le point d'exister en TROIS copies - le stock a la sienne, et
 * caisse plus dépenses en auraient fait deux de plus. Trois copies d'un mode
 * « mois précis » finissent par se répondre différemment sur février.
 */
function BlocPeriode({
  periode,
  onChanger,
  demanderChoix,
}: {
  periode: PeriodeFiltre;
  onChanger: (p: PeriodeFiltre) => void;
  demanderChoix: (d: DemandeChoix) => void;
}) {
  const p = periode;
  const nomMode = MODES_PERIODE.find((m) => m.valeur === p.mode)?.label;
  const nomMois = p.mois
    ? (moisRecents().find((m) => m.valeur === p.mois)?.label ?? p.mois)
    : undefined;

  return (
    <>
      <FormField label="Période">
        <DeclencheurSelect
          libelle={nomMode ?? "Tout l'historique"}
          actif={p.mode !== "tout"}
          accessibilityLabel="Période"
          onPress={() =>
            demanderChoix({
              titre: "Période",
              options: OPTIONS_MODE,
              valeur: p.mode,
              onChoisir: (v) => {
                const mode = (v ?? "tout") as ModePeriode;
                // Le mois se propose d'emblée : un mode « mois » sans mois
                // retomberait sur le courant en silence, et l'écran
                // n'annoncerait pas la période qu'il applique.
                onChanger(
                  mode === "mois"
                    ? { mode, mois: p.mois ?? moisRecents()[0].valeur }
                    : mode === "personnalisee"
                      ? { mode, debut: p.debut, fin: p.fin }
                      : { mode }
                );
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
              demanderChoix({
                titre: "Mois",
                options: moisRecents(),
                valeur: p.mois ?? null,
                onChoisir: (v) => onChanger({ mode: "mois", mois: v ?? undefined }),
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
                onChange={(v) => onChanger({ ...p, mode: "personnalisee", debut: v })}
                maximum={p.fin}
                accessibilityLabel="Date de début"
              />
            </FormField>
          </View>
          <View className="flex-1">
            <FormField label="Au">
              <ChampDate
                valeur={p.fin ?? ""}
                onChange={(v) => onChanger({ ...p, mode: "personnalisee", fin: v })}
                minimum={p.debut}
                accessibilityLabel="Date de fin"
              />
            </FormField>
          </View>
        </View>
      ) : null}
    </>
  );
}

/** Le pied commun : réinitialiser, puis le décompte de ce qu'on va voir. */
function Pied({
  actif,
  onReinitialiser,
  onFermer,
  nombre,
  singulier,
  pluriel,
}: {
  actif: boolean;
  onReinitialiser: () => void;
  onFermer: () => void;
  nombre: number;
  singulier: string;
  pluriel: string;
}) {
  return (
    <>
      {actif ? (
        <Button variant="ghost" fullWidth onPress={onReinitialiser}>
          Réinitialiser les filtres
        </Button>
      ) : null}
      <Button fullWidth size="lg" onPress={onFermer}>
        {nombre === 1 ? `Voir ${singulier}` : `Voir les ${nombre} ${pluriel}`}
      </Button>
      <Text variant="caption">
        Les filtres s&apos;appliquent aussitôt : fermer n&apos;annule rien.
      </Text>
    </>
  );
}

/* Les mêmes phrases sur le déclencheur fermé et sur la première ligne de la
   liste : voir `features/perimetre/champs-perimetre.tsx`, qui porte le motif. */
const TOUS_TYPES = "Tous les types";
const TOUTES_CATEGORIES = "Toutes les catégories";
const TOUTES_DEVISES = "Toutes les devises";

export function FeuilleFiltresCaisse({
  ouvert,
  onFermer,
  valeur,
  onChanger,
  nombreDeResultats,
  perimetre,
  devises,
}: {
  ouvert: boolean;
  onFermer: () => void;
  valeur: FiltresCaisse;
  onChanger: (f: FiltresCaisse) => void;
  nombreDeResultats: number;
  /** Ce que le rôle autorise : la feuille le rend, elle n'en décide rien. */
  perimetre: OffrePerimetre;
  /** Les devises de l'établissement. Vide ou unique : le champ disparaît. */
  devises: OptionSelect[];
}) {
  const [choix, setChoix] = useState<DemandeChoix | null>(null);
  const reculer = () => (choix ? setChoix(null) : onFermer());

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
          libelleVide={choix.libelleVide}
          messageVide={choix.messageVide}
        />
      ) : (
        <>
          <ChampsPerimetre
            offre={perimetre}
            valeur={valeur}
            onChanger={(perim) => onChanger({ ...valeur, ...perim })}
            setChoix={setChoix}
          />

          <FormField label="Type de mouvement">
            <DeclencheurSelect
              libelle={valeur.type ? libelleTypeCaisse(valeur.type) : TOUS_TYPES}
              actif={Boolean(valeur.type)}
              accessibilityLabel="Type de mouvement"
              onPress={() =>
                setChoix({
                  titre: "Type de mouvement",
                  options: OPTIONS_TYPE,
                  valeur: valeur.type,
                  onChoisir: (v) => onChanger({ ...valeur, type: v }),
                  libelleVide: TOUS_TYPES,
                })
              }
            />
          </FormField>

          {/* Un choix unique n'est pas un choix : sur un établissement
              mono-devise, le champ n'aurait qu'une seule réponse possible. */}
          {devises.length > 1 ? (
            <FormField
              label="Devise"
              hint="Celle des billets. Le tiroir contient des liasses distinctes."
            >
              <DeclencheurSelect
                libelle={valeur.devise ?? TOUTES_DEVISES}
                actif={Boolean(valeur.devise)}
                accessibilityLabel="Devise"
                onPress={() =>
                  setChoix({
                    titre: "Devise",
                    options: devises,
                    valeur: valeur.devise,
                    onChoisir: (v) => onChanger({ ...valeur, devise: v }),
                    libelleVide: TOUTES_DEVISES,
                  })
                }
              />
            </FormField>
          ) : null}

          <BlocPeriode
            periode={valeur.periode}
            onChanger={(periode) => onChanger({ ...valeur, periode })}
            demanderChoix={setChoix}
          />

          <Pied
            actif={aDesFiltresCaisse(valeur)}
            onReinitialiser={() => onChanger(FILTRES_CAISSE_VIDES)}
            onFermer={onFermer}
            nombre={nombreDeResultats}
            singulier="le mouvement"
            pluriel="mouvements"
          />
        </>
      )}
    </Sheet>
  );
}

export function FeuilleFiltresDepense({
  ouvert,
  onFermer,
  valeur,
  onChanger,
  nombreDeResultats,
  perimetre,
  categories,
  devises,
}: {
  ouvert: boolean;
  onFermer: () => void;
  valeur: FiltresDepense;
  onChanger: (f: FiltresDepense) => void;
  nombreDeResultats: number;
  perimetre: OffrePerimetre;
  categories: OptionSelect[];
  devises: OptionSelect[];
}) {
  const [choix, setChoix] = useState<DemandeChoix | null>(null);
  const reculer = () => (choix ? setChoix(null) : onFermer());
  const nomCategorie = categories.find((c) => c.valeur === valeur.categorie)?.label;

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
          libelleVide={choix.libelleVide}
          messageVide={choix.messageVide}
        />
      ) : (
        <>
          <ChampsPerimetre
            offre={perimetre}
            valeur={valeur}
            onChanger={(perim) => onChanger({ ...valeur, ...perim })}
            setChoix={setChoix}
          />

          <FormField label="Catégorie">
            <DeclencheurSelect
              libelle={nomCategorie ?? TOUTES_CATEGORIES}
              actif={Boolean(nomCategorie)}
              accessibilityLabel="Catégorie"
              onPress={() =>
                setChoix({
                  titre: "Catégorie",
                  options: categories,
                  valeur: valeur.categorie,
                  onChoisir: (v) => onChanger({ ...valeur, categorie: v }),
                  libelleVide: TOUTES_CATEGORIES,
                  messageVide:
                    "Aucune catégorie de dépense n'est encore descendue sur ce terminal.",
                })
              }
            />
          </FormField>

          {devises.length > 1 ? (
            <FormField label="Devise">
              <DeclencheurSelect
                libelle={valeur.devise ?? TOUTES_DEVISES}
                actif={Boolean(valeur.devise)}
                accessibilityLabel="Devise"
                onPress={() =>
                  setChoix({
                    titre: "Devise",
                    options: devises,
                    valeur: valeur.devise,
                    onChoisir: (v) => onChanger({ ...valeur, devise: v }),
                    libelleVide: TOUTES_DEVISES,
                  })
                }
              />
            </FormField>
          ) : null}

          <BlocPeriode
            periode={valeur.periode}
            onChanger={(periode) => onChanger({ ...valeur, periode })}
            demanderChoix={setChoix}
          />

          <Pied
            actif={aDesFiltresDepense(valeur)}
            onReinitialiser={() => onChanger(FILTRES_DEPENSE_VIDES)}
            onFermer={onFermer}
            nombre={nombreDeResultats}
            singulier="la dépense"
            pluriel="dépenses"
          />
        </>
      )}
    </Sheet>
  );
}
