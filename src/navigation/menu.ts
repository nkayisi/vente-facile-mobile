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
  /** `null` = visible par tous, comme « Tableau de bord » sur le web. */
  permission: string | null;
  /** Lot du plan qui câblera les fonctions. `null` = livré. */
  lot: number | null;
}

export const MENU: readonly EntreeMenu[] = [
  { cle: "index",        label: "Tableau de bord",         icon: "LayoutDashboard", href: "/",             permission: null,             lot: 9    },
  { cle: "ventes",       label: "Ventes",                  icon: "ShoppingCart",    href: "/ventes",       permission: "sales.view",     lot: 6    },
  { cle: "articles",     label: "Produits",                icon: "Package",         href: "/articles",     permission: "products.view",  lot: 8    },
  { cle: "stock",        label: "Stock",                   icon: "Boxes",           href: "/stock",        permission: "stock.view",     lot: 7    },
  { cle: "inventaire",   label: "Inventaire",              icon: "ClipboardList",   href: "/inventaire",   permission: "inventory.view", lot: 8    },
  { cle: "caisse",       label: "Livre de caisse",         icon: "Wallet",          href: "/caisse",       permission: "cashbook.view",  lot: 9    },
  { cle: "rapports",     label: "Rapports & statistiques", icon: "BarChart3",       href: "/rapports",     permission: "reports.view",   lot: 10   },
  { cle: "contacts",     label: "Clients & fournisseurs",  icon: "Users",           href: "/contacts",     permission: "customers.view", lot: 6    },
  { cle: "utilisateurs", label: "Utilisateurs",            icon: "UserCog",         href: "/utilisateurs", permission: "users.view",     lot: 10   },
  { cle: "abonnement",   label: "Abonnement",              icon: "Crown",           href: "/abonnement",   permission: "settings.view",  lot: 11   },
  { cle: "parametres",   label: "Paramètres",              icon: "Settings",        href: "/parametres",   permission: "settings.view",  lot: null },
] as const;

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
