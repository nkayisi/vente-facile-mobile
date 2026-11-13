/**
 * Une migration locale doit pouvoir s'appliquer sur un terminal EN SERVICE.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ SQLITE REFUSE `ADD <colonne> NOT NULL` SANS VALEUR PAR DÉFAUT DÈS QUE    │
 * │ LA TABLE PORTE UNE LIGNE.                                                │
 * │                                                                          │
 * │ Et c'est exactement ce que `drizzle-kit generate` écrit pour un champ    │
 * │ NOT NULL sans défaut. Sur l'émulateur de développement - base vide ou    │
 * │ recréée - rien ne se voit ; sur le terminal d'un marchand, la migration  │
 * │ échoue AU DÉMARRAGE, juste après l'installation de la mise à jour. Le    │
 * │ piège a été payé par `0013_cagnotte_en_argent`, puis rattrapé de justesse│
 * │ sur `0015_unite_suppression_douce` : deux fois, c'est une règle.         │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Les commentaires SQL sont retirés avant le balayage : `0013` EXPLIQUE ce
 * piège en citant la forme fautive, et un garde-fou qui crie sur de la prose
 * finit désactivé.
 */
import { readdirSync, readFileSync } from "fs";
import { join } from "path";

const DOSSIER = join(__dirname, "..", "..", "drizzle");

function instructions(fichier: string): string[] {
  const sql = readFileSync(join(DOSSIER, fichier), "utf8")
    .split("\n")
    .map((ligne) => ligne.replace(/--.*$/, ""))
    .join("\n");
  return sql
    .split(/;|-->\s*statement-breakpoint/)
    .map((i) => i.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/** `ALTER TABLE … ADD … NOT NULL` sans `DEFAULT` : inapplicable sur une table habitée. */
function ajoutsInapplicables(instr: string[]): string[] {
  return instr.filter(
    (i) => /^ALTER TABLE .+ ADD /i.test(i) && /NOT NULL/i.test(i) && !/DEFAULT/i.test(i)
  );
}

describe("les migrations locales", () => {
  const fichiers = readdirSync(DOSSIER).filter((f) => f.endsWith(".sql"));

  it("sont bien balayées", () => {
    // Un balayage qui ne balaie rien passe au vert et ne prouve rien.
    expect(fichiers.length).toBeGreaterThanOrEqual(15);
  });

  it("n'ajoutent aucune colonne NOT NULL sans valeur par défaut", () => {
    const fautes = fichiers.flatMap((f) =>
      ajoutsInapplicables(instructions(f)).map((i) => `${f} : ${i}`)
    );
    expect(fautes).toEqual([]);
  });

  it("mord sur la forme qu'engendre drizzle-kit", () => {
    expect(
      ajoutsInapplicables(["ALTER TABLE `units` ADD `is_deleted` integer NOT NULL"])
    ).toHaveLength(1);
    expect(
      ajoutsInapplicables(["ALTER TABLE `units` ADD `is_deleted` integer DEFAULT false NOT NULL"])
    ).toHaveLength(0);
  });
});
