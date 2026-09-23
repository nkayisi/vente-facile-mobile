/**
 * Le relevé des marges système, à lire sur l'appareil qui pose problème.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ IL MESURE, IL NE CORRIGE RIEN. C'EST TOUT SON INTÉRÊT.                  │
 * │                                                                          │
 * │ Un marchand rapporte que la barre gestuelle de son téléphone recouvre    │
 * │ les éléments du bas. Mesuré sur l'émulateur - navigation par gestes,     │
 * │ marge de 24 points, Android 16 - le défaut ne s'y reproduit pas :        │
 * │ `Screen` pose bien `paddingBottom: insets.bottom`, et la barre d'onglets │
 * │ d'expo-router fait de même de son côté. Le mécanisme est donc juste, et  │
 * │ « corriger » à l'aveugle ajouterait une bande morte sur tous les         │
 * │ appareils qui, eux, fonctionnent.                                        │
 * │                                                                          │
 * │ Reste une hypothèse, et une seule qui explique « sur CERTAINS            │
 * │ téléphones » : la marge est rapportée à ZÉRO alors que le système        │
 * │ dessine bien une barre. Cet écran la met en évidence ou l'écarte.        │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ IL EST DANS `app/`, PAS DANS `ui/`, et c'est ce qui l'autorise à lire les
 * insets. Le garde-fou « un seul propriétaire par bord » ne balaie que
 * `src/ui/`, où `Screen` est seul à poser une marge de contenu. Ici on ne
 * POSE rien : on affiche ce que le système annonce.
 */
import { useCallback, useState } from "react";
import { Dimensions, Platform, View } from "react-native";
import { useSafeAreaFrame, useSafeAreaInsets } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";

import { HAUTEUR_ONGLETS } from "@/navigation/metriques";
import {
  AppBar,
  Banner,
  Button,
  Card,
  Divider,
  ListItem,
  Screen,
  Section,
  Text,
} from "@/ui";
import { LIBELLES, verdict } from "@/features/diagnostic/marge-basse";

/** Deux décimales au plus : une marge est un nombre de points, pas une mesure. */
const pt = (n: number): string => `${Math.round(n * 100) / 100} pt`;

export default function Affichage() {
  const insets = useSafeAreaInsets();
  const frame = useSafeAreaFrame();
  const fenetre = Dimensions.get("window");
  const ecran = Dimensions.get("screen");
  const [copie, setCopie] = useState(false);

  const v = verdict({
    hauteurEcran: ecran.height,
    hauteurFenetre: frame.height,
    margeBasse: insets.bottom,
  });
  const l = LIBELLES[v];

  // Le texte plutôt que la capture : un relevé se recopie dans un message,
  // une capture se relit à la loupe.
  const releve = [
    `verdict        ${v}`,
    `insets         haut ${insets.top} / bas ${insets.bottom} / g ${insets.left} / d ${insets.right}`,
    `frame          ${frame.width} x ${frame.height}`,
    `window         ${fenetre.width} x ${fenetre.height} @${fenetre.scale}`,
    `screen         ${ecran.width} x ${ecran.height} @${ecran.scale}`,
    `barre onglets  ${HAUTEUR_ONGLETS} + ${insets.bottom} = ${HAUTEUR_ONGLETS + insets.bottom}`,
    `plateforme     ${Platform.OS} ${String(Platform.Version)}`,
  ].join("\n");

  const copier = useCallback(() => {
    void Clipboard.setStringAsync(releve);
    setCopie(true);
  }, [releve]);

  return (
    <Screen scroll padded={false}>
      <AppBar title="Diagnostic d'affichage" subtitle="Marges réservées par le système" />

      <View className="gap-4 p-4">
        {/* Le verdict AVANT les chiffres : c'est la seule ligne qui dit s'il y
            a quelque chose à faire, et les nombres ne parlent pas d'eux-mêmes. */}
        <Banner
          tone={v === "marge_absente" ? "destructive" : "success"}
          title={l.titre}
          message={l.detail}
        />

        <Section title="Marges annoncées par le système">
          <Card className="overflow-hidden p-0">
            <ListItem title="En bas" icon="Ruler" value={pt(insets.bottom)} />
            <Divider inset />
            <ListItem title="En haut" value={pt(insets.top)} />
            <Divider inset />
            <ListItem title="À gauche" value={pt(insets.left)} />
            <Divider inset />
            <ListItem title="À droite" value={pt(insets.right)} />
          </Card>
        </Section>

        <Section title="Dimensions">
          <Card className="overflow-hidden p-0">
            {/* Les DEUX hauteurs, l'une sous l'autre : c'est leur écart qui
                tranche, et le lecteur doit pouvoir le faire de l'oeil. */}
            <ListItem
              title="Fenêtre de l'application"
              icon="Smartphone"
              value={`${Math.round(frame.width)} × ${Math.round(frame.height)}`}
            />
            <Divider inset />
            <ListItem
              title="Écran physique"
              icon="Monitor"
              value={`${Math.round(ecran.width)} × ${Math.round(ecran.height)}`}
            />
            <Divider inset />
            <ListItem
              title="Écart de hauteur"
              value={pt(ecran.height - frame.height)}
              valueTone={v === "fenetre_inseree" ? "success" : "muted"}
            />
            <Divider inset />
            <ListItem title="Densité" value={`×${ecran.scale}`} />
          </Card>
        </Section>

        <Section title="Barre d'onglets">
          <Card className="overflow-hidden p-0">
            <ListItem
              title="Hauteur totale"
              icon="LayoutDashboard"
              value={pt(HAUTEUR_ONGLETS + insets.bottom)}
              subtitle={`${HAUTEUR_ONGLETS} de barre, plus la marge du bas`}
            />
            <Divider inset />
            <ListItem
              title="Plateforme"
              value={`${Platform.OS} ${String(Platform.Version)}`}
            />
          </Card>
        </Section>

        <Button
          fullWidth
          size="lg"
          variant={copie ? "secondary" : "primary"}
          leftIcon={copie ? "Check" : "ClipboardList"}
          onPress={copier}
        >
          {copie ? "Relevé copié" : "Copier le relevé"}
        </Button>

        {/* La bande de contrôle : si la barre gestuelle la recouvre, le défaut
            se voit sans lire un seul chiffre. */}
        <View className="rounded-lg border border-dashed border-border p-3">
          <Text variant="caption" className="text-center">
            {"Le bas de ce cadre est la dernière chose que l'écran dessine. La barre du système ne doit pas le recouvrir."}
          </Text>
        </View>
      </View>
    </Screen>
  );
}
