/**
 * Tout appui dans le tiroir le referme. Sans exception.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN MENU QUI RESTE OUVERT SE LIT COMME UN APPUI PERDU.                   │
 * │                                                                          │
 * │ Le tiroir couvre la page ET la barre d'onglets : tant qu'il est là, le   │
 * │ marchand ne voit pas où son geste l'a mené. Trois appuis ne le           │
 * │ refermaient pas - une section hors droits, qui n'avait aucun `onPress` ; │
 * │ la déconnexion ; et toute entrée ajoutée plus tard en oubliant l'appel.  │
 * │ Les deux premiers sont des trous, le troisième est une fatalité si la    │
 * │ fermeture reste à la charge de celui qui écrit la ligne.                 │
 * │                                                                          │
 * │ D'où ce point de passage UNIQUE : un gestionnaire d'appui du tiroir ne   │
 * │ s'écrit plus à la main, il se fabrique. Un test refuse tout `onPress` de │
 * │ `menu-lateral.tsx` qui ne passerait pas par ici.                         │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ LA FERMETURE VIENT D'ABORD, et ce n'est pas un détail de style : si
 * l'action lève - un chemin de navigation invalide, une session déjà expirée -
 * le tiroir doit quand même être refermé. Dans l'autre ordre, une exception
 * laisserait le marchand devant un menu figé par-dessus une application qui,
 * elle, a bougé.
 */
export function fermerPuis(fermer: () => void, action?: () => void): () => void {
  return () => {
    fermer();
    action?.();
  };
}

/**
 * Ce que le bouton RETOUR d'Android doit faire quand le tiroir est ouvert.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ NI LE PAQUET NI LA NAVIGATION NE S'EN CHARGENT.                         │
 * │                                                                          │
 * │ `react-native-drawer-layout` est la PRIMITIVE de react-navigation, pas   │
 * │ son navigateur : vérifié dans sa source, elle ne touche pas à            │
 * │ `BackHandler`. Le navigateur `Drawer`, lui, le ferait - mais nous ne     │
 * │ l'employons pas, le tiroir devant envelopper la barre d'onglets.         │
 * │                                                                          │
 * │ Sans interception, un retour pressé menu ouvert dépile l'écran du        │
 * │ dessous : le marchand revient en arrière ET garde le panneau sur les     │
 * │ bras, par-dessus une page qui, elle, a changé. C'est le seul chemin qui  │
 * │ laissait encore le tiroir ouvert une fois tous les appuis couverts.      │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ ON NE CONSOMME L'ÉVÉNEMENT QUE SI LE TIROIR EST OUVERT. Rendre `true` en
 * toutes circonstances neutraliserait le retour de toute l'application, et sur
 * Android c'est aussi le geste qui permet d'en sortir.
 */
export function retourFermeLeTiroir(ouvert: boolean, fermer: () => void): boolean {
  if (!ouvert) return false;
  fermer();
  return true;
}
