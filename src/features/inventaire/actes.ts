/**
 * Les actes d'une session d'inventaire, et la création au catalogue.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE COMPTAGE S'ÉCRIT DANS LE JOURNAL, PAS DANS LA TABLE TIRÉE.           │
 * │                                                                          │
 * │ On compte debout dans le rayon, souvent sans réseau. Un comptage écrit   │
 * │ localement puis refusé laisserait une feuille qui se croit finie. La     │
 * │ fusion se fait donc à la lecture : la table tirée porte ce que le        │
 * │ serveur sait, le journal ce que le magasinier vient de saisir.           │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import * as Crypto from "expo-crypto";

import { pireEnvoi } from "@/data/envoi";
import { lotEnAttente, type LotEnAttente } from "@/features/sync/attente";
import {
  enAttenteParType,
  enqueue,
  type EtatEnvoi,
  type OperationKind,
} from "@/sync";

// Le corps de l'acte vit dans le module PUR : ce fichier importe `@/sync`, qui
// ouvre la base SQLite au chargement, et le contrat de transport ne serait
// alors éprouvable sur aucune machine sans appareil. C'est le motif déjà
// retenu pour `payload-mouvement.ts`.
import {
  type ActeEnFile,
  type TransitionSession,
} from "./apparence";
import {
  corpsDeLaSession,
  type SaisieSession,
} from "./nouvelle-session";
import {
  corpsCreationReferentiel,
  corpsModificationReferentiel,
  type GenreReferentiel,
  type SaisieReferentiel,
} from "./referentiel";
import { slugifier } from "./slug";

export type { SaisieSession };
// Le type vit dans `apparence.ts`, module PUR : ce fichier ouvre SQLite au
// chargement. Le réexport garde les appelants en place.
export type { ActeEnFile, TransitionSession };

/**
 * Met une session d'inventaire en file.
 *
 * ⚠ Le nom se compose ICI, à l'instant de l'envoi, et non au montage de
 * l'écran : un formulaire laissé ouvert passé minuit doit enregistrer la date
 * qu'il affichera après, pas celle qu'il affichait avant.
 */
export async function creerSession(saisie: SaisieSession): Promise<string> {
  const id = Crypto.randomUUID();
  await enqueue(id, "inventory_session.create", {
    id,
    ...corpsDeLaSession(saisie, new Date()),
  });
  return id;
}

const TRANSITIONS: TransitionSession[] = ["start", "submit", "validate", "cancel"];

export async function transitionSession(
  sessionId: string,
  transition: TransitionSession
): Promise<string> {
  const id = Crypto.randomUUID();
  await enqueue(id, `inventory_session.${transition}` as never, {
    id,
    session: sessionId,
  });
  return id;
}

/** Un comptage, tel que le magasinier le saisit dans le rayon. */
export interface Comptage {
  ligne: string;
  /** Total en unité de détail. Toujours envoyé : le serveur le retient si la
   *  ligne n'a pas de conditionnement. */
  total: number;
  contenants?: number;
  vrac?: number;
  notes?: string;
}

/**
 * Envoie un lot de comptages.
 *
 * Un LOT et non une ligne à la fois : on compte une allée, puis on enregistre.
 * Une ligne inconnue du serveur est ignorée par lui, pas refusée - le travail
 * du magasinier ne doit pas être condamné par une ligne supprimée entre-temps.
 */
export async function enregistrerComptages(
  sessionId: string,
  comptages: Comptage[]
): Promise<string> {
  const id = Crypto.randomUUID();
  await enqueue(id, "inventory_session.count", {
    id,
    session: sessionId,
    counts: comptages.map((c) => ({
      id: c.ligne,
      quantity_counted: String(c.total),
      ...(c.contenants != null
        ? { counted_package_quantity: String(c.contenants) }
        : {}),
      ...(c.vrac != null ? { counted_loose_quantity: String(c.vrac) } : {}),
      ...(c.notes ? { notes: c.notes } : {}),
    })),
  });
  return id;
}

/** Comptages saisis sur ce terminal et pas encore confirmés, par ligne. */
export interface ComptageEnAttente {
  total: number;
  contenants: number | null;
  vrac: number | null;
  /**
   * Où en est l'envoi de CE comptage.
   *
   * Un comptage bloqué reste affiché - c'est du travail fait dans le rayon, le
   * masquer ferait recompter - mais il n'ouvre pas la soumission : il
   * n'arrivera pas au serveur, qui verrait une feuille incomplète.
   */
  envoi: EtatEnvoi;
}

