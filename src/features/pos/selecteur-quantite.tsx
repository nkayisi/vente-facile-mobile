/**
 * Saisie de quantité au comptoir, pour un article vendu au conditionnement.
 *
 * PRINCIPE, repris du back-office : le sélecteur d'unité n'est PAS un filtre
 * exclusif, c'est un sélecteur de FOCUS. Chaque canal garde sa propre valeur et
 * le nombre frappé prend le sens du canal actif. Le caissier tape « 2 » sur
 * Casier, « 3 » sur Bouteille, et obtient « 2 casiers + 3 bouteilles » sans
 * jamais multiplier de tête. Un sélecteur exclusif l'obligerait à saisir 27.
 *
 * Rien n'est prérempli. Un « 1 » d'avance se fait effacer plus souvent qu'il ne
 * sert, et surtout il se fait valider par inadvertance.
 *
 * Le composant ne calcule aucune quantité qui partirait telle quelle : il
 * remonte la saisie brute (`packages`, `loose`), exactement ce que
 * `PackagingService.to_base` attend côté serveur.
 *
 * Pavé numérique plutôt que clavier système : le clavier d'Android couvre la
 * moitié basse de l'écran, masque justement le récapitulatif, et sa touche de
 * validation ferme la saisie au lieu d'ajouter au panier. Le pavé garde tout
 * visible et laisse la confirmation au seul endroit qui la déclenche.
 */
import { useEffect, useMemo, useState } from "react";
import { Modal, View } from "react-native";

import { getPackaging, pluralizeUnit } from "@vente-facile/core";
import type { Saisie } from "@vente-facile/core/pos";

import { Button, Divider, Icon, Pressable, Text } from "@/ui";
import type { ArticlePos } from "./catalogue";

type Canal = "package" | "retail";

/** Raccourcis : couvrent l'écrasante majorité des ventes au comptoir. */
const RACCOURCIS = [1, 2, 3, 5, 10];

export interface SelecteurQuantiteProps {
  article: ArticlePos | null;
  visible: boolean;
  onFermer: () => void;
  onValider: (saisie: Saisie) => void;
  /** Saisie déjà présente, pour rouvrir une ligne du panier en édition. */
  initiale?: Saisie;
  /** Contenants encore scellés. `null` : pas de borne connue. */
  scellesDisponibles?: number | null;
  /** Unités hors emballage. `null` : partage inconnu, jamais à lire comme 0. */
  vracDisponible?: number | null;
  /** Refus éventuel, calculé par l'appelant : le paquet en est seul juge. */
  refus?: string | null;
  libelleValider?: string;
  /** Retrait de la ligne, proposé en édition. */
  onRetirer?: () => void;
}

