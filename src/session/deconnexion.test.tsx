/**
 * La séquence de déconnexion, jugée sur ce qu'aucun module pur ne peut juger :
 * l'ORDRE des effets, et le fait que la purge ne tourne JAMAIS sur une file qui
 * n'est pas vide.
 *
 * Les libellés et les issues sont éprouvés dans `deconnexion-regles.test.ts` ;
 * ici on ne vérifie que le câblage.
 */
import { useEffect } from "react";

// Module PUR, sans effet de bord : il peut rester en tête.
import { prendre, reinitialiserPourTest } from "@/sync/verrou";
import TestRenderer, { act } from "react-test-renderer";

// `jest.mock` est HISSÉ par Babel au-dessus des imports : celui-ci peut donc
// rester en tête, et le module recevra bien ses doublures.
import { DeconnexionProvider, RESPIRATION_MS, useDeconnexion } from "./deconnexion";

const mockJournal: string[] = [];
let mockFile = { pending: 0, inflight: 0, quarantined: 0, blocked: 0, photos: 0 };
/** Ce que la base porte APRÈS l'envoi. Nul : l'envoi n'a rien changé. */
let mockFileApres: typeof mockFile | null = null;
let mockPerissables = { paniers: 0, documents: 0 };
let mockStatus = "ready";

const mockLogout = jest.fn(async () => {
  mockJournal.push("logout");
});

/**
 * ⚠ LE VERROU N'EST PAS DOUBLÉ, ET C'EST TOUT L'INTÉRÊT.
 *
 * Ce fichier juge que la purge ne tourne JAMAIS hors verrou. Le doubler
 * reviendrait à éprouver la doublure. Il est PUR (une variable de module), donc
 * le vrai tourne ici sans rien ouvrir.
 *
 * Seule `attendreLibre` est raccourcie : la vraie sonde toutes les 200 ms
 * pendant trente secondes, ce qui ferait expirer le test au lieu de le faire
 * échouer. Sa décision est la même - libre, ou pas.
 */
/**
 * Une attente de verrou que le test peut SUSPENDRE.
 *
 * C'est la seule façon d'observer la fenêtre qui nous intéresse : sans elle,
 * `attendreLibre` répond dans la même microtâche et toute la séquence est finie
 * avant qu'on ait pu regarder ce qui était affiché.
 */
let mockAttente: Promise<void> | null = null;

jest.mock("@/sync", () => {
  const verrou = jest.requireActual("@/sync/verrou") as typeof import("@/sync/verrou");
  return {
    ...verrou,
    attendreLibre: async () => {
      if (mockAttente) await mockAttente;
      return !verrou.estPris();
    },
    pushAll: async () => {
      mockJournal.push("push");
      return { sent: 0, applied: 0, quarantined: 0, retry: 0, blocked: 0, more: false };
    },
  };
});

jest.mock("./en-souffrance", () => ({
  // La base est relue APRÈS l'envoi, et c'est elle qui fait foi : un `pending`
  // à échéance future n'apparaît dans aucun bilan de poussée.
  lireEnSouffrance: async () =>
    mockJournal.includes("push") && mockFileApres ? mockFileApres : mockFile,
  lirePerissablesLocaux: async () => mockPerissables,
}));

jest.mock("@/features/inventaire/photos", () => ({
  envoyerPhotosEnAttente: async () => {
    mockJournal.push("photos");
    return { envoyees: 0, differees: 0, abandonnees: 0 };
  },
}));

jest.mock("@/db/purge", () => {
  const verrou = jest.requireActual("@/sync/verrou") as typeof import("@/sync/verrou");
  return {
    purgerBaseLocale: async () => {
      // ⚠ On note l'état du verrou À L'INSTANT de la purge. C'est la seule
      // assertion qui attrape un verrou rendu trop tôt : le constater APRÈS
      // coup ne distingue pas « rendu à la fin » de « rendu avant le nettoyage ».
      mockJournal.push(verrou.estPris() ? "purge:sous-verrou" : "purge:SANS-VERROU");
      return { tablesVidees: 51, lignesSupprimees: 0, fichiersSupprimes: 0 };
    },
  };
});

