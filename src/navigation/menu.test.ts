/**
 * PARITÉ DE MENU : le test le plus important du lot.
 *
 * Il lit `frontend/components/layout/sidebar.tsx` - le vrai fichier du
 * back-office, pas une copie - en extrait ses entrées, et les compare à `MENU`.
 * C'est lui qui fait que le web et le mobile ne peuvent plus dériver en
 * silence : ajouter une section au web sans l'ajouter ici casse la suite.
 *
 * Une section délibérément absente du terminal se déclare dans
 * `SECTIONS_WEB_SEULES`, avec son motif.
 *
 * Il compare l'ORDRE, les LIBELLÉS, les GLYPHES et les PERMISSIONS. Pas les
 * chemins : le mobile écrit `/ventes` là où le web écrit `/dashboard/sales`, et
 * c'est assumé (une URL est invisible sur un téléphone).
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { MENU } from "./menu";

const SIDEBAR = resolve(__dirname, "../../../../frontend/components/layout/sidebar.tsx");
const REGLES = resolve(__dirname, "../../../../frontend/lib/navigation/regles-de-route.ts");

interface EntreeWeb {
  label: string;
  icon: string;
  /** Ce que la PAGE exige ; un tableau quand l'une de plusieurs suffit. */
  permission: string | string[] | null;
}

interface RegleWeb {
  prefix: string;
  permission: string | string[];
}

/**
 * Les règles de route du back-office : `prefix` → permission.
 *
 * ⚠ LE MENU WEB NE PORTE PLUS SA PERMISSION (2026-11-20) : il demande à cette
 * table ce que la page ouvre. Ce test lisait `permission:` dans les entrées du
 * menu, et ne trouvait plus RIEN - zéro entrée, donc aucune comparaison.
 */
function lireRegles(source: string): RegleWeb[] {
  const debut = source.indexOf("const DASHBOARD_ROUTE_RULES");
  if (debut === -1) throw new Error("`DASHBOARD_ROUTE_RULES` introuvable");
  const bloc = source.slice(debut, source.indexOf("\n];", debut));
  const regles: RegleWeb[] = [];
  for (const m of bloc.matchAll(/\{\s*prefix:\s*"([^"]+)"([^}]*)\}/g)) {
    const seule = m[2].match(/permission:\s*"([^"]+)"/)?.[1];
    const plusieurs = m[2].match(/anyPermissions:\s*\[([^\]]*)\]/)?.[1];
    const liste = plusieurs ? [...plusieurs.matchAll(/"([^"]+)"/g)].map((x) => x[1]) : null;
    if (seule) regles.push({ prefix: m[1], permission: seule });
    else if (liste) regles.push({ prefix: m[1], permission: liste });
  }
  return regles;
}

/** La règle du plus long préfixe, comme `regleDeRoute` du back-office. */
function permissionDeLaPage(href: string, regles: RegleWeb[]): string | string[] | null {
  const r = [...regles]
    .sort((a, b) => b.prefix.length - a.prefix.length)
    .find((x) => href.startsWith(x.prefix));
  return r ? r.permission : null;
}

/** Extrait les objets du tableau `menuItems` de la barre latérale. */
function lireSidebar(source: string, regles: RegleWeb[]): EntreeWeb[] {
  const debut = source.indexOf("const menuItems = [");
  if (debut === -1) throw new Error("`menuItems` introuvable dans sidebar.tsx");
  const fin = source.indexOf("\n];", debut);
  const bloc = source.slice(debut, fin);

  const entrees: EntreeWeb[] = [];
  const blocs = bloc.split(/\n\s*\{/).slice(1);
  for (const b of blocs) {
    const label = b.match(/label:\s*"([^"]+)"/)?.[1];
    const icon = b.match(/icon:\s*([A-Za-z0-9]+)/)?.[1];
    const href = b.match(/href:\s*"([^"]+)"/)?.[1];
    if (!label || !icon || !href) continue;
    entrees.push({ label, icon, permission: permissionDeLaPage(href, regles) });
  }
  return entrees;
}

/**
 * Les sections que le back-office porte et que le terminal NE PORTE PAS,
 * chacune avec son motif.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UNE EXEMPTION SE NOMME, SINON ELLE NE SE DISTINGUE PLUS D'UN OUBLI.      │
 * │                                                                          │
 * │ Ce test a attrapé « Achats » le jour où le lot 13 l'a ajouté au web, et  │
 * │ c'est exactement ce qu'on lui demande. Relever simplement le compte à    │
 * │ douze l'aurait rendu muet sur la section SUIVANTE - celle dont l'absence │
 * │ sur le terminal serait, elle, un vrai oubli.                             │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const SECTIONS_WEB_SEULES: Record<string, string> = {
  Achats:
    "Lot 13, décision du 25 octobre 2026 : les achats restent au back-office. " +
    "Les quatre tables (commandes, réceptions, règlements, retours) ne sont pas " +
    "au manifeste de tirage et aucun acte de journal ne les porte, donc un " +
    "bouton posé ici partirait en quarantaine - et un bouton qui part en " +
    "quarantaine est pire que pas de bouton.",
};

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

  const webBrut = lireSidebar(
    readFileSync(SIDEBAR, "utf8"),
    lireRegles(readFileSync(REGLES, "utf8"))
  );
  const web = webBrut.filter((e) => !(e.label in SECTIONS_WEB_SEULES));

  it("porte les mêmes entrées, dans le même ordre", () => {
    expect(MENU.map((e) => e.label)).toEqual(web.map((e) => e.label));
  });

  it("porte exactement onze entrées, une fois les sections web-seules retirées", () => {
    expect(web).toHaveLength(11);
    expect(MENU).toHaveLength(11);
  });

  it("n'exempte que des sections qui existent VRAIMENT, et seulement au web", () => {
    const etiquettes = Object.keys(SECTIONS_WEB_SEULES);
    // Un balayage qui ne balaie rien passe au vert sans rien démontrer.
    expect(etiquettes.length).toBeGreaterThan(0);

    for (const etiquette of etiquettes) {
      // ⚠ Une exemption qui ne désigne plus rien au web a été OUBLIÉE : la
      // section a été renommée ou retirée, et la ligne masquera désormais une
      // divergence réelle.
      expect(webBrut.map((e) => e.label)).toContain(etiquette);

      // ⚠ Et elle ne doit pas être AUSSI sur le terminal : ce serait une
      // exemption qui écarte de la comparaison une entrée bel et bien présente
      // des deux côtés, donc qui cesse de comparer ce qu'elle prétend comparer.
      expect(MENU.map((e) => e.label)).not.toContain(etiquette);
    }
  });

  it("emploie les mêmes glyphes lucide", () => {
    expect(MENU.map((e) => e.icon)).toEqual(web.map((e) => e.icon));
  });

  it("garde les mêmes permissions", () => {
    // Une page ouverte par « l'une de plusieurs » permissions (les contacts)
    // est à parité si le terminal en garde l'une.
    const ecarts = MENU.map((e, i) => {
      const w = web[i]?.permission ?? null;
      const ok = Array.isArray(w) ? e.permission !== null && w.includes(e.permission) : e.permission === w;
      return ok ? null : `${e.label} : terminal ${e.permission ?? "aucune"}, back-office ${JSON.stringify(w)}`;
    }).filter(Boolean);
    expect(ecarts).toEqual([]);
  });
});
