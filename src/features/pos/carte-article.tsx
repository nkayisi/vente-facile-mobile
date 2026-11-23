/**
 * Une vignette d'article dans la grille du comptoir.
 *
 * La carte du point de vente du back-office, sur les mêmes repères : un bandeau
 * de stock posé sur l'image (vert, ambre, rouge), puis le nom, le prix, la
 * catégorie, la marque et l'emplacement. On repère d'un coup d'œil ce qui se
 * vend sans avoir à lire un seul chiffre.
 *
 * Deux formes pour le même contenu. Assez large, l'image est à gauche du texte,
 * comme sur le web. Sur les deux colonnes d'un téléphone, elle lui laisserait
 * une cinquantaine de points : elle passe donc au-dessus.
 */
import { View } from "react-native";

import { formatQuantity, getPackaging } from "@vente-facile/core";

import { casseDeTitre } from "@/data/casse";
import { Icon, Pressable, Text, VignetteArticle } from "@/ui";
import type { ArticlePos } from "./catalogue";
import {
  HAUTEUR_MIN_VIGNETTE_COTE,
  LARGEUR_VIGNETTE_COTE,
  type FormeDeCarte,
} from "./disposition-comptoir";
import {
  etatDeLaCarte,
  libelleDuBandeau,
  lieuDeLArticle,
  type EtatDeStock,
} from "./presentation-carte";

/** Une table, jamais `bg-${ton}` : NativeWind extrait les classes du code. */
const TONS: Record<EtatDeStock, { fond: string; texte: string }> = {
  verrouille: { fond: "bg-destructive", texte: "text-destructive-foreground" },
  non_suivi: { fond: "bg-muted-foreground", texte: "text-card" },
  aucun: { fond: "bg-destructive", texte: "text-destructive-foreground" },
  epuise: { fond: "bg-destructive", texte: "text-destructive-foreground" },
  bas: { fond: "bg-warning", texte: "text-warning-foreground" },
  ok: { fond: "bg-success", texte: "text-success-foreground" },
};

interface Props {
  article: ArticlePos;
  /** Montant formaté par l'appelant : les décimales dépendent de la devise. */
  prix: string;
  /**
   * Le prix annoncé dans l'AUTRE devise de l'établissement, au taux en
   * vigueur, déjà formaté. `null` sur un établissement mono-devise.
   *
   * ⚠ IL NE REMPLACE JAMAIS `prix`, il le suit entre parenthèses. Un prix
   * converti affiché seul se lirait comme le prix de vente, et le ticket
   * sortirait alors dans une autre monnaie que celle annoncée au client - la
   * facture reste libellée en devise principale. T10 du retour de test.
   */
  prixEquivalent?: string | null;
  prixGros?: string | null;
  /** Quantité déjà au panier, pour la signaler sans rouvrir la fiche. */
  auPanier?: number;
  /** L'entrepôt de la caisse, pour dire où se trouve l'article. */
  entrepot?: string | null;
  forme: FormeDeCarte;
  onPress: () => void;
}

