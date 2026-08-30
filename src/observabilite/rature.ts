/**
 * Ce qui ne doit jamais sortir du terminal dans un rapport de plantage.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ MODULE PUR, SANS AUCUN IMPORT DU SDK.                                    │
 * │                                                                          │
 * │ C'est délibéré : importer `@sentry/react-native` depuis un test le fait  │
 * │ démarrer, et Jest se plaint alors d'une poignée restée ouverte. Une      │
 * │ fonction d'expression régulière n'a aucune raison de traîner un module   │
 * │ natif derrière elle.                                                     │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
/**
 * Les ratures elles-mêmes.
 *
 * On rature sur la CHAÎNE rendue, pas sur des champs nommés : un message
 * d'erreur porte souvent la donnée en clair (« Client Nelly Kayisi
 * +243997876765 : solde insuffisant »), et aucune liste de champs n'attrape
 * cela.
 */
const RATURES: { motif: RegExp; par: string }[] = [
  // Téléphones congolais et internationaux : +243 997 876 765, 0997876765.
  { motif: /\+?\d[\d\s().-]{7,}\d/g, par: "[numéro]" },
  { motif: /[\w.+-]+@[\w-]+\.[\w.]+/g, par: "[courriel]" },
  // Jetons : « Bearer eyJ… », et les UUID, qui désignent un client précis.
  { motif: /Bearer\s+[\w.\-]+/gi, par: "Bearer [jeton]" },
  {
    motif: /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
    par: "[id]",
  },
];

/**
 * Rature récursivement les chaînes d'une structure, sans en changer la forme.
 *
 * La signature est `unknown -> unknown` À DESSEIN : un générique se ferait
 * rétrécir en `T & string` dans la branche des chaînes, et le compilateur
 * refuserait de rendre la version raturée. Les deux appelants savent ce qu'ils
 * ont passé et le redisent, ce qui est plus honnête qu'un générique qui ment.
 */
export function raturer(valeur: unknown, profondeur = 0): unknown {
  // Une structure profonde est soit un cycle, soit du bruit : on s'arrête.
  if (profondeur > 6) return valeur;
  if (typeof valeur === "string") {
    let sortie = valeur;
    for (const r of RATURES) sortie = sortie.replace(r.motif, r.par);
    return sortie;
  }
  if (Array.isArray(valeur)) {
    return valeur.map((v) => raturer(v, profondeur + 1));
  }
  if (valeur && typeof valeur === "object") {
    const sortie: Record<string, unknown> = {};
    for (const [cle, v] of Object.entries(valeur)) {
      sortie[cle] = raturer(v, profondeur + 1);
    }
    return sortie;
  }
  return valeur;
}

