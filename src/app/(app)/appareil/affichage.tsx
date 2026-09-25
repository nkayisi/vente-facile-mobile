/**
 * Le relevé des marges système, à lire sur l'appareil qui pose problème.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ IL MESURE. C'EST TOUT SON INTÉRÊT, ET C'EST TOUJOURS VRAI.              │
 * │                                                                          │
 * │ Un marchand rapporte que la barre de son téléphone recouvre les éléments │
 * │ du bas. Mesuré sur l'émulateur - navigation par gestes, marge de 24      │
 * │ points, Android 16 - le défaut ne s'y reproduit pas : `Screen` pose bien │
 * │ la marge, et la barre d'onglets aussi. Reste une hypothèse, et une seule │
 * │ qui explique « sur CERTAINS téléphones » : la marge est rapportée à ZÉRO │
 * │ alors que le système dessine bien une barre. Cet écran la met en         │
 * │ évidence ou l'écarte.                                                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ DEUX LIGNES, ET C'EST LEUR ÉCART QUI RENSEIGNE. « Marge annoncée » est ce
 * que le système dit ; « marge posée » est ce que l'application en fait. Elles
 * ne diffèrent que dans le cas `marge_absente`, et c'est ce qui distingue, sur
 * la capture d'un marchand, « le système ment » de « on n'a pas compensé ».
 *
 * ⚠ IL PASSE PAR `useMargesSysteme` COMME TOUT LE MONDE. Il ne lit plus les
 * hooks bruts : le hook expose `brut` et `fenetre` précisément pour qu'il n'ait
 * pas à le faire, ce qui permet à la règle « une seule main » de n'avoir AUCUNE
 * exception. Il ne POSE toujours rien : il affiche.
 */
import { useCallback, useState } from "react";
import { Platform, View } from "react-native";
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
  Segmented,
  Text,
  useMargesSysteme,
} from "@/ui";
import { LIBELLES, type Verdict } from "@/features/diagnostic/marge-basse";
import { forcerVerdict, useVerdictForce } from "@/features/diagnostic/simulation";

/** Deux décimales au plus : une marge est un nombre de points, pas une mesure. */
const pt = (n: number): string => `${Math.round(n * 100) / 100} pt`;

const SIMULATIONS: { valeur: Verdict | "reel"; label: string }[] = [
  { valeur: "reel", label: "Réel" },
  { valeur: "conforme", label: "Conforme" },
  { valeur: "fenetre_inseree", label: "Insérée" },
  { valeur: "marge_absente", label: "Le défaut" },
];

