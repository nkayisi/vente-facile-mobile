/**
 * Gestion des utilisateurs. Miroir de `app/dashboard/users/page.tsx`.
 *
 * **Limite connue, et elle est structurelle** : la table `users` n'est PAS au
 * manifeste de tirage. `memberships` ne porte que `user_id`, le rôle et les
 * permissions supplémentaires - ni nom, ni e-mail, ni téléphone. On rend donc
 * ce que le terminal SAIT (le nombre de membres, la répartition par rôle) et on
 * dit franchement ce qui manque, plutôt que d'afficher une liste d'identifiants.
 *
 * Conséquence backend à porter au lot 10 : ajouter `users` (allégée) au
 * manifeste. C'est noté ici parce que c'est ici qu'on s'en aperçoit.
 */
import { View } from "react-native";
import { ROLE_LABELS, type Role } from "@vente-facile/core";

import { db } from "@/db/client";
import { memberships } from "@/db/schema";
import { useLecture } from "@/data/live";
import {
  Badge,
  Banner,
  Card,
  CarteReleve,
  Divider,
  Icon,
  ListItem,
  PageHeader,
  Screen,
  StatValue,
  Text,
} from "@/ui";

async function repartitionRoles(): Promise<{ total: number; actifs: number; parRole: [string, number][] }> {
  const lignes = await db.select().from(memberships);
  const m = new Map<string, number>();
  for (const l of lignes) m.set(l.role, (m.get(l.role) ?? 0) + 1);
  return {
    total: lignes.length,
    actifs: lignes.filter((l) => l.isActive).length,
    parRole: [...m.entries()].sort((a, b) => b[1] - a[1]),
  };
}

export default function Utilisateurs() {
  const { donnees: r } = useLecture(repartitionRoles, { tables: ["memberships"] });

  return (
    <Screen scroll edges={[]}>
      <PageHeader
        title="Gestion des utilisateurs"
        subtitle="Gérez les membres de votre organisation et leurs rôles"
      />

      <View className="mt-4 flex-row flex-wrap gap-4">
        <CarteReleve
          label="Total membres"
          icone={
            <View className="h-9 w-9 items-center justify-center rounded-lg bg-chart-2/15">
              <Icon name="Users" size={18} color="chart2" />
            </View>
          }
        >
          <StatValue value={String(r?.total ?? 0)} />
        </CarteReleve>
        <CarteReleve
          label="Actifs"
          icone={
            <View className="h-9 w-9 items-center justify-center rounded-lg bg-success/15">
              <Icon name="CheckCircle2" size={18} color="success" />
            </View>
          }
        >
          <StatValue value={String(r?.actifs ?? 0)} tone="success" />
        </CarteReleve>
      </View>

      <View className="mt-6">
        <Text variant="h4" className="mb-3">
          Répartition par rôle
        </Text>
        <Card className="overflow-hidden p-0">
          {(r?.parRole ?? []).map(([role, n], i) => (
            <View key={role}>
              {i > 0 ? <Divider inset /> : null}
              <ListItem
                title={ROLE_LABELS[role as Role] ?? role}
                icon="UserCog"
                value={String(n)}
              />
            </View>
          ))}
        </Card>
      </View>

      <View className="mt-6">
        <Banner
          tone="info"
          title="Noms et permissions individuelles"
          message="Le terminal ne synchronise pas encore l'identité des membres : la table « users » n'est pas au manifeste de tirage. La liste nominative, les rôles et les permissions individuelles arrivent au lot 10."
        />
      </View>
    </Screen>
  );
}