export async function comptagesEnAttente(
  sessionId: string
): Promise<Map<string, ComptageEnAttente>> {
  // `avecBloquees` : voir `ComptageEnAttente.envoi`. La lecture ne peut ici
  // que RESSERRER - elle ferme une porte, elle n'affirme aucun acquis.
  const ops = await enAttenteParType<{
    session: string;
    counts?: {
      id: string;
      quantity_counted?: string;
      counted_package_quantity?: string;
      counted_loose_quantity?: string;
    }[];
  }>("inventory_session.count", { avecBloquees: true });

  // Le DERNIER comptage d'une ligne gagne : le magasinier recompte quand il
  // doute, et c'est sa dernière lecture qui vaut.
  const par = new Map<string, ComptageEnAttente>();
  for (const o of ops) {
    if (o.payload.session !== sessionId) continue;
    for (const c of o.payload.counts ?? []) {
      par.set(c.id, {
        total: Number(c.quantity_counted ?? 0),
        contenants:
          c.counted_package_quantity != null
            ? Number(c.counted_package_quantity)
            : null,
        vrac:
          c.counted_loose_quantity != null ? Number(c.counted_loose_quantity) : null,
        // L'état retenu est celui de l'opération retenue, pas le pire : c'est
        // la valeur que le magasinier vient de saisir.
        envoi: o.envoi,
      });
    }
  }
  return par;
}

/** Une session créée sur ce terminal et pas encore confirmée. */
export interface SessionEnAttente {
  id: string;
  nom: string;
  entrepot: string;
  perimetre: string;
  envoi: EtatEnvoi;
  /** Quand elle a été mise en file. */
  le: Date;
}

/**
 * Les sessions créées ici, encore dans le journal.
 *
 * Sans cette lecture, une session tout juste créée serait déclarée
 * « introuvable » par sa propre fiche : elle n'est PAS dans la table tirée, et
 * elle ne doit pas y être. C'est la contrepartie systématique de la règle
 * « on n'écrit rien dans une table tirée ».
 *
 * ⚠ `avecBloquees` est OBLIGATOIRE ici. Sans lui, une session créée puis
 * bloquée - abonnement expiré, droit manquant - disparaît de la liste ET de sa
 * propre fiche, qui la déclare « introuvable » alors que l'opération est
 * vivante et s'appliquera dès le déblocage. Rien n'est pour autant présenté
 * comme acquis : le badge dit « en attente d'un droit ».
 */
export async function creationsEnAttente(): Promise<SessionEnAttente[]> {
  const ops = await enAttenteParType<{
    id: string;
    name?: string;
    warehouse?: string;
    scope_type?: string;
  }>("inventory_session.create", { avecBloquees: true });
  return ops.map((o) => ({
    id: o.payload.id,
    nom: o.payload.name ?? "Session",
    entrepot: o.payload.warehouse ?? "",
    perimetre: o.payload.scope_type ?? "full",
    envoi: o.envoi,
    le: o.occurredAt,
  }));
}

/** L'acte qu'une session attend d'envoyer, et où il en est. */
export interface AttenteSession {
  /** Le plus RÉCENT : c'est le dernier geste du magasinier. */
  acte: ActeEnFile;
  /**
   * Le PIRE état de tous les actes en file pour cette session.
   *
   * Un comptage en file plus une soumission bloquée, ce n'est pas « attend son
   * envoi » : c'est bloqué, et proposer de synchroniser ferait attendre un
   * réseau qui ne débloquera rien.
   */
  envoi: EtatEnvoi;
  le: Date;
}

