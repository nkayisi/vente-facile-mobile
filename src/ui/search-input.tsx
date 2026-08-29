/**
 * Champ de recherche.
 *
 * **Le débounce vit DANS le composant, pas chez l'appelant.** Le web n'en a pas
 * besoin (server actions et transitions React) ; ici chaque frappe déclenche un
 * `LIKE` SQLite sur des milliers de produits. Laissé à l'appelant, vingt écrans
 * l'oublieraient de vingt façons différentes.
 *
 * La valeur affichée est locale et immédiate ; seule la valeur remontée est
 * retardée. Un champ qui rend ses propres frappes en différé paraît cassé.
 */
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";

import { Icon } from "./icon";
import { Input } from "./input";
import { Pressable } from "./pressable";

export function SearchInput({
  valeur,
  onChange,
  placeholder = "Rechercher...",
  debounceMs = 250,
  accessibilityLabel,
}: {
  valeur: string;
  onChange: (v: string) => void;
  placeholder?: string;
  debounceMs?: number;
  accessibilityLabel?: string;
}) {
  const [saisie, setSaisie] = useState(valeur);
  const dernier = useRef(valeur);

  // Remise à niveau quand l'appelant efface les filtres depuis l'extérieur.
  useEffect(() => {
    if (valeur !== dernier.current) {
      dernier.current = valeur;
      setSaisie(valeur);
    }
  }, [valeur]);

  useEffect(() => {
    if (saisie === dernier.current) return;
    const t = setTimeout(() => {
      dernier.current = saisie;
      onChange(saisie);
    }, debounceMs);
    return () => clearTimeout(t);
  }, [saisie, debounceMs, onChange]);

  return (
    <Input
      value={saisie}
      onChangeText={setSaisie}
      placeholder={placeholder}
      accessibilityLabel={accessibilityLabel ?? placeholder}
      autoCorrect={false}
      leading={<Icon name="Search" size={18} color="mutedForeground" />}
      trailing={
        saisie.length > 0 ? (
          <Pressable
            onPress={() => setSaisie("")}
            accessibilityRole="button"
            accessibilityLabel="Effacer la recherche"
            hitSlop={8}
          >
            <Icon name="X" size={18} color="mutedForeground" />
          </Pressable>
        ) : undefined
      }
    />
  );
}

/** Réexporté pour les écrans qui n'ont besoin que du conteneur. */
export function BarreRecherche({ children }: { children: React.ReactNode }) {
  return <View className="flex-row items-center gap-2">{children}</View>;
}
