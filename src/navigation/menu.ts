/**
 * Le menu, source unique.
 *
 * **Copié ligne à ligne de `frontend/components/layout/sidebar.tsx`** : même
 * ordre, mêmes libellés, mêmes glyphes, mêmes permissions. C'est ce qui fait
 * qu'un marchand qui quitte son ordinateur pour son terminal retrouve le même
 * menu. Un test compare les deux fichiers et échoue si l'un dérive.
 *
 * La barre latérale du web est PLATE : onze entrées, aucun regroupement, aucun
 * sous-menu. On ne réorganise pas en passant, même quand la tentation est
 * grande : c'est précisément la réorganisation qui perdrait l'utilisateur.
 *
 * Les chemins mobiles diffèrent (`/ventes` contre `/dashboard/sales`), et c'est
 * assumé : une URL est invisible sur un téléphone, et la reproduire coûterait
 * une hiérarchie de routes que la barre d'onglets ne sait pas adresser.
 */
import type { IconName } from "@/ui";

export interface EntreeMenu {
  /** Nom de la route dans le groupe `(tabs)`. */
  cle: string;
  /** Libellé EXACT du back-office. */
  label: string;
  /** Glyphe lucide EXACT du back-office. */
  icon: IconName;
  href: string;
  /**
   * La permission de la PAGE, celle que le back-office lit dans
   * `lib/navigation/regles-de-route.ts`. `null` = visible par tous.
   */
  permission: string | null;
  /** Lot du plan qui câblera les fonctions. `null` = livré. */
  lot: number | null;
}

export const MENU: readonly EntreeMenu[] = [
  // `dashboard.view` est porté par les quatre rôles : l'accueil reste visible
  // de tous, mais la règle est celle du back-office, pas une exception.
  { cle: "index",        label: "Tableau de bord",         icon: "LayoutDashboard", href: "/",             permission: "dashboard.view", lot: 9    },
  { cle: "ventes",       label: "Ventes",                  icon: "ShoppingCart",    href: "/ventes",       permission: "sales.view",     lot: 6    },
  { cle: "articles",     label: "Produits",                icon: "Package",         href: "/articles",     permission: "products.view",  lot: 8    },
  { cle: "stock",        label: "Stock",                   icon: "Boxes",           href: "/stock",        permission: "stock.view",     lot: 7    },
  { cle: "inventaire",   label: "Inventaire",              icon: "ClipboardList",   href: "/inventaire",   permission: "inventory.view", lot: 8    },
  { cle: "caisse",       label: "Livre de caisse",         icon: "Wallet",          href: "/caisse",       permission: "cashbook.view",  lot: 9    },
  { cle: "rapports",     label: "Rapports & statistiques", icon: "BarChart3",       href: "/rapports",     permission: "reports.view",   lot: 10   },
  { cle: "contacts",     label: "Clients & fournisseurs",  icon: "Users",           href: "/contacts",     permission: "customers.view", lot: 6    },
  { cle: "utilisateurs", label: "Utilisateurs",            icon: "UserCog",         href: "/utilisateurs", permission: "users.view",     lot: 10   },
  // `subscription.view`, au seul propriétaire : sous `settings.view`, le gérant
  // voyait l'entrée et ses règlements lui répondaient 403. Le back-office a
  // corrigé le même défaut le 2026-11-20.
  { cle: "abonnement",   label: "Abonnement",              icon: "Crown",           href: "/abonnement",   permission: "subscription.view", lot: 11 },
  { cle: "parametres",   label: "Paramètres",              icon: "Settings",        href: "/parametres",   permission: "settings.view",  lot: null },
] as const;

