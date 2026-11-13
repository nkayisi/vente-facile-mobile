/**
 * Les ventes à CRÉDIT qui attendent leur envoi, pour l'écran des créances. PUR.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ L'ÉCRAN DES CRÉANCES TAISAIT CE QUE LE COMPTOIR VENAIT DE FAIRE.        │
 * │                                                                          │
 * │ La balance âgée vient du SERVEUR, et c'est délibéré (ses définitions -   │
 * │ échéance, ancienneté, conversion - ne se recalculent pas ici). Mais une  │
 * │ vente à crédit encaissée hors ligne n'y est pas encore : le marchand     │
 * │ venait de faire crédit, ouvrait « Qui doit », et ne voyait ni la         │
 * │ facture ni le montant. Il conclut que la vente est perdue - ou il la     │
 * │ refait.                                                                  │
 * │                                                                          │
 * │ On ne mêle PAS ces montants à la balance : ils n'ont ni échéance         │
 * │ arrêtée ni ancienneté, et le serveur peut encore les refuser. On les     │
 * │ DIT à part, par devise, jamais sommés entre devises.                     │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import type { EtatEnvoi } from "@/sync/outbox";

/** Une vente à crédit du journal (`sale_type === "credit"`). */
export interface CreditEnFile {
  reference: string;
  client: string | null;
  /** `null` : le ticket rangé est introuvable, le montant est INCONNU. */
  resteAPayer: number | null;
  devise: string | null;
  envoi: EtatEnvoi;
}

export interface MontantDevise {
  devise: string;
  montant: number;
}

export interface CreditsEnFile {
  nombre: number;
  /** Par devise, jamais sommé entre devises ; trié du plus gros au plus petit. */
  parDevise: MontantDevise[];
  /** Dont combien attendent une DÉCISION (abonnement, droit), pas le réseau. */
  bloquees: number;
  /** Ventes dont le ticket rangé est introuvable : montant INCONNU, compté à part. */
  sansMontant: number;
}

/**
 * Le résumé des crédits en file.
 *
 * ⚠ Une vente sans devise (ticket introuvable) est COMPTÉE sans être
 *   additionnée : `null` ne se lit jamais comme zéro.
 */
export function resumerCreditsEnFile(ventes: CreditEnFile[]): CreditsEnFile {
  const parDevise = new Map<string, number>();
  let nombre = 0;
  let bloquees = 0;
  let sansMontant = 0;
  for (const v of ventes) {
    const connu = v.devise != null && v.resteAPayer != null && Number.isFinite(v.resteAPayer);
    // Un crédit soldé par son acompte ne doit plus rien : ce n'est plus une créance.
    if (connu && !((v.resteAPayer as number) > 0.005)) continue;
    nombre += 1;
    if (v.envoi === "bloque") bloquees += 1;
    if (!connu) {
      sansMontant += 1;
      continue;
    }
    const devise = v.devise as string;
    parDevise.set(devise, (parDevise.get(devise) ?? 0) + (v.resteAPayer as number));
  }
  return {
    nombre,
    parDevise: [...parDevise.entries()]
      .map(([devise, montant]) => ({ devise, montant }))
      .sort((a, b) => b.montant - a.montant || a.devise.localeCompare(b.devise)),
    bloquees,
    sansMontant,
  };
}

/**
 * L'état d'envoi à annoncer : le PIRE l'emporte, comme partout ailleurs.
 *
 * `undefined` quand rien n'attend : `BandeauEnvoi` ne rend alors rien.
 */
export function envoiDesCredits(r: CreditsEnFile): EtatEnvoi | undefined {
  if (r.nombre === 0) return undefined;
  return r.bloquees > 0 ? "bloque" : "en_attente";
}

/** Le titre du bandeau, accordé. */
export function titreCreditsEnFile(r: CreditsEnFile): string {
  return r.nombre > 1
    ? `${r.nombre} ventes à crédit attendent leur envoi`
    : "1 vente à crédit attend son envoi";
}

/**
 * Ce que ces ventes ajouteront à la balance, par devise.
 *
 * ⚠ `formater` vient de l'écran (`money.money`) : la table des devises n'est
 *   connue que de lui, et ce module reste pur.
 */
export function consequenceCreditsEnFile(
  r: CreditsEnFile,
  formater: (montant: number, devise: string) => string
): string {
  const plusieurs = r.nombre > 1;
  const montants = r.parDevise.map((m) => formater(m.montant, m.devise)).join(" · ");
  const inconnus =
    r.sansMontant > 0
      ? `${montants ? " " : ""}(+${r.sansMontant} sans montant)`
      : "";
  const ce = `${montants}${inconnus}`;
  return (
    `${plusieurs ? "Elles ne sont" : "Elle n'est"} pas encore dans la balance ci-dessous` +
    (ce ? ` : ${ce}.` : ".") +
    ` ${plusieurs ? "Elles y entreront" : "Elle y entrera"} une fois envoyée${plusieurs ? "s" : ""}.`
  );
}