export function CarteArticle({
  article, prix, prixEquivalent, prixGros, auPanier = 0, entrepot, forme, onPress,
}: Props) {
  // Le nom AFFICHÉ, en casse de titre : la base garde ce que le marchand a
  // saisi, souvent en capitales. Voir `data/casse.ts`.
  const nom = casseDeTitre(article.name);
  const conditionnement = getPackaging(article);
  // ┌────────────────────────────────────────────────────────────────────────┐
  // │ AUCUNE CARTE N'EST PLUS INERTE, PAS MÊME SOUS INVENTAIRE.             │
  // │                                                                        │
  // │ Un article sous inventaire rendait sa carte morte : le caissier ne     │
  // │ pouvait même pas le chiffrer sur une proforma. Comme l'article épuisé, │
  // │ il s'ajoute désormais au panier, et c'est l'ENCAISSEMENT qui se ferme  │
  // │ (le serveur refuse la vente d'un produit bloqué). La carte garde son   │
  // │ cadenas et la RÉFÉRENCE de la session : c'est l'information, et le     │
  // │ caissier doit pouvoir dire au client ce qu'on attend.                  │
  // └────────────────────────────────────────────────────────────────────────┘
  const etat = etatDeLaCarte(article, auPanier);
  const verrouille = etat === "verrouille";
  const sansStock = etat === "aucun" || etat === "epuise";
  const cote = forme === "cote";
  const stock = libelleDuBandeau(article, cote);

  // Vendu en gros seulement, l'article n'a pas de prix de détail : afficher le
  // sien écrirait « 0 $ ». « par » et non « le » : le GENRE d'un nom de
  // contenant n'est pas dérivable, et ce nom vient du marchand.
  const grosSeul = article.selling_mode === "wholesale_only" && conditionnement && prixGros;
  const prixPrincipal = grosSeul ? `${prixGros} par ${conditionnement.packageWord}` : prix;
  const prixSecondaire =
    !grosSeul && conditionnement && prixGros ? `${prixGros} par ${conditionnement.packageWord}` : null;

  // Ce que le lecteur d'écran annonce : le prix, puis son équivalent.
  const annonce = prixEquivalent ? `${prixPrincipal}, soit ${prixEquivalent}` : prixPrincipal;

  const categorie = article.categoryName?.trim() || "Sans catégorie";
  const marque = article.brand_name?.trim() || "Sans marque";
  const lieu = lieuDeLArticle(article, entrepot);

  // ⚠ `grow` ET NON `flex-1` sur l'axe vertical. `flex-1` vaut une base de
  // hauteur NULLE : dans une carte dont la hauteur vient de son contenu, la
  // carte se mesurait à zéro et les rangées de la grille se chevauchaient
  // (relevé sur l'émulateur). `grow` garde la base à `auto`, et l'étirement de
  // la rangée aligne le bas des cartes voisines. Même piège que `EmptyState`.
  const texte = (
    // En forme `cote`, le rembourrage vit sur le TEXTE : la photo, elle, touche
    // les bords de la carte du haut en bas.
    <View
      className={cote ? "min-w-0 flex-1 justify-between gap-1 p-2.5" : "mt-2 grow justify-between gap-1"}
    >
      <View>
        <View className="flex-row items-start gap-1">
          <Text
            variant="bodySmall"
            numberOfLines={2}
            className={`min-w-0 flex-1 font-sans-semibold ${verrouille ? "text-destructive" : ""}`}
          >
            {nom}
          </Text>
          {auPanier > 0 ? (
            <View className="min-w-6 items-center rounded-full bg-primary px-1.5 py-0.5">
              <Text variant="caption" className="text-primary-foreground">
                {/* Formatée : une demi-unité au panier s'affichait « 0.5 », au
                    point anglais, au milieu d'un écran qui écrit « 1 122,4 $ »
                    (relevé sur l'émulateur le 2026-11-14). */}
                {formatQuantity(auPanier)}
              </Text>
            </View>
          ) : null}
        </View>
        {/* ┌──────────────────────────────────────────────────────────────┐
            │ LE PRIX ET SON ÉQUIVALENT, ET AUCUN DES DEUX N'EST TRONQUÉ.  │
            │                                                              │
            │ « 1 150 $ (2 645 000 FC) » tient sur une carte de tablette ; │
            │ sur les deux colonnes d'un téléphone, l'équivalent passe à   │
            │ la ligne. Un montant rogné en « 2 645 0… » n'est pas un      │
            │ montant abrégé, c'est un montant faux.                       │
            └──────────────────────────────────────────────────────────────┘ */}
        <View className="mt-0.5 flex-row flex-wrap items-baseline gap-x-1.5">
          <Text
            variant="body"
            numeric
            className={`font-sans-bold ${verrouille ? "text-destructive" : "text-primary"}`}
          >
            {prixPrincipal}
          </Text>
          {prixEquivalent ? (
            <Text variant="caption" numeric className="text-muted-foreground">
              {`(${prixEquivalent})`}
            </Text>
          ) : null}
        </View>
        {prixSecondaire ? (
          <Text variant="caption" numberOfLines={1}>
            {prixSecondaire}
          </Text>
        ) : null}
      </View>

      <View>
        {/* La RÉFÉRENCE, pas « indisponible » : le caissier doit pouvoir dire
            au client ce qu'on attend, et au gérant quelle session débloquer. */}
        {verrouille ? (
          <View className="flex-row items-center gap-1">
            <Icon name="Lock" size={11} color="destructive" />
            <Text variant="caption" numberOfLines={1} className="min-w-0 flex-1 text-destructive">
              {`Inventaire ${article.verrou_inventaire}`}
            </Text>
          </View>
        ) : null}
        <View className="flex-row items-center gap-1">
          <Icon name="Tag" size={11} color="primary" />
          <Text variant="caption" numberOfLines={1} className="min-w-0 flex-1">
            {/* Sur une carte étroite, les deux tiennent sur une ligne : trois
                lignes de plus par carte feraient perdre une rangée d'articles. */}
            {cote ? categorie : `${categorie} · ${marque}`}
          </Text>
        </View>
        {cote ? (
          <Text variant="caption" numberOfLines={1}>
            {marque}
          </Text>
        ) : null}
        <View className="flex-row items-center gap-1">
          <Icon name="MapPin" size={11} color="mutedForeground" />
          <Text variant="caption" numberOfLines={1} className="min-w-0 flex-1">
            {lieu}
          </Text>
        </View>
      </View>
    </View>
  );

  return (
    <Pressable
      onPress={onPress}
      haptic="selection"
      // `overflow-hidden` : en forme `cote`, la photo touche les bords et c'est
      // la carte qui arrondit ses coins.
      className={`flex-1 overflow-hidden rounded-xl border ${cote ? "" : "p-2.5"} ${
        verrouille
          ? "border-destructive/40 bg-destructive/5"
          : `border-border bg-card active:bg-muted ${sansStock ? "opacity-75" : ""}`
      }`}
      accessibilityLabel={
        verrouille
          ? `${nom}, ${annonce}, sous inventaire : ne s'encaisse pas`
          : `${nom}, ${annonce}, ${stock}`
      }
    >
      <View className={cote ? "grow flex-row" : "grow"}>
        <Visuel article={article} etat={etat} stock={stock} cote={cote} />
        {texte}
      </View>
    </Pressable>
  );
}

