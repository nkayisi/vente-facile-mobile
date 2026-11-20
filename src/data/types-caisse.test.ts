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
  TRANSITION_DEPENSE,
  libelleTypeCaisse,
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

describe("droits des gestes d'une dépense", () => {
  // Les gestes eux-mêmes sont éprouvés dans `gestes-depense.test.ts`. Ici, le
  // droit que chacun demande : un code faux ne lève rien, il fait disparaître
  // le bouton, et personne ne cherche un défaut là où il n'y a pas d'erreur.
  it("le caissier PAIE par `cashbook.pay_expense`, pas par le droit d'approuver", () => {
    expect(TRANSITION_DEPENSE.pay.permission).toBe("cashbook.pay_expense");
  });

  it("payer directement vaut une approbation", () => {
    expect(TRANSITION_DEPENSE.pay_direct.permission).toBe("cashbook.approve_expense");
  });
});
