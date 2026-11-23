/**
 * Combien de feuilles et de dialogues sont ouverts en ce moment.
 *
 * Le lecteur de codes du comptoir s'arrête dès qu'il y en a un : le web fait
 * pareil (`!showPaymentDialog && !showCustomerDialog && …`). Un code scanné
 * pendant l'encaissement n'est pas un article à ajouter, et il ne doit pas
 * ouvrir une saisie de quantité PAR-DESSUS la feuille d'encaissement.
 *
 * `Sheet` et `Dialog` s'y inscrivent d'eux-mêmes : une feuille ajoutée demain
 * suspend le lecteur sans qu'on y pense. La saisie de quantité, une `Modal`
 * brute, ne s'inscrit volontairement pas : un re-scan s'y applique (+1).
 */
import { useEffect, useSyncExternalStore } from "react";

let ouvertes = 0;
const abonnes = new Set<() => void>();

function notifier() {
  for (const f of abonnes) f();
}

/** Inscrit une modale ouverte ; rend la fonction qui la retire. */
export function inscrireModale(): () => void {
  ouvertes += 1;
  notifier();
  let retiree = false;
  return () => {
    if (retiree) return;
    retiree = true;
    ouvertes -= 1;
    notifier();
  };
}

export function modaleOuverte(): boolean {
  return ouvertes > 0;
}

function sabonner(f: () => void) {
  abonnes.add(f);
  return () => {
    abonnes.delete(f);
  };
}

/** Inscrit la modale tant qu'elle est ouverte. */
export function useInscrireModale(ouvert: boolean) {
  useEffect(() => (ouvert ? inscrireModale() : undefined), [ouvert]);
}

/** Vrai tant qu'une feuille ou un dialogue est ouvert. */
export function useModaleOuverte(): boolean {
  return useSyncExternalStore(sabonner, modaleOuverte, modaleOuverte);
}
