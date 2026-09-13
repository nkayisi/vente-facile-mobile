/**
 * Numérotation des documents émis par ce terminal.
 *
 * DOCTRINE DU PROJET : un numéro doit être DÉFINITIF dès l'impression. Un
 * numéro provisoire remplacé plus tard par un définitif réintroduit exactement
 * le défaut que la numérotation serveur a corrigé : un client qui revient avec
 * son ticket ne peut plus prouver son paiement.
 *
 * Hors ligne, le terminal ne peut pas tirer un numéro dans la série du serveur
 * sans lui parler. La réponse retenue n'est donc pas un numéro provisoire, ni
 * un bail de numéros (qui creuserait des trous dans une série portant le RCCM
 * et le NIF, et dont la taille de bloc est indécidable), mais UNE SÉRIE DENSE
 * PAR APPAREIL : `VT-20260829-K7QM-0042`.
 *
 * Le `device_code` est attribué par le SERVEUR à l'enrôlement, donc unique par
 * organisation et sans tirage aléatoire. Chaque série reste continue et
 * auditable, le numéro se dicte, se trie, et dit de quel terminal il vient, ce
 * qu'un marchand à trois caisses veut savoir.
 *
 * Le compteur se remet à 1 chaque jour, comme la série du serveur.
 */
import { eq, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { localSettings } from "@/db/schema";

/**
 * Préfixes, alignés sur `apps/core/numbering.py` et sur les identités de
 * document de `@vente-facile/core/receipt`. C'est le préfixe qui rend un reçu
 * de règlement reconnaissable au premier regard dans une liasse.
 *
 * `AVC` (avance) et `RGL` (règlement) désignent le même acte au comptoir, mais
 * pas le même papier : le serveur choisit l'un ou l'autre selon qu'il a trouvé
 * une facture ouverte à solder. Hors ligne, le terminal tranche pareil, avec ce
 * qu'il a en base.
 */
export const PREFIXE = {
  vente: "VT",
  reglement: "RGL",
  avance: "AVC",
  ajustement: "AJU",
  cloture: "CZ",
  depense: "DEP",
  /**
   * La facture proforma.
   *
   * Elle a sa propre série, dense et par appareil, plutôt que le suffixe
   * aléatoire du back-office : un numéro dictable au téléphone vaut mieux
   * qu'un tirage, et un client qui revient avec son devis doit pouvoir le
   * désigner. Le préfixe est celui que `DOCUMENT_IDENTITIES.proforma` attend.
   */
  proforma: "PRO",
} as const;

export type Prefixe = (typeof PREFIXE)[keyof typeof PREFIXE];

/**
 * Une série par préfixe : les numéros de vente et ceux de règlement ne
 * partagent pas leur compteur, sur le serveur non plus. Un compteur unique
 * ferait sauter des rangs dans chaque série, et une série trouée porte le RCCM
 * et le NIF.
 *
 * La vente GARDE sa clé d'origine, `pos.compteur_ventes`, et ce n'est pas de la
 * nostalgie : un terminal déjà en service porte son compteur du jour sous ce
 * nom. Le renommer ferait repartir la série à 1 sur des appareils qui ont déjà
 * imprimé, et deux ventes de la même journée sortiraient sous le même numéro.
 */
const CLE = (prefixe: string) =>
  prefixe === "VT" ? "pos.compteur_ventes" : `pos.compteur.${prefixe}`;

interface Compteur {
  /** Jour de la série, en AAAAMMJJ local. */
  jour: string;
  dernier: number;
}

/** Le jour tel que le comptoir le vit, pas tel qu'UTC le voit. */
function jourLocal(maintenant = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${maintenant.getFullYear()}${p(maintenant.getMonth() + 1)}${p(maintenant.getDate())}`;
}

/**
 * Alloue le prochain numéro de ce terminal, pour un type de document.
 *
 * L'incrément et la lecture sont faits dans UNE SEULE instruction SQL, sous la
 * transaction implicite de SQLite : deux encaissements simultanés (le caissier
 * qui appuie deux fois, une reprise d'écran pendant l'envoi) ne peuvent pas
 * tirer le même numéro. Lire puis écrire en JavaScript le permettrait, et c'est
 * précisément le défaut que `ReferenceGenerator` porte encore côté serveur.
 */
export async function prochainNumero(
  prefixe: Prefixe,
  deviceCode: string | null
): Promise<string> {
  const jour = jourLocal();
  const cle = CLE(prefixe);

  // `ON CONFLICT` avec un test sur le jour stocké : même journée, on incrémente ;
  // journée différente, la série repart à 1.
  const [ligne] = await db
    .insert(localSettings)
    .values({ key: cle, value: JSON.stringify({ jour, dernier: 1 } satisfies Compteur) })
    .onConflictDoUpdate({
      target: localSettings.key,
      set: {
        value: sql`json_object(
          'jour', ${jour},
          'dernier', CASE
            WHEN json_extract(${localSettings.value}, '$.jour') = ${jour}
            THEN json_extract(${localSettings.value}, '$.dernier') + 1
            ELSE 1
          END
        )`,
        updatedAt: new Date(),
      },
    })
    .returning({ value: localSettings.value });

  const compteur = JSON.parse(ligne.value) as Compteur;
  const rang = String(compteur.dernier).padStart(4, "0");

  // Sans code d'appareil (enrôlement incomplet), on n'invente PAS de segment :
  // un code fabriqué localement pourrait entrer en collision avec celui d'un
  // autre terminal, et deux ventes porteraient le même numéro.
  return deviceCode
    ? `${prefixe}-${jour}-${deviceCode}-${rang}`
    : `${prefixe}-${jour}-${rang}`;
}

/** Le prochain numéro de VENTE, cas de loin le plus fréquent. */
export function prochaineReference(deviceCode: string | null): Promise<string> {
  return prochainNumero(PREFIXE.vente, deviceCode);
}

/** Le dernier numéro tiré, pour l'afficher sans en consommer un. */
export async function dernierNumero(prefixe: Prefixe = PREFIXE.vente): Promise<Compteur | null> {
  const [ligne] = await db
    .select({ value: localSettings.value })
    .from(localSettings)
    .where(eq(localSettings.key, CLE(prefixe)))
    .limit(1);
  return ligne ? (JSON.parse(ligne.value) as Compteur) : null;
}
