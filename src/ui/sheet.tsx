/**
 * Feuille basse.
 *
 * Les `Dialog sm:max-w-md` du back-office deviennent ici des feuilles : c'est
 * la doctrine du plan, « feuilles basses plutôt que modales centrées ».
 *
 * L'implémentation s'appuie sur `@gorhom/bottom-sheet`, mais **derrière notre
 * propre API**. C'est elle qui compte : si le paquet devenait un problème, on
 * réécrit le corps sans toucher aux appelants.
 *
 * `BottomSheetModalProvider` est monté UNE SEULE FOIS, dans `app/_layout.tsx`.
 *
 * Le clavier : `Screen` pose déjà un `KeyboardAvoidingView` et gorhom a le sien.
 * Les deux ensemble font sauter la feuille ; celle-ci vit en portail, donc hors
 * du `KeyboardAvoidingView` de l'écran, et c'est `keyboardBehavior` qui décide.
 */
import { useCallback, useEffect, useRef } from "react";
import { View } from "react-native";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";

import { Text } from "./text";
import { useColor } from "./theme";

export function Sheet({
  ouvert,
  onFermer,
  titre,
  children,
}: {
  ouvert: boolean;
  onFermer: () => void;
  titre?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<BottomSheetModal>(null);
  const card = useColor("card");
  const border = useColor("border");
  const muted = useColor("mutedForeground");

  useEffect(() => {
    if (ouvert) ref.current?.present();
    else ref.current?.dismiss();
  }, [ouvert]);

  const fond = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} pressBehavior="close" />
    ),
    []
  );

  return (
    <BottomSheetModal
      ref={ref}
      onDismiss={onFermer}
      enableDynamicSizing
      keyboardBehavior="interactive"
      backdropComponent={fond}
      backgroundStyle={{ backgroundColor: card }}
      handleIndicatorStyle={{ backgroundColor: muted }}
      style={{ borderTopWidth: 1, borderColor: border }}
    >
      <BottomSheetView>
        <View className="gap-4 px-4 pb-8 pt-1">
          {titre ? <Text variant="h4">{titre}</Text> : null}
          {children}
        </View>
      </BottomSheetView>
    </BottomSheetModal>
  );
}
