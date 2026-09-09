/**
 * Ce que la liste des débiteurs montre, dans quel ordre, et sous quelles
 * sections. Module PUR : aucune base, aucun réseau, aucun rendu.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ TRIER PAR MONTANT À TRAVERS DEUX DEVISES EST UNE COMPARAISON FAUSSE.     │
 * │                                                                          │
 * │ « Jamais de somme inter-devises » a un corollaire qu'on oublie parce     │
 * │ qu'aucun chiffre faux n'apparaît à l'écran : un ORDRE inter-devises est  │
 * │ tout aussi faux. Le serveur range ses débiteurs par `amount_due`         │
 * │ décroissant, toutes devises confondues, si bien qu'un client devant      │
 * │ 50 000 FC (environ dix-huit dollars) se place au-dessus d'un client      │
 * │ devant 3 000 $. Le marchand relance dans l'ordre de la liste - c'est     │
 * │ tout l'usage de cet écran - et il commence donc par le mauvais.          │
 * │                                                                          │
 * │ On ne réordonne pas : on SÉPARE. Une section par devise, l'ordre à       │
 * │ l'intérieur, et le sous-total en tête de section. Deux montants          │
 * │ comparés le sont alors toujours dans la même monnaie, et la question     │
 * │ « qui dois-je appeler en premier » se pose une fois par devise, ce       │
 * │ qu'elle est réellement.                                                  │
 * │                                                                          │
 * │ Une seule devise : aucune section. Un en-tête qui ne sépare rien est du  │
 * │ bruit, et il se lirait comme le début d'une seconde liste.               │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import type { Debiteur } from "@/data/rapports";

export type TriCreances = "montant" | "retard";

export interface FiltreCreances {
  recherche: string;
  /** La puce « En retard » : ne garder que ceux dont une part est échue. */
  seulementEchus: boolean;
  /** La puce de devise, quand l'établissement en a plusieurs. `null` : toutes. */
  devise: string | null;
}

export type ElementCreance =
  | { type: "section"; cle: string; devise: string; nb: number; total: number }
  | { type: "debiteur"; cle: string; debiteur: Debiteur };

export interface VueDebiteurs {
  /** Les sections et les rangées, dans l'ordre d'affichage. */
  elements: ElementCreance[];
  /** Les débiteurs retenus, à plat : c'est ce que l'export doit porter. */
  lignes: Debiteur[];
  /**
   * Les décomptes des puces, calculés AVANT elles.
   *
   * Une puce dont le décompte tomberait à zéro dès qu'une autre est active se
   * lirait « il n'y en a pas », et non « vous ne les regardez pas ». C'est la
   * règle déjà posée sur les puces de statut de l'historique. La RECHERCHE,
   * elle, entre bien dans le décompte : elle réduit le périmètre lui-même.
   */
  nbTous: number;
  nbEchus: number;
  /** Les devises présentes, dans l'ordre alphabétique du serveur. */
  devises: string[];
  /**
   * La devise RÉELLEMENT appliquée.
   *
   * ┌────────────────────────────────────────────────────────────────────────┐
   * │ UNE PUCE DE DEVISE QUI DISPARAÎT NE DOIT PAS EMPORTER LA LISTE.        │
   * │                                                                        │
   * │ Le marchand filtre sur les francs, puis cherche un nom qui ne doit     │
   * │ qu'en dollars : la puce « CDF » n'a plus de raison d'être affichée, et │
   * │ le filtre qu'elle portait vide la liste. L'écran présenterait alors un │
   * │ état vide sans rien pour dire par quoi il l'est, et sans le bouton qui │
   * │ le déverrouille - la puce ayant disparu avec le reste.                 │
   * │                                                                        │
   * │ La règle vit ici et non dans un effet d'écran : un `setState` dans un  │
   * │ effet est un rendu de plus et un ordre à défendre, alors que la        │
   * │ question posée - « ce filtre désigne-t-il encore quelque chose » -     │
   * │ n'est qu'une dérivation, et elle se teste.                             │
   * └────────────────────────────────────────────────────────────────────────┘
   */
  deviseActive: string | null;
}

/** « nelly » trouve « Nelly Kayisi ». Le numéro compte aussi : on relance dessus. */
function correspond(d: Debiteur, terme: string): boolean {
  if (!terme) return true;
  const t = terme.toLowerCase();
  return (
    d.nom.toLowerCase().includes(t) ||
    (d.telephone ?? "").toLowerCase().includes(t)
  );
}

