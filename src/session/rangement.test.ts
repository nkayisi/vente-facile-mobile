/**
 * Le repli du Keystore.
 *
 * Sur une carte Rockchip rk3568, le Keymaster du système plante et toute
 * écriture au Keystore échoue jusqu'au redémarrage : le marchand ne pouvait
 * plus se connecter. Ces cas tiennent la règle qui fait passer le secret au
 * stockage privé SANS jamais rendre une valeur périmée.
 */
import {
  creerRangement,
  MESSAGE_RANGEMENT_IMPOSSIBLE,
  type Coffre,
  type CoffreDeRepli,
} from "./rangement";

function coffre(): Coffre & { carte: Map<string, string>; panne: boolean } {
  const carte = new Map<string, string>();
  const c = {
    carte,
    panne: false,
    async lire(cle: string) {
      if (c.panne) throw new Error("Keystore operation failed");
      return carte.get(cle) ?? null;
    },
    async ecrire(cle: string, valeur: string) {
      if (c.panne) throw new Error("Keystore operation failed");
      carte.set(cle, valeur);
    },
    async effacer(cle: string) {
      if (c.panne) throw new Error("Keystore operation failed");
      carte.delete(cle);
    },
  };
  return c;
}

function repli(): CoffreDeRepli & { carte: Map<string, string>; estActif: boolean; panne: boolean } {
  const carte = new Map<string, string>();
  const r = {
    carte,
    estActif: false,
    panne: false,
    async lire(cle: string) {
      return carte.get(cle) ?? null;
    },
    async ecrire(cle: string, valeur: string) {
      if (r.panne) throw new Error("disque plein");
      carte.set(cle, valeur);
    },
    async effacer(cle: string) {
      carte.delete(cle);
    },
    async actif() {
      return r.estActif;
    },
    async activer() {
      if (r.panne) throw new Error("disque plein");
      r.estActif = true;
    },
    async vider() {
      carte.clear();
      r.estActif = false;
    },
  };
  return r;
}

function monter() {
  const sur = coffre();
  const rep = repli();
  const bascules: unknown[] = [];
  const rangement = creerRangement({
    sur,
    repli: rep,
    signalerBascule: (e) => bascules.push(e),
  });
  return { sur, rep, bascules, rangement };
}

describe("Keystore en état de marche", () => {
  it("écrit au Keystore, et le repli reste éteint et vide", async () => {
    const { sur, rep, bascules, rangement } = monter();
    await rangement.ecrire("vf.access_token", "A1");

    expect(sur.carte.get("vf.access_token")).toBe("A1");
    expect(rep.carte.size).toBe(0);
    expect(rep.estActif).toBe(false);
    expect(bascules).toHaveLength(0);
    expect(await rangement.lire("vf.access_token")).toBe("A1");
  });
});

describe("Keystore en panne", () => {
  it("la connexion aboutit : le secret passe au repli", async () => {
    const { sur, rep, bascules, rangement } = monter();
    sur.panne = true;

    await rangement.ecrire("vf.access_token", "A1");

    expect(rep.estActif).toBe(true);
    expect(rep.carte.get("vf.access_token")).toBe("A1");
    expect(await rangement.lire("vf.access_token")).toBe("A1");
    expect(bascules).toHaveLength(1);
  });

  it("une fois le repli actif, une rotation n'y laisse jamais l'ANCIEN jeton", async () => {
    const { sur, rangement } = monter();
    sur.panne = true;
    await rangement.ecrire("vf.refresh_token", "R1");

    // Le Keystore remarche (le terminal a redémarré, par exemple). Si la
    // rotation partait au Keystore, le repli garderait R1, que le serveur a mis
    // sur liste noire, et la lecture le rendrait en premier.
    sur.panne = false;
    await rangement.ecrire("vf.refresh_token", "R2");

    expect(await rangement.lire("vf.refresh_token")).toBe("R2");
    expect(sur.carte.has("vf.refresh_token")).toBe(false);
  });

  it("une paire écrite à cheval sur la bascule se relit entière", async () => {
    const { sur, rangement } = monter();
    await rangement.ecrire("vf.access_token", "A1");
    sur.panne = true;
    await rangement.ecrire("vf.refresh_token", "R1");
    sur.panne = false;

    expect(await rangement.lire("vf.access_token")).toBe("A1");
    expect(await rangement.lire("vf.refresh_token")).toBe("R1");
  });

  it("le repli prime sur une copie plus ancienne restée au Keystore", async () => {
    const { sur, rep, rangement } = monter();
    sur.carte.set("vf.device_token", "ANCIEN");
    rep.estActif = true;
    rep.carte.set("vf.device_token", "RECENT");

    expect(await rangement.lire("vf.device_token")).toBe("RECENT");
  });

  it("un Keystore illisible rend null, il ne lève pas", async () => {
    const { sur, rangement } = monter();
    sur.carte.set("vf.access_token", "A1");
    sur.panne = true;

    expect(await rangement.lire("vf.access_token")).toBeNull();
  });

  it("si le repli refuse aussi, l'erreur est une PHRASE, pas le message natif", async () => {
    const { sur, rep, rangement } = monter();
    sur.panne = true;
    rep.panne = true;

    await expect(rangement.ecrire("vf.access_token", "A1")).rejects.toThrow(
      MESSAGE_RANGEMENT_IMPOSSIBLE
    );
  });
});

describe("effacement et déconnexion", () => {
  it("effacer retire la clé des deux coffres", async () => {
    const { sur, rep, rangement } = monter();
    sur.carte.set("vf.access_token", "A1");
    rep.carte.set("vf.access_token", "A2");

    await rangement.effacer("vf.access_token");

    expect(await rangement.lire("vf.access_token")).toBeNull();
  });

  it("effacer ne lève pas quand le Keystore est en panne", async () => {
    const { sur, rangement } = monter();
    sur.panne = true;
    await expect(rangement.effacer("vf.access_token")).resolves.toBeUndefined();
  });

  it("après la déconnexion, la connexion suivante retente le Keystore", async () => {
    const { sur, rep, rangement } = monter();
    sur.panne = true;
    await rangement.ecrire("vf.access_token", "A1");
    expect(rep.estActif).toBe(true);

    await rangement.reinitialiser();
    sur.panne = false;
    await rangement.ecrire("vf.access_token", "A2");

    expect(rep.estActif).toBe(false);
    expect(sur.carte.get("vf.access_token")).toBe("A2");
  });
});
