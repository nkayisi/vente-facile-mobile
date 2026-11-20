/**
 * Le repli du Keystore : un fichier par secret, dans le stockage privé.
 *
 * Voir `rangement.ts` pour la raison d'être et la règle. Ce module ne fait que
 * brancher `expo-file-system`.
 *
 * ⚠ `Paths.document` et non le cache : le système vide le cache dès que le
 * stockage se tend, et un jeton d'appareil perdu déconnecte le terminal.
 * ⚠ Le dossier n'est PAS dans la base SQLite : la purge de la base suit une
 * liste d'autorisation, et une session n'a rien à y faire. C'est `clearSession`
 * qui le vide, par `reinitialiser`.
 */
import { Directory, File, Paths } from "expo-file-system";

import type { CoffreDeRepli } from "./rangement";

const DOSSIER = "session-repli";
/** Sa présence dit que le repli a pris le relais du Keystore. */
const TEMOIN = ".actif";

function dossier(): Directory {
  return new Directory(Paths.document, DOSSIER);
}

function assurerDossier(): Directory {
  const d = dossier();
  if (!d.exists) d.create({ intermediates: true, idempotent: true });
  return d;
}

export const repliFichier: CoffreDeRepli = {
  async lire(cle) {
    const fichier = new File(dossier(), cle);
    return fichier.exists ? fichier.textSync() : null;
  },

  async ecrire(cle, valeur) {
    new File(assurerDossier(), cle).write(valeur);
  },

  async effacer(cle) {
    const fichier = new File(dossier(), cle);
    if (fichier.exists) fichier.delete();
  },

  async actif() {
    return new File(dossier(), TEMOIN).exists;
  },

  async activer() {
    new File(assurerDossier(), TEMOIN).write("1");
  },

  async vider() {
    const d = dossier();
    if (d.exists) d.delete();
  },
};
