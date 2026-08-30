/**
 * NE PAS remettre ce composant dans `src/app/` : c'est le dossier de ROUTES
 * d'expo-router, et un souligné de tête n'y est PAS ignoré - le routeur
 * enregistre le fichier et se plaint qu'il n'exporte pas de composant par
 * défaut. Même piège que le test rangé dans `src/app/` au lot 5bis.7.
 */
/**
 * Ajuster le solde d'un client.
 *
 * **Ce n'est PAS un encaissement**, et c'est pour cela qu'il a son propre
 * écran. Un ajustement corrige une écriture : une facture saisie deux fois, un
 * geste commercial, un reste de dette qu'on efface. L'argent, lui, n'a pas
 * forcément bougé.
 *
 * Sauf dans un sens, et il faut le dire : **réduire une dette, c'est recevoir
 * de l'argent**, et le serveur passe alors une entrée en caisse. Un ajustement
 * négatif n'est donc pas neutre pour le tiroir, et l'écran l'annonce plutôt que
 * de laisser le caissier le découvrir dans son Z.
 *
 * Le MOTIF est obligatoire. Un ajustement sans motif est une écriture que
 * personne ne saura justifier trois mois plus tard, et c'est exactement le
 * genre de ligne qu'un contrôle regarde en premier.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { formatDateTimeFr } from "@vente-facile/core";

import type { DetailClient } from "@/data/contact-detail";
import { useMonnaie } from "@/data/devises";
import { ajusterSolde } from "@/features/clients/actes";
import { montantAjustement } from "@/features/clients/imputation";
import { chromeDeLaSession } from "@/features/pos/ticket";
import { enregistrerEtImprimer } from "@/printing/jobs";
import { useSession } from "@/session/provider";
import {
  Banner,
  Button,
  Chip,
  ChipRow,
  FormField,
  Input,
  Segmented,
  Sheet,
  Text,
  useToast,
} from "@/ui";

type Sens = "augmenter" | "reduire";

export function FeuilleAjustement({
  ouvert,
  onFermer,
  client,
  deviceCode,
}: {
  ouvert: boolean;
  onFermer: () => void;
  client: DetailClient;
  deviceCode: string | null;
}) {
  const money = useMonnaie();
  const toast = useToast();
  const { snapshot } = useSession();
  const devises = snapshot?.currencies ?? [];
  const principale = devises.find((d) => d.is_primary)?.currency_code ?? "CDF";
  const deviseDette = client.dettes[0]?.devise ?? principale;

  const [sens, setSens] = useState<Sens>("reduire");
  const [devise, setDevise] = useState(deviseDette);
  const [montant, setMontant] = useState("");
  const [motif, setMotif] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const verrou = useRef(false);

  useEffect(() => {
    if (!ouvert) return;
    setSens("reduire");
    setDevise(deviseDette);
    setMontant("");
    setMotif("");
    verrou.current = false;
  }, [ouvert, deviseDette]);

  const saisi = Number(montant.replace(",", ".")) || 0;
  // Le SIGNE est porté par le sens choisi, jamais par la saisie. `montantAjustement`
  // porte la règle et son test : « -500 » tapé dans « augmenter » ne doit pas
  // inverser l'opération.
  const montantSigne = montantAjustement(sens, saisi);

  const soldeActuel =
    client.soldes.find((s) => s.devise === devise)?.montant ?? 0;
  const soldeApres = soldeActuel + montantSigne;

  const bloque = envoi || saisi <= 0 || motif.trim().length === 0;

  const valider = useCallback(async () => {
    if (verrou.current || bloque) return;
    verrou.current = true;
    setEnvoi(true);

    try {
      const { numeroRecu } = await ajusterSolde(
        { client: client.id, montant: montantSigne, devise, notes: motif.trim() },
        deviceCode
      );

      await enregistrerEtImprimer({
        kind: "payment",
        documentNumber: numeroRecu,
        label: client.nom,
        donnees: {
          kind: "adjustment",
          number: numeroRecu,
          date: formatDateTimeFr(new Date()),
          chrome: chromeDeLaSession(snapshot),
          customerName: client.nom,
          cashierName: snapshot?.user.full_name,
          amountPaid: Math.abs(montantSigne),
          currency: devise,
          notes: motif.trim(),
          debt: { before: soldeActuel, after: soldeApres, currency: devise },
        },
      });

      toast.succes(`Ajustement ${numeroRecu} enregistré.`);
      onFermer();
    } catch (e) {
      toast.erreur(
        e instanceof Error
          ? `Ajustement enregistré, mais l'impression a échoué : ${e.message}`
          : "L'ajustement n'a pas pu être enregistré."
      );
      onFermer();
    } finally {
      setEnvoi(false);
      verrou.current = false;
    }
  }, [
    bloque, client, montantSigne, devise, motif, deviceCode, snapshot,
    soldeActuel, soldeApres, toast, onFermer,
  ]);

  return (
    <Sheet ouvert={ouvert} onFermer={onFermer} titre="Ajuster le solde">
      <Text variant="caption">
        Une correction d&apos;écriture, pas un encaissement. Le reçu sort marqué
        AJUSTEMENT.
      </Text>

      <FormField label="Sens de l'ajustement" required>
        <Segmented
          options={[
            { valeur: "reduire", label: "Réduire la dette" },
            { valeur: "augmenter", label: "Augmenter la dette" },
          ]}
          valeur={sens}
          onChange={(v) => setSens(v as Sens)}
        />
      </FormField>

      {devises.length > 1 ? (
        <FormField label="Devise">
          <ChipRow>
            {devises.map((d) => (
              <Chip
                key={d.currency_code}
                label={d.currency_code}
                actif={devise === d.currency_code}
                onPress={() => setDevise(d.currency_code)}
              />
            ))}
          </ChipRow>
        </FormField>
      ) : null}

      <FormField
        label={`Montant (${devise})`}
        required
        hint={`Solde actuel ${money.money(soldeActuel, devise)}`}
      >
        <Input
          value={montant}
          onChangeText={setMontant}
          keyboardType="decimal-pad"
          placeholder="0"
          autoFocus
        />
      </FormField>

      <FormField
        label="Motif"
        required
        hint="Il figure sur le reçu et dans l'historique du compte."
      >
        <Input
          value={motif}
          onChangeText={setMotif}
          placeholder="Facture saisie deux fois, geste commercial…"
        />
      </FormField>

      {saisi > 0 ? (
        <View className="rounded-lg bg-muted p-3">
          <Text variant="caption">
            {`Solde après : ${money.money(soldeApres, devise)}`}
          </Text>
        </View>
      ) : null}

      {sens === "reduire" ? (
        <Banner
          tone="warning"
          title="Une entrée en caisse sera enregistrée"
          message="Réduire une dette vaut argent reçu : le montant entre au tiroir et se retrouvera dans le rapport de caisse."
        />
      ) : null}

      <Button fullWidth size="lg" disabled={bloque} onPress={() => void valider()}>
        {envoi ? "Enregistrement…" : "Enregistrer l'ajustement"}
      </Button>
    </Sheet>
  );
}
