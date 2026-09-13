/**
 * Garde-fou de parité : les codes du terminal sont ceux du SERVEUR.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE TEST LIT LA SOURCE DU SERVEUR, IL NE RECOPIE PAS SA LISTE.           │
 * │                                                                          │
 * │ Une table recopiée à la main est exactement ce qui a produit le défaut   │
 * │ qu'il ferme : six codes sur onze étaient inventés, et personne ne        │
 * │ pouvait le voir - le repli affichait le code brut au lieu de lever.      │
 * │ `permissions.test.ts` avait déjà connu cela, sa liste de référence ayant │
 * │ été recopiée avec trois codes fantômes.                                  │
 * │                                                                          │
 * │ Le backend vit dans le MÊME dépôt : on le lit. Un fichier introuvable    │
 * │ fait ÉCHOUER le test en nommant le chemin, il ne le fait pas passer -    │
 * │ un balayage qui ne balaie rien passe et ne prouve rien, et ce dépôt l'a  │
 * │ déjà payé trois fois.                                                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import { readFileSync } from "fs";
import { resolve } from "path";

import {
  STATUT_DEPENSE,
  TYPE_MOUVEMENT_CAISSE,
  decisionsPossibles,
  libelleTypeCaisse,
  transitionsPossibles,
} from "./types-caisse";

const MODELS = resolve(__dirname, "../../../../backend/apps/cashbook/models.py");

function sourceServeur(): string {
  try {
    return readFileSync(MODELS, "utf8");
  } catch {
    throw new Error(
      `Le modèle du serveur est introuvable : ${MODELS}. ` +
        "Ce test croise les codes du terminal avec la source, il ne peut pas " +
        "s'en passer sans cesser de prouver quoi que ce soit."
    );
  }
}

/** Les couples (code, libellé) d'un bloc `TextChoices` nommé. */
function choixDe(bloc: string): Map<string, string> {
  const src = sourceServeur();
  const debut = src.indexOf(`class ${bloc}(models.TextChoices):`);
  if (debut === -1) throw new Error(`Bloc \`${bloc}\` absent de ${MODELS}.`);
  const corps = src.slice(debut).split(/\n\s*\n/)[0];
  const codes = new Map<string, string>();
  for (const m of corps.matchAll(/^\s+[A-Z_0-9]+ = '([^']+)', '([^']+)'/gm)) {
    codes.set(m[1], m[2]);
  }
  return codes;
}

describe("le balayage MORD", () => {
  it("trouve les douze types du serveur", () => {
    // Sans ce contrôle, une expression qui ne trouverait rien ferait passer
    // tous les tests suivants sur des ensembles vides.
    expect(choixDe("MovementType").size).toBeGreaterThanOrEqual(10);
    expect(choixDe("Status").size).toBeGreaterThanOrEqual(6);
  });
});

describe("types de mouvement de caisse", () => {
  it("porte EXACTEMENT les codes du serveur, ni plus ni moins", () => {
    const serveur = [...choixDe("MovementType").keys()].sort();
    expect(Object.keys(TYPE_MOUVEMENT_CAISSE).sort()).toEqual(serveur);
  });

  it("reprend le libellé du serveur pour chaque code", () => {
    for (const [code, label] of choixDe("MovementType")) {
      expect(TYPE_MOUVEMENT_CAISSE[code].label).toBe(label);
    }
  });

  it("nomme les deux types que ce terminal produit lui-même", () => {
    // `features/caisse/actes.ts` envoie `other_in` / `other_out` : ce sont les
    // seuls types qu'un terminal fabrique, et donc ceux que son propre écran
    // affichait sous leur code technique.
    expect(libelleTypeCaisse("other_in")).toBe("Autre entrée");
    expect(libelleTypeCaisse("other_out")).toBe("Autre sortie");
  });

  it("rend le CODE d'un type inconnu, jamais une phrase", () => {
    expect(libelleTypeCaisse("type_de_demain")).toBe("type_de_demain");
  });
});

describe("statuts de dépense", () => {
  it("porte exactement les six statuts du serveur, avec leurs libellés", () => {
    const serveur = choixDe("Status");
    expect(Object.keys(STATUT_DEPENSE).sort()).toEqual([...serveur.keys()].sort());
    for (const [code, label] of serveur) {
      expect(STATUT_DEPENSE[code].label).toBe(label);
    }
  });
});

describe("transitions d'une dépense", () => {
  // Miroir des cinq gardes de `ExpenseViewSet`. Proposer une transition que le
  // serveur refusera l'envoie en quarantaine, loin de l'écran qui l'a offerte.
  it.each([
    ["draft", ["submit", "pay", "cancel"]],
    ["pending", ["approve", "reject", "pay", "cancel"]],
    ["approved", ["pay", "cancel"]],
    ["rejected", ["pay", "cancel"]],
    ["paid", ["cancel"]],
    ["cancelled", []],
  ])("depuis %s", (statut, attendu) => {
    expect(transitionsPossibles(statut as string).sort()).toEqual(
      (attendu as string[]).sort()
    );
  });

  it("n'offre jamais rien sur une dépense annulée", () => {
    // Le serveur répond 400 « Cette dépense est déjà annulée » sur les cinq.
    expect(transitionsPossibles("cancelled")).toEqual([]);
  });
});

describe("décisions sur une dépense encore en file", () => {
  it("n'en ouvre AUCUNE, quel que soit le statut", () => {
    // `_transition_depense` cherche la pièce par `_objet_de_lorg` : sur un
    // identifiant que le serveur n'a pas encore vu, il refuse - verdict
    // `rejected`, donc quarantaine, découverte des jours plus tard sur un
    // autre écran. Offrir « Approuver » ici, c'est offrir un bouton qui
    // fabrique un refus que le marchand n'a pas provoqué.
    for (const statut of ["draft", "pending", "approved", "paid"]) {
      expect(decisionsPossibles(statut, true)).toEqual([]);
    }
  });

  it("les rend toutes dès que le serveur connaît la pièce", () => {
    expect(decisionsPossibles("draft", false)).toEqual(
      transitionsPossibles("draft")
    );
    expect(decisionsPossibles("pending", false)).toEqual(
      transitionsPossibles("pending")
    );
  });
});