/**
 * Les entrées PROPRES AU TERMINAL, sans miroir dans le back-office.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UNE SEULE LISTE, LUE PAR LA BARRE LATÉRALE, LE TIROIR ET LE RAIL.       │
 * │                                                                          │
 * │ Le rail ne portait que les onze sections : « Ma journée » et tout « Cet  │
 * │ appareil » n'existaient que derrière son bouton « Menu », et c'est par   │
 * │ là qu'une opération refusée restait sans lecteur. Elles vivent ici, avec │
 * │ leur étiquette COURTE (`court`), celle que quatre-vingts points tiennent │
 * │ (« Synchronisation » n'y entre pas).                                     │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ ELLES NE VONT PAS DANS `MENU`, que `menu.test.ts` compare ligne à ligne au
 * back-office : y ajouter une entrée mobile y ferait échouer trois assertions,
 * à juste titre.
 */
export interface EntreeAnnexe {
  /** La clé que `sectionDeLaRoute` rend sur cette route. */
  cle: string;
  label: string;
  court: string;
  icon: IconName;
  href: string;
}

export const ENTREE_MA_JOURNEE: EntreeAnnexe = {
  cle: "ma-journee",
  label: "Ma journée",
  court: "Ma journée",
  icon: "CalendarCheck",
  href: "/(app)/ma-journee",
};

/** La clé de l'entrée qui porte la pastille des opérations à corriger. */
export const CLE_OPERATIONS = "operations";

export const ENTREES_APPAREIL: readonly EntreeAnnexe[] = [
  { cle: "synchronisation", label: "Synchronisation", court: "Sync", icon: "CloudDownload", href: "/(app)/appareil/synchronisation" },
  // L'écran où un refus du serveur devient lisible et se corrige. Il porte sa
  // PASTILLE (refusées + bloquées) : sans elle, le marchand n'avait aucune raison
  // de l'ouvrir, et une vente refusée restait en quarantaine des jours.
  { cle: CLE_OPERATIONS, label: "Opérations à corriger", court: "À corriger", icon: "AlertTriangle", href: "/(app)/appareil/operations" },
  { cle: "imprimante", label: "Imprimante", court: "Imprimante", icon: "Printer", href: "/(app)/appareil/imprimante" },
  // ⚠ SANS CETTE ENTRÉE, L'ÉCRAN DE DIAGNOSTIC N'EXISTE POUR PERSONNE. Il a été
  // écrit pour qu'un marchand chez qui la barre du système recouvre le bas de
  // l'écran puisse nous envoyer un relevé.
  { cle: "affichage", label: "Diagnostic d'affichage", court: "Affichage", icon: "Ruler", href: "/(app)/appareil/affichage" },
];

/** Rôles, dans l'ordre de la hiérarchie backend. */
export type Role = "cashier" | "stock_keeper" | "manager" | "owner";

/**
 * Les sections que ce membre peut OUVRIR, et seulement elles.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UNE SECTION HORS DROITS N'EST PLUS AFFICHÉE.                            │
 * │                                                                          │
 * │ La première version les montrait grisées, avec une pastille « Réservé   │
 * │ au gérant » et un toast au toucher, au motif qu'un caissier qui ne voit  │
 * │ jamais « Stock » ne sait pas que la fonction existe. À l'usage, c'était  │
 * │ l'inverse d'une aide : six entrées sur onze qu'un caissier ne peut pas   │
 * │ ouvrir, et qu'il touche quand même, plusieurs fois par jour. Décision de │
 * │ l'utilisateur, le 14 novembre 2026 : qui n'est pas censé y entrer ne     │
 * │ les voit pas.                                                            │
 * │                                                                          │
 * │ C'est aussi ce que fait le back-office (`return null` dans               │
 * │ `sidebar.tsx`) : les deux surfaces ne divergent plus sur ce point.       │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * La règle porte sur la PERMISSION, jamais sur le rôle : un caissier à qui le
 * marchand accorde `stock.view` par `extra_permissions` voit « Stock » paraître.
 * L'ORDRE reste celui de `MENU` : une entrée disparaît, les autres ne bougent
 * pas les unes par rapport aux autres.
 */
export function entreesDuMenu(peut: (permission: string) => boolean): EntreeMenu[] {
  return MENU.filter((e) => e.permission === null || peut(e.permission));
}

