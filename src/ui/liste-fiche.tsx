/**
 * La liste et sa fiche, côte à côte sur un grand écran.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ SUR UNE TABLETTE, ON NE QUITTE PAS LA LISTE POUR LIRE UNE PIÈCE.        │
 * │                                                                          │
 * │ Sur un téléphone, toucher une vente pousse sa fiche et la liste          │
 * │ disparaît : il n'y a pas la place des deux. Sur une tablette, le         │
 * │ marchand qui relit dix ventes l'une après l'autre ferait dix allers et   │
 * │ retours, en perdant à chaque fois sa position dans la liste. La liste    │
 * │ reste donc à gauche, la ligne choisie surlignée, et la fiche s'ouvre à   │
 * │ droite : c'est la disposition des messageries et des clients de          │
 * │ courrier, et celle que le back-office prend dès qu'il en a la place.     │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Trois règles, et chacune répond à un défaut qu'aucune erreur ne signale :
 *
 * 1. ⚠ LA FICHE EST MONTÉE AVEC `key={id}`. Sans elle, passer d'une vente à la
 *    suivante réutiliserait le même composant : ses lectures, ses feuilles
 *    ouvertes et ses saisies glisseraient d'une pièce à l'autre, et un
 *    règlement tapé pour un client partirait sur le compte du suivant.
 * 2. ⚠ LA LISTE GARDE SA PLACE DANS L'ARBRE, QUE LA FICHE SOIT LÀ OU NON. Si
 *    elle changeait de rang en passant d'une colonne à deux, chaque rotation
 *    la remonterait : recherche effacée, filtres perdus, défilement remis en
 *    haut.
 * 3. ⚠ PASSER DE DEUX COLONNES À UNE AVEC UNE PIÈCE OUVERTE LA POUSSE. Une
 *    tablette qu'on tourne en portrait, ou qu'on partage avec une autre
 *    application, ne doit pas faire disparaître la fiche qu'on lisait.
 *
 * Le corps d'une fiche lit son identifiant par `useIdDeFiche()` et en sort par
 * `useSortieDeFiche()` : il ne sait pas s'il est une route ou un volet, et
 * c'est ce qui permet au même code de servir les deux.
 */