/**
 * Le comparateur, dans une devise DONNÉE.
 *
 * `montant` range du plus gros au plus petit : c'est l'exposition, ce qu'on
 * risque de perdre. `retard` range du plus ancien au plus récent : c'est
 * l'urgence, et une petite dette de cent jours se relance avant une grosse
 * qui n'est pas encore échue. Les deux questions sont légitimes et n'ont pas
 * la même réponse, d'où deux ordres et non un seul.
 *
 * Les départages ne sont pas du zèle : sans eux, deux débiteurs à égalité
 * changeraient de place d'un rendu à l'autre, et une liste qui bouge sous le
 * doigt fait perdre celui qu'on venait d'y repérer.
 */
function comparer(tri: TriCreances) {
  return (a: Debiteur, b: Debiteur): number => {
    if (tri === "retard") {
      if (b.plusAncienneJours !== a.plusAncienneJours) {
        return b.plusAncienneJours - a.plusAncienneJours;
      }
      if (b.echu !== a.echu) return b.echu - a.echu;
    }
    if (b.montant !== a.montant) return b.montant - a.montant;
    return a.nom.localeCompare(b.nom, "fr");
  };
}

export function vueDebiteurs(
  debiteurs: Debiteur[],
  filtre: FiltreCreances,
  tri: TriCreances
): VueDebiteurs {
  const terme = filtre.recherche.trim().toLowerCase();
  const base = debiteurs.filter((d) => correspond(d, terme));

  const nbTous = base.length;
  const nbEchus = base.filter((d) => d.echu > 0).length;
  const devises = [...new Set(base.map((d) => d.devise))].sort((a, b) =>
    a.localeCompare(b)
  );

  const deviseActive =
    filtre.devise && devises.includes(filtre.devise) ? filtre.devise : null;

  const retenus = base.filter(
    (d) =>
      (!filtre.seulementEchus || d.echu > 0) &&
      (deviseActive === null || d.devise === deviseActive)
  );

  const parDevise = new Map<string, Debiteur[]>();
  for (const d of retenus) {
    const liste = parDevise.get(d.devise);
    if (liste) liste.push(d);
    else parDevise.set(d.devise, [d]);
  }

  const ordreDevises = [...parDevise.keys()].sort((a, b) => a.localeCompare(b));
  const sectionne = ordreDevises.length > 1;

  const elements: ElementCreance[] = [];
  const lignes: Debiteur[] = [];

  for (const devise of ordreDevises) {
    const groupe = (parDevise.get(devise) ?? []).slice().sort(comparer(tri));
    if (sectionne) {
      elements.push({
        type: "section",
        cle: `section-${devise}`,
        devise,
        nb: groupe.length,
        // Une somme, oui - mais DANS une devise, et sur les seules lignes
        // affichées. C'est le même sous-total qu'un en-tête de journée porte
        // dans l'historique, et il vaut le total du serveur tant qu'aucun
        // filtre n'a mordu.
        total: groupe.reduce((s, d) => s + d.montant, 0),
      });
    }
    for (const d of groupe) {
      elements.push({ type: "debiteur", cle: `${d.clientId}-${d.devise}`, debiteur: d });
      lignes.push(d);
    }
  }

  return { elements, lignes, nbTous, nbEchus, devises, deviseActive };
}

/**
 * Le ton d'un retard, du plus tiède au plus grave.
 *
 * Les seuils sont ceux des tranches du serveur, et ce n'est pas un choix
 * esthétique : une pastille qui passerait au rouge à soixante jours quand la
 * balance âgée bascule à quatre-vingt-onze ferait dire deux choses
 * différentes au même écran, sur la même créance.
 */
export function tonDuRetard(jours: number): "neutral" | "warning" | "destructive" {
  if (jours <= 0) return "neutral";
  if (jours <= 60) return "warning";
  return "destructive";
}

/** « 9 j », « 3 mois ». Au-delà de deux mois, le compte en jours ne dit plus rien. */
export function libelleRetard(jours: number): string {
  if (jours <= 0) return "";
  if (jours < 61) return `${jours} j`;
  const mois = Math.floor(jours / 30);
  return `${mois} mois`;
}
