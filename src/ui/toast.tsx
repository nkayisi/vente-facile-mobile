/**
 * Retours brefs, miroir de `sonner` sur le web (`toast.success` / `toast.error`).
 *
 * Implémentation maison, environ quatre-vingts lignes : les bibliothèques de
 * toast React Native sont soit non maintenues, soit d'ancienne architecture, et
 * le besoin est trivial.
 *
 * **UN TOAST NE REMPLACE JAMAIS LE RETOUR HAPTIQUE.** Au comptoir, dans un
 * marché bruyant, le caissier ne regarde pas l'écran : le refus de stock passe
 * d'abord par la vibration, le toast ne fait que confirmer. C'est déjà la
 * doctrine du plan et elle vaut pour chaque appelant.
 */
import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon, type IconName } from "./icon";
import { Text } from "./text";

type TonToast = "succes" | "erreur" | "info";

const HABILLAGE: Record<TonToast, { fond: string; icone: IconName; couleur: "success" | "destructive" | "foreground" }> = {
  succes: { fond: "border-success/30 bg-success/15", icone: "CheckCircle2", couleur: "success" },
  erreur: { fond: "border-destructive/30 bg-destructive/15", icone: "AlertTriangle", couleur: "destructive" },
  info: { fond: "border-border bg-card", icone: "Info", couleur: "foreground" },
};

interface ApiToast {
  succes: (message: string) => void;
  erreur: (message: string) => void;
  info: (message: string) => void;
}

const Contexte = createContext<ApiToast | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [courant, setCourant] = useState<{ ton: TonToast; message: string } | null>(null);
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();

  const montrer = useCallback((ton: TonToast, message: string) => {
    if (minuteur.current) clearTimeout(minuteur.current);
    setCourant({ ton, message });
    minuteur.current = setTimeout(() => setCourant(null), 3500);
  }, []);

  const api = useMemo<ApiToast>(
    () => ({
      succes: (m) => montrer("succes", m),
      erreur: (m) => montrer("erreur", m),
      info: (m) => montrer("info", m),
    }),
    [montrer]
  );

  const h = courant ? HABILLAGE[courant.ton] : null;

  return (
    <Contexte.Provider value={api}>
      {children}
      {courant && h ? (
        <View
          pointerEvents="none"
          className="absolute inset-x-0 z-50 px-4"
          style={{ top: insets.top + 8 }}
        >
          <View className={`flex-row items-center gap-2 rounded-xl border px-3 py-3 ${h.fond}`}>
            <Icon name={h.icone} size={18} color={h.couleur} />
            <Text variant="bodySmall" className="flex-1">
              {courant.message}
            </Text>
          </View>
        </View>
      ) : null}
    </Contexte.Provider>
  );
}

export function useToast(): ApiToast {
  const ctx = useContext(Contexte);
  if (!ctx) throw new Error("useToast doit être appelé sous <ToastProvider>.");
  return ctx;
}
