/**
 * Le réglage de l'imprimante, et les règles qui le rendent lisible.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ MODULE PUR, ET C'EST OBLIGATOIRE.                                       │
 * │                                                                          │
 * │ `preferences.ts` importe `@/db/client`, qui OUVRE la base SQLite au      │
 * │ chargement : une règle écrite là-bas ne serait pas éprouvable sans       │
 * │ appareil. Or celle-ci décide de ce qu'on ira chercher dans la table des  │
 * │ pilotes, et une valeur inconnue y rend `undefined` : la première         │
 * │ impression planterait, sur le terminal d'un marchand.                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * | Transport   | Matériel visé                                              |
 * | ----------- | ---------------------------------------------------------- |
 * | `embedded`  | imprimante intégrée d'un terminal de caisse (NYX, Sunmi…)  |
 * | `bluetooth` | toute imprimante sans fil, profil série (SPP) OU basse      |
 * |             | consommation (GATT). Le PROTOCOLE n'est pas un choix du     |
 * |             | marchand : il est relevé quand il désigne sa machine.       |
 * | `pdf`       | repli universel : iOS, appareil sans imprimante, envoi      |
 */
import { DENSITE_PAR_DEFAUT } from "./densite";

export type TransportId = "embedded" | "bluetooth" | "pdf";

/** L'ordre de la cascade, et la seule liste des transports qui existe. */
export const TRANSPORTS: readonly TransportId[] = ["embedded", "bluetooth", "pdf"];

/**
 * Comment on parle à une imprimante sans fil.
 *
 * `spp` ouvre une socket série et avale des octets ; `gatt` écrit dans une
 * caractéristique, par paquets bornés au MTU. Le marchand ne voit jamais ces
 * deux mots : il choisit une machine, et c'est cette machine qui décide.
 */
export type LienBluetooth = "spp" | "gatt";

/** Ce que `transport` valait avant que les deux Bluetooth ne soient fondus. */
const ANCIEN_BLE = "ble";

export interface ReglageImprimante {
  transport: TransportId;
  /**
   * Le lien de l'imprimante retenue. Posé au CHOIX de l'appareil, JAMAIS deviné
   * au moment d'imprimer : c'est tout l'objet de la fusion des deux options.
   */
  lien?: LienBluetooth;
  /** Adresse MAC en profil série, identifiant système en basse consommation. */
  adresse?: string;
  nom?: string;
  paperWidth: 58 | 80;
  /** Faux sur une imprimante sans massicot : la commande de coupe l'ignorerait
   *  au mieux, ferait avancer le papier de dix centimètres au pire. */
  cut: boolean;
  /**
   * N'envoyer que du TEXTE à l'imprimante sans fil, plutôt que la page dessinée.
   *
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ MODE DE SECOURS, ET IL EST NOMMÉ PLUTÔT QUE DEVINÉ.                 │
   * │                                                                      │
   * │ Le ticket part en image (`GS v 0`), pour qu'il soit le même document │
   * │ sur toute imprimante. Une machine très ancienne peut ne connaître     │
   * │ que le mode « colonne » (`ESC *`), et l'on ne peut pas le détecter :  │
   * │ elle n'en dit rien, elle imprime du charabia. Le marchand, lui, le    │
   * │ voit sur son papier. On lui donne donc l'interrupteur au lieu de      │
   * │ deviner un défaut qu'aucune machine du parc n'a montré.               │
   * │                                                                      │
   * │ ⚠ Le repli texte est un AUTRE document : pas de bandeau en vidéo     │
   * │ inversée, pas de hiérarchie de police, accents retirés. C'est le prix │
   * │ à payer pour qu'un ticket sorte quand même.                           │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  texteSimple?: boolean;
  /**
   * Noirceur de chaque point de chauffe, sur l'imprimante INTÉGRÉE.
   *
   * ⚠ ELLE SE RÈGLE, ELLE NE SE DEVINE PAS. Un papier bon marché bave à densité
   * trop haute et la tête s'use plus vite ; personne ne peut trancher depuis un
   * bureau. D'où le réglage à l'écran et la règle de calibration, qui porte la
   * valeur employée pour qu'une photo se rattache à un essai.
   */
  densite: number;
}

