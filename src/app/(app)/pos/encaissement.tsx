/**
 * Encaisser : devise, moyen de paiement, monnaie, crédit, points.
 *
 * La vente est mise en FILE, elle n'est pas envoyée. Le comptoir ne dépend
 * jamais du réseau : l'opération part au journal, le caissier voit tout de
 * suite la monnaie à rendre, et le serveur rejouera l'acte par le même chemin
 * que le back-office dès qu'il sera joignable.
 *
 * Aucun montant n'est calculé ici. Tout vient de `@vente-facile/core/pos`, y
 * compris le corps de la requête : c'est ce qui garantit qu'une vente saisie
 * sur ce téléphone laisse exactement le même état qu'une vente saisie sur le
 * back-office, ce que le backend vérifie par test.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import * as Crypto from "expo-crypto";

import { buildSalePayload } from "@vente-facile/core/pos";

import { enregistrerDocument } from "@/printing/jobs";
import { donneesTicketVente } from "@/features/pos/ticket";

import { moyensDePaiement, pointsDuClient, type MoyenPaiement } from "@/features/pos/donnees";
import { prochaineReference } from "@/features/pos/numerotation";
import { sessionOuverte, type SessionCaisse } from "@/features/pos/caisse";
import { usePanier } from "@/features/pos/panier";
import { useSession } from "@/session/provider";
import { enqueue } from "@/sync";
import {
  Banner, Button, Divider, FormField, Icon, Input, Pressable, Screen, Text,
} from "@/ui";

export default function Encaissement() {
  const panier = usePanier();
  const { snapshot } = useSession();
  const { etat, totaux, devises, deviseFacture, deviseMonnaie, argent } = panier;

  const [moyens, setMoyens] = useState<MoyenPaiement[]>([]);
  const [session, setSession] = useState<SessionCaisse | null>(null);
  const [points, setPoints] = useState(0);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const verrou = useRef(false);

  useEffect(() => {
    moyensDePaiement().then((liste) => {
      setMoyens(liste);
      // Un règlement unique, préchargé sur l'espèces et sur le montant exact :
      // c'est la vente de comptoir la plus fréquente, et elle ne doit demander
      // qu'un seul geste.
      if (liste.length > 0 && etat.reglements.length === 0) {
        panier.envoyer({
          type: "reglements",
          reglements: [
            { cle: "r1", method: liste[0].id, currency: deviseFacture, amount: "" },
          ],
        });
      }
    });
    sessionOuverte().then(setSession);
    // Le montant exact se pose à l'ouverture seulement : le recalculer à chaque
    // frappe empêcherait le caissier de saisir un montant partiel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!etat.client) {
      setPoints(0);
      return;
    }
    pointsDuClient(etat.client.id).then(setPoints);
  }, [etat.client]);

  const reglement = etat.reglements[0];
  const modifier = (patch: Partial<typeof reglement>) =>
    panier.envoyer({
      type: "reglements",
      reglements: reglement ? [{ ...reglement, ...patch }] : [],
    });

  const devisesActives = useMemo(
    () => (snapshot?.currencies ?? []).filter((c) => c.is_active !== false),
    [snapshot]
  );

  const moyenChoisi = moyens.find((m) => m.id === reglement?.method);
  const credit = totaux.credit;
  const resteAPayer = totaux.restantFacture;
  const aCredit = resteAPayer > 0;

  const bloque =
    etat.lignes.length === 0 ||
    !session ||
    !reglement?.method ||
    (aCredit && (!etat.client || !!credit?.blocked)) ||
    (moyenChoisi?.requiresReference && !reglement?.reference?.trim());

  const valider = async () => {
    // Verrou SYNCHRONE avant tout `setState` : un double appui créerait deux
    // ventes, et la seconde sortirait le stock une fois de trop.
    if (verrou.current || bloque || !session) return;
    verrou.current = true;
    setEnvoi(true);
    setErreur(null);

    try {
      const id = Crypto.randomUUID();
      const reference = await prochaineReference(snapshot?.device?.device_code ?? null);

      const corps = buildSalePayload({
        lines: etat.lignes.map((l) => ({ ...l, product: { ...l.product, id: l.product.id } })),
        currencies: devises,
        invoiceCurrency: deviseFacture,
        changeCurrency: deviseMonnaie,
        globalDiscountAmount: etat.remiseGlobale,
        tenders: etat.reglements,
        register: session.registerId,
        warehouse: session.warehouseId,
        customer: etat.client?.id,
        isCredit: aCredit,
        dueDate: etat.echeance,
        loyaltyProgram: snapshot?.loyalty_program ?? null,
        pointsToUse: etat.points,
        isPos: true,
      });

      await enqueue(id, "sale.create", {
        id,
        reference,
        // La session est nommée explicitement : le serveur la retrouverait par
        // la caisse, mais une session ouverte hors ligne n'existe encore que
        // dans le journal, et c'est celle-là qu'il faut viser.
        session: session.id,
        ...corps,
      });

      const monnaie = totaux.monnaie;

      // Le document est rangé AVANT de vider le panier : après, il n'y a plus
      // rien à décrire. Il est rangé, pas imprimé : l'écran suivant s'en
      // charge, pour que le caissier voie la monnaie à rendre même si
      // l'imprimante est en panne de papier.
      const ticket = await enregistrerDocument({
        kind: "sale",
        documentNumber: reference,
        label: etat.client?.name ?? `Vente ${reference}`,
        donnees: donneesTicketVente({
          reference,
          date: new Date(),
          etat,
          totaux,
          deviseFacture,
          snapshot,
          registerName: session.registerName,
          restantDu: aCredit ? totaux.restantFacture : 0,
          aCredit,
        }),
      });

      panier.envoyer({ type: "vider" });
      router.replace({
        pathname: "/pos/termine",
        params: {
          reference,
          monnaie: String(monnaie),
          devise: deviseMonnaie,
          credit: aCredit ? "1" : "",
          ticket,
        },
      });
    } catch (e) {
      setErreur(
        e instanceof Error ? e.message : "La vente n'a pas pu être mise en file."
      );
    } finally {
      verrou.current = false;
      setEnvoi(false);
    }
  };

  return (
    <Screen scroll>
      <View className="flex-row items-center gap-2 pt-2">
        <Pressable
          onPress={() => router.back()}
          className="h-11 w-11 items-center justify-center rounded-full active:bg-muted"
          accessibilityLabel="Retour"
        >
          <Icon name="chevron-back" size={24} />
        </Pressable>
        <Text variant="h4" className="flex-1">
          Encaisser
        </Text>
      </View>

      <View className="mt-4 items-center rounded-2xl bg-primary/10 py-6">
        <Text variant="bodySmall" className="text-muted-foreground">
          À payer
        </Text>
        <Text variant="h1" className="mt-1 text-primary">
          {argent(totaux.totalFacture)}
        </Text>
      </View>

      {devisesActives.length > 1 ? (
        <Rubrique titre="Devise de la facture">
          <Chips
            options={devisesActives.map((c) => ({ cle: c.currency_code, libelle: c.currency_code }))}
            actif={deviseFacture}
            onChoisir={(code) => panier.envoyer({ type: "deviseFacture", code })}
          />
        </Rubrique>
      ) : null}

      <Rubrique titre="Moyen de paiement">
        <View className="flex-row flex-wrap gap-2">
          {moyens.map((m) => (
            <Pressable
              key={m.id}
              onPress={() => modifier({ method: m.id })}
              className={`min-h-11 justify-center rounded-xl border px-4 py-2 ${
                reglement?.method === m.id ? "border-primary bg-primary/10" : "border-border"
              }`}
            >
              <Text
                variant="body"
                className={reglement?.method === m.id ? "text-primary" : undefined}
              >
                {m.name}
              </Text>
            </Pressable>
          ))}
        </View>
      </Rubrique>

      <Rubrique titre="Montant remis">
        <FormField label="Reçu du client">
          <Input
            value={reglement?.amount ?? ""}
            onChangeText={(v) => modifier({ amount: v.replace(",", ".") })}
            keyboardType="decimal-pad"
            placeholder="0"
          />
        </FormField>
        <View className="mt-2 flex-row gap-2">
          <Pressable
            onPress={() =>
              modifier({
                amount: String(totaux.totalFacture),
                currency: deviseFacture,
              })
            }
            className="rounded-full border border-border px-3 py-2"
          >
            <Text variant="bodySmall">Montant exact</Text>
          </Pressable>
          {devisesActives.map((c) => (
            <Pressable
              key={c.currency_code}
              onPress={() => modifier({ currency: c.currency_code })}
              className={`rounded-full border px-3 py-2 ${
                reglement?.currency === c.currency_code
                  ? "border-primary bg-primary/10"
                  : "border-border"
              }`}
            >
              <Text
                variant="bodySmall"
                className={
                  reglement?.currency === c.currency_code ? "text-primary" : undefined
                }
              >
                {c.currency_code}
              </Text>
            </Pressable>
          ))}
        </View>

        {moyenChoisi?.requiresReference ? (
          <View className="mt-3">
            <FormField label={`Référence ${moyenChoisi.name}`} required>
              <Input
                value={reglement?.reference ?? ""}
                onChangeText={(v) => modifier({ reference: v })}
                autoCapitalize="characters"
                placeholder="Numéro de transaction"
              />
            </FormField>
          </View>
        ) : null}
      </Rubrique>

      <View className="mt-4 rounded-xl border border-border p-4">
        <Rang libelle="Total" valeur={argent(totaux.totalFacture)} />
        <Rang libelle="Reçu" valeur={argent(totaux.payeFacture)} />
        <View className="my-2">
          <Divider />
        </View>
        {totaux.monnaie > 0 ? (
          <View className="flex-row items-baseline justify-between">
            <Text variant="body">Monnaie à rendre</Text>
            <Text variant="h3" className="text-success">
              {argent(totaux.monnaie, deviseMonnaie)}
            </Text>
          </View>
        ) : (
          <View className="flex-row items-baseline justify-between">
            <Text variant="body">Reste à payer</Text>
            <Text variant="h3" className={resteAPayer > 0 ? "text-destructive" : undefined}>
              {argent(resteAPayer)}
            </Text>
          </View>
        )}
        {totaux.monnaie > 0 && devisesActives.length > 1 ? (
          <View className="mt-3">
            <Text variant="bodySmall" className="mb-2 text-muted-foreground">
              Rendre en
            </Text>
            <Chips
              options={devisesActives.map((c) => ({
                cle: c.currency_code,
                libelle: c.currency_code,
              }))}
              actif={deviseMonnaie}
              onChoisir={(code) => panier.envoyer({ type: "deviseMonnaie", code })}
            />
          </View>
        ) : null}
      </View>

      {aCredit ? (
        <Rubrique titre="Vente à crédit">
          {!etat.client ? (
            <Banner
              tone="warning"
              title="Un client est nécessaire"
              message="Le reste à payer sera porté à son compte. Choisissez le client pour continuer."
              action={{ label: "Choisir un client", onPress: () => router.push("/pos/client") }}
            />
          ) : credit?.blocked ? (
            <Banner tone="destructive" title="Crédit refusé" message={credit.reason ?? ""} />
          ) : (
            <View className="rounded-xl border border-border p-4">
              <Text variant="body">{etat.client.name}</Text>
              <Text variant="bodySmall" className="mt-1 text-muted-foreground">
                Dette actuelle : {argent(credit?.currentBalance ?? 0, devises.primary)} ·
                {" "}après cette vente : {argent(credit?.projectedBalance ?? 0, devises.primary)}
              </Text>
            </View>
          )}
        </Rubrique>
      ) : (
        <Rubrique titre="Client">
          <Pressable
            onPress={() => router.push("/pos/client")}
            className="min-h-12 flex-row items-center justify-between rounded-xl border border-border px-4 py-3"
          >
            <Text variant="body" className={etat.client ? undefined : "text-muted-foreground"}>
              {etat.client?.name ?? "Aucun client (vente au comptant)"}
            </Text>
            <Icon name="chevron-forward" size={16} color="mutedForeground" />
          </Pressable>
        </Rubrique>
      )}

      {etat.client && snapshot?.loyalty_program?.is_active && points > 0 ? (
        <Rubrique titre="Points de fidélité">
          <Text variant="bodySmall" className="mb-2 text-muted-foreground">
            {points} point{points > 1 ? "s" : ""} disponible{points > 1 ? "s" : ""}.
            {" "}Au plus {Math.min(points, totaux.pointsMax)} utilisable
            {Math.min(points, totaux.pointsMax) > 1 ? "s" : ""} sur cette vente.
          </Text>
          <FormField
            label="Points à utiliser"
            hint={`Minimum ${totaux.pointsMinimum}. En dessous, aucune remise n'est accordée.`}
          >
            <Input
              value={etat.points ? String(etat.points) : ""}
              onChangeText={(v) =>
                panier.envoyer({
                  type: "points",
                  points: Math.min(Number(v) || 0, Math.min(points, totaux.pointsMax)),
                })
              }
              keyboardType="number-pad"
              placeholder="0"
            />
          </FormField>
          {totaux.remiseFidelite > 0 ? (
            <Text variant="bodySmall" className="mt-2 text-success">
              Remise accordée : {argent(
                devises.convertMoney(totaux.remiseFidelite, devises.primary, deviseFacture)
              )}
            </Text>
          ) : null}
        </Rubrique>
      ) : null}

      {erreur ? (
        <View className="mt-4">
          <Banner tone="destructive" title="Vente non enregistrée" message={erreur} />
        </View>
      ) : null}

      {!session ? (
        <View className="mt-4">
          <Banner
            tone="destructive"
            title="Aucune caisse ouverte"
            message="Ouvrez une session de caisse avant d'encaisser."
          />
        </View>
      ) : null}

      <View className="mb-8 mt-6">
        <Button onPress={valider} disabled={bloque} loading={envoi} fullWidth>
          {aCredit ? "Enregistrer à crédit" : "Valider la vente"}
        </Button>
      </View>
    </Screen>
  );
}

function Rubrique({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <View className="mt-6">
      <Text variant="label" className="mb-2">
        {titre}
      </Text>
      {children}
    </View>
  );
}

function Chips({
  options,
  actif,
  onChoisir,
}: {
  options: { cle: string; libelle: string }[];
  actif: string;
  onChoisir: (cle: string) => void;
}) {
  return (
    <View className="flex-row flex-wrap gap-2">
      {options.map((o) => (
        <Pressable
          key={o.cle}
          onPress={() => onChoisir(o.cle)}
          className={`min-h-11 justify-center rounded-full border px-4 ${
            actif === o.cle ? "border-primary bg-primary/10" : "border-border"
          }`}
        >
          <Text variant="body" className={actif === o.cle ? "text-primary" : undefined}>
            {o.libelle}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function Rang({ libelle, valeur }: { libelle: string; valeur: string }) {
  return (
    <View className="flex-row justify-between py-0.5">
      <Text variant="bodySmall" className="text-muted-foreground">
        {libelle}
      </Text>
      <Text variant="bodySmall">{valeur}</Text>
    </View>
  );
}
