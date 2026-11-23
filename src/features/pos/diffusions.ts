/**
 * Les lecteurs intégrés qui envoient le code par MESSAGE système plutôt qu'en
 * le « tapant » comme un clavier.
 *
 * Chaque marque diffuse le code lu sous sa propre action Android, avec sa
 * propre clé. Le module natif (`modules/lecteur-codes`) écoute les actions de
 * cette table pendant que le comptoir est ouvert, et un code reçu est un scan
 * COMPLET : il n'a pas de rafale à reconnaître.
 *
 * ⚠ AUCUNE N'A ÉTÉ VÉRIFIÉE SUR SON TERMINAL : ce sont les réglages d'usine
 * documentés par les fabricants. Le terminal SDL du marchand lit en mode
 * clavier, et c'est le seul qui ait été éprouvé. Un terminal absent de la
 * table se règle en mode clavier (« sortie clavier », « keyboard wedge »).
 */
export interface Diffusion {
  marque: string;
  action: string;
  /** La clé de l'extra qui porte le code (chaîne, ou octets UTF-8). */
  cle: string;
}

export const DIFFUSIONS: readonly Diffusion[] = [
  { marque: "Sunmi", action: "com.sunmi.scanner.ACTION_DATA_CODE_RECEIVED", cle: "data" },
  { marque: "Urovo", action: "android.intent.ACTION_DECODE_DATA", cle: "barcode_string" },
  { marque: "Newland", action: "nlscan.action.SCANNER_RESULT", cle: "SCAN_BARCODE1" },
  { marque: "iData", action: "android.intent.action.SCANRESULT", cle: "value" },
  { marque: "Chainway", action: "com.scanner.broadcast", cle: "data" },
  { marque: "Seuic", action: "com.android.server.scannerservice.broadcast", cle: "scannerdata" },
];

/** Ce que le module natif reçoit : l'action et la clé, rien d'autre. */
export function diffusionsPourLeModule(
  table: readonly Diffusion[] = DIFFUSIONS
): { action: string; cle: string }[] {
  return table.map(({ action, cle }) => ({ action, cle }));
}
