/**
 * Application des migrations au démarrage.
 *
 * Le journal est embarqué dans le bundle (`drizzle/migrations.js`) : il n'y a
 * pas de fichier à lire sur le disque, donc rien qui puisse manquer sur un
 * appareil hors ligne.
 *
 * Une migration qui échoue est un état dont on ne se relève pas tout seul :
 * on l'affiche en clair plutôt que de laisser l'application démarrer sur une
 * base à moitié transformée, où une vente s'écrirait dans un schéma faux.
 */
import type { ReactNode } from "react";
import { View } from "react-native";
import { useMigrations } from "drizzle-orm/expo-sqlite/migrator";

import { Text } from "@/ui/text";

import { db } from "./client";
import migrations from "../../drizzle/migrations";

export function DatabaseProvider({ children }: { children: ReactNode }) {
  const { success, error } = useMigrations(db, migrations);

  if (error) {
    return (
      <View className="flex-1 items-center justify-center bg-background p-6">
        <Text variant="h4" className="mb-2 text-center">
          La base locale n'a pas pu être préparée
        </Text>
        <Text variant="muted" className="text-center">
          {error.message}
        </Text>
        <Text variant="caption" className="mt-4 text-center">
          Vos données ne sont pas perdues. Signalez ce message au support avant
          de réinstaller l'application.
        </Text>
      </View>
    );
  }

  // Sans écran d'attente : la migration d'une base déjà à jour est immédiate,
  // et afficher une roue pour trois millisecondes fait clignoter le démarrage.
  if (!success) return null;

  return <>{children}</>;
}