export const REGLAGE_PAR_DEFAUT: ReglageImprimante = {
  // `embedded` par défaut, et non `pdf` : un terminal de caisse porte presque
  // toujours son imprimante, et le premier ticket doit sortir sans réglage.
  // La cascade retombe de toute façon sur le PDF si rien ne répond.
  transport: "embedded",
  paperWidth: 58,
  cut: true,
  densite: DENSITE_PAR_DEFAUT,
};

function estTransport(v: unknown): v is TransportId {
  return typeof v === "string" && (TRANSPORTS as readonly string[]).includes(v);
}

function lireTransport(v: unknown): TransportId {
  // La migration : `ble` était un transport à lui seul, il devient un lien.
  if (v === ANCIEN_BLE) return "bluetooth";
  return estTransport(v) ? v : REGLAGE_PAR_DEFAUT.transport;
}

function lireLien(transportBrut: unknown, lienBrut: unknown): LienBluetooth {
  if (lienBrut === "spp" || lienBrut === "gatt") return lienBrut;
  // Avant la fusion, `ble` désignait le GATT et `bluetooth` le profil série :
  // un réglage d'alors n'a pas de `lien`, mais son transport le dit.
  return transportBrut === ANCIEN_BLE ? "gatt" : "spp";
}

function lireTexte(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

/**
 * Un réglage lisible, quoi qu'il y ait en base.
 *
 * ⚠ CE N'EST PAS QU'UNE MIGRATION. Elle traite `ble`, mais aussi une écriture
 * tronquée, un réglage écrit à la main, ou une valeur d'une version future. La
 * garantie tenue est étroite et suffit : `transport` est TOUJOURS membre de
 * `TRANSPORTS`. La recherche du pilote reste néanmoins totale de son côté - la
 * lecture et la recherche vivent dans deux modules, et le second n'a pas à
 * faire confiance au premier.
 */
export function normaliserReglage(brut: unknown): ReglageImprimante {
  if (!brut || typeof brut !== "object" || Array.isArray(brut)) return REGLAGE_PAR_DEFAUT;
  const o = brut as Record<string, unknown>;

  const transport = lireTransport(o.transport);
  const base: ReglageImprimante = {
    transport,
    paperWidth: o.paperWidth === 80 ? 80 : 58,
    cut: typeof o.cut === "boolean" ? o.cut : REGLAGE_PAR_DEFAUT.cut,
    densite:
      typeof o.densite === "number" && Number.isFinite(o.densite)
        ? o.densite
        : DENSITE_PAR_DEFAUT,
  };

  // Absent vaut faux : la page dessinée est le chemin ordinaire, le texte est
  // le secours. Ne poser la clé que si elle est vraie garde les réglages
  // existants strictement identiques en base.
  if (o.texteSimple === true) base.texteSimple = true;

  // Hors Bluetooth, l'appareil retenu ne désigne plus rien. Le garder ferait
  // ressortir une adresse oubliée au prochain passage en Bluetooth, sur une
  // imprimante dont le marchand ne se souvient pas.
  if (transport !== "bluetooth") return base;

  // Sans machine, ni le lien ni le nom ne désignent quoi que ce soit : les
  // trois se posent ensemble, quand le marchand choisit dans la liste.
  const adresse = lireTexte(o.adresse);
  if (!adresse) return base;

  return {
    ...base,
    adresse,
    nom: lireTexte(o.nom),
    lien: lireLien(o.transport, o.lien),
  };
}

/**
 * Le transport, tel qu'un marchand le lit.
 *
 * Le journal d'impression garde la valeur BRUTE, `ble` d'avant la fusion
 * compris : une valeur inconnue se rend telle quelle plutôt que de se taire,
 * mais aucun identifiant technique ne doit atteindre un écran par défaut.
 */
export function libelleTransport(id: string): string {
  switch (id) {
    case "embedded":
      return "imprimante du terminal";
    case "bluetooth":
    case ANCIEN_BLE:
      return "Bluetooth";
    case "pdf":
      return "PDF";
    default:
      return id;
  }
}
