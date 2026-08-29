/**
 * Lectures liées à l'établissement.
 *
 * Premier fichier de `src/data/`, qui porte la convention nouvelle du lot :
 * **aucun écran n'interroge la base**. Un écran appelle `src/data/`, qui rend
 * une forme finale. C'est ce qui rend les lots 6 à 11 peu coûteux - ils
 * remplacent un corps de fonction, pas un écran.
 *
 * C'est aussi le miroir des server actions du back-office
 * (`frontend/actions/*.actions.ts`) : la parité se relit fichier contre fichier.
 */
import { db } from "@/db/client";
import { organizations, organizationSettings } from "@/db/schema";

/** Libellés du type d'établissement, repris de l'assistant d'inscription web. */
const TYPES: Record<string, string> = {
  boutique: "Boutique",
  supermarket: "Supermarché",
  pharmacy: "Pharmacie",
  depot: "Dépôt",
  restaurant: "Restaurant",
  other: "Autre",
};

export interface Etablissement {
  id: string;
  nom: string;
  typeAffiche: string;
  adresse: string | null;
  ville: string | null;
  pays: string | null;
  telephone: string | null;
  email: string | null;
  nif: string | null;
  rccm: string | null;
  idNat: string | null;
}

export async function etablissement(): Promise<Etablissement | null> {
  const [o] = await db.select().from(organizations).limit(1);
  if (!o) return null;
  return {
    id: o.id,
    nom: o.name,
    typeAffiche: TYPES[o.businessType] ?? o.businessType,
    adresse: o.address ?? null,
    ville: o.city ?? null,
    pays: o.country ?? null,
    telephone: o.phone ?? null,
    email: o.email ?? null,
    nif: o.taxId ?? null,
    rccm: o.rccm ?? null,
    idNat: o.idNat ?? null,
  };
}

export interface ParametresRecu {
  enTete: string | null;
  pied: string | null;
  largeurPapier: number;
  pointsSurRecu: boolean;
  seuilStockBas: number | null;
}

/**
 * Une seule ligne, sans filtre d'organisation : le serveur retire le champ
 * `organization` de tout ce qu'il envoie (`NEVER_SENT`), et un terminal n'est
 * enrôlé que pour UNE organisation. Filtrer dessus serait impossible et inutile.
 */
export async function parametresRecu(): Promise<ParametresRecu | null> {
  const [s] = await db.select().from(organizationSettings).limit(1);
  if (!s) return null;
  return {
    enTete: s.receiptHeader ?? null,
    pied: s.receiptFooter ?? null,
    largeurPapier: s.receiptPaperWidth ?? 58,
    pointsSurRecu: Boolean(s.showLoyaltyPointsOnReceipt),
    seuilStockBas: s.lowStockThreshold ?? null,
  };
}
