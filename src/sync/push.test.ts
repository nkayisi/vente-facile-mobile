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

/**
 * Un abonnement échu ferme une PORTE ; il ne tombe pas en panne.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ SANS CETTE BRANCHE, LE TERMINAL MARTÈLE LE SERVEUR PENDANT DES SEMAINES.│
 * │                                                                          │
 * │ Le refus arrive en 402 sur TOUT le lot, pas en verdict par opération :   │
 * │ il tombe donc dans le `catch`, qui remettait chaque opération en         │
 * │ attente. À chaque cycle, le même lot repartait, le compteur d'essais     │
 * │ montait - et finissait par condamner des ventes parfaitement valides -   │
 * │ pendant que les écrans annonçaient « attend son envoi », c'est-à-dire    │
 * │ qu'ils envoyaient le marchand chercher du réseau qui était déjà là.      │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Le contrôle est TEXTUEL, comme ceux du dessus : `push.ts` ouvre la base
 * locale, qui n'existe pas sous Jest. Ce qu'il tient est donc la STRUCTURE du
 * `catch`, et c'est là que vivait le défaut.
 */
function blocCatchDeLEnvoi(): string {
  const code = readFileSync(join(SRC, "sync/push.ts"), "utf8");
  const debut = code.indexOf("  } catch (error) {");
  const fin = code.indexOf("  const parKind", debut);
  return code.slice(debut, fin);
}

describe("un lot refusé pour abonnement", () => {
  it("le bloc de rattrapage est bien trouvé", () => {
    // Un balayage qui ne balaie rien passe au vert et ne prouve rien : ce
    // dépôt l'a déjà payé trois fois.
    const bloc = blocCatchDeLEnvoi();
    expect(bloc.length).toBeGreaterThan(200);
    expect(bloc).toContain("scheduleRetry");
  });

  it("est mis en attente d'un règlement, jamais réessayé", () => {
    const bloc = blocCatchDeLEnvoi();
    const surAbonnement = bloc.indexOf('kind === "subscription"');
    const surReessai = bloc.indexOf("scheduleRetry");

    expect(surAbonnement).toBeGreaterThan(-1);
    // ⚠ L'ORDRE est ce qui compte : un `scheduleRetry` atteint avant le test
    // d'abonnement remettrait tout en attente et la branche ne servirait plus.
    expect(surAbonnement).toBeLessThan(surReessai);
    expect(bloc).toContain("markBlocked");
  });

  it("arrête la boucle d'envoi au lieu d'enchaîner cinquante refus", () => {
    // Le refus porte sur l'ENDPOINT, pas sur le lot : sans `more: false`,
    // `pushAll` repartirait pour un lot suivant qui se ferait refuser pareil.
    expect(blocCatchDeLEnvoi()).toContain("more: false");
  });
});