/**
 * Ce que chaque session attend d'envoyer.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN `Set` NE DISAIT NI QUOI, NI DANS QUEL ÉTAT.                          │
 * │                                                                          │
 * │ Les cinq actes étaient aplatis en identifiants : l'écran savait qu'« une │
 * │ opération » attendait, jamais laquelle, et surtout jamais si elle était  │
 * │ BLOQUÉE. Il annonçait donc « attend son envoi » sur une opération qui    │
 * │ attend une décision, et le marchand cherchait du réseau des jours        │
 * │ durant.                                                                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ `avecBloquees` est OBLIGATOIRE, et ce n'est pas une lecture optimiste :
 * elle ne fait que FERMER une porte. Sans lui, un `start` bloqué sort de la
 * carte, « Démarrer le comptage » redevient actif, et le magasinier met en
 * file un SECOND démarrage. `unblockAll` les libère tous deux : le premier
 * s'applique, le second part en quarantaine avec « session déjà démarrée », et
 * il découvre un refus qu'il n'a jamais provoqué. C'est mot pour mot le défaut
 * de la seconde session de caisse (`features/pos/caisse.ts`).
 *
 * Un `inventory_session.count` n'y entre PAS : un comptage n'est pas une
 * transition d'état, et l'y mêler ferait dire « une opération attend son
 * envoi » à chaque ligne saisie, sur toute la feuille, en permanence. Les
 * comptages se lisent ligne par ligne, dans `comptagesEnAttente`.
 */
export async function sessionsEnAttente(): Promise<Map<string, AttenteSession>> {
  const [creations, parTransition] = await Promise.all([
    enAttenteParType<{ id: string }>("inventory_session.create", {
      avecBloquees: true,
    }),
    Promise.all(
      TRANSITIONS.map(async (t) => ({
        acte: t as ActeEnFile,
        ops: await enAttenteParType<{ session: string }>(
          `inventory_session.${t}`,
          { avecBloquees: true }
        ),
      }))
    ),
  ]);

  const actes = [
    ...creations.map((o) => ({
      session: o.payload.id,
      acte: "create" as ActeEnFile,
      envoi: o.envoi,
      le: o.occurredAt,
    })),
    ...parTransition.flatMap(({ acte, ops }) =>
      ops.map((o) => ({
        session: o.payload.session,
        acte,
        envoi: o.envoi,
        le: o.occurredAt,
      }))
    ),
  ];

  const par = new Map<string, AttenteSession>();
  for (const a of actes) {
    if (!a.session) continue;
    const deja = par.get(a.session);
    const plusRecent = !deja || a.le >= deja.le;
    par.set(a.session, {
      acte: plusRecent ? a.acte : deja.acte,
      le: plusRecent ? a.le : deja.le,
      envoi: pireEnvoi([deja?.envoi, a.envoi]),
    });
  }
  return par;
}

// ------------------------------------------------------------------ catalogue

/** Les trois modes du serveur, à l'identique : aucun alias, aucune traduction. */
export type ModeVente = "retail_only" | "wholesale_only" | "wholesale_and_retail";

export interface SaisieArticle {
  nom: string;
  sku: string;
  codeBarres?: string;
  categorie?: string | null;
  marque?: string | null;
  unite?: string | null;
  modeVente: ModeVente;
  /** Canal détail. En gros seul, le serveur les déduit du contenant. */
  prixVente: number;
  prixAchat: number;
  /** Canal gros, exprimé pour un CONTENANT entier. */
  prixVenteGros?: number;
  prixAchatGros?: number;
  taxable: boolean;
  tauxTva?: number;
  suitLeStock: boolean;
  seuilReassort?: number;
  /** Conditionnement : nombre d'unités de détail par contenant. */
  unitesParContenant?: number;
  uniteContenant?: string | null;
  ouvertureAutomatique?: boolean;
  notes?: string;
}

