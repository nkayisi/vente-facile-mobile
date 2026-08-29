/**
 * Déclarations pour `@point-of-sale/receipt-printer-encoder`, qui n'en publie pas.
 *
 * Volontairement RÉDUIT À CE QUE NOUS APPELONS. Recopier toute l'API donnerait
 * une surface à maintenir sans contrepartie, et une déclaration trop large ne
 * dit plus rien : elle laisse passer les appels qui n'existent pas. Ce fichier
 * est le contrat que `render-escpos.ts` suppose ; s'il devient faux, la montée
 * de version échoue à la compilation plutôt qu'au comptoir.
 */
declare module "@point-of-sale/receipt-printer-encoder" {
  export interface ReceiptPrinterEncoderOptions {
    printerModel?: string;
    language?: "esc-pos" | "star-prnt" | "star-line";
    /** Largeur du papier en caractères. 42 par défaut, comme notre mesure. */
    columns?: number;
    imageMode?: "column" | "raster";
    feedBeforeCut?: number;
    newline?: "\n" | "\n\r";
    codepageMapping?: string | Record<string, number>;
    codepageCandidates?: string[];
  }

  export default class ReceiptPrinterEncoder {
    constructor(options?: ReceiptPrinterEncoderOptions);

    initialize(): this;
    text(value: string): this;
    newline(count?: number): this;
    line(value: string): this;
    bold(value?: boolean): this;
    underline(value?: boolean): this;
    /** 1 ou 2 : 2 double la largeur ET la hauteur des caractères. */
    size(value: number): this;
    align(position: "left" | "center" | "right"): this;
    rule(options?: { style?: "single" | "double"; width?: number }): this;
    cut(type?: "full" | "partial"): this;
    pulse(device?: number, on?: number, off?: number): this;
    raw(data: number[] | Uint8Array): this;

    /** Termine la file de commandes. Ne s'enchaîne pas. */
    encode(): Uint8Array;
  }
}
