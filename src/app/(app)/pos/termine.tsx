/**
 * Vente enregistrée.
 *
 * Cet écran existe pour UNE information : la monnaie à rendre. Le caissier a
 * une main sur le tiroir et un client en face ; il ne doit pas avoir à revenir
 * en arrière pour relire un chiffre.
 *
 * La vente est en file, pas envoyée. On le dit sans dramatiser : c'est le
 * fonctionnement normal de l'application, pas une panne.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { Banner, Button, Icon, Screen, Text } from "@/ui";
import { usePanier } from "@/features/pos/panier";
import { imprimerDocument } from "@/printing/jobs";

export default function Termine() {
  const { reference, monnaie, devise, credit, ticket } = useLocalSearchParams<{
    reference: string;
    monnaie: string;
    devise: string;
    credit: string;
    ticket?: string;
  }>();
  const { argent } = usePanier();
  const aRendre = Number(monnaie) || 0;

  const [impression, setImpression] = useState<"encours" | "faite" | "echec" | null>(null);
  const [motif, setMotif] = useState<string | null>(null);
  // Verrou synchrone : deux appuis rapprochés sortiraient deux tickets, dont le
  // second marqué DUPLICATA pour rien.
  const verrou = useRef(false);

  const lancerImpression = useCallback(async () => {
    if (!ticket || verrou.current) return;
    verrou.current = true;
    setImpression("encours");
    setMotif(null);
    try {
      await imprimerDocument(ticket);
      setImpression("faite");
    } catch (e) {
      // L'échec d'impression n'annule RIEN : la vente est en file, le stock est
      // sorti, l'argent est au tiroir. On le dit sans dramatiser et on laisse
      // réessayer, parce que la cause est presque toujours un rouleau vide.
      setImpression("echec");
      setMotif(e instanceof Error ? e.message : "L'impression a échoué.");
    } finally {
      verrou.current = false;
    }
  }, [ticket]);

  // Le ticket part TOUT SEUL : au comptoir, un client attend son papier, et
  // lui demander d'appuyer sur un bouton de plus est une seconde de trop à
  // chaque vente de la journée.
  useEffect(() => {
    void lancerImpression();
  }, [lancerImpression]);

  return (
    <Screen>
      <View className="flex-1 items-center justify-center px-4">
        <View className="h-20 w-20 items-center justify-center rounded-full bg-success/15">
          <Icon name="Check" size={40} color="success" />
        </View>

        <Text variant="h2" className="mt-6 text-center">
          {credit ? "Vente à crédit enregistrée" : "Vente enregistrée"}
        </Text>
        <Text variant="muted" className="mt-1 text-center">
          {reference}
        </Text>

        {aRendre > 0 ? (
          <View className="mt-8 w-full items-center rounded-2xl bg-primary/10 py-8">
            <Text variant="body" className="text-muted-foreground">
              Monnaie à rendre
            </Text>
            <Text variant="h1" className="mt-2 text-primary">
              {argent(aRendre, devise)}
            </Text>
          </View>
        ) : null}

        <Text variant="bodySmall" className="mt-8 text-center text-muted-foreground">
          Elle part au prochain passage du réseau. Rien n'est perdu si vous
          fermez l'application.
        </Text>
      </View>

      <View className="mb-8 gap-3">
        {impression === "echec" ? (
          <Banner
            tone="warning"
            title="Ticket non imprimé"
            message={`${motif ?? ""} La vente est enregistrée : vérifiez le papier, puis réimprimez.`}
          />
        ) : null}

        {ticket ? (
          <Button
            variant={impression === "echec" ? "primary" : "secondary"}
            onPress={() => void lancerImpression()}
            disabled={impression === "encours"}
            fullWidth
          >
            {impression === "encours"
              ? "Impression…"
              : impression === "faite"
                ? "Réimprimer (duplicata)"
                : "Imprimer le reçu"}
          </Button>
        ) : null}

        <Button onPress={() => router.replace("/pos")} fullWidth>
          Nouvelle vente
        </Button>
        <Button variant="ghost" onPress={() => router.replace("/")} fullWidth>
          Quitter le comptoir
        </Button>
      </View>
    </Screen>
  );
}