jest.mock("@/data/reseau", () => ({ useEnLigne: () => true }));

jest.mock("./provider", () => ({
  useSession: () => ({
    snapshot: { device: { id: "d-1" } },
    status: mockStatus,
    logout: mockLogout,
  }),
}));

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));

/**
 * ⚠ Les composants de `react-native` sont des CLASSES sous le préréglage Jest :
 * les appeler comme des fonctions lève. On passe donc par `createElement`, et
 * les doublures restent des composants à part entière.
 */
jest.mock("@/ui", () => {
  const React = jest.requireActual("react") as typeof import("react");
  const RN = jest.requireActual("react-native") as typeof import("react-native");
  return {
    Spinner: () => null,
    Text: RN.Text,
    Button: (p: { children?: React.ReactNode; onPress?: () => void }) =>
      React.createElement(RN.Text, { onPress: p.onPress }, p.children),
    Dialog: (p: { ouvert: boolean; actions?: React.ReactNode }) =>
      p.ouvert ? React.createElement(RN.View, null, p.actions) : null,
  };
});


/**
 * Expose `demander` au test, sans écran.
 *
 * ⚠ L'affectation se fait dans un EFFET, jamais au rendu : écrire dans une
 * variable extérieure pendant le rendu est un effet de bord, et `react-hooks`
 * le refuse à raison - le rendu peut se rejouer.
 */
let declencher: (() => void) | null = null;
function Sonde() {
  const { demander } = useDeconnexion();
  useEffect(() => {
    declencher = demander;
  }, [demander]);
  return null;
}

async function monter() {
  let arbre!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    arbre = TestRenderer.create(
      <DeconnexionProvider>
        <Sonde />
      </DeconnexionProvider>
    );
  });
  return arbre;
}

/** Le bouton dont le libellé contient `texte`, ou `undefined`. */
function bouton(arbre: TestRenderer.ReactTestRenderer, texte: string) {
  return arbre.root
    .findAll((n) => typeof n.props.onPress === "function")
    .find((n) => JSON.stringify(n.props.children ?? "").includes(texte));
}

/** Appuie sur le bouton dont le libellé contient `texte`. */
async function appuyer(arbre: TestRenderer.ReactTestRenderer, texte: string) {
  const cible = arbre.root
    .findAll((n) => typeof n.props.onPress === "function")
    .find((n) => JSON.stringify(n.props.children ?? "").includes(texte));
  if (!cible) throw new Error(`Aucun bouton ne porte « ${texte} »`);
  await act(async () => {
    cible.props.onPress();
  });
  // Le nettoyage attend que la garde ait démonté `(app)` avant de purger : le
  // test doit lui laisser cette respiration, sinon il juge une séquence qui
  // n'est pas finie.
  await act(async () => {
    await new Promise((r) => setTimeout(r, RESPIRATION_MS + 20));
  });
}

beforeEach(() => {
  // Le verrou est une variable de MODULE : elle survit d'un cas à l'autre. Un
  // test qui la laisse prise ferait échouer le suivant pour une raison qui ne
  // lui appartient pas.
  reinitialiserPourTest();
  mockJournal.length = 0;
  mockFile = { pending: 0, inflight: 0, quarantined: 0, blocked: 0, photos: 0 };
  mockFileApres = null;
  mockPerissables = { paniers: 0, documents: 0 };
  mockStatus = "ready";
  mockAttente = null;
  mockLogout.mockClear();
});

