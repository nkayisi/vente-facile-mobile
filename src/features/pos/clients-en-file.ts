/**
 * Les clients créés au terminal et pas encore confirmés par le serveur, tels
 * que le comptoir doit les proposer.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN CLIENT CRÉÉ HORS LIGNE ÉTAIT INTROUVABLE AU COMPTOIR.                │
 * │                                                                          │
 * │ `chercherClients` ne lisait que la table tirée, où un client n'arrive    │
 * │ qu'après synchronisation. Le formulaire « Nouveau client » promettait    │
 * │ pourtant « Vous pouvez déjà vendre à ce client » : le caissier le        │
 * │ cherchait à l'encaissement, ne le trouvait pas, et le saisissait une     │
 * │ seconde fois. Relevé le 2026-11-14, en ajoutant la création d'un client  │
 * │ depuis la feuille d'encaissement.                                        │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Un client en file n'a ni dette ni code : son solde vaut zéro, ce qui est
 * exact - il n'a encore rien acheté que le serveur sache.
 *
 * Module PUR : la recherche reçoit sa fonction de pliage (`sansAccent` du
 * catalogue), qui vit dans un module qui ouvre la base.
 */
import type { ClientPos } from "./etat-panier";

/** Ce que le corps d'un `customer.create` porte et dont le comptoir a besoin. */
export interface CreationClient {
  id: string;
  name?: string;
  phone?: string;
  allow_credit?: boolean;
  credit_limit?: string;
}

export function clientPosDepuisCreation(c: CreationClient): ClientPos {
  return {
    id: c.id,
    name: c.name?.trim() || "Client",
    phone: c.phone?.trim() || null,
    allow_credit: c.allow_credit !== false,
    credit_limit: c.credit_limit ?? "0",
    current_balance: "0",
  };
}

/**
 * Les clients tirés et ceux en file, en une seule liste.
 *
 * ⚠ Une création déjà redescendue par le tirage est dans les DEUX : la table
 * fait foi, sinon le client s'afficherait deux fois le temps que le journal se
 * vide. Les clients en file passent EN TÊTE quand ils correspondent : c'est le
 * client qu'on vient de créer qu'on cherche, presque toujours.
 */
export function fusionnerClients(
  tires: ClientPos[],
  enFile: ClientPos[],
  terme: string,
  plier: (s: string) => string,
  limite: number
): ClientPos[] {
  const connus = new Set(tires.map((c) => c.id));
  const motif = plier(terme.trim());
  const correspond = (c: ClientPos) =>
    !motif ||
    plier(c.name).includes(motif) ||
    plier(c.phone ?? "").includes(motif);
  const nouveaux = enFile.filter((c) => !connus.has(c.id) && correspond(c));
  return [...nouveaux, ...tires].slice(0, limite);
}

/**
 * Ce que la recherche infructueuse laisse deviner, pour la création qui suit :
 * un numéro va au téléphone, tout le reste au nom. Le caissier vient de le
 * taper, il ne doit pas le retaper.
 */
export function preremplissage(recherche: string): { nom: string; telephone: string } {
  const t = recherche.trim();
  if (!t) return { nom: "", telephone: "" };
  return /^[+\d][\d\s]*$/.test(t) ? { nom: "", telephone: t } : { nom: t, telephone: "" };
}
