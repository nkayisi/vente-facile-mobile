/**
 * La caisse et sa session, vues depuis le terminal.
 *
 * Une vente ne s'attache pas à un appareil mais à une SESSION de caisse : c'est
 * elle qui donne l'entrepôt d'où sort le stock et le tiroir où entre l'argent.
 * Sans elle, il n'y a pas de comptoir, et le serveur refuserait la vente.
 *
 * Tout se lit dans la base locale. Ouvrir une caisse hors ligne est un acte
 * comme un autre : il part au journal et sera rejoué par le serveur.
 */
import * as Crypto from "expo-crypto";
import { desc, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { registerSessions, registers, warehouses } from "@/db/schema";
import { enAttenteParType, enqueue, type EtatEnvoi } from "@/sync";

export interface CaissePos {
  id: string;
  name: string;
  warehouseId: string | null;
  warehouseName: string | null;
}

export interface SessionCaisse {
  id: string;
  registerId: string;
  registerName: string;
  warehouseId: string | null;
  openingBalance: string | null;
  openedAt: Date | null;
  /**
   * Où en est l'ouverture : acceptée, en file, ou BLOQUÉE.
   *
   * Trois états et pas deux. Une ouverture bloquée - abonnement expiré, droit
   * manquant - part quand même le jour où la porte se rouvre : la traiter
   * comme inexistante renverrait le caissier ouvrir une SECONDE session sur le
   * même comptoir, et c'est elle que le serveur refuserait, en emportant
   * toutes les ventes qui s'y rattachent.
   */
  envoi: EtatEnvoi;
}

/**
 * Les sessions dont la CLÔTURE attend son envoi.
 *
 * L'acte porte `{ session: <id> }`, et cet identifiant est celui de la session
 * qu'elle ferme, qu'elle vienne du serveur ou d'une ouverture encore en file :
 * `ouvrirSession` pose le même UUID sur l'opération et sur la session, ce qui
 * porte l'idempotence et permet à tout le reste de la journée de la désigner.
 */
async function sessionsClotureesEnAttente(): Promise<Set<string>> {
  // Les clôtures BLOQUÉES en sont : le caissier a compté son tiroir, imprimé
  // son Z et rangé. Que le serveur ne l'ait pas encore accepté ne rouvre pas le
  // tiroir - et lui reproposer de vendre sur une session dont le Z est déjà
  // sorti est exactement ce que cette lecture existe pour empêcher.
  const clotures = await enAttenteParType<{ session: string }>(
    "register_session.close",
    { avecBloquees: true }
  );
  return new Set(clotures.map((o) => o.payload.session).filter(Boolean));
}

export async function caissesDisponibles(): Promise<CaissePos[]> {
  const lignes = await db
    .select({
      id: registers.id,
      name: registers.name,
      warehouseId: registers.warehouseId,
      warehouseName: warehouses.name,
    })
    .from(registers)
    .leftJoin(warehouses, eq(warehouses.id, registers.warehouseId))
    .where(eq(registers.isActive, true));
  return lignes;
}

/**
 * La session ouverte sur ce terminal, s'il y en a une.
 *
 * Trois sources, dans cet ordre : la table tirée, qui fait foi ; les CLÔTURES
 * en attente, qui la retirent ; puis le journal, pour une ouverture faite hors
 * ligne que le serveur n'a pas encore vue.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UNE CAISSE CLÔTURÉE HORS LIGNE RESTAIT OUVERTE AU COMPTOIR.             │
 * │                                                                          │
 * │ La clôture passe par le journal, et c'est délibéré : le Z se tire à la   │
 * │ fermeture, souvent avant que le réseau ne revienne. Mais cette lecture   │
 * │ ne consultait que la table tirée, où la session reste `open` tant que le │
 * │ serveur n'a pas vu la clôture.                                           │
 * │                                                                          │
 * │ Le caissier comptait donc son tiroir, imprimait son Z, rangeait, et le   │
 * │ comptoir lui proposait de continuer à vendre SUR LA SESSION QU'IL VENAIT │
 * │ DE FERMER. Chaque vente d'après s'y rattachait ; le serveur les refusera │
 * │ toutes, la session étant close, et le Z déjà imprimé ne les compte pas.  │
 * │                                                                          │
 * │ C'est la règle du dépôt prise par l'autre bout : ce qui n'est pas encore │
 * │ confirmé se lit dans le JOURNAL, jamais dans sa table. Le motif existait │
 * │ déjà sur l'écran de clôture (`enAttenteCaisse().clotures`).              │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * On ne filtre PAS sur l'utilisateur : une session appartient à la CAISSE, et
 * deux vendeurs qui se relaient au même comptoir travaillent sur la même. Le
 * serveur, lui, contrôle qui a le droit de la fermer.
 */
export async function sessionOuverte(): Promise<SessionCaisse | null> {
  const fermees = await sessionsClotureesEnAttente();

  const [ligne] = await db
    .select({
      id: registerSessions.id,
      registerId: registerSessions.registerId,
      registerName: registers.name,
      warehouseId: registers.warehouseId,
      openingBalance: registerSessions.openingBalance,
      openedAt: registerSessions.openedAt,
    })
    .from(registerSessions)
    .innerJoin(registers, eq(registers.id, registerSessions.registerId))
    .where(eq(registerSessions.status, "open"))
    .orderBy(desc(registerSessions.openedAt))
    .limit(1);

  if (ligne && !fermees.has(ligne.id)) return { ...ligne, envoi: "envoye" };

  // Rien d'authentique : une ouverture peut attendre dans le journal. On ne
  // l'écrit pas dans la table tirée, sans quoi un refus du serveur laisserait
  // une session fantôme sur laquelle le terminal continuerait de vendre.
  //
  // Elle aussi peut avoir été clôturée depuis : ouvrir puis fermer dans la même
  // journée hors ligne met les DEUX actes en file, et le second annule le
  // premier pour le comptoir.
  //
  // ┌────────────────────────────────────────────────────────────────────────┐
  // │ UNE OUVERTURE BLOQUÉE EST UNE SESSION, PAS UN NÉANT.                  │
  // │                                                                        │
  // │ `blocked` n'est pas `quarantined` : l'acte est CONSERVÉ et partira dès │
  // │ que l'abonnement sera réglé ou le droit accordé. L'ignorer renvoyait   │
  // │ le caissier sur « Ouvrir la caisse » en pleine journée ; la seconde    │
  // │ session qu'il ouvre porte un autre identifiant, et au déblocage c'est  │
  // │ elle que le serveur refuse - avec TOUTES les ventes qui s'y            │
  // │ rattachaient, alors que la première passe. Un refus en cascade, pour   │
  // │ un abonnement en retard.                                               │
  // │                                                                        │
  // │ On la rend donc, et l'écran DIT qu'elle est bloquée : c'est le seul    │
  // │ endroit où le marchand peut apprendre qu'il n'attend pas du réseau.    │
  // └────────────────────────────────────────────────────────────────────────┘
  const attentes = await enAttenteParType<{ register: string; opening_balance?: string }>(
    "register_session.open",
    { avecBloquees: true }
  );
  const ouvertes = attentes.filter((o) => !fermees.has(o.id));
  const derniere = ouvertes[ouvertes.length - 1];
  if (!derniere) return null;

  const [caisse] = await db
    .select({ name: registers.name, warehouseId: registers.warehouseId })
    .from(registers)
    .where(eq(registers.id, derniere.payload.register))
    .limit(1);

  return {
    id: derniere.id,
    registerId: derniere.payload.register,
    registerName: caisse?.name ?? "Caisse",
    warehouseId: caisse?.warehouseId ?? null,
    // Absent quand le caissier n'a rien écrit : le serveur héritera alors du
    // tiroir de la dernière clôture. `"0"` par défaut affirmerait un tiroir
    // vide que personne n'a compté.
    openingBalance: derniere.payload.opening_balance ?? null,
    openedAt: derniere.occurredAt,
    envoi: derniere.envoi,
  };
}

/**
 * Ouvre une session de caisse.
 *
 * L'identifiant est tiré ICI et porte l'idempotence : si l'envoi se coupe après
 * que le serveur a enregistré, le renvoi retombe sur la même session au lieu
 * d'en créer une seconde. C'est aussi ce qui permet aux ventes de la journée de
 * référencer une session que le serveur n'a pas encore vue.
 *
 * Rien n'est écrit dans `register_sessions` : le journal suffit à faire exister
 * la session pour le comptoir, et il sait l'oublier si le serveur refuse. Le
 * refus le plus probable est qu'une autre session soit déjà ouverte sur cette
 * caisse ; le serveur le dit en nommant qui l'a ouverte et quand.
 */
export async function ouvrirSession(
  registerId: string,
  fondDeCaisse: number | null
): Promise<SessionCaisse> {
  const id = Crypto.randomUUID();

  await enqueue(id, "register_session.open", {
    id,
    register: registerId,
    // ┌──────────────────────────────────────────────────────────────────────┐
    // │ LE CHAMP ABSENT N'EST PAS UN CHAMP À ZÉRO.                          │
    // │                                                                      │
    // │ `open_register_session` hérite le fonds de la dernière clôture,      │
    // │ devise par devise, PUIS laisse `opening_balance` écraser la devise   │
    // │ principale. L'écran envoyait « 0 » dès que le champ était vide :     │
    // │ l'héritage sautait en principale et lui seul, le tiroir repartait de │
    // │ zéro, et le Z du soir annonçait un excédent égal à ce que la veille  │
    // │ y avait laissé. Les devises secondaires, elles, restaient héritées - │
    // │ deux règles pour le même tiroir.                                     │
    // │                                                                      │
    // │ Ne rien envoyer, c'est dire « reprends la clôture précédente ».      │
    // │ Envoyer « 0 » reste possible : le caissier l'écrit, et c'est alors   │
    // │ une affirmation, pas un défaut de formulaire.                        │
    // └──────────────────────────────────────────────────────────────────────┘
    ...(fondDeCaisse === null ? {} : { opening_balance: String(fondDeCaisse) }),
  });

  const [caisse] = await db
    .select({ name: registers.name, warehouseId: registers.warehouseId })
    .from(registers)
    .where(eq(registers.id, registerId))
    .limit(1);

  return {
    id,
    registerId,
    registerName: caisse?.name ?? "Caisse",
    warehouseId: caisse?.warehouseId ?? null,
    openingBalance: fondDeCaisse === null ? null : String(fondDeCaisse),
    openedAt: new Date(),
    // Elle vient d'entrer au journal : rien n'a encore pu la bloquer.
    envoi: "en_attente",
  };
}
