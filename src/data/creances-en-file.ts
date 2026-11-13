/**
 * Les ventes à crédit encore dans le journal : lecture pour l'écran des créances.
 *
 * La règle (ce qu'on compte, comment on ventile) vit dans
 * `features/creances/en-file.ts`, PUR et testé ; ici, on lit seulement.
 */
import { referencesDejaTirees } from "@/data/deja-tirees";
import type { ContexteFile, FiltrePerimetre } from "@/features/perimetre/filtre-perimetre";
import { resumerCreditsEnFile, type CreditsEnFile } from "@/features/creances/en-file";
import { retientVenteEnFile } from "@/features/tableau-de-bord/en-file";
import { ventesEnAttenteDetaillees } from "@/features/ventes/attente";

export async function creditsEnFile(
  perimetre: FiltrePerimetre,
  file: ContexteFile
): Promise<CreditsEnFile> {
  const toutes = await ventesEnAttenteDetaillees();
  // Le même filtre de périmètre que le tableau de bord et l'historique : une
  // vente en file d'un autre dépôt n'a rien à faire sous un filtre de dépôt.
  const credits = toutes.filter(
    (v) =>
      (v.corps as { sale_type?: string }).sale_type === "credit" &&
      retientVenteEnFile(v, perimetre, file)
  );
  if (credits.length === 0) return resumerCreditsEnFile([]);

  // ⚠ Une vente déjà ramenée par le tirage est appliquée côté serveur : la
  //   balance âgée la compte déjà. La compter ici aussi la ferait paraître
  //   deux fois le temps que le journal se vide.
  const dejaTirees = await referencesDejaTirees(credits.map((v) => v.reference));
  return resumerCreditsEnFile(
    credits
      .filter((v) => !dejaTirees.has(v.reference))
      .map((v) => ({
        reference: v.reference,
        client: v.client,
        resteAPayer: v.devise ? v.resteAPayer : null,
        devise: v.devise,
        envoi: v.envoi,
      }))
  );
}