export function SelecteurQuantite({
  article,
  visible,
  onFermer,
  onValider,
  initiale,
  scellesDisponibles,
  vracDisponible,
  refus,
  libelleValider = "Ajouter",
  onRetirer,
}: SelecteurQuantiteProps) {
  const conditionnement = article ? getPackaging(article) : null;
  const [canal, setCanal] = useState<Canal>("retail");
  const [contenants, setContenants] = useState("");
  const [detail, setDetail] = useState("");

  // Réinitialisation à chaque ouverture : un reliquat de la saisie précédente
  // se fait valider sans être relu.
  useEffect(() => {
    if (!visible) return;
    setContenants(initiale?.packages ? String(initiale.packages) : "");
    setDetail(initiale?.loose ? String(initiale.loose) : "");
    // Un article vendu uniquement en gros ouvre sur son canal, sinon le premier
    // chiffre frappé partirait au détail, qui lui est interdit.
    setCanal(conditionnement?.packageOnly ? "package" : "retail");
    // `conditionnement` se reconstruit à chaque rendu : c'est l'article qui
    // détermine la remise à zéro, pas l'objet dérivé.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, article?.id]);

  const saisie: Saisie = useMemo(
    () => ({
      packages: conditionnement ? Number(contenants) || 0 : 0,
      loose: Number(detail) || 0,
    }),
    [conditionnement, contenants, detail]
  );

  if (!article) return null;

  const valeurCourante = canal === "package" ? contenants : detail;
  const poser = (v: string) => (canal === "package" ? setContenants(v) : setDetail(v));

  /** Accumulateur : chaque touche ajoute un chiffre, comme une caisse. */
  const frapper = (chiffre: string) => {
    const suivant = (valeurCourante + chiffre).replace(/^0+(?=\d)/, "");
    if (suivant.length > 5) return;
    poser(suivant);
  };
  const effacer = () => poser(valeurCourante.slice(0, -1));
  const raccourci = (n: number) => poser(String(n));

  const totalDetail = conditionnement
    ? saisie.packages * conditionnement.factor + saisie.loose
    : saisie.loose;
  const rien = totalDetail < 1;

  const motDetail = conditionnement?.retailWord ?? article.unit_name ?? "unité";
  const motContenant = conditionnement?.packageWord ?? "contenant";

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onFermer}>
      <Pressable
        className="flex-1 justify-end bg-black/50"
        onPress={onFermer}
        haptic="none"
        accessibilityLabel="Fermer"
      >
        {/* Le contenu absorbe le geste : toucher la feuille ne la ferme pas. */}
        <Pressable onPress={() => {}} haptic="none" className="rounded-t-3xl bg-card pb-6">
          <View className="items-center py-3">
            <View className="h-1 w-10 rounded-full bg-border" />
          </View>

          <View className="px-5">
            <Text variant="h3" numberOfLines={2}>
              {article.name}
            </Text>
            <Text variant="muted" className="mt-1">
              {conditionnement
                ? `${motContenant} de ${conditionnement.factor} ${pluralizeUnit(
                    motDetail,
                    conditionnement.factor
                  )}`
                : motDetail}
            </Text>
          </View>

          {conditionnement ? (
            <View className="mt-4 flex-row gap-3 px-5">
              <Onglet
                actif={canal === "package"}
                titre={pluralizeUnit(motContenant, saisie.packages || 2)}
                valeur={contenants}
                onPress={() => setCanal("package")}
              />
              {!conditionnement.packageOnly ? (
                <Onglet
                  actif={canal === "retail"}
                  titre={pluralizeUnit(motDetail, saisie.loose || 2)}
                  valeur={detail}
                  onPress={() => setCanal("retail")}
                />
              ) : null}
            </View>
          ) : null}

          <View className="mx-5 mt-4 rounded-xl bg-muted px-4 py-3">
            <Text variant="bodySmall" className="text-muted-foreground">
              Cette ligne
            </Text>
            <Text variant="h3" className="mt-0.5">
              {resume(saisie, conditionnement, motContenant, motDetail)}
            </Text>
            {conditionnement && totalDetail > 0 ? (
              <Text variant="bodySmall" className="mt-0.5 text-muted-foreground">
                soit {totalDetail} {pluralizeUnit(motDetail, totalDetail)} au total
              </Text>
            ) : null}
          </View>

          <Disponibilite
            conditionnement={!!conditionnement}
            scelles={scellesDisponibles}
            vrac={vracDisponible}
            motContenant={motContenant}
            motDetail={motDetail}
          />

          {refus ? (
            <View className="mx-5 mt-3 flex-row items-start gap-2 rounded-xl bg-destructive/10 px-4 py-3">
              <Icon name="alert-circle-outline" size={18} color="destructive" />
              <Text variant="bodySmall" className="flex-1 text-destructive">
                {refus}
              </Text>
            </View>
          ) : null}

          <View className="mt-4 flex-row gap-2 px-5">
            {RACCOURCIS.map((n) => (
              <Pressable
                key={n}
                onPress={() => raccourci(n)}
                className="flex-1 items-center rounded-lg border border-border py-2 active:bg-muted"
                accessibilityLabel={`Mettre ${n}`}
              >
                <Text variant="body">{n}</Text>
              </Pressable>
            ))}
          </View>

          <Clavier onChiffre={frapper} onEffacer={effacer} onVider={() => poser("")} />

          <View className="mt-1"><Divider /></View>

          <View className="flex-row gap-3 px-5 pt-4">
            {onRetirer ? (
              <View className="flex-1">
                <Button variant="ghost" onPress={onRetirer} fullWidth>
                  Retirer
                </Button>
              </View>
            ) : null}
            <View className="flex-1">
              <Button
                onPress={() => onValider(saisie)}
                disabled={rien || !!refus}
                fullWidth
              >
                {libelleValider}
              </Button>
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Onglet de canal : porte sa valeur, pour qu'on voie les deux d'un coup d'œil. */
function Onglet({
  actif,
  titre,
  valeur,
  onPress,
}: {
  actif: boolean;
  titre: string;
  valeur: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-1 rounded-xl border px-3 py-2 ${
        actif ? "border-primary bg-primary/10" : "border-border"
      }`}
      accessibilityLabel={`Saisir en ${titre}`}
      accessibilityState={{ selected: actif }}
    >
      <Text variant="bodySmall" className={actif ? "text-primary" : "text-muted-foreground"}>
        {titre}
      </Text>
      <Text variant="h3" className={actif ? "text-primary" : undefined}>
        {valeur || "0"}
      </Text>
    </Pressable>
  );
}

function Disponibilite({
  conditionnement,
  scelles,
  vrac,
  motContenant,
  motDetail,
}: {
  conditionnement: boolean;
  scelles?: number | null;
  vrac?: number | null;
  motContenant: string;
  motDetail: string;
}) {
  // `null` ne se lit JAMAIS comme zéro : il signifie « pas de borne connue ».
  // Afficher « 0 disponible » sur une donnée absente ferait refuser des ventes
  // possibles, et le caissier n'aurait aucun moyen de savoir que c'est faux.
  const morceaux: string[] = [];
  if (conditionnement && scelles !== null && scelles !== undefined) {
    morceaux.push(`${scelles} ${pluralizeUnit(motContenant, scelles)} scellé${scelles > 1 ? "s" : ""}`);
  }
  if (vrac !== null && vrac !== undefined) {
    morceaux.push(`${vrac} ${pluralizeUnit(motDetail, vrac)}`);
  }
  if (morceaux.length === 0) return null;

  return (
    <Text variant="bodySmall" className="mt-2 px-5 text-muted-foreground">
      Disponible : {morceaux.join(" · ")}
    </Text>
  );
}

const TOUCHES = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

function Clavier({
  onChiffre,
  onEffacer,
  onVider,
}: {
  onChiffre: (c: string) => void;
  onEffacer: () => void;
  onVider: () => void;
}) {
  return (
    <View className="mt-3 flex-row flex-wrap px-4">
      {TOUCHES.map((t) => (
        <Touche key={t} onPress={() => onChiffre(t)} label={t} />
      ))}
      <Touche onPress={onVider} label="C" secondaire />
      <Touche onPress={() => onChiffre("0")} label="0" />
      <Touche onPress={onEffacer} icone="backspace-outline" label="Effacer" secondaire />
    </View>
  );
}

function Touche({
  onPress,
  label,
  icone,
  secondaire,
}: {
  onPress: () => void;
  label: string;
  icone?: "backspace-outline";
  secondaire?: boolean;
}) {
  return (
    // Largeur d'un tiers posée explicitement : un `flex-wrap` libre laisserait
    // quatre touches passer sur une ligne dès que la police grossit, et le pavé
    // ne se lirait plus comme un pavé.
    <View className="w-1/3 p-1">
      <Pressable
        onPress={onPress}
        haptic="selection"
        className={`h-14 items-center justify-center rounded-xl ${
          secondaire ? "bg-muted" : "bg-secondary"
        } active:opacity-70`}
        accessibilityLabel={label}
      >
        {icone ? (
          <Icon name={icone} size={22} />
        ) : (
          <Text variant="h3">{label}</Text>
        )}
      </Pressable>
    </View>
  );
}

/** « 2 casiers + 3 bouteilles », ou « Aucune quantité » tant que rien n'est saisi. */
function resume(
  saisie: Saisie,
  conditionnement: ReturnType<typeof getPackaging>,
  motContenant: string,
  motDetail: string
): string {
  const parts: string[] = [];
  if (conditionnement && saisie.packages > 0) {
    parts.push(`${saisie.packages} ${pluralizeUnit(motContenant, saisie.packages)}`);
  }
  if (saisie.loose > 0) {
    parts.push(`${saisie.loose} ${pluralizeUnit(motDetail, saisie.loose)}`);
  }
  return parts.length ? parts.join(" + ") : "Aucune quantité";
}
