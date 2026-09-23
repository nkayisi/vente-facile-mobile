/**
 * Champ de choix : un déclencheur qui ANNONCE la valeur, une liste à ouvrir.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UNE RANGÉE DE PUCES N'EST PAS UN CHOIX, C'EST UN INVENTAIRE.            │
 * │                                                                          │
 * │ Douze types de mouvement, six motifs d'ajustement, N entrepôts : tous    │
 * │ défilaient horizontalement. Trois conséquences :                         │
 * │                                                                          │
 * │ 1. LE CHOIX ACTIF SORT DE L'ÉCRAN. « Ajustement négatif » est la         │
 * │    neuvième puce : une fois choisie, la rangée reste où le doigt l'a     │
 * │    laissée, et on ne voit plus SUR QUOI on a réglé le champ. Sur un      │
 * │    formulaire, c'est la valeur qu'on s'apprête à enregistrer.            │
 * │ 2. IL FAUT DÉFILER POUR DÉCOUVRIR. Rien ne dit combien d'options         │
 * │    existent : trois sont visibles, les autres sont hors champ.           │
 * │ 3. Deux rangées de puces l'une sous l'autre se lisent comme UN seul jeu, │
 * │    alors qu'elles portent deux champs indépendants.                       │
 * │                                                                          │
 * │ Un déclencheur porte la valeur courante et la liste s'ouvre en entier,   │
 * │ d'un coup d'œil. C'est le `<Select>` du back-office : la parité est dans │
 * │ la forme du contrôle, pas dans la puce.                                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ DEUX APPARENCES, PARCE QU'IL Y A DEUX VOISINAGES.                       │
 * │                                                                          │
 * │ `champ` (défaut) : la hauteur, le rayon et la bordure d'`Input` et de    │
 * │ `ChampDate`. Dans un formulaire, un contrôle plus bas que ses voisins se │
 * │ lit comme un défaut d'alignement.                                        │
 * │                                                                          │
 * │ `filtre` : la grammaire de `Chip` - h-9, rond, peint quand il porte une  │
 * │ valeur - pour vivre DANS une rangée de puces. L'état actif y est peint   │
 * │ et pas seulement écrit : dès que la valeur est cachée derrière un        │
 * │ déclencheur, c'est la couleur qui dit qu'un filtre est posé.             │
 * │                                                                          │
 * │ La cible utile reste à 44 points dans les deux cas, par le `hitSlop` de  │
 * │ `Pressable`.                                                             │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ TROIS PIÈCES, PARCE QU'UNE FEUILLE NE S'EMPILE PAS SUR UNE FEUILLE.     │
 * │                                                                          │
 * │ `Sheet` est un `Modal` : en ouvrir un second par-dessus donne un voile   │
 * │ sur un voile et deux `onRequestClose` qui se disputent le bouton retour  │
 * │ d'Android. Or ces champs vivent maintenant DANS des feuilles (les trois  │
 * │ formulaires du stock), où `ChampSelect` ne peut donc pas ouvrir la       │
 * │ sienne.                                                                   │
 * │                                                                          │
 * │ D'où la découpe :                                                        │
 * │   `ListeChoix`        - la liste seule, à poser où l'on veut ;           │
 * │   `DeclencheurSelect` - le déclencheur seul, qui ne fait qu'appeler ;    │
 * │   `ChampSelect`       - les deux plus une feuille, pour un écran PLEIN.  │
 * │                                                                          │
 * │ Dans une feuille, l'appelant garde un `DemandeChoix` en état et échange  │
 * │ le CONTENU de sa propre feuille - le même mécanisme de panneaux que les  │
 * │ feuilles de devis et de retour.                                           │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import { Fragment, useState } from "react";
import { View } from "react-native";

import { CaseACocher } from "./checkbox";
import { Divider } from "./divider";
import { Icon, type IconName } from "./icon";
import { ListItem } from "./list-item";
import { Pastille } from "./pastille";
import { Pressable } from "./pressable";
import { Sheet } from "./sheet";
import { Text } from "./text";

/**
 * Une option. Un LIBELLÉ, et rien d'autre.
 *
 * Pas de sous-titre : mesuré à l'écran sur les douze types de mouvement, une
 * précision sous chaque libellé triple la hauteur de la liste et répète la même
 * phrase à deux mots près sur toute sa longueur, alors qu'elle ne renseigne que
 * sur une ou deux entrées. Une liste de choix se lit en balayant UNE colonne ;
 * ce qui la rallonge la rend moins lisible, pas plus.
 */
