/**
 * Gestion des utilisateurs. Miroir de `app/dashboard/users/page.tsx`.
 *
 * **Les membres sont enfin NOMMÉS.** Jusqu'au lot 10, `users` n'était pas au
 * manifeste : l'écran ne pouvait afficher qu'un décompte, parce que
 * `memberships` ne porte que `user_id`, le rôle et les permissions. La table
 * descend désormais, bornée par appartenance et amputée de tout ce qui ne doit
 * pas quitter le serveur.
 *
 * **Le rôle donne des permissions, la liste en donne d'AUTRES.** Les deux se
 * cumulent : un caissier peut recevoir `stock_movements.create` sans devenir
 * magasinier. L'écran montre les supplémentaires, seules à ne pas se déduire du
 * rôle.
 */
import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { ROLE_HIERARCHY, ROLE_LABELS, type Role } from "@vente-facile/core";

import { listeMembres, type Membre } from "@/data/administration";
import { useLecture } from "@/data/live";
import {
  Badge, Banner, Card, CarteReleve, DataList, DataRow, Icon, PageHeader,
  Screen, StatValue, Text,
} from "@/ui";

const TABLES = ["memberships", "users"];

const TON_ROLE: Record<Role, "primary" | "success" | "warning" | "neutral"> = {
  owner: "primary",
  manager: "success",
  stock_keeper: "warning",
  cashier: "neutral",
};

export default function Utilisateurs() {
  const { donnees, chargement } = useLecture(listeMembres, { tables: TABLES });
  const membres = donnees ?? [];

  const parRole = membres.reduce<Record<string, number>>((acc, m) => {
    acc[m.role] = (acc[m.role] ?? 0) + 1;
    return acc;
  }, {});

  const enTete = (
    <View className="gap-4 px-4 pb-3 pt-2">
      <PageHeader
        title="Utilisateurs"
        count={{
          n: membres.length,
          label: membres.length > 1 ? "membres" : "membre",
        }}
      />
      <View className="flex-row flex-wrap gap-4">
        {(Object.keys(ROLE_LABELS) as Role[])
          .sort((a, b) => ROLE_HIERARCHY[b] - ROLE_HIERARCHY[a])
          .map((role) => (
            <CarteReleve
              key={role}
              label={ROLE_LABELS[role]}
              icone={
                <View className="h-9 w-9 items-center justify-center rounded-lg bg-muted">
                  <Icon
                    name={role === "owner" ? "Crown" : "User"}
                    size={18}
                    color="mutedForeground"
                  />
                </View>
              }
            >
              <StatValue value={String(parRole[role] ?? 0)} />
            </CarteReleve>
          ))}
      </View>
      {/* L'INVITATION et la modification d'un rôle restent au back-office :
          elles envoient un e-mail et touchent à qui peut faire quoi. Un
          terminal perdu ne doit pas pouvoir promouvoir son porteur. */}
      <Banner
        tone="info"
        title="Inviter et changer un rôle se fait au back-office"
        message="Ces gestes envoient un e-mail et décident de qui peut faire quoi : ils n'ont pas leur place sur un terminal qui peut être perdu."
      />
    </View>
  );

  const rendu = (m: Membre) => (
    <DataRow
      principal={m.nom}
      secondaire={[m.email, m.telephone].filter(Boolean).join(" · ") || null}
      icon={m.role === "owner" ? "Crown" : "User"}
      badge={
        !m.actif ? (
          <Badge tone="neutral">Inactif</Badge>
        ) : (
          <Badge tone={TON_ROLE[m.role] ?? "neutral"}>{m.roleLabel}</Badge>
        )
      }
      sousValeur={
        m.permissionsSupplementaires.length > 0
          ? `+${m.permissionsSupplementaires.length} permission${m.permissionsSupplementaires.length > 1 ? "s" : ""}`
          : null
      }
      chevron={false}
    />
  );

  return (
    <Screen edges={[]} padded={false}>
      <DataList
        donnees={membres}
        cle={(m) => m.id}
        rendu={rendu}
        enTete={enTete}
        chargement={chargement && membres.length === 0}
        vide={{
          icon: "Users",
          titre: "Aucun membre",
          message: "Les membres de l'établissement apparaîtront ici.",
        }}
      />
    </Screen>
  );
}
