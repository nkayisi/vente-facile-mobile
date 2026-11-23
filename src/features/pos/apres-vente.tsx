/**
 * Après l'encaissement : l'attente du ticket, puis la vente terminée.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE N'EST PLUS UNE PAGE, ET CE N'EST PAS UNE SECONDE MODALE.             │
 * │                                                                          │
 * │ La vente ouvrait `/pos/termine`, un écran de pile poussé HORS des        │
 * │ onglets. Sur une tablette large, la navigation ne se replie en rail que  │
 * │ sur le comptoir : la barre latérale large revenait à chaque vente, et la │
 * │ page glissait depuis la droite pendant que le rail s'élargissait.        │
 * │                                                                          │
 * │ Ces deux panneaux vivent donc DANS la feuille d'encaissement, qui        │
 * │ échange déjà ses panneaux (client, moyen, cagnotte). Une seconde `Modal` │
 * │ par-dessus est proscrite : un voile sur un voile, et deux               │
 * │ `onRequestClose` qui se disputent le bouton retour d'Android.            │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Easing, View } from "react-native";

import { imprimerDocument } from "@/printing/jobs";
import { libelleTransport } from "@/printing";
import {
  Apparition,
  Banner,
  Button,
  Icon,
  Spinner,
  Text,
  useMouvementReduit,
} from "@/ui";

import {
  DELAI_AVANT_CONTINUER_MS,
  libelleBoutonImpression,
  phraseImpression,
  titreDeLaVente,
  type StatutImpression,
  type TransportUtilise,
} from "./apres-vente-libelles";

/** Ce que la vente a laissé : le panier est vidé, ces valeurs ne se relisent plus. */
export interface VenteEnregistree {
  reference: string;
  credit: boolean;
  /** Le total, déjà formaté dans la devise de la feuille. */
  total: string;
  /** Son équivalent dans l'autre devise, `null` sans seconde devise. */
  equivalent: string | null;
  /** La monnaie à rendre, déjà formatée, `null` quand il n'y en a pas. */
  monnaie: string | null;
  /** L'identifiant du document rangé dans `print_jobs`. */
  ticket: string;
}

/**
 * Imprime un ticket rangé, et dit comment cela s'est passé.
 *
 * Verrou SYNCHRONE : deux appuis rapprochés sortiraient deux tickets, dont le
 * second marqué DUPLICATA pour rien.
 */
export function useImpressionTicket() {
  const [statut, setStatut] = useState<StatutImpression | null>(null);
  const [motif, setMotif] = useState<string | null>(null);
  const [transport, setTransport] = useState<TransportUtilise | null>(null);
  const verrou = useRef(false);

  const lancer = useCallback(async (ticket: string) => {
    if (verrou.current) return;
    verrou.current = true;
    setStatut("encours");
    setMotif(null);
    try {
      const id = await imprimerDocument(ticket);
      setTransport({ id, libelle: libelleTransport(id) });
      setStatut("faite");
    } catch (e) {
      // L'échec d'impression n'annule RIEN : la vente est en file, le stock
      // est sorti, l'argent est au tiroir. On le dit sans dramatiser et on
      // laisse réessayer, parce que la cause est presque toujours un rouleau vide.
      setStatut("echec");
      setMotif(e instanceof Error ? e.message : "L'impression a échoué.");
    } finally {
      verrou.current = false;
    }
  }, []);

  return { statut, motif, transport, lancer };
}

/**
 * L'attente du ticket.
 *
 * La monnaie à rendre est DÉJÀ là : le caissier a une main sur le tiroir et un
 * client en face, et il ne doit pas attendre l'imprimante pour rendre.
 */
export function PanneauImpression({
  vente,
  onContinuer,
}: {
  vente: VenteEnregistree;
  onContinuer: () => void;
}) {
  // Le bouton de sortie ne paraît qu'après le délai : avant, il ferait
  // abandonner une impression qui allait aboutir.
  const [patience, setPatience] = useState(false);
  useEffect(() => {
    const minuteur = setTimeout(() => setPatience(true), DELAI_AVANT_CONTINUER_MS);
    return () => clearTimeout(minuteur);
  }, []);

  return (
    <View className="items-center gap-5 py-6">
      <HaloImprimante />
      <View className="items-center gap-1">
        <Text variant="h4" className="text-center">
          Impression du ticket
        </Text>
        <Text variant="muted" className="text-center">
          {vente.reference}
        </Text>
      </View>

      {vente.monnaie ? (
        <View className="w-full items-center rounded-2xl bg-success/10 py-4">
          <Text variant="bodySmall" className="text-muted-foreground">
            Monnaie à rendre
          </Text>
          <Text variant="h2" numeric className="mt-1 text-success">
            {vente.monnaie}
          </Text>
        </View>
      ) : null}

      {patience ? (
        <View className="w-full gap-2">
          <Text variant="caption" className="text-center">
            {"Le ticket tarde à sortir. La vente est enregistrée, l'impression continue."}
          </Text>
          <Button variant="ghost" onPress={onContinuer} fullWidth>
            Continuer sans attendre
          </Button>
        </View>
      ) : null}
    </View>
  );
}

