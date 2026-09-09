/**
 * L'historique est une CHRONOLOGIE, pas une liste de références.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA DATE ÉTAIT RÉPÉTÉE SUR CHAQUE LIGNE, ET NE DISAIT RIEN.              │
 * │                                                                          │
 * │ Cent lignes portant chacune « 31 août, 14:07 » à côté du nom du client   │
 * │ mangeaient la ligne secondaire pour une information que la ligne du      │
 * │ dessus donnait déjà. Ce qu'un marchand cherche dans un historique n'est  │
 * │ pas l'horodatage de chaque vente : c'est ce qu'une JOURNÉE a pesé, et    │
 * │ où elle commence dans la liste.                                          │
 * │                                                                          │
 * │ Le jour devient donc un en-tête qui porte son sous-total, et la ligne    │
 * │ ne garde que l'heure - ce qui libère la place du client, et de l'état    │
 * │ d'envoi quand il y en a un à dire.                                       │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Module PUR, sans base ni composant : le découpage d'une liste par journée
 * locale se prouve sans appareil, et une borne de jour fausse ne lève rien -
 * elle range simplement une vente sous la mauvaise date.
 */
import { jourEnLettresFr } from "@/data/dates";
import type { VenteResume } from "@/data/ventes";

export interface GroupeJour {
  /** « 2026-08-31 », ou « inconnu ». Sert de clé de liste, jamais d'affichage. */
  cle: string;
  /** « Aujourd'hui », « Hier », « Lundi 31 août ». */
  label: string;
  nb: number;
  /** Sous-total du jour, ventilé : jamais une somme inter-devises. */
  totalParDevise: { devise: string; montant: number }[];
  /** Ventes du jour dont le montant est inconnu : le sous-total n'est pas complet. */
  sansMontant: number;
}

/**
 * La liste APLATIE que la liste virtualisée consomme.
 *
 * `FlashList` ne connaît pas les sections : on lui donne une suite d'éléments
 * et un `getItemType` pour qu'elle recycle les en-têtes entre eux et les
 * rangées entre elles. Construire deux listes imbriquées casserait la
 * virtualisation, et c'est le piège que `DataList` interdit déjà par ailleurs.
 */
export type ElementHistorique =
  | { type: "jour"; cle: string; groupe: GroupeJour }
  | { type: "vente"; cle: string; vente: VenteResume };

/** Clé de journée LOCALE. Une clé en UTC rangerait une vente de 23h30 la veille. */
function cleDuJour(d: Date): string {
  const deux = (n: number) => (n < 10 ? `0${n}` : String(n));
  return `${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}`;
}

/**
 * « Aujourd'hui » et « Hier » plutôt qu'une date.
 *
 * Ce sont les deux journées qu'on consulte le plus, et les seules dont le
 * quantième oblige à un calcul mental pour savoir si c'est bien celle qu'on
 * cherche. Au-delà, le jour de la semaine en tête est ce qui situe le mieux
 * une vente dont on se souvient (« c'était un samedi »).
 */
function labelDuJour(d: Date, maintenant: Date): string {
  const aujourdhui = cleDuJour(maintenant);
  const veille = new Date(
    maintenant.getFullYear(),
    maintenant.getMonth(),
    maintenant.getDate() - 1
  );
  const cle = cleDuJour(d);
  if (cle === aujourdhui) return "Aujourd'hui";
  if (cle === cleDuJour(veille)) return "Hier";
  return jourEnLettresFr(d);
}

/**
 * Découpe une liste DÉJÀ TRIÉE par date décroissante en journées.
 *
 * Elle ne trie pas : le tri appartient à la lecture, qui seule sait fusionner
 * la table et le journal. Retrier ici masquerait un défaut d'ordre en amont au
 * lieu de le laisser voir.
 */
export function grouperParJour(
  ventes: VenteResume[],
  maintenant = new Date()
): ElementHistorique[] {
  const sortie: ElementHistorique[] = [];
  let courant: GroupeJour | null = null;
  const totaux = new Map<string, number>();

  const fermer = () => {
    if (!courant) return;
    courant.totalParDevise = [...totaux.entries()]
      .map(([devise, montant]) => ({ devise, montant }))
      .sort((a, b) => a.devise.localeCompare(b.devise));
    totaux.clear();
  };

  for (const v of ventes) {
    // Une vente sans date ne se range pas sous « Aujourd'hui » : elle irait
    // grossir un sous-total auquel elle n'appartient pas, et le marchand
    // n'aurait aucun moyen de savoir laquelle. Elle a son propre groupe.
    const cle = v.date ? cleDuJour(v.date) : "inconnu";
    if (!courant || courant.cle !== cle) {
      fermer();
      courant = {
        cle,
        label: v.date ? labelDuJour(v.date, maintenant) : "Date inconnue",
        nb: 0,
        totalParDevise: [],
        sansMontant: 0,
      };
      sortie.push({ type: "jour", cle: `jour:${cle}`, groupe: courant });
    }
    courant.nb += 1;
    // Une devise vide donnerait un montant sans symbole ; un montant inconnu
    // vaut zéro faute de mieux. Ni l'un ni l'autre n'entre dans le sous-total,
    // et le second se COMPTE pour que l'en-tête puisse dire qu'il est partiel.
    if (v.montantConnu === false) courant.sansMontant += 1;
    else if (v.devise !== "") totaux.set(v.devise, (totaux.get(v.devise) ?? 0) + v.total);
    sortie.push({ type: "vente", cle: v.id, vente: v });
  }
  fermer();
  return sortie;
}
