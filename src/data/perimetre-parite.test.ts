/**
 * Le SQL et son jumeau tranchent-ils le même périmètre ?
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ C'EST LA FAUTE QUE CE LOT RISQUE LE PLUS.                               │
 * │                                                                          │
 * │ Chaque liste de ce terminal a DEUX traductions du même périmètre : une   │
 * │ en SQL (`conditionsX`) pour les lignes descendues du serveur, une en     │
 * │ JavaScript (`retientXEnFile`) pour celles encore dans le journal. Elles  │
 * │ vivent parfois à cent soixante-dix lignes l'une de l'autre.              │
 * │                                                                          │
 * │ Ajouter une condition d'un côté et l'oublier de l'autre ne lève RIEN :   │
 * │ l'écran affiche simplement des lignes que le filtre aurait dû écarter,   │
 * │ ou en cache qu'il aurait dû garder. Le marchand ne peut pas s'en         │
 * │ apercevoir - les deux populations se ressemblent.                        │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ Ce test lit le TEXTE de `data/caisse.ts`. C'est un pis-aller assumé :
 * `conditionsCaisse` et `retientEnFile` sont privées, et les exporter pour un
 * test rendrait publique une frontière qui ne doit pas l'être. Le jour où ces
 * prédicats montent dans un module pur, ce test doit devenir un vrai test de
 * comportement.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const RACINE = join(__dirname, "..", "..");

function corpsDe(fichier: string, nomDeFonction: string): string {
  const source = readFileSync(join(RACINE, fichier), "utf8");
  const debut = source.indexOf(`function ${nomDeFonction}(`);
  if (debut === -1) {
    throw new Error(
      `« ${nomDeFonction} » est introuvable dans ${fichier}. ` +
        "Renommée ? Ce test doit suivre, sinon il ne balaie plus rien."
    );
  }
  // Jusqu'à la prochaine déclaration de premier niveau.
  const suite = source.slice(debut + 1);
  const fin = suite.search(/\n(export )?(async )?function /);
  return fin === -1 ? suite : suite.slice(0, fin);
}

/** Les couples à tenir en phase, et les clés qui doivent figurer des deux côtés. */
const COUPLES: {
  fichier: string;
  sql: string;
  jumeau: string;
  cles: string[];
}[] = [
  {
    fichier: "src/data/caisse.ts",
    sql: "conditionsCaisse",
    jumeau: "retientEnFile",
    cles: ["f.entrepot", "f.utilisateur"],
  },
  {
    fichier: "src/data/caisse.ts",
    sql: "conditionsDepense",
    jumeau: "retientDepenseEnFile",
    cles: ["f.entrepot", "f.utilisateur"],
  },
  {
    fichier: "src/data/ventes.ts",
    sql: "conditionsHistorique",
    jumeau: "retientVenteHistoriqueEnFile",
    cles: ["f.entrepot", "f.utilisateur"],
  },
];

describe("le SQL et son jumeau portent le même périmètre", () => {
  it("le balayage balaie bien trois couples", () => {
    // Un balayage qui ne balaie rien passe au vert et ne prouve rien : ce
    // dépôt s'est fait prendre quatre fois.
    expect(COUPLES).toHaveLength(3);
  });

  it.each(COUPLES)(
    "$sql et $jumeau tranchent les mêmes clés",
    ({ fichier, sql, jumeau, cles }) => {
      const corpsSql = corpsDe(fichier, sql);
      const corpsJumeau = corpsDe(fichier, jumeau);
      for (const cle of cles) {
        expect(corpsSql).toContain(cle);
        // Le jumeau doit la porter AUSSI. S'il ne la porte pas, une ligne
        // encore en file échappe au filtre que la liste applique.
        expect(corpsJumeau).toContain(cle);
      }
    }
  );

  it.each(COUPLES)(
    "$jumeau COMPARE la clé, il ne la rejette pas en bloc",
    ({ fichier, jumeau, cles }) => {
      // ┌──────────────────────────────────────────────────────────────────┐
      // │ MENTIONNER UNE CLÉ N'EST PAS LA TRANCHER.                        │
      // │                                                                  │
      // │ Le contrôle ci-dessus était au vert sur les DEUX traitements      │
      // │ opposés du même mot-clé : `retientEnFile` écartait toute ligne    │
      // │ en file dès qu'un entrepôt était filtré (`if (f.entrepot) return  │
      // │ false;`) pendant que `retientDepenseEnFile` comparait vraiment.   │
      // │ Le premier faisait disparaître du Livre de caisse les mouvements  │
      // │ que le marchand venait d'y saisir, et le test ne disait rien.     │
      // │                                                                  │
      // │ Un rejet en bloc sur la seule PRÉSENCE d'un filtre est donc       │
      // │ interdit : le jumeau doit comparer la ligne, ou dire pourquoi     │
      // │ elle est admise (`entrepotInconnuAdmis`).                         │
      // └──────────────────────────────────────────────────────────────────┘
      const corps = corpsDe(fichier, jumeau);
      for (const cle of cles) {
        const rejetEnBloc = new RegExp(
          `if\\s*\\(\\s*${cle.replace(".", "\\.")}\\s*\\)\\s*return\\s+false`
        );
        expect(corps).not.toMatch(rejetEnBloc);
      }
    }
  );

  it("le contrôle MORD sur un rejet en bloc", () => {
    // La preuve que l'expression ci-dessus reconnaît bien la forme fautive :
    // sans elle, le durcissement serait un décor.
    const fautif = "  if (f.entrepot) return false;\n  return true;";
    expect(fautif).toMatch(/if\s*\(\s*f\.entrepot\s*\)\s*return\s+false/);
  });

  it("le contrôle MORD quand une clé manque d'un côté", () => {
    const corpsSql = corpsDe("src/data/caisse.ts", "conditionsCaisse");
    // Une clé qui n'existe nulle part doit faire échouer l'assertion : c'est
    // la preuve que `toContain` regarde bien le corps et non une chaîne vide.
    expect(() => expect(corpsSql).toContain("f.cleQuiNExistePas")).toThrow();
  });
});