/**
 * Un rond « imprimante » et un halo qui s'en éloigne, en boucle.
 *
 * Sur le fil d'interface (`useNativeDriver`) : le fil JS est occupé à écrire
 * le document au moment exact où l'attente commence. Sous « réduire les
 * animations », le halo ne bouge pas et une roue dit que le travail continue.
 */
function HaloImprimante() {
  const reduit = useMouvementReduit();
  // `useState` d'initialisation paresseuse et non `useRef` : la valeur est LUE
  // au rendu, ce que `react-hooks/refs` interdit pour un ref (même motif que
  // `Apparition`).
  const [pulsation] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (reduit) {
      pulsation.setValue(0);
      return;
    }
    const boucle = Animated.loop(
      Animated.timing(pulsation, {
        toValue: 1,
        duration: 1400,
        // Ce qui s'éloigne ralentit en s'effaçant.
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    );
    boucle.start();
    return () => boucle.stop();
  }, [reduit, pulsation]);

  return (
    <View className="h-28 w-28 items-center justify-center">
      {reduit ? null : (
        <Animated.View
          className="absolute h-24 w-24 rounded-full bg-primary/20"
          style={{
            opacity: pulsation.interpolate({ inputRange: [0, 1], outputRange: [0.9, 0] }),
            transform: [
              { scale: pulsation.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1.35] }) },
            ],
          }}
        />
      )}
      <View className="h-20 w-20 items-center justify-center rounded-full bg-primary/15">
        <Icon name="Printer" size={34} color="primary" />
      </View>
      {reduit ? (
        <View className="absolute -bottom-1">
          <Spinner size="small" />
        </View>
      ) : null}
    </View>
  );
}

/** La vente terminée : ce qui a été encaissé, la monnaie, et le ticket. */
export function PanneauVenteTerminee({
  vente,
  statut,
  motif,
  transport,
}: {
  vente: VenteEnregistree;
  statut: StatutImpression | null;
  motif: string | null;
  transport: TransportUtilise | null;
}) {
  const phrase = phraseImpression(statut, transport);

  return (
    <View className="gap-4 py-2">
      <View className="items-center">
        <Apparition>
          <View className="h-20 w-20 items-center justify-center rounded-full bg-success/15">
            <Icon name="Check" size={40} color="success" />
          </View>
        </Apparition>
        <Text variant="h3" className="mt-4 text-center">
          {titreDeLaVente(vente.credit)}
        </Text>
        <Text variant="muted" className="mt-1 text-center">
          {vente.reference}
        </Text>
      </View>

      <View className="flex-row items-baseline justify-between gap-3 rounded-xl bg-muted p-3">
        <Text variant="label">Total</Text>
        <View className="min-w-0 flex-1 flex-row flex-wrap items-baseline justify-end gap-x-1.5">
          <Text variant="h4" numeric>
            {vente.total}
          </Text>
          {vente.equivalent ? (
            <Text variant="caption" numeric>
              {`(${vente.equivalent})`}
            </Text>
          ) : null}
        </View>
      </View>

      {vente.monnaie ? (
        <View className="items-center rounded-2xl bg-success/10 py-6">
          <Text variant="body" className="text-muted-foreground">
            Monnaie à rendre
          </Text>
          <Text variant="h1" numeric className="mt-2 text-success">
            {vente.monnaie}
          </Text>
        </View>
      ) : null}

      {statut === "echec" ? (
        <Banner
          tone="warning"
          title="Ticket non imprimé"
          message={`${motif ?? ""} La vente est enregistrée : vérifiez le papier, puis imprimez le reçu.`.trim()}
        />
      ) : phrase ? (
        <View className="flex-row items-center justify-center gap-1.5">
          <Icon
            name={statut === "faite" ? "CheckCircle2" : "Printer"}
            size={14}
            color={statut === "faite" ? "success" : "mutedForeground"}
          />
          <Text variant="caption">{phrase}</Text>
        </View>
      ) : null}

      <Text variant="bodySmall" className="text-center text-muted-foreground">
        {"Elle part au prochain passage du réseau. Rien n'est perdu si vous fermez l'application."}
      </Text>
    </View>
  );
}

/** La barre fixe de la vente terminée : le ticket, puis la vente suivante. */
export function PiedVenteTerminee({
  statut,
  onImprimer,
  onNouvelleVente,
}: {
  statut: StatutImpression | null;
  onImprimer: () => void;
  onNouvelleVente: () => void;
}) {
  return (
    <View className="flex-row gap-3">
      <View className="flex-1">
        <Button
          // Primaire après un échec : c'est alors le geste qu'il reste à faire.
          variant={statut === "echec" ? "primary" : "outline"}
          onPress={onImprimer}
          loading={statut === "encours"}
          disabled={statut === "encours"}
          leftIcon="Printer"
          fullWidth
        >
          {libelleBoutonImpression(statut)}
        </Button>
      </View>
      <View className="flex-1">
        <Button
          variant={statut === "echec" ? "outline" : "primary"}
          onPress={onNouvelleVente}
          fullWidth
        >
          Nouvelle vente
        </Button>
      </View>
    </View>
  );
}
