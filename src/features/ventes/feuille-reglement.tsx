/**
 * NE PAS remettre ce composant dans `src/app/` : c'est le dossier de ROUTES
 * d'expo-router, et un souligné de tête n'y est PAS ignoré - le routeur
 * enregistre le fichier et se plaint qu'il n'exporte pas de composant par
 * défaut. Même piège que le test rangé dans `src/app/` au lot 5bis.7.
 */
/**
 * Feuille d'encaissement d'une facture déjà émise.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE MONTANT SAISI EST DANS LA DEVISE DES BILLETS REMIS, et il est comparé │
 * │ au restant dû CONVERTI DANS CETTE DEVISE.                                │
 * │                                                                          │
 * │ C'est la seule comparaison valide, et le back-office s'est fait prendre : │
 * │ sa page des paiements en attente convertissait la saisie vers la devise   │
 * │ principale, si bien qu'un règlement de 50 USD sur une facture de 50 USD   │
 * │ était comparé à 140 000 et refusé comme « dépassant le restant dû ».      │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Rien n'est calculé au-delà de cette comparaison : la conversion, la monnaie
 * et l'imputation restent à `apply_payment_to_sale`, point d'entrée unique d'un
 * règlement. Le terminal ne fait que dire ce qu'il a reçu.
 *
 * Le reçu est IMPRIMÉ ICI, sous un numéro tiré dans la série de l'appareil, et
 * ce numéro voyage avec l'opération. Le client repart avec un papier qui
 * désigne un reçu que le serveur retrouvera.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { formatDateTimeFr } from "@vente-facile/core";

import { useMonnaie } from "@/data/devises";
import { useLecture } from "@/data/live";
import type { DetailVente } from "@/data/vente-detail";
import { moyensDePaiement } from "@/features/pos/donnees";
import { chromeDeLaSession } from "@/features/pos/ticket";
import { ajouterReglement } from "@/features/ventes/actes";
import { enregistrerEtImprimer } from "@/printing/jobs";
import { useSession } from "@/session/provider";
import {
  Banner,
  Button,
  Chip,
  ChipRow,
  FormField,
  Input,
  Sheet,
  Text,
  useToast,
} from "@/ui";

export function FeuilleReglement({
  ouvert,
  onFermer,
  vente,
  resteReel,
  deviceCode,
}: {
  ouvert: boolean;
  onFermer: () => void;
  vente: DetailVente;
  /** Restant dû net de ce qui attend déjà dans le journal. */
  resteReel: number;
  deviceCode: string | null;
}) {
  const money = useMonnaie();
  const toast = useToast();
  const { snapshot } = useSession();
  const devises = snapshot?.currencies ?? [];

  const { donnees: moyens } = useLecture(moyensDePaiement, {
    tables: ["payment_methods"],
  });

  const [methode, setMethode] = useState<string | null>(null);
  const [devise, setDevise] = useState(vente.devise);
  const [montant, setMontant] = useState("");
  const [reference, setReference] = useState("");
  const [envoi, setEnvoi] = useState(false);
  // Verrou SYNCHRONE : un double appui créerait deux règlements, et le second
  // sortirait de la monnaie sur une facture déjà soldée.
  const verrou = useRef(false);

  // Le formulaire se remet à neuf à chaque ouverture : rouvrir la feuille après
  // un encaissement ne doit pas proposer le montant précédent, déjà encaissé.
  useEffect(() => {
    if (!ouvert) return;
    setDevise(vente.devise);
    setMontant("");
    setReference("");
    verrou.current = false;
  }, [ouvert, vente.devise]);

  useEffect(() => {
    if (methode === null && moyens && moyens.length > 0) {
      setMethode((moyens.find((m) => m.isDefault) ?? moyens[0]).id);
    }
  }, [moyens, methode]);

  const moyenChoisi = moyens?.find((m) => m.id === methode) ?? null;

  /** Restant dû exprimé dans la devise SAISIE : la seule comparaison valide. */
  const resteDansLaDevise = money.convMoney(resteReel, vente.devise, devise);
  const saisi = Number(montant.replace(",", ".")) || 0;
  const trop = saisi > resteDansLaDevise + 0.0001;

  const bloque =
    envoi ||
    saisi <= 0 ||
    trop ||
    !methode ||
    (moyenChoisi?.requiresReference && !reference.trim());

  const valider = useCallback(async () => {
    if (verrou.current || bloque || !methode) return;
    verrou.current = true;
    setEnvoi(true);

    try {
      const { numeroRecu } = await ajouterReglement(
        {
          vente: vente.id,
          methode,
          montant: saisi,
          devise,
          reference: reference.trim(),
        },
        deviceCode
      );

      // Le document est rangé PUIS imprimé, après la mise en file : un ticket
      // sorti avant décrirait un versement que rien ne rejouerait si
      // l'application était tuée entre les deux.
      await enregistrerEtImprimer({
        kind: "payment",
        documentNumber: numeroRecu,
        label: vente.client?.nom ?? vente.reference,
        donnees: {
          kind: "debt_payment",
          number: numeroRecu,
          date: formatDateTimeFr(new Date()),
          chrome: chromeDeLaSession(snapshot),
          customerName: vente.client?.nom,
          cashierName: snapshot?.user.full_name,
          paymentMethod: moyenChoisi?.name,
          paymentReference: reference.trim() || undefined,
          amountPaid: money.convMoney(saisi, devise, vente.devise),
          currency: vente.devise,
          // Les billets réellement remis, quand ils ne sont pas dans la devise
          // de la facture : sans eux, un client qui paie en francs une facture
          // en dollars ne lit sur son reçu aucun des billets qu'il a sortis.
          tenderedAmount: devise !== vente.devise ? saisi : undefined,
          tenderedCurrency: devise !== vente.devise ? devise : undefined,
          invoice: {
            reference: vente.reference,
            total: vente.total,
            previouslyPaid: vente.paye,
            remaining: Math.max(
              0,
              resteReel - money.convMoney(saisi, devise, vente.devise)
            ),
            currency: vente.devise,
          },
        },
      });

      toast.succes(`Reçu ${numeroRecu} imprimé.`);
      onFermer();
    } catch (e) {
      // La mise en file a pu réussir et seule l'impression échouer : le
      // règlement n'est PAS perdu, et le dire évite un second encaissement.
      toast.erreur(
        e instanceof Error
          ? `Règlement enregistré, mais l'impression a échoué : ${e.message}`
          : "Le règlement n'a pas pu être enregistré."
      );
      onFermer();
    } finally {
      setEnvoi(false);
      verrou.current = false;
    }
  }, [
    bloque, methode, saisi, devise, reference, deviceCode, vente, resteReel,
    snapshot, moyenChoisi, money, toast, onFermer,
  ]);

  return (
    <Sheet ouvert={ouvert} onFermer={onFermer} titre="Encaisser cette facture">
      <View className="gap-1">
        <Text variant="caption">
          {`${vente.reference} · reste ${money.money(resteReel, vente.devise)}`}
        </Text>
      </View>

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
        <FormField
          label="Devise remise"
          hint={
            devise !== vente.devise
              ? `Facture en ${vente.devise} · ${money.rateLabel(devise, vente.devise)}`
              : undefined
          }
        >
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
        label={`Montant reçu (${devise})`}
        required
        error={trop ? `Au plus ${money.money(resteDansLaDevise, devise)}` : undefined}
        hint={
          devise !== vente.devise
            ? `Soit ${money.money(money.convMoney(saisi, devise, vente.devise), vente.devise)} sur la facture`
            : undefined
        }
      >
        <Input
          value={montant}
          onChangeText={setMontant}
          keyboardType="decimal-pad"
          placeholder={money.amountOnly(resteDansLaDevise, devise)}
          invalid={trop}
          autoFocus
        />
      </FormField>

      {moyenChoisi?.requiresReference ? (
        <FormField label="Référence" required>
          <Input
            value={reference}
            onChangeText={setReference}
            placeholder="N° de transaction, chèque…"
          />
        </FormField>
      ) : null}

      <Banner
        tone="info"
        title="Le reçu sort tout de suite"
        message="Il porte un numéro définitif, même hors ligne. Le règlement partira à la prochaine synchronisation."
      />

      <Button fullWidth size="lg" disabled={bloque} onPress={() => void valider()}>
        {envoi ? "Enregistrement…" : "Encaisser et imprimer"}
      </Button>
    </Sheet>
  );
}