export default function Affichage() {
  const m = useMargesSysteme();
  const force = useVerdictForce();
  const [copie, setCopie] = useState(false);

  const l = LIBELLES[m.verdict];
  const compense = m.bas !== m.brut.bottom;

  // Le texte plutôt que la capture : un relevé se recopie dans un message,
  // une capture se relit à la loupe.
  const releve = [
    `verdict        ${m.verdict}${force ? " (SIMULÉ)" : ""}`,
    `marge annoncée bas ${m.brut.bottom} / haut ${m.brut.top} / g ${m.brut.left} / d ${m.brut.right}`,
    `marge posée    bas ${m.bas}`,
    `frame          ${m.fenetre.largeur} x ${m.fenetre.hauteur}`,
    `screen         ${m.ecran.largeur} x ${m.ecran.hauteur}`,
    `barre onglets  ${HAUTEUR_ONGLETS} + ${m.bas} = ${HAUTEUR_ONGLETS + m.bas}`,
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
          tone={m.verdict === "marge_absente" ? (compense ? "warning" : "destructive") : "success"}
          // ⚠ LE MARQUEUR N'EST PAS DÉCORATIF. En simulation, « marge annoncée »
          // reste la VRAIE valeur du système - c'est ce qu'elle doit être - et
          // elle contredit alors le sous-titre « le système n'annonçait rien ».
          // Sans le dire, on lirait un faux diagnostic sur sa propre capture.
          title={`${
            m.verdict === "marge_absente" && compense
              ? "Compensé par l'application"
              : l.titre
          }${force ? " (simulé)" : ""}`}
          message={
            m.verdict === "marge_absente" && compense
              ? `${l.detail} L'application réserve elle-même ${pt(m.bas)} en bas.`
              : l.detail
          }
        />

        <Section title="Marges en bas">
          <Card className="overflow-hidden p-0">
            {/* Les DEUX lignes, l'une sous l'autre : c'est leur écart qui dit
                si le système ment, et le lecteur doit le voir de l'oeil. */}
            <ListItem
              title="Annoncée par le système"
              icon="Ruler"
              value={pt(m.brut.bottom)}
            />
            <Divider inset />
            <ListItem
              title="Posée par l'application"
              value={pt(m.bas)}
              valueTone={compense ? "success" : "muted"}
              subtitle={compense ? "Plancher appliqué : le système n'annonçait rien" : undefined}
            />
          </Card>
        </Section>

        <Section title="Autres marges annoncées">
          <Card className="overflow-hidden p-0">
            <ListItem title="En haut" value={pt(m.brut.top)} />
            <Divider inset />
            <ListItem title="À gauche" value={pt(m.brut.left)} />
            <Divider inset />
            <ListItem title="À droite" value={pt(m.brut.right)} />
          </Card>
        </Section>

        <Section title="Dimensions">
          <Card className="overflow-hidden p-0">
            {/* Les DEUX hauteurs, l'une sous l'autre : c'est leur écart qui
                tranche, et le lecteur doit pouvoir le faire de l'oeil. */}
            <ListItem
              title="Fenêtre de l'application"
              icon="Smartphone"
              value={`${Math.round(m.fenetre.largeur)} × ${Math.round(m.fenetre.hauteur)}`}
            />
            <Divider inset />
            <ListItem
              title="Écran physique"
              icon="Monitor"
              value={`${Math.round(m.ecran.largeur)} × ${Math.round(m.ecran.hauteur)}`}
            />
            <Divider inset />
            <ListItem
              title="Écart de hauteur"
              value={pt(m.ecran.hauteur - m.fenetre.hauteur)}
              valueTone={m.verdict === "fenetre_inseree" ? "success" : "muted"}
            />
          </Card>
        </Section>

        <Section title="Barre d'onglets">
          <Card className="overflow-hidden p-0">
            <ListItem
              title="Hauteur totale"
              icon="LayoutDashboard"
              value={pt(HAUTEUR_ONGLETS + m.bas)}
              subtitle={`${HAUTEUR_ONGLETS} de barre, plus la marge posée`}
            />
            <Divider inset />
            <ListItem
              title="Plateforme"
              value={`${Platform.OS} ${String(Platform.Version)}`}
            />
          </Card>
        </Section>

        {/* ┌──────────────────────────────────────────────────────────────────┐
            │ L'INTERRUPTEUR N'EXISTE QU'EN DÉVELOPPEMENT.                    │
            │                                                                  │
            │ `marge_absente` ne se produit sur aucun émulateur : sans lui, le │
            │ chemin qui pose le plancher ne serait jamais regardé. Il         │
            │ fabrique des MESURES, jamais un verdict - voir `simulation.ts`.  │
            └──────────────────────────────────────────────────────────────────┘ */}
        {__DEV__ ? (
          <Section title="Simuler un verdict (développement)">
            <Card className="overflow-hidden p-0">
              <Segmented
                options={SIMULATIONS}
                valeur={force ?? "reel"}
                onChange={(v) => forcerVerdict(v === "reel" ? null : v)}
              />
            </Card>
          </Section>
        ) : null}

        <Button
          fullWidth
          size="lg"
          variant={copie ? "secondary" : "primary"}
          leftIcon={copie ? "Check" : "ClipboardList"}
          onPress={copier}
        >
          {copie ? "Relevé copié" : "Copier le relevé"}
        </Button>

        {/* La bande de contrôle : si la barre du système la recouvre, le défaut
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
