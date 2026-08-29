/**
 * `Block[]` vers HTML, pour `expo-print`.
 *
 * Repli d'iOS, et de tout Android sans imprimante intégrée : le document part
 * en PDF, que le caissier partage ou envoie. La LECTURE reste celle du ticket
 * thermique, colonne étroite et police à chasse fixe comprises, pour qu'un
 * client qui reçoit le PDF et un client qui repart avec le papier tiennent
 * visiblement le même document.
 *
 * Les accents sont CONSERVÉS ici : c'est un rendu vectoriel, pas une page de
 * code d'imprimante. `deaccent` ne s'applique qu'au chemin thermique.
 */
import type { Block, ItemRow } from "@vente-facile/core/receipt";

const echapper = (v: string) =>
  v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function article(item: ItemRow): string {
  return `<div class="art">
    <div class="nom">${echapper(item.name)}</div>
    <div class="row"><span>${echapper(item.quantity)} × ${echapper(item.unitPrice)}</span><span>${echapper(item.total)}</span></div>
    ${item.quantityLabel ? `<div class="sub">${echapper(item.quantityLabel)}</div>` : ""}
    ${item.discountPercentage ? `<div class="sub">Remise : -${item.discountPercentage} %</div>` : ""}
  </div>`;
}

function bloc(block: Block): string {
  switch (block.kind) {
    case "logo":
      return `<img class="logo" src="${block.dataUrl}" />`;
    case "text":
      return `<div class="t ${block.role}${block.align === "center" ? " c" : ""}${
        block.muted ? " muted" : ""
      }${block.italic ? " it" : ""}${block.indent ? " in" : ""}">${echapper(block.text)}</div>`;
    case "band":
      return `<div class="band">${echapper(block.text)}${
        block.sub ? `<div class="bandsub">${echapper(block.sub)}</div>` : ""
      }</div>`;
    case "chip":
      return `<div class="chipwrap"><span class="chip">${echapper(block.text)}</span></div>`;
    case "kv":
      return block.rows
        .map((r) =>
          block.mode === "justified"
            ? `<div class="row${r.strong ? " b" : ""}"><span>${echapper(r.label)}</span><span>${echapper(r.value)}</span></div>`
            : `<div class="t${r.strong ? " b" : ""}">${echapper(r.label)} : ${echapper(r.value)}</div>`
        )
        .join("");
    case "items":
      return block.rows.map(article).join("");
    case "amounts":
      return block.rows
        .map(
          (r) =>
            `<div class="row${r.strong ? " b" : ""}"><span>${echapper(r.label)}</span><span>${echapper(r.value)}</span></div>`
        )
        .join("");
    case "total":
      return `<div class="totlabel">${echapper(block.label)}</div><div class="tot">${echapper(block.value)}</div>`;
    case "rule":
      return `<hr class="${block.weight}" />`;
    case "space":
      return `<div class="sp ${block.size}"></div>`;
  }
}

export function rendreHtml(blocks: Block[], paperWidth: 58 | 80 = 58): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8" />
<style>
  @page { margin: 0; size: ${paperWidth}mm auto; }
  body { margin: 0; padding: 4mm 2.5mm 6mm; width: ${paperWidth}mm;
         font-family: "Courier New", Courier, monospace; font-size: 9pt;
         color: #000; -webkit-text-size-adjust: none; }
  .t { line-height: 1.35; word-wrap: break-word; }
  .c { text-align: center; }
  .b, .band, .tot { font-weight: bold; }
  .muted { color: #444; }
  .it { font-style: italic; }
  .in { padding-left: 3mm; }
  .orgName { font-size: 12pt; font-weight: bold; text-align: center; }
  .legal { font-size: 7pt; }
  .label { font-size: 8pt; }
  .row { display: flex; justify-content: space-between; gap: 3mm; line-height: 1.35; }
  .row span:last-child { white-space: nowrap; }
  .art { margin: 1mm 0; }
  .art .nom { line-height: 1.3; }
  .sub { padding-left: 3mm; font-size: 8pt; }
  /* La vidéo inversée, elle, EXISTE en PDF : le repli à filets du thermique
     est une limite du matériel, pas une intention de mise en page. */
  .band { background: #000; color: #fff; text-align: center; padding: 1mm 0;
          margin: 1.5mm 0; font-size: 10pt; letter-spacing: 0.5px; }
  .bandsub { font-size: 8pt; font-weight: normal; }
  .chipwrap { text-align: center; margin: 1mm 0; }
  .chip { background: #000; color: #fff; padding: 0.5mm 2mm; font-size: 9pt; font-weight: bold; }
  .totlabel { font-size: 8pt; margin-top: 1mm; }
  .tot { font-size: 13pt; text-align: right; }
  hr { border: none; border-top: 1px solid #000; margin: 1mm 0; }
  hr.light { border-top-width: 0.5px; }
  hr.hair { border-top-width: 0.3px; }
  .sp.xs { height: 1mm; } .sp.sm { height: 2mm; }
  .sp.md { height: 3mm; } .sp.lg { height: 5mm; }
  .logo { display: block; margin: 0 auto 2mm; max-height: 12mm; }
</style></head><body>${blocks.map(bloc).join("")}</body></html>`;
}
