/**
 * Abonnement. Miroir de `app/dashboard/subscription/page.tsx`.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN ABONNEMENT EXPIRÉ N'EMPÊCHE PAS DE VENDRE, il empêche de POUSSER.    │
 * │                                                                          │
 * │ La porte d'abonnement du serveur laisse passer la lecture et répond 402  │
 * │ à l'écriture : les opérations reviennent en verdict `blocked`,           │
 * │ conservées et non réessayées. Le comptoir continue donc de fonctionner,  │
 * │ et rien n'est perdu - mais rien ne remonte non plus. C'est exactement ce │
 * │ que cet écran doit faire comprendre, sous peine de voir un marchand      │
 * │ vendre trois semaines sans jamais synchroniser.                          │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * **Le paiement part dans le NAVIGATEUR DU SYSTÈME.** Le tunnel Moko est une
 * page web hébergée ; l'embarquer dans une WebView est le motif de refus 4.2
 * le plus courant à la revue App Store, et c'est aussi ce qu'un marchand
 * attend d'un paiement : voir la barre d'adresse.
 *
 * **Lecture en ligne, assumée.** `subscriptions` n'est pas au manifeste de
 * tirage et n'a rien à y faire : un abonnement est une relation avec
 * l'éditeur, pas une donnée de comptoir.
 */
import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { formatDateFr } from "@vente-facile/core";

import { WEB_BASE_URL } from "@/api/config";
import { readableMessage } from "@/api/errors";
import {
  STATUT_ABONNEMENT,
  STATUT_PAIEMENT,
  etatAbonnement,
  facturesAbonnement,
  lirePlafond,
  paiementsAbonnement,
  plansDisponibles,
  type EtatAbonnement,
  type FactureAbonnement,
  type PaiementAbonnement,
  type PlanAbonnement,
} from "@/data/abonnement";
import { useMonnaie } from "@/data/devises";
import { useEnLigne } from "@/data/reseau";
import { useSession } from "@/session/provider";
import {
  Badge, Banner, Button, Card, CardHeader, Divider, Icon, PageHeader, Screen,
  Section, Segmented, Spinner, StatValue, Text, useToast,
} from "@/ui";

type Onglet = "etat" | "plans" | "historique";

