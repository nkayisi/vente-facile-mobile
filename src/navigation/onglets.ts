/**
 * Les onglets du bas : CINQ emplacements, remplis selon les DROITS.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CINQ ONGLETS POUR TOUS, ET AUCUN QU'ON NE PEUT PAS OUVRIR.               │
 * │                                                                          │
 * │ La barre de base est celle du propriétaire : Accueil, Caisse, POS,       │
 * │ Stock, Paramètres. Un membre qui peut ouvrir les cinq les a tels quels - │
 * │ c'est le cas du gérant.                                                  │
 * │                                                                          │
 * │ Un onglet de base que le rôle ne peut pas ouvrir n'est ni grisé ni       │
 * │ laissé vide : sa place revient aux premières sections de `REMPLACANTS`   │
 * │ que le membre peut ouvrir. Un caissier lit donc « Accueil, Caisse, POS,  │
 * │ Ventes, Produits », un magasinier « Accueil, Caisse, Produits, Stock,    │
 * │ Inventaire ». Décision de l'utilisateur, le 14 novembre 2026 : une barre │
 * │ à trois boutons gaspillait la place la plus accessible de l'écran.       │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ L'ORDRE NE DÉPEND PAS DES DROITS : C'EST `ORDRE_DE_LA_BARRE`, FIXE.      │
 * │                                                                          │
 * │ Les boutons se rangent dans l'ordre où les `Tabs.Screen` sont déclarés.  │
 * │ Une première version déclarait chaque remplaçant à la place de l'onglet  │
 * │ qu'il remplaçait, donc dans un ordre calculé depuis les droits. À la     │
 * │ déconnexion, les droits tombent alors que la barre est encore montée :   │
 * │ les écrans se réordonnaient, et Fabric plantait l'application (relevé   │
 * │ sur l'émulateur : « addViewAt: failed to insert view … The specified     │
 * │ child already has a parent »). Masquer un bouton (`href: null`) est sûr, │
 * │ réordonner les écrans d'un navigateur monté ne l'est pas.                │
 * │                                                                          │
 * │ L'ordre fixe est choisi pour que chaque rôle lise une barre juste : le   │
 * │ POS reste au CENTRE pour qui peut vendre, et chaque remplaçant tombe là  │
 * │ où était l'onglet qu'il remplace.                                        │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Le POS est au CENTRE : c'est l'action la plus fréquente de la journée, et le
 * centre de la barre est le point le plus sûr du pouce.
 *
 * ⚠ Moins de cinq onglets ne se voit que si le membre n'a pas cinq sections à
 * ouvrir en tout : on ne remplit jamais un emplacement avec une section qu'il
 * ne peut pas ouvrir.
 *
 * **Les onze sections du menu restent toutes déclarées comme écrans d'onglet**,
 * avec `href: null` pour celles qui n'ont pas de bouton. Une route absente de
 * la déclaration perdrait la barre d'onglets quand on y entre depuis le tiroir.
 */
import type { IconName } from "@/ui";

import { MENU, permissionDeLaSection } from "./menu";

export interface Onglet {
  /** Nom du fichier de route dans le groupe `(tabs)`. */
  nom: string;
  /** Étiquette de la barre. Courte : un bouton dispose d'un cinquième de la largeur. */
  label: string;
  icon: IconName;
  /** `null` = ouvert à tous. */
  permission: string | null;
}

/**
 * Le comptoir n'est pas une section du menu : il a sa propre permission.
 *
 * `sales.create` et non `sales.view` : on ouvre le POS pour VENDRE, et le
 * serveur refuse une vente à qui n'a pas ce droit. Le magasinier ne l'a pas.
 */
export const PERMISSION_DU_COMPTOIR = "sales.create";

/**
 * Une section du menu, avec son étiquette courte de barre.
 *
 * Le glyphe est celui du tiroir, sauf `icon` : voir « Ventes » plus bas.
 */
function section(cle: string, label: string, icon?: IconName): Onglet {
  const entree = MENU.find((e) => e.cle === cle);
  if (!entree) throw new Error(`Section du menu inconnue : « ${cle} »`);
  return { nom: cle, label, icon: icon ?? entree.icon, permission: permissionDeLaSection(cle) };
}

/**
 * La barre de base, celle du propriétaire.
 *
 * Les sections lisent la permission de LEUR entrée du menu, sans la recopier :
 * un onglet et l'entrée du tiroir qui mènent au même écran ne peuvent pas être
 * gardés par deux droits différents.
 */
export const ONGLETS: readonly Onglet[] = [
  section("index", "Accueil"),
  section("caisse", "Caisse"),
  { nom: "vendre", label: "POS", icon: "ShoppingCart", permission: PERMISSION_DU_COMPTOIR },
  section("stock", "Stock"),
  section("parametres", "Paramètres"),
] as const;

export const NOMS_ONGLETS: readonly string[] = ONGLETS.map((o) => o.nom);

/**
 * Les sections qui prennent la place d'un onglet de base qu'on ne peut pas
 * ouvrir, par ordre de PRIORITÉ.
 *
 * L'ordre suit ce qu'on vient chercher le plus souvent au comptoir : l'historique
 * des ventes, le catalogue, puis le comptage, les clients, et enfin les écrans
 * d'administration.
 */
export const REMPLACANTS: readonly Onglet[] = [
  // ⚠ PAS LE CHARIOT DU TIROIR. Le web donne le même glyphe aux ventes et au
  // point de vente, et dans un menu vertical, avec le libellé à côté, cela ne
  // gêne pas. Dans la barre d'un caissier, « POS » et « Ventes » se suivent :
  // deux chariots côte à côte, et l'oeil ne sait plus lequel ouvre le
  // comptoir. Un reçu dit l'historique.
  section("ventes", "Ventes", "Receipt"),
  section("articles", "Produits"),
  section("inventaire", "Inventaire"),
  section("contacts", "Clients"),
  section("rapports", "Rapports"),
  section("utilisateurs", "Équipe"),
  section("abonnement", "Abonnement"),
] as const;

