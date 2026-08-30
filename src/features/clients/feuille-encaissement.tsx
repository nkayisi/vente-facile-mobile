/**
 * NE PAS remettre ce composant dans `src/app/` : c'est le dossier de ROUTES
 * d'expo-router, et un souligné de tête n'y est PAS ignoré - le routeur
 * enregistre le fichier et se plaint qu'il n'exporte pas de composant par
 * défaut. Même piège que le test rangé dans `src/app/` au lot 5bis.7.
 */
/**
 * Encaisser du client. **Un seul écran, et il dit ce qu'il fait.**
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ « RÈGLEMENT » ET « AVANCE » NE SONT PAS DEUX CHOIX.                      │
 * │                                                                          │
 * │ L'API a deux routes, mais `record-advance` n'est plus qu'un alias de     │
 * │ `record-payment` : inscrire une avance sans toucher aux factures d'un     │
 * │ client endetté faisait diverger son solde de la somme de ses factures     │
 * │ dues, et le marchand voyait chez le même client une dette ET une avance.  │
 * │                                                                          │
 * │ Offrir deux boutons ferait donc croire à un choix qui n'existe pas. Il y  │
 * │ en a un, et l'écran ANNONCE l'imputation avant de la faire : les factures │
 * │ ouvertes sont soldées de la plus ancienne à la plus récente, et seul le   │
 * │ reliquat devient une avance.                                             │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * **Deux devises, et il faut les deux.** Celle des BILLETS remis, qui entre au
 * tiroir, et celle des FACTURES visées. Un client qui doit en dollars peut
 * payer en francs ; les confondre envoyait le versement en avance dans la
 * devise remise sans que la dette bouge.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { formatDateFr, formatDateTimeFr } from "@vente-facile/core";

import { facturesOuvertes, type DetailClient } from "@/data/contact-detail";
import { useMonnaie } from "@/data/devises";
import { useLecture } from "@/data/live";
import { encaisserClient } from "@/features/clients/actes";
import { imputer } from "@/features/clients/imputation";
import { moyensDePaiement } from "@/features/pos/donnees";
import { chromeDeLaSession } from "@/features/pos/ticket";
import { enregistrerEtImprimer } from "@/printing/jobs";
import { useSession } from "@/session/provider";
import {
  Banner,
  Button,
  Chip,
  ChipRow,
  Divider,
  FormField,
  Input,
  Sheet,
  Text,
  useToast,
} from "@/ui";

export function FeuilleEncaissement({
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

  /** Devise à viser par défaut : celle où le client doit le plus. */
  const deviseDette =
    [...client.dettes].sort((a, b) => b.montant - a.montant)[0]?.devise ?? principale;

  const [devise, setDevise] = useState(deviseDette);
  const [deviseImputation, setDeviseImputation] = useState(deviseDette);
  const [montant, setMontant] = useState("");
  const [methode, setMethode] = useState<string | null>(null);
  const [reference, setReference] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const verrou = useRef(false);

  const { donnees: moyens } = useLecture(moyensDePaiement, { tables: ["payment_methods"] });
  const chargerFactures = useCallback(
    () => facturesOuvertes(client.id, deviseImputation),
    [client.id, deviseImputation]
  );
  const { donnees: factures } = useLecture(chargerFactures, {
    tables: ["sales"],
    deps: [client.id, deviseImputation],
  });

  useEffect(() => {
    if (!ouvert) return;
    setDevise(deviseDette);
    setDeviseImputation(deviseDette);
    setMontant("");
    setReference("");
    verrou.current = false;
  }, [ouvert, deviseDette]);

  useEffect(() => {
    if (methode === null && moyens && moyens.length > 0) {
      setMethode((moyens.find((m) => m.isDefault) ?? moyens[0]).id);
    }
  }, [moyens, methode]);

  const moyenChoisi = moyens?.find((m) => m.id === methode) ?? null;
  const saisi = Number(montant.replace(",", ".")) || 0;
  const ouvertes = factures ?? [];
  const aDesFactures = ouvertes.length > 0;

  /**
   * L'imputation ANNONCÉE, calculée comme le serveur la fera. Aperçu, pas
   * décision : `imputer` porte la règle et ses tests, l'écran ne fait que la
   * rendre lisible.
   */
  const enDeviseImputation = money.convMoney(saisi, devise, deviseImputation);
  const { soldees, partielle, avance } = imputer(enDeviseImputation, ouvertes);

  const bloque =
    envoi ||
    saisi <= 0 ||
    !methode ||
    (moyenChoisi?.requiresReference && !reference.trim());

  const valider = useCallback(async () => {
    if (verrou.current || bloque || !methode) return;
    verrou.current = true;
    setEnvoi(true);

    try {
      const { numeroRecu } = await encaisserClient(
        {
          client: client.id,
          montant: saisi,
          devise,
          deviseImputation,
          methode: moyenChoisi?.methodType ?? "cash",
          reference: reference.trim(),
        },
        deviceCode,
        aDesFactures
      );

      await enregistrerEtImprimer({
        kind: "payment",
        documentNumber: numeroRecu,
        label: client.nom,
        donnees: {
          // Le GENRE du document suit ce que l'acte est vraiment. Un versement
          // sans facture à solder est une avance, et son papier le dit.
          kind: aDesFactures ? "debt_payment" : "advance",
          number: numeroRecu,
          date: formatDateTimeFr(new Date()),
          chrome: chromeDeLaSession(snapshot),
          customerName: client.nom,
          customerPhone: client.telephone ?? undefined,
          cashierName: snapshot?.user.full_name,
          paymentMethod: moyenChoisi?.name,
          paymentReference: reference.trim() || undefined,
          amountPaid: saisi,
          currency: devise,
          settledInvoices: [...soldees, ...(partielle ? [partielle] : [])],
          debt: {
            before: client.dettes.find((d) => d.devise === deviseImputation)?.montant ?? 0,
            after: Math.max(
              0,
              (client.dettes.find((d) => d.devise === deviseImputation)?.montant ?? 0) -
                enDeviseImputation
            ),
            currency: deviseImputation,
          },
        },
      });

      toast.succes(`Reçu ${numeroRecu} imprimé.`);
      onFermer();
    } catch (e) {
      toast.erreur(
        e instanceof Error
          ? `Encaissement enregistré, mais l'impression a échoué : ${e.message}`
          : "L'encaissement n'a pas pu être enregistré."
      );
      onFermer();
    } finally {
      setEnvoi(false);
      verrou.current = false;
    }
  }, [
    bloque, methode, saisi, devise, deviseImputation, reference, deviceCode,
    client, aDesFactures, moyenChoisi, snapshot, soldees, partielle,
    enDeviseImputation, money, toast, onFermer,
  ]);

  return (
    <Sheet ouvert={ouvert} onFermer={onFermer} titre="Encaisser du client">
      <Text variant="caption">
        {aDesFactures
          ? `${ouvertes.length} ${ouvertes.length > 1 ? "factures ouvertes" : "facture ouverte"} en ${deviseImputation}. Les plus anciennes sont soldées d'abord.`
          : "Aucune facture ouverte dans cette devise : ce versement sera une avance."}
      </Text>

      <FormField label="Moyen de paiement" required>
        <ChipRow>
          {(moyens ?? []).map((m) => (
            <Chip
              key={m.id}
              label={m.name}
              actif={methode === m.id}
              onPress={() => setMethode(m.id)}
            />
          ))}
        </ChipRow>
      </FormField>

      {devises.length > 1 ? (
        <>
          <FormField label="Devise remise" hint="Les billets que le client sort.">
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
          <FormField
            label="Devise des factures à solder"
            hint={
              devise !== deviseImputation
                ? money.rateLabel(devise, deviseImputation)
                : "Un client qui doit en dollars peut payer en francs."
            }
          >
            <ChipRow>
              {devises.map((d) => (
                <Chip
                  key={d.currency_code}
                  label={d.currency_code}
                  actif={deviseImputation === d.currency_code}
                  onPress={() => setDeviseImputation(d.currency_code)}
                />
              ))}
            </ChipRow>
          </FormField>
        </>
      ) : null}

      <FormField label={`Montant reçu (${devise})`} required>
        <Input
          value={montant}
          onChangeText={setMontant}
          keyboardType="decimal-pad"
          placeholder="0"
          autoFocus
        />
      </FormField>

      {/* L'imputation ANNONCÉE avant validation : le caissier voit ce qui va
          être soldé, plutôt que de le découvrir sur le reçu. */}
      {saisi > 0 ? (
        <View className="gap-1 rounded-lg bg-muted p-3">
          {soldees.length > 0 ? (
            <Text variant="caption">{`Solde entièrement : ${soldees.join(", ")}`}</Text>
          ) : null}
          {partielle ? (
            <Text variant="caption">{`Solde partiellement : ${partielle}`}</Text>
          ) : null}
          {avance > 0 ? (
            <Text variant="caption">
              {`Reste en avance : ${money.money(money.convMoney(avance, deviseImputation, devise), devise)}`}
            </Text>
          ) : null}
          {soldees.length === 0 && !partielle && avance <= 0 ? (
            <Text variant="caption">Rien à imputer.</Text>
          ) : null}
        </View>
      ) : null}

      {moyenChoisi?.requiresReference ? (
        <FormField label="Référence" required>
          <Input
            value={reference}
            onChangeText={setReference}
            placeholder="N° de transaction, chèque…"
          />
        </FormField>
      ) : null}

      {ouvertes.length > 0 ? (
        <View>
          <Divider />
          <View className="pt-2">
            {ouvertes.slice(0, 4).map((f) => (
              <View key={f.id} className="flex-row justify-between gap-3 py-1">
                <Text variant="caption" numberOfLines={1} className="min-w-0 flex-1">
                  {`${f.reference}${f.date ? ` · ${formatDateFr(f.date)}` : ""}`}
                </Text>
                <Text numeric variant="caption" className="shrink-0">
                  {money.money(f.resteAPayer, f.devise)}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      <Banner
        tone="info"
        title="Le reçu sort tout de suite"
        message="Numéro définitif, même hors ligne. L'imputation définitive reste au serveur."
      />

      <Button fullWidth size="lg" disabled={bloque} onPress={() => void valider()}>
        {envoi ? "Enregistrement…" : "Encaisser et imprimer"}
      </Button>
    </Sheet>
  );
}
