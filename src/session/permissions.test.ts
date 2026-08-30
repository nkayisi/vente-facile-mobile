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
 * C'est exactement ce qui s'est produit au lot 9 : `stock.adjust` n'existe pas
 * (le vrai code est `stock_movements.create`), et le bouton « Ouvrir des
 * BOITES » ne se serait affiché pour personne.
 *
 * La liste de référence est extraite des `action_permissions` du backend. Elle
 * est VERSIONNÉE ici plutôt que lue à travers le réseau : un test qui exige un
 * serveur ne s'exécute pas en intégration continue, et celui-ci doit tourner à
 * chaque commit.
 */
const SRC = resolve(__dirname, "..");

/**
 * Codes déclarés par le serveur (`grep -rhoE "'[a-z_]+\\.[a-z_]+'" apps/*​/views.py`).
 * À RÉGÉNÉRER quand le backend en ajoute : le test dira lequel manque.
 */
const CODES_SERVEUR = new Set([
  "cashbook.approve_expense", "cashbook.cancel_movement", "cashbook.create_expense",
  "cashbook.create_movement", "cashbook.delete_expense", "cashbook.delete_movement",
  "cashbook.manage_categories", "cashbook.view", "cashbook.view_reports",
  "customers.create", "customers.delete", "customers.edit", "customers.view",
  "inventory.count", "inventory.create", "inventory.validate", "inventory.view",
  "products.create", "products.delete", "products.edit", "products.view",
  "reports.view", "sales.cancel", "sales.create", "sales.refund", "sales.view",
  "settings.edit", "settings.view",
  "stock.view", "stock_adjustments.approve", "stock_adjustments.create",
  "stock_adjustments.view", "stock_movements.create", "stock_movements.view",
  "stock_transfers.cancel", "stock_transfers.create", "stock_transfers.receive",
  "stock_transfers.ship", "stock_transfers.view",
  "suppliers.create", "suppliers.delete", "suppliers.edit", "suppliers.view",
  "users.create", "users.delete", "users.edit", "users.view",
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
