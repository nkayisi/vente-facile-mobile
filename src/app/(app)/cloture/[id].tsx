/**
 * Clôture de caisse, et son Z.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE COMPTAGE EST PAR DEVISE, ET NE SE SOMME JAMAIS.                      │
 * │                                                                          │
 * │ Un tiroir contient des billets de plusieurs devises. Les additionner     │
 * │ donnerait un nombre qui ne correspond à aucune liasse, et le caissier    │
 * │ compte des liasses. Chaque devise a donc sa ligne : fonds d'ouverture,   │
 * │ entrées, sorties, attendu, compté, écart.                                │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * **Une note est OBLIGATOIRE dès qu'un écart est non nul.** Le serveur la
 * refuse sans, et il a raison : un écart sans explication est exactement la
 * ligne qu'un contrôle regarde en premier, et le caissier est la seule
 * personne à pouvoir la donner - sur le moment, pas trois semaines plus tard.
 *
 * **Le Z sort AVANT que l'opération ne parte.** Le caissier ferme, imprime,
 * range son tiroir et rentre. Le papier porte déjà son numéro définitif.
 */
import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { formatDateTimeFr } from "@vente-facile/core";

import { sessionACloturer } from "@/data/caisse";
import { useMonnaie } from "@/data/devises";
import { useLecture } from "@/data/live";
import { cloturerSession, enAttenteCaisse } from "@/features/caisse/actes";
import { BandeauEnvoi } from "@/features/sync/bandeau-envoi";
import { PREFIXE, prochainNumero } from "@/features/pos/numerotation";
import { chromeDeLaSession } from "@/features/pos/ticket";
import { enregistrerEtImprimer } from "@/printing/jobs";
import { useSession } from "@/session/provider";
import {
  AppBar, Banner, Button, Card, CardHeader, Divider, EmptyState, FormField,
  Input, Screen, Spinner, Text, useToast,
} from "@/ui";

const TABLES = ["register_sessions", "registers", "warehouses", "sales", "payments", "cash_movements"];

