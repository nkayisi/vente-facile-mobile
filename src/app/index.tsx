/**
 * Écran de vérification du socle, temporaire.
 *
 * Il prouve sur l'appareil, avant qu'on construise quoi que ce soit dessus, que
 * les quatre fondations tiennent : les jetons et les deux thèmes, le noyau
 * partagé avec le web, la base locale migrée, et la réactivité des requêtes.
 * Il sert aussi de planche de référence du design system : on l'ouvre pour
 * vérifier un contraste ou une cible tactile sans traverser l'application.
 *
 * Il disparaît au lot 1, remplacé par l'aiguillage de session.
 */
import { useEffect } from "react";
import { View } from "react-native";
import { useLiveQuery } from "drizzle-orm/expo-sqlite";

import { formatPackagedSplit, formatPrice, getPackaging } from "@vente-facile/core";
import { db } from "@/db/client";
import { localSettings } from "@/db/schema";
import {
  Badge,
  Banner,
  Button,
  Card,
  CardHeader,
  Divider,
  EmptyState,
  IconButton,
  ListItem,
  Screen,
  Section,
  SkeletonList,
  Text,
  useTheme,
} from "@/ui";

const casier = getPackaging({
  selling_mode: "wholesale_and_retail",
  units_per_package: 12,
  unit_name: "bouteille",
  packaging_unit_name: "casier",
});

const COMPTEUR = "socle.compteur";

function Swatch({ label, className }: { label: string; className: string }) {
  return (
    <View className="mr-2 mb-2 items-center">
      <View className={`h-11 w-11 rounded-lg border border-border ${className}`} />
      <Text variant="caption" className="mt-1">
        {label}
      </Text>
    </View>
  );
}

export default function Socle() {
  const { scheme } = useTheme();
  const { data } = useLiveQuery(db.select().from(localSettings));
  const compteur = Number(data?.find((r) => r.key === COMPTEUR)?.value ?? "0");

  useEffect(() => {
    void db
      .insert(localSettings)
      .values({ key: COMPTEUR, value: "0" })
      .onConflictDoNothing();
  }, []);

  const incrementer = () =>
    void db
      .insert(localSettings)
      .values({ key: COMPTEUR, value: String(compteur + 1) })
      .onConflictDoUpdate({
        target: localSettings.key,
        set: { value: String(compteur + 1), updatedAt: new Date() },
      });

  return (
    <Screen scroll>
      <View className="mb-5 flex-row items-start justify-between">
        <View className="flex-1">
          <Text variant="h1">Vente Facile</Text>
          <Text variant="muted">
            Socle vérifié, thème {scheme === "dark" ? "sombre" : "clair"}.
          </Text>
        </View>
        <IconButton name="sync" label="Synchroniser" onPress={() => {}} />
      </View>

      <View className="mb-4">
        <Banner
          tone="warning"
          title="Hors ligne"
          message="12 opérations en attente. Elles partiront à la reconnexion."
        />
      </View>

      <Section title="Noyau partagé avec le web">
        <Card>
          <ListItem title="formatPrice" value={formatPrice(1250036.4)} />
          <Divider />
          <ListItem
            title="Coca-Cola 50 cl"
            subtitle="Stock du rayon"
            value={formatPackagedSplit(casier, 3, 27)}
          />
        </Card>
      </Section>

      <Section title="Base locale et réactivité">
        <Card>
          <CardHeader
            title="Compteur"
            subtitle={`${data?.length ?? 0} réglage(s) en base`}
            right={<Badge tone="success">{String(compteur)}</Badge>}
          />
          <Button fullWidth leftIcon="add" onPress={incrementer}>
            Incrémenter et relire
          </Button>
        </Card>
      </Section>

      <Section title="Boutons">
        <View className="flex-row flex-wrap gap-2">
          <Button size="sm">Primaire</Button>
          <Button size="sm" variant="secondary">Secondaire</Button>
          <Button size="sm" variant="outline">Contour</Button>
          <Button size="sm" variant="destructive">Annuler</Button>
          <Button size="sm" loading>Envoi</Button>
        </View>
      </Section>

      <Section title="Pastilles">
        <View className="flex-row flex-wrap gap-2">
          <Badge>Brouillon</Badge>
          <Badge tone="primary">En attente</Badge>
          <Badge tone="success">Terminée</Badge>
          <Badge tone="warning">Partiel</Badge>
          <Badge tone="destructive">Annulée</Badge>
        </View>
      </Section>

      <Section title="Jetons de couleur">
        <View className="flex-row flex-wrap">
          <Swatch label="primary" className="bg-primary" />
          <Swatch label="15 %" className="bg-primary/15" />
          <Swatch label="accent" className="bg-accent" />
          <Swatch label="muted" className="bg-muted" />
          <Swatch label="success" className="bg-success" />
          <Swatch label="warning" className="bg-warning" />
          <Swatch label="destruct." className="bg-destructive" />
        </View>
      </Section>

      <Section title="Chargement">
        <Card className="p-0 overflow-hidden">
          <SkeletonList rows={2} />
        </Card>
      </Section>

      <Section title="État vide">
        <Card>
          <EmptyState
            icon="cart-outline"
            title="Panier vide"
            message="Scannez un code-barres ou cherchez un article pour commencer."
            action={{ label: "Scanner", onPress: () => {} }}
          />
        </Card>
      </Section>
    </Screen>
  );
}
