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

/**
 * Tout acte du journal porte un LIBELLÉ HUMAIN.
 *
 * `appareil/operations.tsx` est l'écran « Opérations à corriger » : c'est là
 * que le marchand décide quoi faire d'une opération refusée ou bloquée. Un acte
 * sans libellé s'y affiche sous son CODE TECHNIQUE - « expense_category.update »
 * -, sur l'écran même où l'on attend de lui une décision.
 *
 * Le défaut est arrivé pour de vrai : les cinq transitions de dépense,
 * `cash_movement.cancel` et les deux créations de rubrique étaient dans
 * `OperationKind` depuis leur lot, et dans aucune table de libellés.
 */
function kindsLibelles(): string[] {
  const code = readFileSync(join(SRC, "app/(app)/appareil/operations.tsx"), "utf8");
  const debut = code.indexOf("const KIND_LABELS");
  const bloc = code.slice(debut, code.indexOf("\n};", debut));
  return [...bloc.matchAll(/"([a-z_]+\.[a-z_]+)":/g)].map((m) => m[1]);
}

describe("libellés des opérations", () => {
  it("la table est trouvée", () => {
    // Sans cela, une expression qui ne trouve rien ferait passer le test
    // suivant sur un ensemble vide - le piège déjà payé trois fois ici.
    expect(kindsLibelles().length).toBeGreaterThan(20);
  });

  it("chaque acte déclaré a un libellé en français", () => {
    const manquants = kindsDeclares().filter((k) => !kindsLibelles().includes(k));
    expect(manquants).toEqual([]);
  });

  it("aucun libellé ne désigne un acte qui n'existe pas", () => {
    const orphelins = kindsLibelles().filter((k) => !kindsDeclares().includes(k));
    expect(orphelins).toEqual([]);
  });
});
