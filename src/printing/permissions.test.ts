import { permissionsRequises, verdict, type PermissionAndroid } from "./permissions";

const SCAN = "android.permission.BLUETOOTH_SCAN" as const;
const CONNECT = "android.permission.BLUETOOTH_CONNECT" as const;
const LOCALISATION = "android.permission.ACCESS_FINE_LOCATION" as const;

describe("permissionsRequises", () => {
  it.each([31, 33, 34, 36])("demande le scan et la connexion sur Android API %i", (api) => {
    expect(permissionsRequises(api)).toEqual([SCAN, CONNECT]);
  });

  it.each([31, 33, 36])("ne demande JAMAIS la localisation sur API %i", (api) => {
    // Le manifeste déclare `neverForLocation` : la demander ferait apparaître
    // une invite de position pour imprimer un ticket.
    expect(permissionsRequises(api)).not.toContain(LOCALISATION);
  });

  it.each([23, 28, 30])("demande la localisation fine sur Android API %i", (api) => {
    // Avant 12, Android l'exigeait pour toute découverte, sans alternative.
    expect(permissionsRequises(api)).toEqual([LOCALISATION]);
  });
});

describe("verdict", () => {
  const requises: PermissionAndroid[] = [SCAN, CONNECT];

  it("accorde quand tout est accordé", () => {
    expect(verdict(requises, { [SCAN]: "granted", [CONNECT]: "granted" })).toEqual({
      etat: "accordees",
    });
  });

  it("nomme ce qui manque sur un refus ordinaire", () => {
    expect(verdict(requises, { [SCAN]: "granted", [CONNECT]: "denied" })).toEqual({
      etat: "refusees",
      manquantes: [CONNECT],
    });
  });

  it("un seul `never_ask_again` l'emporte sur des refus ordinaires", () => {
    // Redemander ne fait alors plus rien : la boîte ne s'ouvre pas, et un
    // bouton « Autoriser » enverrait le marchand appuyer dans le vide.
    const r = verdict(requises, { [SCAN]: "denied", [CONNECT]: "never_ask_again" });
    expect(r.etat).toBe("refusees_definitivement");
  });

  it("une clé absente vaut refus : ne rien répondre n'est pas accorder", () => {
    expect(verdict(requises, { [SCAN]: "granted" })).toEqual({
      etat: "refusees",
      manquantes: [CONNECT],
    });
  });

  it("une réponse vide refuse tout", () => {
    expect(verdict(requises, {})).toMatchObject({ etat: "refusees", manquantes: requises });
  });

  it("ignore une permission accordée qui n'était pas demandée", () => {
    // Le verdict porte sur ce qu'on a demandé, pas sur ce que le système raconte.
    expect(verdict([SCAN], { [SCAN]: "granted", [LOCALISATION]: "denied" })).toEqual({
      etat: "accordees",
    });
  });
});