export default function ClotureCaisse() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const money = useMonnaie();
  const toast = useToast();
  const { snapshot } = useSession();

  const [comptages, setComptages] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [envoi, setEnvoi] = useState(false);

  const charger = useCallback(() => sessionACloturer(id), [id]);
  const { donnees: s, chargement } = useLecture(charger, { tables: TABLES, deps: [id] });
  const { donnees: attente } = useLecture(enAttenteCaisse, {
    tables: ["outbox_operations"],
  });

  // Le comptage part du solde attendu : le caissier corrige ce qui diffère,
  // plutôt que de tout ressaisir. Un champ vide n'est PAS zéro.
  useEffect(() => {
    if (!s || Object.keys(comptages).length > 0) return;
    setComptages(
      Object.fromEntries(s.soldes.map((l) => [l.devise, String(l.attendu)]))
    );
  }, [s, comptages]);

  if (chargement && !s) {
    return (
      <Screen>
        <AppBar title="Clôture de caisse" />
        <View className="flex-1 items-center justify-center">
          <Spinner />
        </View>
      </Screen>
    );
  }

  if (!s) {
    return (
      <Screen padded={false}>
        <AppBar title="Clôture de caisse" />
        <EmptyState
          icon="Calculator"
          title="Session introuvable"
          message="Elle n'est pas encore descendue sur ce terminal, ou elle est déjà fermée."
          action={{ label: "Retour", onPress: () => router.back() }}
        />
      </Screen>
    );
  }

  const envoiCloture = attente?.clotures.get(s.id);
  const enFile = envoiCloture !== undefined;

  const lignes = s.soldes.map((l) => {
    const saisi = comptages[l.devise];
    const compte = saisi?.trim() ? Number(saisi.replace(",", ".")) || 0 : null;
    return { ...l, compte, ecart: compte === null ? null : compte - l.attendu };
  });
  const ecartNonNul = lignes.some((l) => l.ecart !== null && Math.abs(l.ecart) > 0.005);
  const bloque = envoi || enFile || (ecartNonNul && notes.trim().length === 0);

  const valider = async () => {
    if (bloque) return;
    setEnvoi(true);
    try {
      const numero = await prochainNumero(
        PREFIXE.cloture,
        snapshot?.device?.device_code ?? null
      );

      await cloturerSession(
        s.id,
        lignes
          .filter((l) => l.compte !== null)
          .map((l) => ({ devise: l.devise, montant: l.compte as number })),
        notes.trim()
      );

      // Le Z sort APRÈS la mise en file : un papier émis avant décrirait une
      // clôture que rien ne rejouerait si l'application était tuée entre les
      // deux.
      await enregistrerEtImprimer({
        kind: "cash_session",
        documentNumber: numero,
        label: `${s.caisse} · ${formatDateTimeFr(new Date())}`,
        donnees: {
          kind: "cash_session",
          number: numero,
          date: formatDateTimeFr(new Date()),
          chrome: chromeDeLaSession(snapshot),
          registerName: s.caisse,
          warehouseName: s.entrepot ?? undefined,
          openedAt: s.ouverteLe ? formatDateTimeFr(s.ouverteLe) : "—",
          closedAt: formatDateTimeFr(new Date()),
          closedByName: snapshot?.user.full_name,
          salesCount: s.nbVentes,
          paymentsSummary: s.parMoyen.map((p) => ({
            method: p.moyen,
            total: money.money(p.montant, p.devise),
          })),
          balances: lignes.map((l) => ({
            currency: l.devise,
            opening: l.ouverture,
            expected: l.attendu,
            counted: l.compte,
            difference: l.ecart,
          })),
        },
      });

      toast.succes(`Z ${numero} imprimé. La clôture partira à la synchronisation.`);
      router.back();
    } catch (e) {
      toast.erreur(
        e instanceof Error
          ? `Clôture enregistrée, mais l'impression a échoué : ${e.message}`
          : "La clôture n'a pas pu être enregistrée."
      );
      router.back();
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <Screen scroll padded={false}>
      <AppBar title="Clôture de caisse" subtitle={`${s.caisse} · ${s.nbVentes} ventes`} />

      <View className="gap-4 p-4">
        <BandeauEnvoi
          envoi={envoiCloture}
          titre="Une clôture attend son envoi"
          consequence="La session ne se fermera qu'après."
        />

        {lignes.map((l) => (
          <Card key={l.devise}>
            <CardHeader title={l.devise} />
            <View>
              <Ligne label="Fonds d'ouverture" valeur={money.money(l.ouverture, l.devise)} />
              <Ligne label="Encaissements espèces" valeur={money.money(l.entrees, l.devise)} />
              <Ligne label="Sorties" valeur={`-${money.money(l.sorties, l.devise)}`} />
              <View className="my-2">
                <Divider />
              </View>
              <Ligne label="Attendu au tiroir" valeur={money.money(l.attendu, l.devise)} fort />
            </View>
            <View className="mt-3">
              <FormField
                label={`Compté (${l.devise})`}
                hint={
                  l.ecart !== null && Math.abs(l.ecart) > 0.005
                    ? `Écart : ${l.ecart > 0 ? "+" : ""}${money.money(l.ecart, l.devise)}`
                    : undefined
                }
              >
                <Input
                  value={comptages[l.devise] ?? ""}
                  onChangeText={(v) =>
                    setComptages((c) => ({ ...c, [l.devise]: v }))
                  }
                  keyboardType="decimal-pad"
                  invalid={l.ecart !== null && Math.abs(l.ecart) > 0.005}
                />
              </FormField>
            </View>
          </Card>
        ))}

        <Card>
          <FormField
            label="Note explicative"
            required={ecartNonNul}
            hint={
              ecartNonNul
                ? "Obligatoire : un écart est constaté."
                : "Facultative quand le comptage tombe juste."
            }
          >
            <Input
              value={notes}
              onChangeText={setNotes}
              placeholder="Erreur de rendu de monnaie, avance non enregistrée…"
            />
          </FormField>
        </Card>

        <Banner
          tone="info"
          title="Le Z sort tout de suite"
          message="Il porte un numéro définitif, même hors ligne. La session se fermera à la prochaine synchronisation."
        />

        <Button fullWidth size="lg" disabled={bloque} onPress={() => void valider()}>
          {envoi ? "Clôture…" : "Clôturer et imprimer le Z"}
        </Button>
      </View>
    </Screen>
  );
}

function Ligne({
  label,
  valeur,
  fort = false,
}: {
  label: string;
  valeur: string;
  fort?: boolean;
}) {
  return (
    <View className="flex-row items-baseline justify-between gap-3 py-1">
      <Text variant="bodySmall" numberOfLines={1} className="min-w-0 flex-1 text-muted-foreground">
        {label}
      </Text>
      <Text
        variant={fort ? "body" : "bodySmall"}
        numeric
        className={`shrink-0 ${fort ? "font-sans-medium" : ""}`}
      >
        {valeur}
      </Text>
    </View>
  );
}