export interface OptionSelect {
  valeur: string;
  label: string;
  /** Ligne secondaire : « 12 articles en stock ». Facultative. */
  detail?: string;
  /**
   * Pastille de tête, quand l'entrée porte une couleur CHOISIE par le marchand
   * - une rubrique de caisse, par exemple.
   *
   * ⚠ Ce n'est pas une décoration : c'est elle qui permet de retrouver
   * « Carburant » d'un coup d'oeil dans une liste de vingt, et c'est pour cela
   * qu'on fait choisir une couleur à la création. Une valeur non reconnue est
   * IGNORÉE plutôt que rendue : `backgroundColor` accepte n'importe quelle
   * chaîne et échoue en silence, et une pastille invisible se lirait comme une
   * rubrique sans couleur, pas comme une donnée abîmée.
   */
  couleur?: string | null;
  /**
   * Glyphe de tête, quand l'entrée désigne un GENRE et non une donnée du
   * marchand : un moyen de paiement, par exemple. Il cède le pas à `couleur`,
   * qui, elle, vient du marchand et le distingue de ses voisines.
   */
  icon?: IconName;
}

/** Ce qu'un appelant met en état pour ouvrir la liste dans SA propre feuille. */
export interface DemandeChoix {
  titre: string;
  options: OptionSelect[];
  valeur: string | null;
  onChoisir: (valeur: string | null) => void;
  /** Présent : une première entrée « aucun choix ». */
  libelleVide?: string;
  /** Dit ce que la liste ne peut pas offrir, plutôt que de sortir vide. */
  messageVide?: string;
}

const APPARENCES = {
  champ: {
    // Même hauteur et même bordure qu'`Input` : voir le second encadré.
    base: "h-12 rounded-lg border border-input bg-card px-3",
    taillePastille: 18,
  },
  filtre: {
    base: "h-9 rounded-full border px-3",
    taillePastille: 14,
  },
} as const;

export type ApparenceSelect = keyof typeof APPARENCES;

/**
 * Le déclencheur seul : il annonce la valeur et appelle. Il n'ouvre rien
 * lui-même, c'est ce qui le rend posable dans une feuille.
 */
