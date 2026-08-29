/**
 * Boîte de dialogue CENTRÉE.
 *
 * C'est la seule exception à la doctrine « feuille basse », et elle est
 * justifiée : une décision destructive doit INTERROMPRE, pas glisser.
 *
 * Elle remplace les `Alert.alert` de React Native, qui ignorent le thème
 * sombre, ignorent la police, ne savent pas afficher un montant en chiffres
 * tabulaires, et dont le bouton destructif n'est rouge que sur iOS. Une
 * confirmation d'annulation de vente ne peut pas être le seul écran de
 * l'application à ne pas ressembler à l'application.
 *
 * L'ordre des boutons suit le web en rendu étroit (`flex-col-reverse`) :
 * **l'action principale est EN HAUT**, « Annuler » dessous.
 */
import { Modal, View } from "react-native";

import { Button } from "./button";
import { Text } from "./text";

export function Dialog({
  ouvert,
  onFermer,
  titre,
  description,
  children,
  actions,
}: {
  ouvert: boolean;
  onFermer: () => void;
  titre: string;
  description?: string;
  children?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <Modal visible={ouvert} transparent animationType="fade" onRequestClose={onFermer}>
      {/* Le voile lit un jeton : `bg-black/50` resterait noir en thème sombre
          alors que le fond, lui, aurait changé. */}
      <View className="flex-1 items-center justify-center bg-foreground/50 px-4">
        <View className="w-full max-w-md gap-4 rounded-xl border border-border bg-card p-6">
          {/* Titre et description CENTRÉS, comme le `text-center sm:text-left`
              du web en rendu étroit. */}
          <View className="gap-1">
            <Text variant="h4" className="text-center">
              {titre}
            </Text>
            {description ? (
              <Text variant="muted" className="text-center">
                {description}
              </Text>
            ) : null}
          </View>
          {children}
          {actions ? <View className="gap-2">{actions}</View> : null}
        </View>
      </View>
    </Modal>
  );
}

export function AlertDialog({
  ouvert,
  titre,
  message,
  confirmer,
  annuler = "Annuler",
  destructif = false,
  onConfirmer,
  onAnnuler,
  enCours = false,
}: {
  ouvert: boolean;
  titre: string;
  message?: string;
  confirmer: string;
  annuler?: string;
  destructif?: boolean;
  onConfirmer: () => void;
  onAnnuler: () => void;
  enCours?: boolean;
}) {
  return (
    <Dialog
      ouvert={ouvert}
      onFermer={onAnnuler}
      titre={titre}
      description={message}
      actions={
        <>
          <Button
            fullWidth
            variant={destructif ? "destructive" : "primary"}
            loading={enCours}
            onPress={onConfirmer}
          >
            {confirmer}
          </Button>
          <Button fullWidth variant="outline" onPress={onAnnuler} disabled={enCours}>
            {annuler}
          </Button>
        </>
      }
    />
  );
}