describe("la séquence de déconnexion", () => {
  it("ne fait RIEN tant que personne n'a demandé", async () => {
    await monter();
    expect(mockJournal).toEqual([]);
  });

  it("sur une file vide, ne pousse pas et nettoie", async () => {
    const arbre = await monter();
    await act(async () => declencher!());
    await appuyer(arbre, "Se déconnecter");

    // Aucun envoi : on ne pousse pas une file vide, et `pushAll` sortirait
    // de toute façon sans rien faire.
    expect(mockJournal).toEqual(["logout", "purge:sous-verrou"]);
  });

  /**
   * ⚠ L'ORDRE EST LE CŒUR DU LOT.
   *
   * La session part d'ABORD : `logout()` pose `anonymous`, la garde démonte
   * `(app)`, et la cinquantaine de `useLecture` se désabonne. Purger avant les
   * viderait sous les yeux du marchand. Et tué entre les deux, on rouvre sur une
   * base périmée que le filet d'entrée rattrape - jamais l'inverse.
   */
  it("abandonne la session AVANT de vider la base", async () => {
    mockFile = { ...mockFile, pending: 2 };
    // L'envoi aboutit : la relecture d'après trouve la file vide.
    mockFileApres = { pending: 0, inflight: 0, quarantined: 0, blocked: 0, photos: 0 };
    const arbre = await monter();
    await act(async () => declencher!());
    await appuyer(arbre, "Synchroniser et déconnecter");

    expect(mockJournal).toEqual(["push", "photos", "logout", "purge:sous-verrou"]);
    expect(mockJournal.indexOf("logout")).toBeLessThan(
      mockJournal.indexOf("purge:sous-verrou")
    );
  });

  it("pousse, puis envoie les photos, et rend le verrou", async () => {
    mockFile = { ...mockFile, pending: 2 };
    const arbre = await monter();
    await act(async () => declencher!());
    await appuyer(arbre, "Synchroniser et déconnecter");

    expect(mockJournal.slice(0, 2)).toEqual(["push", "photos"]);
  });

  /**
   * ⚠ LE TEST QUI COMPTE LE PLUS.
   *
   * Derrière une opération restée en file il peut y avoir une vente encaissée
   * dont un client tient le ticket. La modale n'offre AUCUNE issue destructrice :
   * elle nomme ce qui reste, et propose de partir sans effacer.
   */
  it("NE PURGE PAS quand il reste des opérations", async () => {
    mockFile = { ...mockFile, pending: 2 };
    const arbre = await monter();
    await act(async () => declencher!());
    await appuyer(arbre, "Synchroniser et déconnecter");

    expect(mockJournal).toContain("push");
    expect(mockJournal.join(" ")).not.toContain("purge");
    expect(mockLogout).not.toHaveBeenCalled();
  });

  it("ne purge pas davantage sur une quarantaine ou un blocage", async () => {
    for (const reste of [{ quarantined: 3 }, { blocked: 1 }]) {
      mockJournal.length = 0;
      mockFile = { pending: 0, inflight: 0, quarantined: 0, blocked: 0, photos: 0, ...reste };
      const arbre = await monter();
      await act(async () => declencher!());
      await appuyer(arbre, "Synchroniser et déconnecter");
      expect(mockJournal.join(" ")).not.toContain("purge");
    }
  });

  /**
   * L'issue non destructrice : la base survit, estampillée, et c'est le filet
   * d'entrée qui empêchera la fusion à la connexion suivante.
   */
  it("« Se déconnecter sans effacer » abandonne la session SANS purger", async () => {
    mockFile = { ...mockFile, blocked: 1 };
    const arbre = await monter();
    await act(async () => declencher!());
    await appuyer(arbre, "Synchroniser et déconnecter");
    await appuyer(arbre, "Se déconnecter sans effacer");

    expect(mockJournal).toContain("logout");
    expect(mockJournal.join(" ")).not.toContain("purge");
  });

  /**
   * ⚠ LE DÉFAUT QUI A OUVERT CE LOT.
   *
   * Le verrou n'entourait que la POUSSÉE, puis il était rendu. Le nettoyage
   * tournait hors verrou, et sur le chemin « file déjà vide » il n'était jamais
   * pris du tout : un cycle automatique pouvait démarrer pendant le `logout()`
   * et écrire sa première page APRÈS la purge. Une ligne de `sync_state`
   * réécrite, et le compte suivant reprenait le tirage au curseur de l'ancien.
   */
  it("ne purge JAMAIS pendant qu'un cycle tourne, même sur une file vide", async () => {
    prendre(); // un cycle automatique tient déjà le verrou
    const arbre = await monter();
    await act(async () => declencher!());
    await appuyer(arbre, "Se déconnecter");

    expect(mockJournal).toEqual([]);
    expect(mockLogout).not.toHaveBeenCalled();
    // Et l'écran le DIT : ce n'est pas une panne de réseau, on n'a pas essayé.
    await expect(appuyer(arbre, "Réessayer")).resolves.toBeUndefined();
  });

  it("tient le verrou PENDANT la purge, pas seulement pendant l'envoi", async () => {
    mockFile = { ...mockFile, pending: 2 };
    mockFileApres = { pending: 0, inflight: 0, quarantined: 0, blocked: 0, photos: 0 };
    const arbre = await monter();
    await act(async () => declencher!());
    await appuyer(arbre, "Synchroniser et déconnecter");

    expect(mockJournal).toEqual(["push", "photos", "logout", "purge:sous-verrou"]);
    // Rendu à la sortie : le terminal doit pouvoir se resynchroniser ensuite.
    expect(prendre()).toBe(true);
  });

  /**
   * ⚠ Une photo en attente est la SEULE copie d'un fichier : le serveur ne l'a
   * pas, et `viderDossierPhotos()` la détruit. La laisser hors du compte
   * revenait à l'effacer en silence.
   */
  it("NE PURGE PAS quand une photo n'a pas pu partir", async () => {
    mockFile = { ...mockFile, photos: 1 };
    const arbre = await monter();
    await act(async () => declencher!());
    await appuyer(arbre, "Synchroniser et déconnecter");

    expect(mockJournal).toContain("photos");
    expect(mockJournal.join(" ")).not.toContain("purge");
  });

  /**
   * Depuis `(locked)`, « Opérations à corriger » n'est pas atteignable : l'écran
   * vit dans `(app)`. Un bouton qui ne mène nulle part est pire que pas de
   * bouton.
   */

  /**
   * ⚠ LE DIALOGUE RESTAIT TAPABLE PENDANT TOUTE L'ATTENTE DU VERROU.
   *
   * L'étape n'était posée que si l'on avait quelque chose à envoyer. Sur une
   * file VIDE elle restait `confirmation`, donc le dialogue restait affiché -
   * jusqu'à trente secondes quand un cycle tourne. Presser « Annuler » ne
   * faisait que le fermer : la promesse continuait, prenait le verrou, et
   * appelait `logout()` puis la PURGE. Une destruction après une annulation
   * explicite.
   */
  it("n'est plus interruptible dès l'appui, même sur une file vide", async () => {
    let debloquer!: () => void;
    mockAttente = new Promise<void>((r) => {
      debloquer = r;
    });

    const arbre = await monter();
    await act(async () => declencher!());
    await act(async () => {
      bouton(arbre, "Se déconnecter")!.props.onPress();
    });

    // La séquence est engagée : la surcouche opaque couvre l'écran, et il n'y a
    // plus RIEN à presser. Tant que la confirmation restait ouverte, ses deux
    // boutons l'étaient aussi.
    expect(bouton(arbre, "Se déconnecter")).toBeUndefined();
    expect(bouton(arbre, "Annuler")).toBeUndefined();

    debloquer();
    await act(async () => {
      await new Promise((r) => setTimeout(r, RESPIRATION_MS + 20));
    });
    expect(mockJournal).toEqual(["logout", "purge:sous-verrou"]);
  });

  it("n'offre pas « Voir les opérations » hors de l'application", async () => {
    mockStatus = "locked";
    mockFile = { ...mockFile, blocked: 1 };
    const arbre = await monter();
    await act(async () => declencher!());
    await appuyer(arbre, "Synchroniser et déconnecter");

    await expect(appuyer(arbre, "Voir les opérations")).rejects.toThrow();
    // L'issue non destructrice, elle, reste toujours offerte : sans elle, un PIN
    // oublié hors réseau serait un cul-de-sac.
    await expect(appuyer(arbre, "Se déconnecter sans effacer")).resolves.toBeUndefined();
  });
});
