import { estUnePerteDeSession } from "./perte-session";

describe("une session perdue n'est pas une session absente", () => {
  it("sans jeton ni appareil : rien n'est perdu (une déconnexion volontaire)", () => {
    expect(estUnePerteDeSession(false, "no_device")).toBe(false);
  });

  it("avec des jetons refusés et sans appareil : la perte est réelle", () => {
    expect(estUnePerteDeSession(true, "no_device")).toBe(true);
  });

  it("un appareil révoqué est toujours une perte, jetons ou non", () => {
    expect(estUnePerteDeSession(false, "device_not_authorized")).toBe(true);
    expect(estUnePerteDeSession(true, "device_revoked")).toBe(true);
  });
});