/**
 * La permission d'une section du menu, par sa clé.
 *
 * ⚠ ELLE LÈVE sur une clé inconnue plutôt que de rendre `null` : `null` veut
 * dire « ouvert à tous », et une faute de frappe ouvrirait la section à
 * n'importe quel rôle sans que rien ne le signale.
 */
export function permissionDeLaSection(cle: string): string | null {
  const entree = MENU.find((e) => e.cle === cle);
  if (!entree) throw new Error(`Section du menu inconnue : « ${cle} »`);
  return entree.permission;
}

/**
 * La section du menu à laquelle appartient une route, pour allumer la bonne
 * entrée de la barre latérale, du rail et du tiroir.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UNE TABLE DE SEGMENTS, JAMAIS UN PRÉFIXE DE CHAÎNE.                     │
 * │                                                                          │
 * │ L'ancienne règle comparait les chemins par `startsWith` : juste tant     │
 * │ que chaque section ne vivait que sous son propre chemin. Une fiche de    │
 * │ vente vit sous `/vente/…`, pas sous `/ventes`, et sur une tablette la    │
 * │ barre latérale reste à l'écran pendant qu'on la lit : elle n'allumait    │
 * │ plus rien, et le marchand ne savait plus où il était. Et `/caisses` (le  │
 * │ parc de caisses, rangé sous Ventes comme au back-office) commence par    │
 * │ `/caisse` (le livre de caisse) : un préfixe aurait allumé la mauvaise    │
 * │ section. On lit donc le PREMIER SEGMENT, et on le cherche ici.           │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Chaque route vit sous la section d'où on l'ouvre : une fiche de vente sous
 * Ventes, une fiche client et les créances aussi (le hub Ventes y mène), un
 * rayon sous Stock. ⚠ Une route ajoutée demain doit entrer ici ou dans la
 * liste des routes hors section de `menu.test.ts`, qui balaie `src/app/`.
 *
 * `vendre` n'est pas une section du menu : c'est le comptoir, que la barre
 * latérale et le rail portent à part.
 */
const SECTION_PAR_SEGMENT: Readonly<Record<string, string>> = {
  ventes: "ventes",
  vente: "ventes",
  devis: "ventes",
  retour: "ventes",
  caisses: "ventes",
  cloture: "ventes",
  creances: "ventes",
  articles: "articles",
  article: "articles",
  referentiel: "articles",
  stock: "stock",
  rayon: "stock",
  mouvement: "stock",
  transfert: "stock",
  ajustement: "stock",
  entrepot: "stock",
  requisition: "stock",
  inventaire: "inventaire",
  comptage: "inventaire",
  caisse: "caisse",
  depense: "caisse",
  rapports: "rapports",
  "rapport-entrepots": "rapports",
  contacts: "contacts",
  client: "contacts",
  fournisseur: "contacts",
  utilisateurs: "utilisateurs",
  abonnement: "abonnement",
  parametres: "parametres",
  vendre: "vendre",
  pos: "vendre",
  "ma-journee": ENTREE_MA_JOURNEE.cle,
};

/**
 * Sous `/appareil`, c'est le SECOND segment qui désigne l'entrée. Les documents
 * imprimés n'ont pas d'entrée à eux : ils se rangent sous l'imprimante.
 */
const SECTION_APPAREIL: Readonly<Record<string, string>> = {
  synchronisation: "synchronisation",
  operations: CLE_OPERATIONS,
  imprimante: "imprimante",
  documents: "imprimante",
  affichage: "affichage",
};

/** La clé du comptoir, qui n'est pas une entrée de `MENU`. */
export const SECTION_COMPTOIR = "vendre";

export function sectionDeLaRoute(chemin: string | null | undefined): string | null {
  if (!chemin) return null;
  // Les groupes (`(app)`, `(tabs)`) ne sont pas des segments d'URL.
  const [segment, suivant] = chemin
    .split("?")[0]
    .split("/")
    .filter((s) => s && !(s.startsWith("(") && s.endsWith(")")));
  if (!segment) return "index";
  if (segment === "appareil") return SECTION_APPAREIL[suivant ?? ""] ?? null;
  return SECTION_PAR_SEGMENT[segment] ?? null;
}
