/**
 * PARITÉ DE MENU : le test le plus important du lot.
 *
 * Il lit `frontend/components/layout/sidebar.tsx` - le vrai fichier du
 * back-office, pas une copie - en extrait les onze entrées, et les compare à
 * `MENU`. C'est lui qui fait que le web et le mobile ne peuvent plus dériver en
 * silence : ajouter une section au web sans l'ajouter ici casse la suite.
 *
 * Il compare l'ORDRE, les LIBELLÉS, les GLYPHES et les PERMISSIONS. Pas les
 * chemins : le mobile écrit `/ventes` là où le web écrit `/dashboard/sales`, et
 * c'est assumé (une URL est invisible sur un téléphone).
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { MENU } from "./menu";

const SIDEBAR = resolve(__dirname, "../../../../frontend/components/layout/sidebar.tsx");

interface EntreeWeb {
  label: string;
  icon: string;
  permission: string | null;
}

/** Extrait les objets du tableau `menuItems` de la barre latérale. */
function lireSidebar(source: string): EntreeWeb[] {
  const debut = source.indexOf("const menuItems = [");
  if (debut === -1) throw new Error("`menuItems` introuvable dans sidebar.tsx");
  const fin = source.indexOf("\n];", debut);
  const bloc = source.slice(debut, fin);

  const entrees: EntreeWeb[] = [];
  const blocs = bloc.split(/\n\s*\{/).slice(1);
  for (const b of blocs) {
    const label = b.match(/label:\s*"([^"]+)"/)?.[1];
    const icon = b.match(/icon:\s*([A-Za-z0-9]+)/)?.[1];
    const perm = b.match(/permission:\s*(null|"([^"]+)")/);
    if (!label || !icon || !perm) continue;
    entrees.push({ label, icon, permission: perm[1] === "null" ? null : perm[2] });
  }
  return entrees;
}

describe("parité du menu avec le back-office", () => {
  if (!existsSync(SIDEBAR)) {
    // Échec franc, et non un test sauté : une parité qu'on ne vérifie plus est
    // une parité qui dérive. Le dépôt web est le voisin de celui-ci.
    it("trouve la barre latérale du back-office", () => {
      throw new Error(
        `Introuvable : ${SIDEBAR}\n` +
          "Ce test compare le menu mobile au vrai fichier du back-office. " +
          "Sans lui, rien ne garantit que les deux surfaces montrent le même menu."
      );
    });
    return;
  }

  const web = lireSidebar(readFileSync(SIDEBAR, "utf8"));

  it("porte les mêmes entrées, dans le même ordre", () => {
    expect(MENU.map((e) => e.label)).toEqual(web.map((e) => e.label));
  });

  it("porte exactement onze entrées", () => {
    expect(web).toHaveLength(11);
    expect(MENU).toHaveLength(11);
  });

  it("emploie les mêmes glyphes lucide", () => {
    expect(MENU.map((e) => e.icon)).toEqual(web.map((e) => e.icon));
  });

  it("garde les mêmes permissions", () => {
    expect(MENU.map((e) => e.permission)).toEqual(web.map((e) => e.permission));
  });
});
