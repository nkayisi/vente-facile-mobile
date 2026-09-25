/**
 * Le verrou de l'appareil, et les cinq verdicts qu'il peut rendre.
 *
 * ⚠ CES TESTS REMPLACENT CEUX DU CODE PIN. L'application ne possède plus de
 * secret : il n'y a plus de hachage à éprouver, plus de compteur d'essais,
 * plus de temporisation à faire survivre au redémarrage. Ce qui reste à tenir
 * est la TRADUCTION de ce que le système répond, et elle a deux propriétés qui
 * ne se voient pas en relisant : « pas de verrou » fait ENTRER, et le blocage
 * ne se distingue pas du blocage définitif.
 */
import * as LocalAuthentication from "expo-local-authentication";

import { appareilVerrouille, deverrouiller, niveauDeVerrou } from "./lock";

const auth = LocalAuthentication as unknown as {
  getEnrolledLevelAsync: jest.Mock;
  authenticateAsync: jest.Mock;
  hasHardwareAsync: jest.Mock;
  isEnrolledAsync: jest.Mock;
  supportedAuthenticationTypesAsync: jest.Mock;
};

beforeEach(() => {
  jest.clearAllMocks();
  auth.getEnrolledLevelAsync.mockResolvedValue(1);
  auth.authenticateAsync.mockResolvedValue({ success: true });
});

describe("le niveau de verrou de l'appareil", () => {
  it("rend ce que le système déclare", async () => {
    auth.getEnrolledLevelAsync.mockResolvedValue(3);
    expect(await niveauDeVerrou()).toBe(3);
    expect(await appareilVerrouille()).toBe(true);
  });

  it("un schéma ou un code suffit : ce n'est pas une affaire de biométrie", async () => {
    // ⚠ LE PIÈGE QUE CE TEST FERME. `isEnrolledAsync()` ne parle QUE de
    // biométrie : un terminal sans lecteur d'empreinte mais protégé par un
    // schéma y rend `false`. S'en remettre à elle ferait passer pour « sans
    // verrou » la configuration la plus répandue du parc visé.
    auth.getEnrolledLevelAsync.mockResolvedValue(1); // SECRET
    auth.isEnrolledAsync.mockResolvedValue(false);
    auth.hasHardwareAsync.mockResolvedValue(false);
    expect(await appareilVerrouille()).toBe(true);
  });

  it("aucun verrou enrôlé", async () => {
    auth.getEnrolledLevelAsync.mockResolvedValue(0);
    expect(await appareilVerrouille()).toBe(false);
  });

  it("une sonde qui lève OUVRE, elle ne ferme pas", async () => {
    // Un appareil incapable de dire s'il a un verrou ne peut pas en honorer
    // un : rendre « verrouillé » par prudence enfermerait le marchand derrière
    // une invitation que le système refusera ensuite d'afficher.
    auth.getEnrolledLevelAsync.mockRejectedValue(new Error("module absent"));
    expect(await niveauDeVerrou()).toBe(0);
    expect(await appareilVerrouille()).toBe(false);
  });
});

describe("déverrouiller", () => {
  it("laisse entrer quand le système a reconnu son propriétaire", async () => {
    expect(await deverrouiller()).toEqual({ statut: "ok" });
  });

  it("n'invite MÊME PAS quand l'appareil n'a pas de verrou", async () => {
    // Le filet anti-enfermement : le marchand a retiré son verrou pendant que
    // l'application était verrouillée. Afficher une invitation qui échouera en
    // `not_enrolled` à chaque appui laisserait l'écran sans aucune issue.
    auth.getEnrolledLevelAsync.mockResolvedValue(0);
    expect(await deverrouiller()).toEqual({ statut: "sans_verrou" });
    expect(auth.authenticateAsync).not.toHaveBeenCalled();
  });

  it("traite un verrou disparu entre la sonde et l'invitation", async () => {
    // La course : la sonde a vu un verrou, le système n'en a plus. Le verdict
    // doit faire ENTRER, pas laisser tourner en rond.
    auth.authenticateAsync.mockResolvedValue({ success: false, error: "not_enrolled" });
    expect(await deverrouiller()).toEqual({ statut: "sans_verrou" });
  });

  it("distingue une annulation d'un échec", async () => {
    for (const motif of ["user_cancel", "app_cancel", "system_cancel", "user_fallback"]) {
      auth.authenticateAsync.mockResolvedValue({ success: false, error: motif });
      expect(await deverrouiller()).toEqual({ statut: "annule" });
    }
  });

  it("le blocage du système est TRANSITOIRE, faute de pouvoir dire le contraire", async () => {
    // ⚠ `lockout_permanent` N'EXISTE PAS. `LocalAuthenticationError` ne le
    // déclare pas, et les deux natifs écrasent le cas permanent sur le
    // transitoire. On ne peut donc pas savoir quand une biométrie est morte
    // pour de bon, et c'est ce qui rend l'issue de secours de l'écran
    // inconditionnelle.
    auth.authenticateAsync.mockResolvedValue({ success: false, error: "lockout" });
    expect(await deverrouiller()).toEqual({ statut: "temporise" });
  });

  it("n'invente ni succès ni verdict quand le module lève", async () => {
    auth.authenticateAsync.mockRejectedValue(new Error("boom"));
    expect(await deverrouiller()).toEqual({ statut: "indisponible", motif: "unknown" });
  });

  it("le repli système n'est JAMAIS désactivé", async () => {
    // C'est tout l'objet du lot : `disableDeviceFallback: true` gardait NOTRE
    // code. Le remettre couperait le code de l'appareil, donc le seul moyen de
    // déverrouiller un terminal sans biométrie.
    await deverrouiller();
    const options = auth.authenticateAsync.mock.calls[0][0];
    expect(options.disableDeviceFallback).toBeUndefined();
  });
});