export function DeclencheurSelect({
  libelle,
  onPress,
  actif = false,
  apparence = "champ",
  icon,
  invalid = false,
  disabled = false,
  ouvert = false,
  accessibilityLabel,
}: {
  libelle: string;
  onPress: () => void;
  /** Une valeur est posée : le `filtre` se peint, le `champ` sort du gris. */
  actif?: boolean;
  apparence?: ApparenceSelect;
  icon?: IconName;
  invalid?: boolean;
  disabled?: boolean;
  ouvert?: boolean;
  accessibilityLabel?: string;
}) {
  const a = APPARENCES[apparence];
  const peint = apparence === "filtre" && actif;
  const teinte = peint ? "primaryForeground" : "mutedForeground";

  const texte = (
    <Text
      variant={apparence === "filtre" ? "bodySmall" : "body"}
      numberOfLines={1}
      // Le gris du placeholder, jamais celui d'un champ rempli : sans cette
      // distinction, un champ vide se lit comme un champ lu. Même règle que
      // `ChampDate`.
      className={
        peint
          ? "font-sans-medium text-primary-foreground"
          : apparence === "filtre"
            ? "font-sans-medium text-foreground"
            : actif
              ? ""
              : "text-muted-foreground"
      }
    >
      {libelle}
    </Text>
  );

  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      haptic={disabled ? "none" : "selection"}
      accessibilityRole="button"
      // Le lecteur d'écran doit entendre CE QUI EST CHOISI, pas seulement le
      // nom du champ : sans la valeur, « Type » ne renseigne sur rien.
      accessibilityLabel={
        accessibilityLabel ? `${accessibilityLabel} : ${libelle}` : libelle
      }
      accessibilityState={{ expanded: ouvert, disabled }}
      className={`flex-row items-center gap-1.5 ${a.base}${
        peint ? " border-primary bg-primary" : ""
      }${apparence === "filtre" && !peint ? " border-border bg-card" : ""}${
        invalid ? " border-destructive" : ""
      }${disabled ? " opacity-50" : ""}`}
    >
      {icon ? <Icon name={icon} size={a.taillePastille} color={teinte} /> : null}
      {/* ┌──────────────────────────────────────────────────────────────────┐
          │ SEUL LE CHAMP ENVELOPPE SON LIBELLÉ.                            │
          │                                                                  │
          │ Le `flex-1` pousse le chevron au bord droit d'un champ pleine    │
          │ largeur - c'est tout son objet. Mais une PUCE vit dans un        │
          │ `ChipRow`, qui est un `ScrollView` HORIZONTAL : il n'y a aucune  │
          │ largeur définie à remplir, et une puce doit épouser son libellé. │
          │ On rend donc le texte NU dans ce cas, exactement comme la        │
          │ version éprouvée à l'écran sur le journal des mouvements.        │
          └──────────────────────────────────────────────────────────────────┘ */}
      {apparence === "champ" ? (
        <View className="min-w-0 flex-1">{texte}</View>
      ) : (
        texte
      )}
      <Icon name="ChevronDown" size={a.taillePastille} color={teinte} />
    </Pressable>
  );
}

/**
 * La liste des options, à poser dans une feuille - la sienne ou celle d'un
 * formulaire.
 *
 * Un groupe, un seul bord gauche et un seul bord droit : c'est la forme déjà
 * retenue pour le choix du format d'export. Les filets sont PLEINE LARGEUR,
 * faute de colonne d'icônes à préserver.
 */
export function ListeChoix({
  options,
  valeur,
  onChoisir,
  libelleVide,
  messageVide,
}: {
  options: OptionSelect[];
  valeur: string | null;
  onChoisir: (valeur: string | null) => void;
  libelleVide?: string;
  messageVide?: string;
}) {
  // L'entrée « aucun choix » n'a ni détail ni couleur : le type les rend
  // facultatifs plutôt que de forcer chaque appelant à les inventer.
  type Entree = Omit<OptionSelect, "valeur"> & { valeur: string | null };
  const entrees: Entree[] = libelleVide
    ? [{ valeur: null, label: libelleVide }, ...options]
    : options;

  // Une liste vide DIT pourquoi : un groupe sans rien dedans se lit comme un
  // chargement qui n'a pas abouti.
  if (entrees.length === 0) {
    return <Text variant="caption">{messageVide ?? "Aucun choix disponible."}</Text>;
  }

  return (
    <View className="overflow-hidden rounded-xl border border-border">
      {entrees.map((o, i) => (
        <Fragment key={o.valeur ?? "__aucun"}>
          {i > 0 ? <Divider /> : null}
          <ListItem
            title={o.label}
            subtitle={o.detail}
            leading={
              o.couleur ? (
                <View className="mr-3 h-9 w-9 items-center justify-center">
                  <Pastille couleur={o.couleur} taille={12} />
                </View>
              ) : o.icon ? (
                <View className="mr-3 h-9 w-9 items-center justify-center">
                  <Icon name={o.icon} size={20} color="mutedForeground" />
                </View>
              ) : undefined
            }
            // La coche, et non un chevron : l'appui ne mène nulle part, il
            // choisit. `ListItem` réserve le chevron à une destination.
            trailing={
              o.valeur === valeur ? (
                <Icon name="Check" size={18} color="primary" />
              ) : null
            }
            onPress={() => onChoisir(o.valeur)}
          />
        </Fragment>
      ))}
    </View>
  );
}

/**
 * Déclencheur et liste, avec sa propre feuille.
 *
 * ⚠ À n'employer QUE hors d'une feuille. Dans un formulaire déjà en feuille,
 * poser `DeclencheurSelect` et échanger le panneau : voir le troisième encadré.
 */
