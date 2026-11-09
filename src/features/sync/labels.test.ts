/**
 * Toute table tirée porte un nom FRANÇAIS sur l'écran de synchronisation.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UNE TABLE SANS LIBELLÉ S'AFFICHE SOUS SON CODE TECHNIQUE.               │
 * │                                                                          │
 * │ « loyalty_transactions : 1 200 / 1 200 » ne dit rien à un commerçant, et │
 * │ rien ne le signale - pas d'erreur, pas de journal, juste une ligne       │
 * │ illisible au milieu de trente-neuf lisibles. C'est le défaut que         │
 * │ `KIND_LABELS` a déjà payé, « les vingt-six autres actes s'affichaient    │
 * │ sous leur code technique sur l'écran même où le marchand doit décider ». │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ IL BALAIE LE SCHÉMA, PAS UNE LISTE RECOPIÉE : `pulled.ts` est ENGENDRÉ, et
 * une table ajoutée au manifeste demain tombe ici le jour où elle arrive.
 */
import { TABLE_LABELS } from "./labels";
import { tablesTirees } from "@/db/tables";

describe("les libellés de tables", () => {
  it("balaient réellement quelque chose", () => {
    // Un balayage qui ne balaie rien passe au vert et ne prouve rien.
    expect(tablesTirees().length).toBeGreaterThan(30);
  });

  it("couvrent chaque table tirée", () => {
    const sansLibelle = tablesTirees().filter((t) => !TABLE_LABELS[t]);
    expect(sansLibelle).toEqual([]);
  });
});