export default function Abonnement() {
  const { snapshot } = useSession();
  const money = useMonnaie();
  const toast = useToast();
  const enLigne = useEnLigne();
  const organisation = snapshot?.organization.id ?? null;

  const [onglet, setOnglet] = useState<Onglet>("etat");
  const [etat, setEtat] = useState<EtatAbonnement | null>(null);
  const [plans, setPlans] = useState<PlanAbonnement[]>([]);
  const [paiements, setPaiements] = useState<PaiementAbonnement[]>([]);
  const [factures, setFactures] = useState<FactureAbonnement[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async () => {
    if (!organisation) return;
    setChargement(true);
    setErreur(null);
    try {
      // Les quatre appels en PARALLÈLE : en série, sur un réseau à 300 ms de
      // latence, l'écran mettrait plus d'une seconde à se peindre pour rien.
      const [e, p, pa, f] = await Promise.all([
        etatAbonnement(organisation),
        plansDisponibles(organisation),
        paiementsAbonnement(organisation),
        facturesAbonnement(organisation),
      ]);
      setEtat(e);
      setPlans(p);
      setPaiements(pa);
      setFactures(f);
    } catch (e) {
      setErreur(
        readableMessage(
          (e as { body?: unknown })?.body,
          "L'abonnement n'a pas pu être lu."
        )
      );
    } finally {
      setChargement(false);
    }
  }, [organisation]);

  useEffect(() => {
    void charger();
  }, [charger]);

  const payer = async (plan: PlanAbonnement, mode: "new" | "extend") => {
    if (!WEB_BASE_URL) {
      toast.erreur(
        "L'adresse du back-office n'est pas configurée sur cette version. Réglez l'abonnement depuis un navigateur."
      );
      return;
    }
    const q = new URLSearchParams({ planId: plan.id, cycle: "monthly", mode });
    try {
      await WebBrowser.openBrowserAsync(`${WEB_BASE_URL}/payment/checkout?${q}`);
      // Au retour du navigateur, l'état a pu changer : on le redemande plutôt
      // que de laisser un « Expiré » à l'écran d'un marchand qui vient de payer.
      void charger();
    } catch {
      toast.erreur("Le navigateur n'a pas pu être ouvert.");
    }
  };

  /**
   * Ce qu'un plan propose, dans les règles du serveur.
   *
   * L'anti-rétrogradation n'est pas une préférence commerciale : redescendre
   * sous le plancher retirerait des utilisateurs, des entrepôts ou des
   * produits DÉJÀ créés, et le serveur refuse. Le dire sur le bouton évite un
   * aller-retour jusqu'au tunnel de paiement pour se faire refuser là-bas.
   */
  const actionDuPlan = (
    plan: PlanAbonnement
  ): { label: string; desactive: boolean; raison?: string; mode: "new" | "extend" } => {
    if (!etat) return { label: "Choisir", desactive: true, mode: "new" };
    const courant = etat.planId === plan.id;
    if (plan.tier < etat.tierPlancher) {
      return {
        label: "Indisponible",
        desactive: true,
        raison: "Ce plan est en dessous de ce que vous utilisez déjà.",
        mode: "new",
      };
    }
    if (courant) return { label: "Prolonger", desactive: false, mode: "extend" };
    return { label: "Choisir ce plan", desactive: false, mode: "new" };
  };

  if (chargement && !etat) {
    return (
      <Screen>
        <PageHeader title="Abonnement" />
        <View className="flex-1 items-center justify-center">
          <Spinner />
        </View>
      </Screen>
    );
  }

  const s = etat ? STATUT_ABONNEMENT[etat.statut] : undefined;

  return (
    <Screen scroll edges={[]}>
      <PageHeader
        title="Abonnement"
        subtitle="Votre plan, vos paiements et vos factures"
        actions={
          <Button
            variant="outline"
            size="sm"
            leftIcon="RefreshCw"
            disabled={chargement}
            onPress={() => void charger()}
          >
            Actualiser
          </Button>
        }
      />

      {!enLigne ? (
        <View className="mt-4">
          <Banner
            tone="warning"
            title="Hors ligne"
            message="L'abonnement se lit sur le serveur. Vos ventes, elles, continuent d'être enregistrées sur ce terminal."
          />
        </View>
      ) : erreur ? (
        <View className="mt-4">
          <Banner
            tone="destructive"
            title="Lecture impossible"
            message={erreur}
            action={{ label: "Réessayer", onPress: () => void charger() }}
          />
        </View>
      ) : null}

      {etat?.bloque ? (
        <View className="mt-4">
          <Banner
            tone="destructive"
            title="La synchronisation est bloquée"
            message="Vous pouvez continuer à vendre : rien n'est perdu, tout reste en file sur ce terminal. Mais plus rien ne remonte au serveur tant que l'abonnement n'est pas régularisé."
          />
        </View>
      ) : null}

      <View className="mt-4">
        <Segmented
          valeur={onglet}
          onChange={(v) => setOnglet(v as Onglet)}
          options={[
            { valeur: "etat", label: "Mon plan" },
            { valeur: "plans", label: "Plans" },
            { valeur: "historique", label: "Historique" },
          ]}
        />
      </View>

      {onglet === "etat" ? (
        <View className="mt-4 gap-4">
          <Card>
            <View className="flex-row items-start gap-3">
              <View className="h-11 w-11 items-center justify-center rounded-lg bg-primary/10">
                <Icon name="Crown" size={22} color="primary" />
              </View>
              <View className="min-w-0 flex-1">
                <Text variant="label" numberOfLines={1}>
                  {etat?.planNom ?? "Aucun plan"}
                </Text>
                <Text variant="caption">
                  {etat?.cycle ?? (etat?.aUnAbonnement ? "" : "Aucun abonnement actif")}
                </Text>
              </View>
              {s ? <Badge tone={s.ton}>{s.label}</Badge> : null}
            </View>

            {etat && etat.prix !== null ? (
              <View className="mt-4">
                <Text variant="caption" className="mb-1">
                  Montant
                </Text>
                <StatValue value={money.money(etat.prix, etat.devise)} />
              </View>
            ) : null}

            {etat?.message ? (
              <Text variant="bodySmall" className="mt-3">
                {etat.message}
              </Text>
            ) : null}

            <View className="mt-4 gap-1">
              {etat?.finPeriode ? (
                <View className="flex-row items-baseline justify-between gap-3">
                  <Text variant="bodySmall" className="text-muted-foreground">
                    {etat.essai ? "Fin de l'essai" : "Échéance"}
                  </Text>
                  <Text variant="bodySmall" numeric className="font-sans-medium">
                    {formatDateFr(etat.finPeriode)}
                  </Text>
                </View>
              ) : null}
              {etat?.joursRestants !== null && etat?.joursRestants !== undefined ? (
                <View className="flex-row items-baseline justify-between gap-3">
                  <Text variant="bodySmall" className="text-muted-foreground">
                    Jours restants
                  </Text>
                  <Text
                    variant="bodySmall"
                    numeric
                    className={
                      etat.joursRestants <= 7
                        ? "font-sans-medium text-destructive"
                        : "font-sans-medium"
                    }
                  >
                    {String(etat.joursRestants)}
                  </Text>
                </View>
              ) : null}
            </View>
          </Card>

          {etat && etat.plafonds.length > 0 ? (
            <Card>
              <CardHeader
                title="Utilisation"
                subtitle="Ce que votre plan autorise, et ce qui est consommé."
              />
              <View>
                {etat.plafonds.map((p, i) => (
                  <View key={p.label}>
                    {i > 0 ? (
                      <View className="my-2">
                        <Divider />
                      </View>
                    ) : null}
                    <View className="flex-row items-baseline justify-between gap-3">
                      <Text variant="bodySmall" className="text-muted-foreground">
                        {p.label}
                      </Text>
                      <Text
                        variant="bodySmall"
                        numeric
                        className={
                          // Atteindre le plafond n'est pas un incident, mais la
                          // création suivante sera refusée : le dire avant.
                          p.limite !== null && p.utilise >= p.limite
                            ? "font-sans-medium text-warning"
                            : "font-sans-medium"
                        }
                      >
                        {lirePlafond(p)}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
              <Text variant="caption" className="mt-3">
                Un plafond absent veut dire « illimité », jamais « zéro ».
              </Text>
            </Card>
          ) : null}
        </View>
      ) : null}

      {onglet === "plans" ? (
        <View className="mt-4 gap-4">
          {plans.length === 0 ? (
            <Card>
              <Text variant="bodySmall">
                Aucun plan n&apos;est proposé pour le moment.
              </Text>
            </Card>
          ) : (
            plans.map((p) => {
              const a = actionDuPlan(p);
              const courant = etat?.planId === p.id;
              return (
                <Card
                  key={p.id}
                  className={courant ? "border-2 border-primary p-4" : "p-4"}
                >
                  <View className="flex-row items-start justify-between gap-3">
                    <View className="min-w-0 flex-1">
                      <Text variant="label" numberOfLines={1}>
                        {p.nom}
                      </Text>
                      {p.description ? (
                        <Text variant="caption">{p.description}</Text>
                      ) : null}
                    </View>
                    {courant ? (
                      <Badge tone="primary">Plan actuel</Badge>
                    ) : p.miseEnAvant ? (
                      <Badge tone="warning">Recommandé</Badge>
                    ) : null}
                  </View>

                  <View className="mt-3">
                    <StatValue value={money.money(p.prixMensuel, p.devise)} />
                    <Text variant="caption">par mois</Text>
                  </View>

                  <View className="mt-3">
                    {p.limites.map((l) => (
                      <View
                        key={l.label}
                        className="flex-row items-baseline justify-between gap-3 py-0.5"
                      >
                        <Text variant="caption">{l.label}</Text>
                        <Text variant="caption" numeric className="font-sans-medium">
                          {l.valeur}
                        </Text>
                      </View>
                    ))}
                  </View>

                  {p.fonctions.length > 0 ? (
                    <View className="mt-3 gap-1">
                      {p.fonctions.slice(0, 6).map((f) => (
                        <View key={f} className="flex-row items-start gap-2">
                          <Icon name="Check" size={14} color="success" />
                          <Text variant="caption" className="min-w-0 flex-1">
                            {f}
                          </Text>
                        </View>
                      ))}
                    </View>
                  ) : null}

                  <View className="mt-4">
                    <Button
                      fullWidth
                      variant={courant ? "outline" : "primary"}
                      disabled={a.desactive || !enLigne}
                      onPress={() => void payer(p, a.mode)}
                    >
                      {a.label}
                    </Button>
                    {a.raison ? (
                      <Text variant="caption" className="mt-1">
                        {a.raison}
                      </Text>
                    ) : null}
                  </View>
                </Card>
              );
            })
          )}
          <Banner
            tone="info"
            title="Le paiement se fait dans votre navigateur"
            message="Le tunnel Moko s'ouvre hors de l'application, où vous voyez l'adresse du site avant de saisir un moyen de paiement. Revenez ici ensuite : l'état se remet à jour."
          />
        </View>
      ) : null}

      {onglet === "historique" ? (
        <View className="mt-4 gap-4">
          <Section title={`Paiements (${paiements.length})`}>
            <Card className="overflow-hidden p-0">
              {paiements.length === 0 ? (
                <View className="p-4">
                  <Text variant="caption">Aucun paiement enregistré.</Text>
                </View>
              ) : (
                paiements.map((p, i) => {
                  const st = STATUT_PAIEMENT[p.statut];
                  return (
                    <View key={p.id}>
                      {i > 0 ? <Divider /> : null}
                      <View className="flex-row items-start gap-3 px-4 py-3">
                        <View className="min-w-0 flex-1">
                          <Text variant="bodySmall" numberOfLines={1} className="font-sans-medium">
                            {p.reference || "Paiement"}
                          </Text>
                          <Text variant="caption" numberOfLines={1}>
                            {[p.moyen, p.paye ? formatDateFr(p.paye) : null]
                              .filter(Boolean)
                              .join(" · ")}
                          </Text>
                        </View>
                        <View className="shrink-0 items-end gap-1">
                          <Badge tone={st?.ton ?? "neutral"}>
                            {p.statutLabel}
                          </Badge>
                          <Text variant="bodySmall" numeric className="font-sans-semibold">
                            {money.money(p.montant, p.devise)}
                          </Text>
                        </View>
                      </View>
                    </View>
                  );
                })
              )}
            </Card>
          </Section>

          <Section title={`Factures (${factures.length})`}>
            <Card className="overflow-hidden p-0">
              {factures.length === 0 ? (
                <View className="p-4">
                  <Text variant="caption">Aucune facture émise.</Text>
                </View>
              ) : (
                factures.map((f, i) => (
                  <View key={f.id}>
                    {i > 0 ? <Divider /> : null}
                    <View className="flex-row items-start gap-3 px-4 py-3">
                      <View className="min-w-0 flex-1">
                        <Text variant="bodySmall" numberOfLines={1} className="font-sans-medium">
                          {f.numero}
                        </Text>
                        <Text variant="caption" numberOfLines={1}>
                          {[
                            f.emise ? `Émise le ${formatDateFr(f.emise)}` : null,
                            f.payee ? `payée le ${formatDateFr(f.payee)}` : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </Text>
                      </View>
                      <View className="shrink-0 items-end gap-1">
                        <Badge tone={f.payee ? "success" : "warning"}>
                          {f.statutLabel}
                        </Badge>
                        <Text variant="bodySmall" numeric className="font-sans-semibold">
                          {money.money(f.total, f.devise)}
                        </Text>
                      </View>
                    </View>
                  </View>
                ))
              )}
            </Card>
          </Section>
        </View>
      ) : null}
    </Screen>
  );
}
