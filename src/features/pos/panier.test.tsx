/**
 * Le fournisseur du panier, et la seule chose qu'un test sans écran peut y
 * attraper : la STABILITÉ de ce qu'il expose.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ L'ÉCRAN D'ENCAISSEMENT TOURNAIT EN BOUCLE, SANS RIEN MONTRER.           │
 * │                                                                          │
 * │ Il rafraîchit le client à l'arrivée, par un effet qui DÉPEND de          │
 * │ `rafraichirClient`. Fabriquée dans le `useMemo` de la valeur du          │
 * │ contexte, cette fonction changeait d'identité à chaque recalcul des      │
 * │ totaux ; or l'appeler recalcule les totaux, `detteEnAttente` rendant     │
 * │ une carte NEUVE à chaque lecture. L'effet se relançait donc sans fin,    │
 * │ deux requêtes SQLite par tour, tant que l'écran restait ouvert - sur le  │
 * │ seul écran où le caissier a un client devant lui.                        │
 * │                                                                          │
 * │ Rien ne se voyait : pas d'erreur, pas de clignotement, pas de journal.   │
 * │ Seul un téléphone qui chauffe et une batterie qui tombe. C'est pourquoi  │
 * │ ce défaut ne peut être attrapé qu'ici.                                   │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import { useEffect } from "react";
import { act, create } from "react-test-renderer";

/** Chaque lecture rend une carte NEUVE : c'est le vrai comportement du module. */
jest.mock("./reserve-locale", () => ({
  detteEnAttente: jest.fn(async () => new Map<string, number>()),
}));
jest.mock("./donnees", () => ({ pointsDuClient: jest.fn(async () => 0) }));
jest.mock("@/session/provider", () => ({ useSession: () => ({ snapshot: null }) }));

import { PanierProvider, usePanier } from "./panier";

/** Vide la file des micro-tâches, comme le ferait un tour de boucle réel. */
async function tourner(fois: number) {
  for (let i = 0; i < fois; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

describe("rafraichirClient", () => {
  it("garde la MÊME identité d'un rendu à l'autre", async () => {
    const vues: (() => void)[] = [];

    function Temoin() {
      vues.push(usePanier().rafraichirClient);
      return null;
    }

    await act(async () => {
      create(
        <PanierProvider>
          <Temoin />
        </PanierProvider>
      );
    });
    await tourner(3);

    expect(vues.length).toBeGreaterThan(1);
    // Une seule identité sur toute la vie du composant : c'est elle que les
    // effets d'écran prennent en dépendance.
    expect(new Set(vues).size).toBe(1);
  });

  it("ne se rappelle pas lui-même quand un effet en dépend", async () => {
    let appels = 0;

    function Encaissement() {
      const { rafraichirClient } = usePanier();
      // Miroir exact du `useFocusEffect` de l'écran d'encaissement.
      useEffect(() => {
        appels += 1;
        // Sans cette borne, le défaut d'origine ne fait pas ÉCHOUER le test :
        // il le fait tourner sans fin, et `act` ne rend jamais la main. Un
        // échec nommé vaut mieux qu'une expiration de délai.
        if (appels > 5) {
          throw new Error(
            `Boucle de rendu : l'effet est reparti ${appels} fois. ` +
              "`rafraichirClient` change d'identité à chaque recalcul des totaux."
          );
        }
        rafraichirClient();
      }, [rafraichirClient]);
      return null;
    }

    await act(async () => {
      create(
        <PanierProvider>
          <Encaissement />
        </PanierProvider>
      );
    });
    // Chaque tour laisse la lecture asynchrone se poser : sur le code d'origine
    // elle repose une carte neuve, qui relance l'effet, qui relance la lecture.
    await tourner(5);

    expect(appels).toBe(1);
  });
});