import {
  useCallback,
  useContext,
  useEffect,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import { View } from "react-native";
import { router, useIsFocused, useLocalSearchParams } from "expo-router";
import type { Edge } from "react-native-safe-area-context";

import { Volet, useDisposition } from "./disposition";
import {
  largeurDuVoletFiche,
  largeurDuVoletListe,
  listeEtFicheCoteACote,
} from "./disposition-regles";
import { EmptyState } from "./feedback";
import type { IconName } from "./icon";
import { BordsDuVolet, DansVoletDeListe, FicheContexte } from "./volet-fiche";
import { BORDS_PAR_DEFAUT } from "./zone-sure";

/**
 * L'identifiant de la pièce : celui du volet, sinon le paramètre de la route.
 *
 * Les deux hooks sont appelés à chaque rendu, dans le même ordre : dans un
 * volet, le paramètre lu est celui de la LISTE hôte, et il est ignoré.
 */
export function useIdDeFiche(): string {
  const volet = useContext(FicheContexte);
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  if (volet) return volet.id;
  return Array.isArray(id) ? (id[0] ?? "") : (id ?? "");
}

/**
 * Sortir de la fiche : revenir en arrière quand elle est une route, la fermer
 * quand elle est un volet. Un `router.back()` écrit dans un volet ferait
 * quitter la LISTE, c'est-à-dire tout l'écran.
 */
export function useSortieDeFiche(): () => void {
  const volet = useContext(FicheContexte);
  return volet ? volet.fermer : () => router.back();
}

/** Une sorte de pièce : sa route, et le corps qui la rend. */
export interface SorteDeFiche {
  /** La route de la pièce, poussée quand il n'y a pas la place des deux. */
  chemin: (id: string) => string;
  /** Le corps de la fiche, qui lit `useIdDeFiche()`. */
  Fiche: ComponentType;
}

interface OptionsCommunes {
  /** Ce que dit le volet tant qu'aucune pièce n'est choisie. */
  vide: { icon: IconName; titre: string; message?: string };
  /** Les bords de l'écran hôte : `[]` pour un onglet. */
  bords?: Edge[];
}

/**
 * Une liste ouvre UNE sorte de pièce (`chemin` + `Fiche`), ou plusieurs
 * (`variantes`) quand elle en mêle : les contacts listent des clients et des
 * fournisseurs, dont les fiches n'ont rien en commun.
 */
export type OptionsListeFiche = OptionsCommunes &
  (SorteDeFiche | { variantes: Record<string, SorteDeFiche> });

export interface ListeFiche {
  /** Ouvrir une pièce : dans le volet, ou en poussant sa route. */
  ouvrir: (id: string, variante?: string) => void;
  /** Refermer le volet, par exemple quand la liste change de nature. */
  fermer: () => void;
  /** La pièce ouverte dans le volet, pour surligner sa ligne. */
  selection: string | null;
  /** Vrai quand la liste et la fiche sont côte à côte. */
  coteACote: boolean;
  /** Enveloppe l'écran de la liste. */
  rendre: (liste: ReactNode) => ReactNode;
}

const UNIQUE = "fiche";

interface Piece {
  id: string;
  variante: string;
}

export function useListeFiche(options: OptionsListeFiche): ListeFiche {
  const { vide, bords = BORDS_PAR_DEFAUT } = options;
  const sortes: Record<string, SorteDeFiche> =
    "variantes" in options ? options.variantes : { [UNIQUE]: options };
  const { largeur } = useDisposition();
  const coteACote = listeEtFicheCoteACote(largeur);
  const focalise = useIsFocused();

  const [selection, setSelection] = useState<Piece | null>(null);
  // Un OBJET neuf à chaque passage : deux passages en une colonne avec la même
  // pièce ouverte doivent pousser deux fois, et l'identité de l'objet les
  // distingue là où deux valeurs égales se confondraient.
  const [aPousser, setAPousser] = useState<{ route: string } | null>(null);
  const [coteAvant, setCoteAvant] = useState(coteACote);

  // Le passage de deux colonnes à une se constate PENDANT le rendu (la forme
  // React de « retenir la valeur précédente ») : un effet qui poserait l'état
  // ferait un rendu de plus, avec la fiche affichée en volet d'une page qui
  // n'en a plus la place.
  if (coteAvant !== coteACote) {
    setCoteAvant(coteACote);
    if (!coteACote && selection) {
      setSelection(null);
      // ⚠ On ne pousse que si cet écran est au premier plan : une fiche ouverte
      // depuis le volet a pu empiler un autre écran par-dessus (un retour, un
      // règlement), et la pousser à nouveau la poserait AU-DESSUS de lui.
      const sorte = sortes[selection.variante];
      if (focalise && sorte) setAPousser({ route: sorte.chemin(selection.id) });
    }
  }

  // La route est calculée au passage en une colonne, pas ici : l'effet ne
  // dépend que de la demande, donc il ne part qu'une fois par demande, et une
  // nouvelle demande est toujours un objet neuf.
  useEffect(() => {
    if (aPousser) router.push(aPousser.route as never);
  }, [aPousser]);

  const fermer = useCallback(() => setSelection(null), []);

  const ouvrir = (id: string, variante: string = UNIQUE) => {
    const sorte = sortes[variante];
    if (!sorte) return;
    if (coteACote) setSelection({ id, variante });
    else router.push(sorte.chemin(id) as never);
  };

  const ouverte = selection ? sortes[selection.variante] : undefined;

  const largeurListe = coteACote ? largeurDuVoletListe(largeur) : largeur;

  const rendre = (liste: ReactNode) => (
    <View className="flex-1 flex-row bg-background">
      <View style={coteACote ? { width: largeurListe } : { flex: 1 }}>
        <DansVoletDeListe.Provider value={coteACote}>
          <Volet largeur={largeurListe}>{liste}</Volet>
        </DansVoletDeListe.Provider>
      </View>
      {coteACote ? (
        <View className="min-w-0 flex-1 border-l border-border">
          <Volet largeur={largeurDuVoletFiche(largeur)}>
            <BordsDuVolet.Provider value={bords}>
              {selection && ouverte ? (
                <FicheContexte.Provider value={{ id: selection.id, fermer }}>
                  <ouverte.Fiche key={`${selection.variante}:${selection.id}`} />
                </FicheContexte.Provider>
              ) : (
                <VoletVide {...vide} />
              )}
            </BordsDuVolet.Provider>
          </Volet>
        </View>
      ) : null}
    </View>
  );

  return {
    ouvrir,
    fermer,
    selection: coteACote ? (selection?.id ?? null) : null,
    coteACote,
    rendre,
  };
}

/**
 * Le volet de droite, tant qu'aucune pièce n'est choisie. Un volet blanc se
 * lirait comme un chargement qui n'aboutit pas ; il dit ce qu'on attend.
 */
function VoletVide({ icon, titre, message }: { icon: IconName; titre: string; message?: string }) {
  return (
    <View className="flex-1 items-center justify-center bg-background px-8">
      <EmptyState icon={icon} title={titre} message={message} />
    </View>
  );
}