/**
 * Met un article en file, dans le corps EXACT du serializer du back-office.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ `selling_mode: "both"` N'EXISTE PAS, ET LE SERVEUR REFUSAIT.            │
 * │                                                                          │
 * │ Les trois valeurs du modèle sont `retail_only`, `wholesale_only` et      │
 * │ `wholesale_and_retail`. Le terminal envoyait « both » dès qu'un          │
 * │ conditionnement était saisi : réponse 400, « « both » n'est pas un       │
 * │ choix valide », refus DÉTERMINISTE donc quarantaine, jamais réessayé.    │
 * │                                                                          │
 * │ Autrement dit : AUCUN article conditionné saisi sur un terminal n'est    │
 * │ jamais arrivé au serveur. Le marchand voyait sa fiche, la vendait au     │
 * │ comptoir, et elle n'existait nulle part ailleurs.                        │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export async function creerArticle(saisie: SaisieArticle): Promise<string> {
  const id = Crypto.randomUUID();
  const conditionne = saisie.modeVente !== "retail_only";

  await enqueue(id, "product.create", {
    id,
    name: saisie.nom.trim(),
    slug: slugifier(saisie.nom),
    sku: saisie.sku.trim(),
    ...(saisie.codeBarres?.trim() ? { barcode: saisie.codeBarres.trim() } : {}),
    ...(saisie.categorie ? { category: saisie.categorie } : {}),
    ...(saisie.marque ? { brand: saisie.marque } : {}),
    ...(saisie.unite ? { unit: saisie.unite } : {}),
    selling_mode: saisie.modeVente,
    // ⚠ Les décimales voyagent en CHAÎNE, jamais en nombre : un panier en CDF
    // à sept chiffres perd ses unités en virgule flottante.
    selling_price: String(saisie.prixVente),
    cost_price: String(saisie.prixAchat),
    ...(conditionne
      ? {
          units_per_package: saisie.unitesParContenant,
          ...(saisie.uniteContenant ? { packaging_unit: saisie.uniteContenant } : {}),
          ...(saisie.prixVenteGros != null
            ? { wholesale_price: String(saisie.prixVenteGros) }
            : {}),
          ...(saisie.prixAchatGros != null
            ? { package_cost_price: String(saisie.prixAchatGros) }
            : {}),
          ...(saisie.modeVente === "wholesale_and_retail"
            ? { allow_auto_unpacking: saisie.ouvertureAutomatique ?? true }
            : {}),
        }
      : {}),
    is_taxable: saisie.taxable,
    ...(saisie.taxable && saisie.tauxTva != null
      ? { tax_rate: String(saisie.tauxTva) }
      : {}),
    track_inventory: saisie.suitLeStock,
    ...(saisie.seuilReassort != null
      ? { reorder_point: String(saisie.seuilReassort) }
      : {}),
    notes: saisie.notes ?? "",
    is_active: true,
  });
  return id;
}

const ACTE_CREATION: Record<GenreReferentiel, OperationKind> = {
  categories: "category.create",
  marques: "brand.create",
  unites: "unit.create",
};

const ACTE_MODIFICATION: Record<GenreReferentiel, OperationKind> = {
  categories: "category.update",
  marques: "brand.update",
  unites: "unit.update",
};

export async function creerReferentiel(
  saisie: SaisieReferentiel,
  slug: string,
  options: { dependDe?: string[] } = {}
): Promise<string> {
  const id = Crypto.randomUUID();
  await enqueue(
    id,
    ACTE_CREATION[saisie.genre],
    { id, ...corpsCreationReferentiel(saisie, slug) },
    { dependsOn: options.dependDe }
  );
  return id;
}

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA CLÉ DE L'ACTE N'EST PAS CELLE DE LA FICHE, ET C'EST LA DÉFINITION.   │
 * │                                                                          │
 * │ Le premier argument d'`enqueue` est la clé d'IDEMPOTENCE de l'acte ;     │
 * │ `payload.id` est l'identité du SUJET. À la création le sujet n'existe    │
 * │ pas encore, les deux coïncident donc, et le serveur reprend la clé du    │
 * │ terminal. À la modification le sujet a déjà la sienne : réemployer la    │
 * │ clé de la fiche ferait avaler la seconde correction par le               │
 * │ `onConflictDoNothing` d'`enqueue`, et le marchand corrigerait deux fois  │
 * │ la même faute de frappe sans le moindre effet.                           │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * `dependDe` sert deux cas réels : une sous-catégorie dont le PARENT est encore
 * en file, et la modification d'une fiche elle-même encore en file (on crée
 * « Boisons » hors ligne, on voit la faute, on corrige). Sans dépendance, un
 * parent refusé fait partir l'enfant avec un identifiant qui n'existe pas, et
 * le marchand lit une erreur citant un UUID.
 */
export async function modifierReferentiel(
  fiche: string,
  saisie: SaisieReferentiel,
  options: { dependDe?: string[] } = {}
): Promise<string> {
  const id = Crypto.randomUUID();
  await enqueue(
    id,
    ACTE_MODIFICATION[saisie.genre],
    { id: fiche, ...corpsModificationReferentiel(saisie) },
    { dependsOn: options.dependDe }
  );
  return id;
}

/** Une fiche de référentiel qui n'est pas encore arrivée au serveur. */
export interface ReferentielEnAttente {
  /** L'acte. Pour une création, c'est aussi la clé de la fiche. */
  id: string;
  /** La fiche visée. Égale à `id` pour une création. */
  fiche: string;
  genre: GenreReferentiel;
  nom: string;
  slug: string | null;
  symbole: string | null;
  parentId: string | null;
  actif: boolean;
  envoi: EtatEnvoi;
  le: Date | null;
}

