/**
 * Le tiroir se referme, quoi qu'on touche.
 *
 * Ce que ces tests protègent n'est pas une animation : c'est qu'aucun appui du
 * menu ne laisse le marchand devant un panneau qui couvre sa page ET sa barre
 * d'onglets, sans savoir si son geste a porté.
 */
import fs from "fs";
import path from "path";

import { fermerPuis, retourFermeLeTiroir } from "./fermeture";

describe("fermerPuis", () => {
  it("referme le tiroir, même sans action", () => {
    const fermer = jest.fn();
    fermerPuis(fermer)();
    expect(fermer).toHaveBeenCalledTimes(1);
  });

  it("referme AVANT d'agir", () => {
    const ordre: string[] = [];
    fermerPuis(
      () => ordre.push("fermer"),
      () => ordre.push("agir")
    )();
    expect(ordre).toEqual(["fermer", "agir"]);
  });

  it("referme même quand l'action lève", () => {
    // Un chemin de navigation invalide, une session déjà expirée : le tiroir
    // doit être parti avant que l'exception ne remonte, sinon le marchand
    // reste devant un menu figé par-dessus une application qui a bougé.
    const fermer = jest.fn();
    expect(() =>
      fermerPuis(fermer, () => {
        throw new Error("route inconnue");
      })()
    ).toThrow("route inconnue");
    expect(fermer).toHaveBeenCalledTimes(1);
  });

  it("ne ferme qu'une fois par appui", () => {
    const fermer = jest.fn();
    const gestionnaire = fermerPuis(fermer, () => undefined);
    gestionnaire();
    expect(fermer).toHaveBeenCalledTimes(1);
  });
});

describe("Retour Android", () => {
  it("referme le tiroir et consomme l'événement quand il est ouvert", () => {
    const fermer = jest.fn();
    expect(retourFermeLeTiroir(true, fermer)).toBe(true);
    expect(fermer).toHaveBeenCalledTimes(1);
  });

  it("laisse passer le retour quand le tiroir est fermé", () => {
    // Consommer en toutes circonstances neutraliserait le retour de toute
    // l'application - et sur Android, c'est aussi le geste qui permet d'en
    // sortir.
    const fermer = jest.fn();
    expect(retourFermeLeTiroir(false, fermer)).toBe(false);
    expect(fermer).not.toHaveBeenCalled();
  });
});

describe("Aucun appui du tiroir n'échappe à la fermeture", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "menu-lateral.tsx"),
    "utf8"
  );

  /** Les fabriques de gestionnaires, toutes bâties sur `fermerPuis`. */
  const AUTORISES = ["fermerPuis(", "aller(", "refuser("];

  it("le balayage MORD : il trouve bien les appuis du menu", () => {
    // Un balayage qui ne balaie rien passe au vert et ne prouve rien. Le dépôt
    // l'a déjà payé trois fois.
    const appuis = source.match(/onPress=\{/g) ?? [];
    expect(appuis.length).toBeGreaterThanOrEqual(5);
  });

  it("chaque onPress passe par une fabrique qui referme", () => {
    const fautifs: string[] = [];
    const lignes = source.split("\n");

    lignes.forEach((ligne, i) => {
      if (!ligne.includes("onPress={")) return;
      // La valeur du prop peut s'écrire sur la ligne suivante : on lit les deux.
      const expression = `${ligne}${lignes[i + 1] ?? ""}`;
      if (!AUTORISES.some((f) => expression.includes(f))) {
        fautifs.push(`ligne ${i + 1} : ${ligne.trim()}`);
      }
    });

    expect(fautifs).toEqual([]);
  });

  it("aucune entrée du menu n'est inerte", () => {
    // `disabled` rendait une section hors droits muette : le marchand appuyait,
    // rien ne bougeait, et rien ne distinguait un refus d'un blocage.
    expect(source).not.toContain("disabled={");
    expect(source).not.toContain("onPress={undefined}");
  });
});