/** L'image et son bandeau de stock, posé dessus comme sur le web. */
function Visuel({
  article,
  etat,
  stock,
  cote,
}: {
  article: ArticlePos;
  etat: EtatDeStock;
  stock: string;
  cote: boolean;
}) {
  const ton = TONS[etat];
  return (
    <View
      // À côté du texte, la vignette suit TOUTE la hauteur de la carte
      // (`self-stretch`) : la rangée l'étire à la hauteur de la colonne de
      // texte, et la carte, qui porte `overflow-hidden`, en arrondit les coins.
      // Empilée, elle prend toute la largeur : 60 points suffisent à l'image et
      // au bandeau, et la grille d'un téléphone garde ses rangées.
      className={cote ? "self-stretch overflow-hidden" : "overflow-hidden rounded-lg"}
      style={
        cote
          ? { width: LARGEUR_VIGNETTE_COTE, minHeight: HAUTEUR_MIN_VIGNETTE_COTE }
          : { height: 60 }
      }
    >
      {/* ⚠ EN ABSOLU, ET CE N'EST PAS UNE COQUETTERIE. Posée dans le flux, la
          vignette (`h-full`, soit 100 % de la hauteur) se mesurait contre un
          parent qui n'a pas encore de hauteur - c'est l'étirement qui la lui
          donne, APRÈS - et la carte montait à toute la hauteur de l'écran
          (relevé sur le rk3568). Hors du flux, l'image ne pèse plus sur la
          mesure : c'est le texte qui fait la hauteur, et elle la remplit. */}
      <View className="absolute inset-0">
        <VignetteArticle uri={article.image} taille="plein" />
      </View>
      <View className={`absolute inset-x-0 bottom-0 items-center px-1 py-0.5 ${ton.fond}`}>
        {/* `leading-4` et non `leading-3` : à 12 points d'interligne pour un
            texte de 10, la queue de la virgule était rognée, et « 159,5 FLACONS »
            se lisait « 159.5 », au point anglais (relevé sur le rk3568). */}
        <Text
          numberOfLines={2}
          className={`text-center text-[10px] font-sans-bold leading-4 ${ton.texte}`}
        >
          {stock}
        </Text>
      </View>
      {etat === "verrouille" ? (
        <View className="absolute inset-0 items-center justify-center bg-destructive/25">
          <Icon name="Lock" size={20} color="destructive" />
        </View>
      ) : null}
    </View>
  );
}
