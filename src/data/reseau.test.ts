/**
 * Le retour du réseau, et rien d'autre.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN DÉCLENCHEMENT DE TROP NE LÈVE RIEN.                                  │
 * │                                                                          │
 * │ Une garde de transition absente ne casse aucun écran : elle lance des    │
 * │ cycles de synchronisation en trop, à chaque changement de liaison, sur   │
 * │ un terminal qu'on promène dans un marché. Rien à l'écran ne le dit, et   │
 * │ c'est la batterie et le forfait du marchand qui le paient.               │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * `data/reseau.ts` n'importe QUE NetInfo : aucune ouverture de SQLite, donc ce
 * contrat s'éprouve sans appareil.
 */
import React from "react";
import { Text } from "react-native";
import { act, create } from "react-test-renderer";

import type { NetInfoState } from "@react-native-community/netinfo";

// L'import du sujet reste EN TÊTE : la fabrique ci-dessous ne déréférence
// `mockEcouteurs` qu'à l'appel d'`addEventListener`, donc bien après que le
// module de test ait fini de s'évaluer. Un test qui la lirait dans son corps
// buterait sur la zone morte temporelle, et devrait descendre son import.
import { surRetourReseau, useEnLigne } from "./reseau";

// ⚠ Le préfixe `mock` n'est pas décoratif : `jest.mock` est hissé au-dessus des
// déclarations et refuse toute variable hors de sa portée, hormis sous ce
// préfixe. Motif de `features/inventaire/actes.test.ts`.
type Ecouteur = (etat: NetInfoState) => void;
const mockEcouteurs = new Set<Ecouteur>();

jest.mock("@react-native-community/netinfo", () => ({
  __esModule: true,
  default: {
    addEventListener: (ecouteur: Ecouteur) => {
      mockEcouteurs.add(ecouteur);
      return () => {
        // Un module natif n'a aucune raison d'être indulgent : on simule le cas
        // strict, pour que l'idempotence du désabonnement soit PROUVÉE et non
        // supposée.
        if (!mockEcouteurs.delete(ecouteur)) {
          throw new Error("écouteur déjà retiré");
        }
      };
    },
  },
}));

/**
 * Émet un événement NetInfo vers tous les abonnés vivants.
 *
 * `isInternetReachable` vaut `null` par défaut, et ce n'est pas une commodité :
 * c'est l'état RÉEL au démarrage, tant que la sonde n'a pas conclu. L'omettre
 * du faux événement laisserait passer toute lecture de ce champ.
 */
function emettre(isConnected: boolean | null, isInternetReachable: boolean | null = null) {
  act(() => {
    for (const ecouteur of [...mockEcouteurs]) {
      ecouteur({ isConnected, isInternetReachable } as NetInfoState);
    }
  });
}

beforeEach(() => mockEcouteurs.clear());

describe("surRetourReseau", () => {
  it("déclenche UNE fois sur la transition hors ligne vers en ligne", () => {
    const quand = jest.fn();
    surRetourReseau(quand);

    emettre(false);
    expect(quand).not.toHaveBeenCalled();

    emettre(true);
    expect(quand).toHaveBeenCalledTimes(1);
  });

  it("ne déclenche RIEN quand la liaison change sans se couper", () => {
    // Wi-Fi vers cellulaire : NetInfo émet, le réseau n'a jamais manqué.
    const quand = jest.fn();
    surRetourReseau(quand);

    emettre(true);
    emettre(true);
    emettre(true);

    expect(quand).not.toHaveBeenCalled();
  });

  it("ne prend PAS l'état initial pour un retour", () => {
    // NetInfo émet l'état courant dès l'abonnement. Le traiter comme un retour
    // ferait partir un cycle au montage, en double avec celui du montage.
    const quand = jest.fn();
    surRetourReseau(quand);

    emettre(true);

    expect(quand).not.toHaveBeenCalled();
  });

  it("déclenche une seule fois sur un aller-retour complet, et à la fin", () => {
    const quand = jest.fn();
    surRetourReseau(quand);

    emettre(true);
    expect(quand).not.toHaveBeenCalled();
    emettre(false);
    expect(quand).not.toHaveBeenCalled();
    emettre(true);
    expect(quand).toHaveBeenCalledTimes(1);
  });

  it("coupe RÉELLEMENT : après le désabonnement, un retour ne déclenche plus", () => {
    const quand = jest.fn();
    const stop = surRetourReseau(quand);

    emettre(false);
    stop();
    emettre(true);

    expect(quand).not.toHaveBeenCalled();
    expect(mockEcouteurs.size).toBe(0);
  });

  it("se désabonne sans lever quand on le fait deux fois", () => {
    const stop = surRetourReseau(jest.fn());
    stop();
    expect(() => stop()).not.toThrow();
  });

  it("ne voit pas passer une coupure lue comme inconnue", () => {
    // `isConnected: null` ne bloque pas, donc il ne fabrique pas de retour :
    // sinon la sonde qui conclut lancerait un cycle au démarrage.
    const quand = jest.fn();
    surRetourReseau(quand);

    emettre(null);
    emettre(true);

    expect(quand).not.toHaveBeenCalled();
  });
});

describe("useEnLigne", () => {
  /** Rend le booléen du hook, à travers un composant sonde. */
  function lire(): () => string {
    const Sonde = () => React.createElement(Text, null, String(useEnLigne()));
    let rendu!: ReturnType<typeof create>;
    act(() => {
      rendu = create(React.createElement(Sonde));
    });
    return () => rendu.root.findByType(Text).props.children as string;
  }

  it("part optimiste, avant toute réponse de NetInfo", () => {
    expect(lire()()).toBe("true");
  });

  it("ne bloque que sur `isConnected === false`", () => {
    const valeur = lire();
    emettre(false, false);
    expect(valeur()).toBe("false");
    emettre(true, true);
    expect(valeur()).toBe("true");
  });

  it("ne bloque PAS tant que la sonde n'a pas conclu", () => {
    // Connecté, `isInternetReachable` encore `null` : c'est l'état de CHAQUE
    // démarrage. Lire ce champ ferait clignoter le bandeau « hors ligne ».
    const valeur = lire();
    emettre(true, null);
    expect(valeur()).toBe("true");
  });

  it("ne bloque PAS sur une connectivité inconnue", () => {
    const valeur = lire();
    emettre(null, null);
    expect(valeur()).toBe("true");
  });
});
