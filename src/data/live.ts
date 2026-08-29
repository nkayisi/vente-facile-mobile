/**
 * Lecture réactive de la base locale.
 *
 * **`useLiveQuery` de Drizzle ne convient pas ici**, et ce n'est pas un
 * caprice : il accepte un CONSTRUCTEUR DE REQUÊTE, pas une fonction asynchrone.
 * Nos lectures ne sont pas des `select` bruts - le catalogue joint trois tables
 * PUIS applique `availableSplit` et `getPackaging` de `@vente-facile/core`, et
 * les ventes devront fusionner la table tirée avec le journal d'opérations.
 * Rien de tout cela n'entre dans un objet de requête.
 *
 * D'où ce hook, bâti sur ce que `enableChangeListener: true` a rendu possible.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { addDatabaseChangeListener } from "expo-sqlite";

export interface Lecture<T> {
  donnees: T | null;
  chargement: boolean;
  erreur: Error | null;
  recharger: () => void;
}

export function useLecture<T>(
  charger: () => Promise<T>,
  options: { tables: string[]; deps?: unknown[] }
): Lecture<T> {
  const { tables, deps = [] } = options;
  const [donnees, setDonnees] = useState<T | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<Error | null>(null);
  const vivant = useRef(true);
  const chargerRef = useRef(charger);
  chargerRef.current = charger;

  const lire = useCallback(() => {
    setChargement(true);
    chargerRef
      .current()
      .then((r) => {
        if (!vivant.current) return;
        setDonnees(r);
        setErreur(null);
      })
      .catch((e: unknown) => {
        if (!vivant.current) return;
        setErreur(e instanceof Error ? e : new Error(String(e)));
      })
      .finally(() => {
        if (vivant.current) setChargement(false);
      });
  }, []);

  useEffect(() => {
    vivant.current = true;
    lire();
    return () => {
      vivant.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    // Débounce à 150 ms : un tirage insère par lots, et sans cela la requête
    // repartirait à chaque lot. Sur une première synchronisation de plusieurs
    // milliers de produits, la liste clignoterait pendant deux minutes.
    let minuteur: ReturnType<typeof setTimeout> | null = null;
    const abo = addDatabaseChangeListener((ev) => {
      if (!tables.includes(ev.tableName)) return;
      if (minuteur) clearTimeout(minuteur);
      minuteur = setTimeout(lire, 150);
    });
    return () => {
      if (minuteur) clearTimeout(minuteur);
      abo.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tables.join(","), lire]);

  return { donnees, chargement, erreur, recharger: lire };
}