interface CorpsReferentiel {
  id: string;
  name?: string;
  slug?: string;
  symbol?: string;
  parent?: string | null;
  is_active?: boolean;
}

const GENRE_PAR_ACTE: [GenreReferentiel, OperationKind, OperationKind][] = [
  ["categories", "category.create", "category.update"],
  ["marques", "brand.create", "brand.update"],
  ["unites", "unit.create", "unit.update"],
];

function enFiche(
  genre: GenreReferentiel,
  o: { id: string; payload: CorpsReferentiel; occurredAt: Date | null; envoi: EtatEnvoi }
): ReferentielEnAttente {
  return {
    id: o.id,
    // `payload.id` désigne la fiche dans les DEUX cas ; à la création il vaut
    // aussi la clé de l'acte, le terminal posant la clé que le serveur reprend.
    fiche: o.payload.id,
    genre,
    nom: o.payload.name ?? "",
    slug: o.payload.slug ?? null,
    symbole: o.payload.symbol ?? null,
    parentId: o.payload.parent ?? null,
    actif: o.payload.is_active !== false,
    envoi: o.envoi,
    le: o.occurredAt,
  };
}

/**
 * Les fiches CRÉÉES ici et pas encore confirmées.
 *
 * ⚠ `avecBloquees` est demandé, et l'encadré d'`outbox.ts` le permet : chaque
 * ligne fusionnée porte sa pastille d'envoi, donc rien n'est présenté comme
 * ACQUIS. Sans lui, une catégorie créée il y a dix minutes disparaîtrait de la
 * liste ET du sélecteur de parent à la seconde où le serveur répond `blocked` ;
 * le marchand la recréerait, et `unblockAll` ferait partir les deux - la
 * première appliquée, la seconde en quarantaine, pour un refus qu'il n'a pas
 * provoqué.
 */
export async function creationsReferentielEnAttente(): Promise<ReferentielEnAttente[]> {
  const lots = await Promise.all(
    GENRE_PAR_ACTE.map(async ([genre, creation]) => {
      const ops = await enAttenteParType<CorpsReferentiel>(creation, {
        avecBloquees: true,
      });
      return ops.map((o) => enFiche(genre, o));
    })
  );
  return lots.flat();
}

/**
 * Par fiche, la DERNIÈRE modification en file et le PIRE état de toutes.
 *
 * La dernière parce que c'est elle qui décrit ce que le marchand vient de
 * saisir ; le pire état parce qu'une seule opération bloquée suffit à ce que la
 * fiche n'aboutisse pas.
 */
export async function modificationsReferentielEnAttente(): Promise<
  Map<string, ReferentielEnAttente>
> {
  const par = new Map<string, ReferentielEnAttente>();
  for (const [genre, , modification] of GENRE_PAR_ACTE) {
    const ops = await enAttenteParType<CorpsReferentiel>(modification, {
      avecBloquees: true,
    });
    for (const o of ops) {
      const fiche = enFiche(genre, o);
      const deja = par.get(fiche.fiche);
      // `enAttenteParType` rend par `seq` croissant : la dernière écrase.
      par.set(fiche.fiche, {
        ...fiche,
        envoi: pireEnvoi([deja?.envoi, fiche.envoi].filter(Boolean) as EtatEnvoi[]),
      });
    }
  }
  return par;
}

/** Ce que le catalogue attend d'envoyer, par genre. */
export async function catalogueEnAttente(): Promise<{
  articles: { id: string; nom: string; sku: string }[];
  referentiels: LotEnAttente;
}> {
  const [articles, ...lots] = await Promise.all([
    enAttenteParType<{ id: string; name: string; sku: string }>("product.create", {
      avecBloquees: true,
    }),
    ...GENRE_PAR_ACTE.flatMap(([, creation, modification]) =>
      [creation, modification].map((k) =>
        enAttenteParType<{ id: string }>(k, { avecBloquees: true })
      )
    ),
  ]);
  return {
    articles: articles.map((o) => ({
      id: o.payload.id,
      nom: o.payload.name,
      sku: o.payload.sku,
    })),
    referentiels: lotEnAttente(lots.flat()),
  };
}

export { slugifier };
