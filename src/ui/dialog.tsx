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
import { useMargesSysteme } from "./zone-sure";

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
  const marges = useMargesSysteme();

  return (
    <Modal
      visible={ouvert}
      transparent
      animationType="fade"
      onRequestClose={onFermer}
      // ┌──────────────────────────────────────────────────────────────────┐
      // │ LES DEUX PROPS SONT INERTES AUJOURD'HUI, ET ON LES ÉCRIT QUAND   │
      // │ MÊME.                                                            │
      // │                                                                  │
      // │ `ReactModalHostView.kt` force leurs deux getters à `true` dès que │
      // │ le bord-à-bord est actif, et il l'est : `edgeToEdgeEnabled=true`  │
      // │ dans `gradle.properties`, que le prebuild pose. Mais ce fichier   │
      // │ est GITIGNORÉ - le dépôt ne le contrôle pas et ne peut pas le     │
      // │ garder. Le jour où une version d'Expo le repasserait à `false`,   │
      // │ la fenêtre de dialogue serait insérée par le système et la marge  │
      // │ qu'on pose ici deviendrait une DOUBLE marge. Écrites, elles       │
      // │ rendent la géométrie indépendante de ce drapeau.                  │
      // │                                                                  │
      // │ ⚠ `Modal.js` impose de poser les deux ensemble ou aucune :        │
      // │ `navigationBarTranslucent` seul est refusé en développement.      │
      // └──────────────────────────────────────────────────────────────────┘
      statusBarTranslucent
      navigationBarTranslucent
    >
      {/* Le voile lit un jeton : `bg-black/50` resterait noir en thème sombre
          alors que le fond, lui, aurait changé. */}
      <View
        className="flex-1 items-center justify-center bg-foreground/50 px-4"
        // ┌────────────────────────────────────────────────────────────────┐
        // │ UNE MODALE EST RENDUE HORS DE L'ARBRE DE `Screen`.            │
        // │                                                                │
        // │ Personne ne pose donc sa zone sûre, et c'est pourquoi          │
        // │ `dialog.tsx` rejoint `sheet.tsx` dans la liste des exceptions   │
        // │ NOMMÉES du garde-fou « un seul propriétaire par bord ». Un     │
        // │ dialogue court est centré, donc sans danger ; un dialogue assez │
        // │ haut pour remplir l'écran touchait les deux bords, et son       │
        // │ dernier bouton - l'action principale, qui est EN HAUT de la     │
        // │ pile mais en bas de l'écran - passait sous la barre gestuelle.  │
        // │                                                                │
        // │ ⚠ CE N'EST QUE LA MOITIÉ DU REMÈDE, et la moitié sans risque.  │
        // │ La carte ne DÉFILE toujours pas : un contenu plus haut que     │
        // │ l'espace disponible déborde encore. Y mettre un défilement      │
        // │ toucherait une vingtaine d'appelants sans qu'aucun défaut ne    │
        // │ soit constaté sur l'un d'eux - à faire le jour où l'on en tient │
        // │ un, pas avant.                                                  │
        // └────────────────────────────────────────────────────────────────┘
        style={{
          paddingTop: marges.haut + 16,
          paddingBottom: marges.bas + 16,
        }}
      >
        <View
          className="w-full max-w-md gap-4 rounded-xl border border-border bg-card p-6"
          // En React Native, `flexShrink` vaut ZÉRO par défaut - le contraire
          // du navigateur. Sans cette ligne, la carte ignore purement et
          // simplement le rembourrage ci-dessus et déborde quand même.
          style={{ flexShrink: 1 }}
        >
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
