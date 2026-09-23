import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  CLES_CONSERVEES,
  CLE_PROPRIETAIRE,
  CLE_PURGE_EN_COURS,
  clesEpargnees,
  localesParTraitement,
  TABLE_ALLOWLIST,
  tablesAllowlistInattendues,
  tablesNonClassees,
  TRAITEMENT_LOCAL,
} from "./purge-regles";
import { tablesLocales } from "./tables";

const RACINE = resolve(__dirname, "..");

describe("le classement des tables locales", () => {
  it("balaie réellement quelque chose", () => {
    expect(tablesLocales().length).toBeGreaterThan(3);
    expect(Object.keys(TRAITEMENT_LOCAL).length).toBeGreaterThan(3);
  });

  /**
   * ⚠ LE GARDE-FOU CENTRAL.
   *
   * Une table locale ajoutée sans décision ne doit être ni purgée par défaut
   * (elle pourrait porter un réglage d'appareil), ni épargnée par défaut (elle
   * pourrait porter des ventes). Le contrôle existe aussi à l'EXÉCUTION, dans
   * `purgerBaseLocale`.
   */
  it("classe TOUTES les tables du schéma local", () => {
    expect(tablesNonClassees(tablesLocales())).toEqual([]);
  });

  it("ne classe aucune table qui n'existe pas", () => {
    const inconnues = Object.keys(TRAITEMENT_LOCAL).filter(
      (n) => !tablesLocales().includes(n)
    );
    expect(inconnues).toEqual([]);
  });

  it("nomme la table à laquelle il manque une décision", () => {
    expect(tablesNonClassees([...tablesLocales(), "une_table_neuve"])).toEqual([
      "une_table_neuve",
    ]);
  });

  /**
   * L'oublier ne laisserait aucune donnée derrière, mais garderait les CURSEURS
   * de l'ancien compte : la sonde répondrait « rien de neuf » sur des tables
   * jamais tirées, et le catalogue du nouveau compte ne descendrait jamais.
   */
  it("vide `sync_state`, sans quoi le catalogue suivant ne descend jamais", () => {
    expect(TRAITEMENT_LOCAL.sync_state).toBe("vider");
  });

  it("traite `pending_product_photos` avec ses fichiers", () => {
    expect(TRAITEMENT_LOCAL.pending_product_photos).toBe("vider_avec_fichiers");
    expect(localesParTraitement("vider_avec_fichiers")).toEqual([
      "pending_product_photos",
    ]);
  });

  it("ne vide `local_settings` que par clé", () => {
    expect(TRAITEMENT_LOCAL.local_settings).toBe("vider_sauf_allowlist");
    expect(localesParTraitement("vider")).toEqual([
      "outbox_operations",
      "parked_carts",
      "print_jobs",
      "sync_state",
    ]);
  });
});

describe("l'allowlist de `local_settings`", () => {
  it("conserve le thème et l'imprimante", () => {
    expect([...CLES_CONSERVEES]).toEqual(["theme.preference", "imprimante"]);
  });

  /**
   * ⚠ LES COMPTEURS DE NUMÉROTATION PARTENT, ET C'EST SÛR ICI.
   *
   * Un nouvel enrôlement attribue un NOUVEAU `device_code`, donc une nouvelle
   * série dense `VT-AAAAMMJJ-NOUVEAUCODE-0001`. Ce que la doctrine de
   * `numerotation.ts` interdit, c'est de RENOMMER la clé sur un terminal en
   * service ; pas de la remettre à zéro pour un autre compte.
   */
  it("n'épargne ni les compteurs ni l'état de synchronisation", () => {
    for (const cle of [
      "pos.compteur_ventes",
      "pos.compteur.RGL",
      "pos.compteur.CZ",
      "sync.derniere_complete_at",
      CLE_PROPRIETAIRE,
    ]) {
      expect(clesEpargnees()).not.toContain(cle);
    }
  });

  /**
   * Le drapeau survit à la transaction : l'effacer DEDANS ferait perdre la trace
   * d'une purge tuée juste après le commit, avant son propre nettoyage.
   */
  it("épargne le drapeau de purge en cours", () => {
    expect(clesEpargnees()).toContain(CLE_PURGE_EN_COURS);
  });

  /**
   * ⚠ CROISEMENT DE SOURCES, lu en TEXTE.
   *
   * Importer ces deux modules tirerait `@/db/client`, qui ouvre SQLite au
   * chargement, et ferait de `purge-regles` autre chose qu'un module pur. On lit
   * donc les fichiers, comme `sync/push.test.ts` le fait déjà pour les actes.
   * Renommer une clé d'un seul côté doit faire échouer ce test, pas passer.
   */
  it("l'allowlist est exactement ce que les deux écrans écrivent", () => {
    const reglages = readFileSync(join(RACINE, "data/reglages.ts"), "utf8");
    const imprimante = readFileSync(join(RACINE, "printing/preferences.ts"), "utf8");

    const theme = /CLE_THEME\s*=\s*"([^"]+)"/.exec(reglages);
    const impr = /^const CLE = "([^"]+)"/m.exec(imprimante);

    expect(theme).not.toBeNull();
    expect(impr).not.toBeNull();
    expect([...CLES_CONSERVEES].sort()).toEqual([theme![1], impr![1]].sort());
  });
});

describe("le traitement `vider_sauf_allowlist`", () => {
  /**
   * ⚠ LE CONTRÔLE QUI REND LE SUIVANT CRÉDIBLE.
   *
   * Un balayage qui ne balaie rien passe au vert et ne prouve rien : ce dépôt
   * l'a payé trois fois. On établit d'abord que le traitement désigne bien
   * quelque chose.
   */
  it("désigne réellement une table", () => {
    expect(localesParTraitement("vider_sauf_allowlist")).toContain(TABLE_ALLOWLIST);
  });

  /**
   * `aVider` de `purge.ts` ne reprend que `vider` et `vider_avec_fichiers` ;
   * `local_settings` est couverte à part, par un ordre qui suppose sa colonne
   * `key`. Une table classée ici demain serait donc silencieusement épargnée -
   * `tablesNonClassees` ne la verrait pas, elle EST classée - et les données de
   * l'ancien marchand resteraient sur le terminal du suivant.
   */
  it("ne porte QUE la table que la purge sait rendre", () => {
    expect(tablesAllowlistInattendues()).toEqual([]);
  });

  it("nomme la table à laquelle il manque une décision", () => {
    const original = TRAITEMENT_LOCAL.une_table_a_venir;
    TRAITEMENT_LOCAL.une_table_a_venir = "vider_sauf_allowlist";
    try {
      expect(tablesAllowlistInattendues()).toEqual(["une_table_a_venir"]);
    } finally {
      if (original === undefined) delete TRAITEMENT_LOCAL.une_table_a_venir;
      else TRAITEMENT_LOCAL.une_table_a_venir = original;
    }
  });
});
