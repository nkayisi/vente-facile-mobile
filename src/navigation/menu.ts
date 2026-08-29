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
 * Ce qui est écrit à la place du chevron quand l'entrée est hors droits.
 *
 * La raison se déduit du rôle qui détient la permission, jamais d'une table de
 * chaînes figée : une permission déplacée d'un rôle à l'autre côté serveur
 * rendrait cette table fausse en silence.
 */
export function raisonHorsDroits(entree: EntreeMenu): string {
  if (entree.permission === "settings.view" || entree.permission === "users.view") {
    return "Réservé à l'administrateur";
  }
  return "Réservé au gérant";
}

export interface EtatEntree extends EntreeMenu {
  accessible: boolean;
  /** Non vide seulement quand `accessible` est faux. */
  raison: string | null;
  /** L'écran existe mais ses actions ne sont pas encore câblées. */
  bientot: boolean;
}

/**
 * Les ONZE entrées, toujours les onze.
 *
 * Le web retire les entrées hors droits (`return null` dans `sidebar.tsx`) ; le
 * plan approuvé dit de les griser, et le plan gagne. **Masquer enseigne mal** :
 * un caissier qui ne voit jamais « Stock » ne sait pas que la fonction existe,
 * ni qu'il peut la demander à son responsable.
 */
export function entreesDuMenu(peut: (permission: string) => boolean): EtatEntree[] {
  return MENU.map((e) => {
    const accessible = e.permission === null || peut(e.permission);
    return {
      ...e,
      accessible,
      raison: accessible ? null : raisonHorsDroits(e),
      bientot: e.lot !== null,
    };
  });
}
