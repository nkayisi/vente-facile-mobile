import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

/**
 * Tout code de permission employé par un écran existe côté serveur.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UNE FAUTE DE FRAPPE ICI NE LÈVE RIEN : `can("stock.adjust")` rend       │
 * │ simplement `false`, et le bouton DISPARAÎT. Le magasinier conclut que   │
 * │ la fonction n'existe pas, et personne ne cherche un bug là où il n'y a  │
 * │ pas d'erreur.                                                           │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * C'est exactement ce qui s'est produit deux fois. Au lot 9, le bouton
 * « Ouvrir des BOITES » s'appuyait sur `stock.adjust` là où la vue exige
 * `stock_movements.create`. Au lot 11, les retours s'appuyaient sur
 * `sales.refund`, que le serveur n'accorde À AUCUN rôle : les vrais codes sont
 * `sale_returns.create` et `sale_returns.approve`. Dans les deux cas, aucune
 * erreur, aucun journal - juste un bouton absent.
 *
 * La liste de référence est extraite des `action_permissions` du backend. Elle
 * est VERSIONNÉE ici plutôt que lue à travers le réseau : un test qui exige un
 * serveur ne s'exécute pas en intégration continue, et celui-ci doit tourner à
 * chaque commit.
 */
const SRC = resolve(__dirname, "..");

/**
 * Codes que le SERVEUR peut accorder.
 *
 * Source : le catalogue de rôles `apps/core/services.py`, réuni aux
 * `action_permissions` des vues. C'est le catalogue qui compte pour `can()`,
 * puisque c'est lui qui remplit `membership.permissions` ; les vues sont
 * jointes pour qu'un code enforcé mais jamais accordé se voie aussi.
 *
 *   grep -rhoE "'[a-z_]+\.[a-z_]+'" apps/core/services.py apps/*​/views.py \
 *     apps/*​/reports.py | tr -d "'" | sort -u | grep -vE "^(apps|module)\."
 *
 * VERSIONNÉE ici plutôt que lue à travers le réseau : un test qui exige un
 * serveur ne s'exécute pas en intégration continue, et celui-ci doit tourner à
 * chaque commit. À RÉGÉNÉRER quand le backend en ajoute.
 *
 * **La liste précédente était FAUSSE, et le test passait quand même** : elle
 * contenait `sales.refund`, `settings.edit` et `users.delete`, qu'aucun rôle
 * n'accorde. Deux écrans de retour s'appuyaient sur `sales.refund` ; leurs
 * boutons ne se seraient affichés pour PERSONNE, et le garde-fou écrit pour
 * attraper exactement cela les validait. Une liste de référence recopiée à la
 * main vaut ce que vaut la recopie : d'où la commande, au-dessus.
 */
const CODES_SERVEUR = new Set([
  "cashbook.approve_expense", "cashbook.cancel_movement", "cashbook.create_expense",
  "cashbook.create_movement", "cashbook.delete_expense", "cashbook.delete_movement",
  "cashbook.manage_categories", "cashbook.view", "cashbook.view_reports",
  "categories.create", "categories.delete", "categories.edit", "categories.view",
  "customers.create", "customers.delete", "customers.edit", "customers.view",
  "dashboard.view",
  "inventory.cancel", "inventory.count", "inventory.create", "inventory.print",
  "inventory.start", "inventory.submit", "inventory.validate", "inventory.view",
  "organization.edit", "organization.settings", "organization.view",
  "payment_methods.manage", "payment_methods.view",
  "products.create", "products.delete", "products.edit", "products.view",
  "purchases.create", "purchases.edit", "purchases.receive", "purchases.view",
  "reports.create", "reports.delete", "reports.export", "reports.view",
  "sale_returns.approve", "sale_returns.create", "sale_returns.view",
  "sales.cancel", "sales.create", "sales.discount", "sales.manage_registers",
  "sales.view", "sales.view_all",
  "settings.manage", "settings.view",
  "stock.adjust", "stock.view",
  "stock_adjustments.approve", "stock_adjustments.create", "stock_adjustments.view",
  "stock_movements.create", "stock_movements.view",
  "stock_transfers.cancel", "stock_transfers.create", "stock_transfers.receive",
  "stock_transfers.ship", "stock_transfers.view",
  "subscription.manage", "subscription.view",
  "suppliers.create", "suppliers.delete", "suppliers.edit", "suppliers.view",
  "users.create", "users.deactivate", "users.edit", "users.view",
  "warehouses.create", "warehouses.delete", "warehouses.edit", "warehouses.view",
]);

function fichiers(dir: string): string[] {
  const sortie: string[] = [];
  for (const nom of readdirSync(dir)) {
    const chemin = join(dir, nom);
    if (statSync(chemin).isDirectory()) sortie.push(...fichiers(chemin));
    else if (/\.tsx?$/.test(nom) && !/\.test\.tsx?$/.test(nom)) sortie.push(chemin);
  }
  return sortie;
}

describe("codes de permission", () => {
  const employes: { code: string; fichier: string }[] = [];
  for (const f of fichiers(SRC)) {
    const code = readFileSync(f, "utf8");
    for (const m of code.matchAll(/\bcan(?:Any)?\(\s*"([a-z_]+\.[a-z_]+)"/g)) {
      employes.push({ code: m[1], fichier: relative(SRC, f) });
    }
    for (const m of code.matchAll(/\bcanAny\(\s*\[([^\]]*)\]/g)) {
      for (const c of m[1].matchAll(/"([a-z_]+\.[a-z_]+)"/g)) {
        employes.push({ code: c[1], fichier: relative(SRC, f) });
      }
    }
  }

  it("des codes sont bien employés", () => {
    // Sans cette assertion, une expression qui ne trouve rien ferait passer le
    // test suivant sans rien démontrer.
    expect(employes.length).toBeGreaterThan(8);
  });

  it("chaque code employé existe côté serveur", () => {
    const inconnus = employes
      .filter((e) => !CODES_SERVEUR.has(e.code))
      .map((e) => `${e.fichier} -> ${e.code}`);
    expect([...new Set(inconnus)]).toEqual([]);
  });
});
