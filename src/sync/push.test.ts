import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Tout acte du journal sait quelles tables relire après coup.
 *
 * L'oubli est silencieux et coûteux : l'opération part, le serveur l'applique,
 * et le terminal ne redemande jamais la table. L'écran garde alors un solde ou
 * un stock périmé, indéfiniment, sans qu'aucune erreur ne le signale.
 *
 * C'est exactement ce qui est arrivé à `customer.adjust_balance` en l'écrivant :
 * l'acte a été déclaré dans `OperationKind` et le répartiteur l'ignorait.
 *
 * Le test lit les DEUX sources en texte plutôt que d'importer les modules :
 * `outbox.ts` et `push.ts` ouvrent la base locale, qui n'existe pas sous Jest.
 */
const SRC = join(__dirname, "..");

function kindsDeclares(): string[] {
  const code = readFileSync(join(SRC, "sync/outbox.ts"), "utf8");
  const bloc = code.slice(
    code.indexOf("export type OperationKind"),
    code.indexOf(";", code.indexOf("export type OperationKind"))
  );
  return [...bloc.matchAll(/"([a-z_]+\.[a-z_]+)"/g)].map((m) => m[1]);
}

function kindsReconcilies(): string[] {
  const code = readFileSync(join(SRC, "sync/push.ts"), "utf8");
  const debut = code.indexOf("const TABLES_TOUCHEES");
  const bloc = code.slice(debut, code.indexOf("\n};", debut));
  return [...bloc.matchAll(/"([a-z_]+\.[a-z_]+)":/g)].map((m) => m[1]);
}

describe("réconciliation après envoi", () => {
  it("les deux listes sont trouvées", () => {
    // Sans cela, une expression qui ne trouve rien ferait passer le test
    // suivant sans rien démontrer.
    expect(kindsDeclares().length).toBeGreaterThan(5);
    expect(kindsReconcilies().length).toBeGreaterThan(5);
  });

  it("chaque acte déclaré sait quelles tables relire", () => {
    const manquants = kindsDeclares().filter(
      (k) => !kindsReconcilies().includes(k)
    );
    expect(manquants).toEqual([]);
  });

  it("aucune table n'est réconciliée pour un acte qui n'existe pas", () => {
    // L'inverse : une entrée orpheline signale un acte renommé à moitié.
    const orphelins = kindsReconcilies().filter(
      (k) => !kindsDeclares().includes(k)
    );
    expect(orphelins).toEqual([]);
  });
});
