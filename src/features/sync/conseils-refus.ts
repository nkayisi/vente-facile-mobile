/**
 * Ce qu'il faut FAIRE d'une opération refusée, selon le code du refus.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE MOTIF DIT POURQUOI, LE CONSEIL DIT QUOI FAIRE.                       │
 * │                                                                          │
 * │ Le serveur rend une phrase (« Consultation seule : l'entrepôt Nord ne    │
 * │ vous est pas assigné ») et un code. La phrase explique ; elle ne dit pas │
 * │ au caissier qu'il doit ressaisir l'opération ailleurs, ni que réessayer  │
 * │ ne servira à rien. Sans conseil, l'écran « Opérations à corriger » ne    │
 * │ laissait que « Abandonner », et le marchand ne savait pas s'il perdait   │
 * │ une vente ou s'en débarrassait d'un doublon.                             │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ AUCUN CONSEIL NE PROPOSE « Synchronisez » NI « Réessayez ». Une opération
 * refusée ne repart jamais d'elle-même (verdict `rejected`) ; l'inviter à
 * synchroniser enverrait le marchand chercher du réseau pour une règle de
 * droit. Ce qui se refait se RESSAISIT.
 *
 * Module PUR, sans import : il s'éprouve seul.
 */

const CONSEILS: Record<string, string> = {
  consultation_seule:
    "Vous pouvez consulter cet entrepôt, pas y agir. Refaites l'opération depuis un entrepôt qui vous est affecté, ou demandez l'affectation au propriétaire.",
  entrepot_inactif:
    "Cet entrepôt a été désactivé : on n'y opère plus, sauf pour rejeter un ajustement ou annuler un inventaire. Refaites l'opération dans un entrepôt actif.",
  session_d_un_autre:
    "On ne vend que dans sa propre session de caisse. Ouvrez la vôtre, puis refaites la vente.",
  session_personnelle_ouverte:
    "Vous tenez déjà une session sur une autre caisse : clôturez-la avant d'en ouvrir une nouvelle.",
  stock_insuffisant:
    "Le stock ne couvrait pas cette opération quand le serveur l'a reçue. Vérifiez le disponible, enregistrez l'entrée de stock manquante, puis refaites-la.",
  not_own_sale:
    "Seul le vendeur de cette vente, ou un gérant, peut y ajouter un règlement. Demandez-lui de l'encaisser.",
  not_found:
    "L'élément visé n'existe plus, ou n'est plus dans votre périmètre. S'il s'agit d'un doublon, abandonnez cette opération.",
  reserve_au_proprietaire:
    "Seul le propriétaire peut faire cette modification. Demandez-la-lui, puis abandonnez cette opération.",
};

/**
 * Les refus d'ADMINISTRATION d'un entrepôt : ils ne naissent qu'au
 * back-office, ce terminal n'administrant pas les entrepôts. Un seul conseil
 * suffit, et il renvoie là où la décision se prend.
 */
const ADMINISTRATION_ENTREPOT = [
  "entrepot_principal",
  "session_ouverte",
  "transfert_en_route",
  "inventaire_en_cours",
  "seul_entrepot_actif",
  "stock_restant",
] as const;

const CONSEIL_ADMINISTRATION =
  "Cet entrepôt ne peut pas être modifié dans son état actuel. Voyez le motif ci-dessus et traitez-le depuis le back-office.";

for (const code of ADMINISTRATION_ENTREPOT) CONSEILS[code] = CONSEIL_ADMINISTRATION;

/** Le geste à proposer pour ce code, ou `null` si on n'en connaît aucun. */
export function conseilDuRefus(code: string | null | undefined): string | null {
  if (!code) return null;
  return CONSEILS[code] ?? null;
}

/** Les codes qui ont un conseil : exposés pour le garde-fou. */
export const CODES_CONSEILLES: readonly string[] = Object.keys(CONSEILS);
