/**
 * Sur quelle imprimante câblée part le ticket, et ce qu'est une adresse
 * réseau lisible.
 *
 * Ce que ces tests protègent : qu'un terminal dont l'imprimante est branchée en
 * USB (le terminal SDL) imprime sur elle sans réglage, et JAMAIS sur un
 * appareil qu'on ne sait pas être une imprimante.
 */
import { REGLAGE_PAR_DEFAUT, type ReglageImprimante } from "../../reglage";
import {
  analyserAdresseReseau,
  imprimanteDetectee,
  usbRetenue,
  type ImprimanteUsb,
} from "./regles";

const reglage = (patch: Partial<ReglageImprimante> = {}): ReglageImprimante => ({
  ...REGLAGE_PAR_DEFAUT,
  ...patch,
});

const sdl: ImprimanteUsb = {
  cle: "1fc9:2016",
  nom: "Printer USB Printer Port",
  classeImprimante: true,
  autorisee: false,
};
const adaptateurSerie: ImprimanteUsb = {
  cle: "1a86:7523",
  nom: "USB Serial",
  classeImprimante: false,
  autorisee: false,
};

describe("l'imprimante USB détectée", () => {
  it("retient la seule imprimante de classe « imprimante »", () => {
    expect(imprimanteDetectee([adaptateurSerie, sdl])).toBe(sdl);
  });

  it("ne prend JAMAIS d'office un appareil qu'on ne sait pas être une imprimante", () => {
    expect(imprimanteDetectee([adaptateurSerie])).toBeNull();
  });

  it("ne choisit pas entre deux imprimantes", () => {
    expect(imprimanteDetectee([sdl, { ...sdl, cle: "0416:5011" }])).toBeNull();
  });
});

describe("usbRetenue", () => {
  it("sert d'imprimante du terminal quand le réglage est resté sur l'intégrée", () => {
    expect(usbRetenue(reglage(), [sdl])).toEqual({ imprimante: sdl, automatique: true });
  });

  it("sert la machine choisie, même hors classe « imprimante »", () => {
    expect(
      usbRetenue(reglage({ transport: "usb", adresse: "1a86:7523" }), [sdl, adaptateurSerie])
    ).toEqual({ imprimante: adaptateurSerie, automatique: false });
  });

  it("ne sert rien quand la machine choisie n'est pas branchée", () => {
    expect(usbRetenue(reglage({ transport: "usb", adresse: "0416:5011" }), [sdl])).toBeNull();
  });

  it("ne remplace jamais une imprimante Bluetooth ou réseau choisie", () => {
    // Le marchand a désigné une autre machine : le ticket ne sort pas ailleurs
    // sans qu'il le sache.
    expect(usbRetenue(reglage({ transport: "bluetooth", adresse: "AA:BB" }), [sdl])).toBeNull();
    expect(usbRetenue(reglage({ transport: "reseau", adresse: "10.0.0.5:9100" }), [sdl])).toBeNull();
  });
});

describe("analyserAdresseReseau", () => {
  it("lit une adresse IP, avec ou sans port", () => {
    expect(analyserAdresseReseau(" 192.168.1.50 ")).toEqual({ ok: true, hote: "192.168.1.50", port: 9100 });
    expect(analyserAdresseReseau("192.168.1.50:9101")).toEqual({ ok: true, hote: "192.168.1.50", port: 9101 });
  });

  it("lit un nom d'hôte", () => {
    expect(analyserAdresseReseau("imprimante-caisse.local")).toEqual({
      ok: true,
      hote: "imprimante-caisse.local",
      port: 9100,
    });
  });

  it.each([
    ["", "vide"],
    ["192.168.1.300", "un nombre au-delà de 255"],
    ["192.168.1", "trois nombres"],
    ["192.168.1.50:", "un port vide"],
    ["192.168.1.50:99999", "un port hors bornes"],
    ["192.168.1.50:abc", "un port en lettres"],
    ["imprimante caisse", "un espace"],
  ])("refuse %p (%s), en nommant le motif", (saisie) => {
    const r = analyserAdresseReseau(saisie);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motif.length).toBeGreaterThan(10);
  });
});