/**
 * L'ordre de DÉCLARATION des écrans de la barre, donc l'ordre de ses boutons.
 * Il ne dépend JAMAIS des droits : voir l'encadré en tête de fichier.
 *
 * ⚠ Un nom ajouté à `ONGLETS` ou à `REMPLACANTS` doit y entrer, à la place qui
 * garde chaque barre lisible ; un test refuse un oubli.
 */
export const ORDRE_DE_LA_BARRE: readonly string[] = [
  "index",
  "caisse",
  "vendre",
  "ventes",
  "articles",
  "stock",
  "inventaire",
  "contacts",
  "rapports",
  "utilisateurs",
  "abonnement",
  "parametres",
];

const ouvert = (o: Onglet, peut: (permission: string) => boolean) =>
  o.permission === null || peut(o.permission);

/** Les onglets de ce membre, dans l'ordre de la barre : cinq au plus. */
export function ongletsDuMembre(peut: (permission: string) => boolean): Onglet[] {
  const base = ONGLETS.filter((o) => ouvert(o, peut));
  const remplacants = REMPLACANTS.filter((o) => ouvert(o, peut)).slice(
    0,
    ONGLETS.length - base.length
  );
  const rang = (o: Onglet) => ORDRE_DE_LA_BARRE.indexOf(o.nom);
  return [...base, ...remplacants].sort((a, b) => rang(a) - rang(b));
}

/** Un écran déclaré dans la barre, avec ou sans bouton. */
export interface EcranDeLaBarre {
  nom: string;
  titre: string;
  icon: IconName;
  /** Étiquette du bouton ; `null` = pas de bouton dans la barre. */
  bouton: string | null;
}

/**
 * Toutes les routes du groupe `(tabs)`, chacune UNE fois, dans l'ordre FIXE de
 * la barre puis « Mon profil » : c'est la liste des `Tabs.Screen` à déclarer.
 *
 * ⚠ LA LISTE ET SON ORDRE SONT LES MÊMES POUR TOUS LES DROITS ; seul `bouton`
 * varie. Voir l'encadré en tête de fichier : un ordre qui suivrait les droits
 * ferait planter l'application à la déconnexion.
 */
export function ecransDeLaBarre(peut: (permission: string) => boolean): EcranDeLaBarre[] {
  const onglets = ongletsDuMembre(peut);
  const routes: Omit<EcranDeLaBarre, "bouton">[] = [
    ...ORDRE_DE_LA_BARRE.map((nom): Omit<EcranDeLaBarre, "bouton"> => {
      if (nom === "vendre") return { nom, titre: "POS", icon: "ShoppingCart" };
      const entree = MENU.find((e) => e.cle === nom);
      if (!entree) throw new Error(`Route de la barre inconnue : « ${nom} »`);
      return { nom, titre: entree.label, icon: entree.icon };
    }),
    // « Mon profil » n'est pas une entrée du menu, sur le web non plus : il vit
    // dans le menu avatar de l'en-tête, et ici dans le pied du tiroir.
    { nom: "profil", titre: "Mon profil", icon: "User" },
  ];
  return routes.map((r) => {
    const onglet = onglets.find((x) => x.nom === r.nom);
    return onglet ? { ...r, icon: onglet.icon, bouton: onglet.label } : { ...r, bouton: null };
  });
}

/**
 * L'étiquette courte et le glyphe d'une section, ceux de la barre d'onglets.
 *
 * Le rail d'une tablette les reprend tels quels : c'est la même place réduite
 * (quatre-vingts points de large), et un marchand qui tourne sa tablette doit
 * lire « Équipe » au même glyphe sur la barre du bas et sur le rail. « Ventes »
 * y garde donc son reçu, pour ne pas se confondre avec le chariot du comptoir.
 */
export function ongletDeLaSection(cle: string): Onglet {
  const o = [...ONGLETS, ...REMPLACANTS].find((x) => x.nom === cle);
  if (!o) throw new Error(`Section sans onglet : « ${cle} »`);
  return o;
}

/**
 * Une route du groupe `(tabs)`, c'est-à-dire un écran sous lequel la barre
 * d'onglets est rendue.
 *
 * Sert au geste de balayage du tiroir : il n'ouvre le menu QUE sur un onglet,
 * comme avant que le tiroir ne monte d'un cran pour couvrir aussi le rail.
 * Sur une fiche poussée, le bord gauche reste au retour du système.
 */
export function estUneRouteDOnglet(chemin: string | null | undefined): boolean {
  if (!chemin) return false;
  // Les groupes (`(app)`, `(tabs)`) ne sont pas des segments d'URL.
  const segment = chemin
    .split("?")[0]
    .split("/")
    .filter((s) => s && !(s.startsWith("(") && s.endsWith(")")))[0];
  if (!segment) return true;
  return segment !== "index" && (ORDRE_DE_LA_BARRE.includes(segment) || segment === "profil");
}

/**
 * Le geste qui mène à une section, depuis la route `depuis` : un saut d'onglet
 * depuis un onglet, un dépilement depuis une fiche. PUR, pour être éprouvé sans
 * navigateur ; `aller.ts` l'applique, et dit pourquoi ces deux gestes-là.
 */
export function gestePourSection(depuis: string | null | undefined): "navigate" | "dismissTo" {
  return estUneRouteDOnglet(depuis) ? "navigate" : "dismissTo";
}
