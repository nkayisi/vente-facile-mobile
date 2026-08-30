/**
 * Les appareils enrôlés de l'établissement.
 *
 * **Le marchand doit pouvoir reconnaître SON parc**, et surtout repérer un
 * terminal qu'il ne reconnaît plus. La base locale d'un terminal n'est PAS
 * chiffrée : un appareil volé livre son fichier SQLite, et la seule défense
 * est la révocation - qui se fait au back-office, parce qu'un terminal perdu
 * ne doit pas pouvoir révoquer les autres.
 *
 * Le CODE de l'appareil est ce qui se lit sur les tickets qu'il a imprimés
 * (`VT-20260830-K7QM-0042`) : c'est par lui qu'on relie un papier à une caisse.
 */
import { useCallback } from "react";
import { View } from "react-native";
import { formatDateTimeFr } from "@vente-facile/core";

import { listeAppareils, type Appareil } from "@/data/administration";
import { useLecture } from "@/data/live";
import { useSession } from "@/session/provider";
import {
  AppBar, Badge, Banner, DataList, DataRow, Screen, Text,
} from "@/ui";

const TABLES = ["devices"];

export default function ParcAppareils() {
  const { snapshot } = useSession();
  const code = snapshot?.device?.device_code ?? null;

  const charger = useCallback(() => listeAppareils(code), [code]);
  const { donnees, chargement } = useLecture(charger, { tables: TABLES, deps: [code] });
  const appareils = donnees ?? [];

  const rendu = (a: Appareil) => {
    const expire =
      a.expireLe != null && a.expireLe.getTime() < Date.now();
    return (
      <DataRow
        principal={a.nom}
        secondaire={[a.code, a.modele, a.versionApp].filter(Boolean).join(" · ")}
        icon="Cpu"
        badge={
          a.courant ? (
            <Badge tone="primary">Ce terminal</Badge>
          ) : a.revoqueLe ? (
            <Badge tone="destructive">Révoqué</Badge>
          ) : expire ? (
            <Badge tone="warning">Session expirée</Badge>
          ) : undefined
        }
        sousValeur={
          // `null` ne se lit pas comme « jamais vu » : un appareil enrôlé et
          // pas encore utilisé n'a pas de dernière visite.
          a.vuLe ? `Vu ${formatDateTimeFr(a.vuLe)}` : "Jamais utilisé"
        }
        chevron={false}
      />
    );
  };

  return (
    <Screen padded={false}>
      <AppBar title="Appareils" subtitle="Terminaux enrôlés sur cet établissement" />
      <DataList
        donnees={appareils}
        cle={(a) => a.id}
        rendu={rendu}
        enTete={
          <View className="px-4 pb-3 pt-2">
            <Banner
              tone="info"
              title="La révocation se fait au back-office"
              message="Un terminal perdu ne doit pas pouvoir révoquer les autres. La base locale n'étant pas chiffrée, révoquer un appareil volé est la seule défense."
            />
          </View>
        }
        chargement={chargement && appareils.length === 0}
        vide={{
          icon: "Cpu",
          titre: "Aucun appareil",
          message: "Les terminaux enrôlés apparaîtront ici.",
        }}
      />
    </Screen>
  );
}