export function ChampSelect({
  valeur,
  onChange,
  options,
  libelleVide,
  messageVide,
  titre,
  icon,
  apparence = "champ",
  invalid,
  disabled,
  accessibilityLabel,
}: {
  /** `null` : aucun choix, donc le libellé `libelleVide`. */
  valeur: string | null;
  onChange: (valeur: string | null) => void;
  options: OptionSelect[];
  /**
   * Le libellé du « aucun choix », première entrée de la liste.
   *
   * Absent, le champ n'offre aucun retour en arrière : un filtre qu'on ne peut
   * plus retirer est le défaut relevé sur les puces de devise des créances.
   *
   * ⚠ PAS `vide` : dans ce design system, `vide` nomme déjà le zéro d'un relevé
   * (`MultiCurrencyTotal`) et l'état vide d'une liste (`DataList`). Un
   * troisième sens rendrait le mot inutilisable, et le garde-fou « aucune
   * phrase à la place d'un montant » le lirait comme un relevé qui parle.
   */
  libelleVide?: string;
  messageVide?: string;
  /** Titre de la feuille. Sans lui, la liste n'annonce pas ce qu'elle choisit. */
  titre?: string;
  icon?: IconName;
  apparence?: ApparenceSelect;
  invalid?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  const [ouvert, setOuvert] = useState(false);
  const choisie = options.find((o) => o.valeur === valeur) ?? null;

  return (
    <>
      <DeclencheurSelect
        libelle={choisie?.label ?? libelleVide ?? "Choisir"}
        actif={choisie !== null}
        onPress={() => setOuvert(true)}
        apparence={apparence}
        icon={icon}
        invalid={invalid}
        disabled={disabled}
        ouvert={ouvert}
        accessibilityLabel={accessibilityLabel}
      />
      <Sheet ouvert={ouvert} onFermer={() => setOuvert(false)} titre={titre}>
        <ListeChoix
          options={options}
          valeur={valeur}
          onChoisir={(v) => {
            onChange(v);
            setOuvert(false);
          }}
          libelleVide={libelleVide}
          messageVide={messageVide}
        />
      </Sheet>
    </>
  );
}

/**
 * Un panneau de choix MULTIPLE.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ IL NE SE FERME PAS À L'APPUI, ET C'EST TOUTE LA DIFFÉRENCE.             │
 * │                                                                          │
 * │ `ListeChoix` choisit UNE valeur : l'appui tranche, donc il referme. Ici  │
 * │ l'appui BASCULE une case parmi plusieurs, et refermer après chacune      │
 * │ obligerait à rouvrir le panneau autant de fois qu'il y a de cases. La    │
 * │ fermeture appartient donc à l'appelant, par la flèche de retour de la    │
 * │ feuille.                                                                 │
 * │                                                                          │
 * │ La coche, jamais un chevron : `ListItem` réserve le chevron à une        │
 * │ destination, et l'appui ne mène nulle part.                              │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function ListeChoixMultiple({
  options,
  valeurs,
  onBasculer,
  messageVide,
}: {
  options: OptionSelect[];
  valeurs: string[];
  onBasculer: (valeur: string) => void;
  messageVide?: string;
}) {
  // Une liste vide DIT pourquoi : un groupe sans rien dedans se lit comme un
  // chargement qui n'a pas abouti.
  if (options.length === 0) {
    return <Text variant="caption">{messageVide ?? "Aucun choix disponible."}</Text>;
  }

  const choisies = new Set(valeurs);

  return (
    <View className="overflow-hidden rounded-xl border border-border">
      {options.map((o, i) => {
        const active = choisies.has(o.valeur);
        return (
          <Fragment key={o.valeur}>
            {i > 0 ? <Divider /> : null}
            <ListItem
              title={o.label}
              subtitle={o.detail}
              trailing={<CaseACocher coche={active} />}
              onPress={() => onBasculer(o.valeur)}
            />
          </Fragment>
        );
      })}
    </View>
  );
}
