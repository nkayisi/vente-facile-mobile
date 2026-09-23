/**
 * Régler son abonnement, dans une feuille qui monte du bas.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE TUNNEL HÉBERGÉ N'EXISTE PAS, ET N'A JAMAIS EXISTÉ.                   │
 * │                                                                          │
 * │ Ce dépôt a longtemps écrit que le paiement Moko passait par une page web │
 * │ à lui, et que l'embarquer serait le motif de refus 4.2 de l'App Store.   │
 * │ Le checkout du back-office est en réalité un formulaire REST : deux      │
 * │ appels, et une confirmation USSD sur le téléphone du marchand. Il n'y a  │
 * │ donc ni WebView, ni redirection, ni rien à embarquer.                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * **Une feuille, et non une route**, pour deux raisons qui se cumulent :
 * elle monte du bas, sur le contenu qui reste visible derrière, comme tout
 * formulaire de la maison ; et surtout un `Modal` s'affiche AU-DESSUS du voile
 * de blocage, ce qui est la seule façon qu'un marchand enfermé puisse payer
 * sans qu'on ouvre une brèche dans la porte.
 *
 * ⚠ **Elle ne se ferme pas pendant l'envoi ni pendant l'attente.** Une demande
 * partie chez l'opérateur ne s'annule pas d'un geste, et refermer la feuille
 * perdrait la référence qu'il faut pour savoir ce qu'elle est devenue.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Image, View, type ImageSourcePropType } from "react-native";

import { readableMessage } from "@/api/errors";
import {
  CYCLES,
  DELAI_SONDAGE_MS,
  INTERVALLE_SONDAGE_MS,
  OPERATEURS,
  economieAnnuelle,
  finEstimee,
  initierPaiementMoko,
  montantDuCycle,
  numeroUtilisable,
  statutPaiementMoko,
  type CycleFacturation,
  type OperateurMoko,
  type PlanAbonnement,
} from "@/data/abonnement";
import { useMonnaie } from "@/data/devises";
import { formatDateFr } from "@vente-facile/core";
import { useSession } from "@/session/provider";
import { unblockAll } from "@/sync";
import {
  Badge, Banner, Button, Divider, Icon, Input, ProgressBar, Pressable,
  Sheet, Spinner, Text,
} from "@/ui";

/** Les logos, importés statiquement : Metro exige un chemin littéral. */
const LOGOS: Record<OperateurMoko, ImageSourcePropType> = {
  airtel: require("../../../assets/payment/airtel.png"),
  orange: require("../../../assets/payment/orange.png"),
  mpesa: require("../../../assets/payment/mpesa.png"),
  africell: require("../../../assets/payment/africell.png"),
};

type Etape = "formulaire" | "envoi" | "attente" | "reussi" | "echoue" | "indetermine";

export function FeuillePaiement({
  ouvert,
  onFermer,
  plan,
  mode,
  finActuelle,
}: {
  ouvert: boolean;
  onFermer: () => void;
  plan: PlanAbonnement | null;
  mode: "new" | "extend";
  /** Échéance en cours, pour annoncer la nouvelle en mode prolongation. */
  finActuelle: Date | null;
}) {
  const { snapshot, refresh } = useSession();
  const money = useMonnaie();
  const organisation = snapshot?.organization.id ?? null;

  const [cycle, setCycle] = useState<CycleFacturation>("monthly");
  const [operateur, setOperateur] = useState<OperateurMoko | null>(null);
  const [numero, setNumero] = useState("");
  const [etape, setEtape] = useState<Etape>("formulaire");
  const [message, setMessage] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);
  const [ecoule, setEcoule] = useState(0);

  const minuteur = useRef<ReturnType<typeof setInterval> | null>(null);
  const debut = useRef(0);

  const arreter = useCallback(() => {
    if (minuteur.current) {
      clearInterval(minuteur.current);
      minuteur.current = null;
    }
  }, []);

  useEffect(() => arreter, [arreter]);

  const conclureReussite = useCallback(async () => {
    arreter();
    setEtape("reussi");
    try {
      // L'ordre compte : le verdict frais rouvre la porte, PUIS la file repart
      // avec le droit d'aujourd'hui. L'inverse la ferait rebloquer aussitôt.
      await refresh();
      await unblockAll();
    } catch {
      // Le paiement a abouti, c'est l'essentiel : le prochain cycle de
      // synchronisation fera redescendre le verdict de toute façon.
    }
  }, [arreter, refresh]);

  const sonder = useCallback(
    async (ref: string) => {
      if (!organisation) return;
      const passe = Date.now() - debut.current;
      setEcoule(passe);
      if (passe >= DELAI_SONDAGE_MS) {
        arreter();
        setEtape("indetermine");
        return;
      }
      try {
        const r = await statutPaiementMoko(organisation, ref);
        if (r.statut === "completed") {
          await conclureReussite();
          return;
        }
        if (r.statut === "failed") {
          arreter();
          setMessage(r.message || "Le paiement a échoué.");
          setEtape("echoue");
        }
        // `pending` et `unknown` : on repasse au battement suivant. Une sonde
        // qui échoue n'est pas un paiement qui échoue - c'est la situation
        // ordinaire d'un réseau instable pendant qu'un USSD circule.
      } catch {
        // idem : on réessaiera.
      }
    },
    [organisation, arreter, conclureReussite]
  );

  const demarrerSondage = useCallback(
    (ref: string) => {
      debut.current = Date.now();
      setEcoule(0);
      setEtape("attente");
      void sonder(ref);
      minuteur.current = setInterval(() => void sonder(ref), INTERVALLE_SONDAGE_MS);
    },
    [sonder]
  );

  const payer = useCallback(async () => {
    if (!organisation || !plan || !operateur) return;
    setEtape("envoi");
    setMessage(null);
    try {
      const r = await initierPaiementMoko(organisation, {
        planId: plan.id, cycle, mode, operateur, numero,
      });
      setReference(r.reference);
      if (r.abonnementActive) {
        await conclureReussite();
        return;
      }
      setMessage(r.message || null);
      demarrerSondage(r.reference);
    } catch (e) {
      setMessage(
        readableMessage(
          (e as { body?: unknown })?.body,
          "Le paiement n'a pas pu être lancé."
        )
      );
      setEtape("echoue");
    }
  }, [organisation, plan, operateur, cycle, mode, numero, conclureReussite, demarrerSondage]);

  const fermer = useCallback(() => {
    arreter();
    setEtape("formulaire");
    setMessage(null);
    setReference(null);
    onFermer();
  }, [arreter, onFermer]);

  // ⚠ Pendant l'envoi et l'attente, la feuille ne se ferme pas : la demande
  // est partie chez l'opérateur, et perdre la référence empêcherait de savoir
  // ce qu'elle est devenue.
  const verrouillee = etape === "envoi" || etape === "attente";

  if (!plan) return null;

  const montant = montantDuCycle(plan, cycle);
  const numeroPret = numeroUtilisable(numero);
  const economie = economieAnnuelle(plan);
  const nouvelleFin = finEstimee(finActuelle, cycle, mode);

  // ------------------------------------------------------------- panneaux

  if (etape === "attente" || etape === "envoi") {
    const reste = Math.max(0, Math.ceil((DELAI_SONDAGE_MS - ecoule) / 1000));
    return (
      <Sheet ouvert={ouvert} onFermer={() => {}} titre="Confirmation en cours">
        <View className="items-center gap-5 px-2 py-6">
          <View className="h-24 w-24 items-center justify-center">
            <Spinner size="large" />
            {operateur ? (
              <View className="absolute h-12 w-12 items-center justify-center rounded-full bg-card">
                <Image
                  source={LOGOS[operateur]}
                  style={{ width: 30, height: 30 }}
                  resizeMode="contain"
                />
              </View>
            ) : null}
          </View>

          <View className="items-center gap-1">
            <Text variant="h4" className="text-center">
              Confirmez sur votre téléphone
            </Text>
            <Text variant="muted" className="text-center">
              {etape === "envoi"
                ? "Connexion au service de paiement…"
                : "Un message a été envoyé au numéro indiqué. Saisissez votre code PIN pour valider."}
            </Text>
          </View>

          {etape === "attente" ? (
            <>
              <View className="w-full gap-2">
                <ProgressBar valeur={ecoule} max={DELAI_SONDAGE_MS} />
                <Text variant="caption" numeric className="text-center">
                  {`${reste} s`}
                </Text>
              </View>

              <Text variant="caption" className="text-center">
                Ne fermez pas cette fenêtre.
              </Text>

              <View className="w-full gap-2">
                <Button
                  fullWidth
                  variant="outline"
                  leftIcon="RefreshCw"
                  onPress={() => reference && void sonder(reference)}
                >
                  Vérifier maintenant
                </Button>
                {/* « Quitter », jamais « Annuler » : on n'annule pas un
                    paiement Moko déjà parti, on cesse de le regarder. */}
                <Button fullWidth variant="ghost" onPress={fermer}>
                  Quitter le suivi
                </Button>
              </View>
            </>
          ) : null}
        </View>
      </Sheet>
    );
  }

  if (etape === "reussi") {
    return (
      <Sheet ouvert={ouvert} onFermer={fermer} titre="Paiement réussi">
        <View className="items-center gap-4 px-2 py-8">
          <View className="h-20 w-20 items-center justify-center rounded-full bg-success/10">
            <Icon name="Check" size={40} color="success" />
          </View>
          <Text variant="h4" className="text-center">
            Votre abonnement est actif
          </Text>
          <Text variant="muted" className="text-center">
            {`Plan ${plan.nom} · ${money.money(montant, plan.devise)}`}
          </Text>
          <Text variant="caption" className="text-center">
            Tout ce qui attendait sur ce terminal repart à la prochaine
            synchronisation.
          </Text>
          <Button fullWidth onPress={fermer}>
            Terminer
          </Button>
        </View>
      </Sheet>
    );
  }

  if (etape === "indetermine") {
    return (
      <Sheet ouvert={ouvert} onFermer={fermer} titre="Paiement en cours">
        <View className="items-center gap-4 px-2 py-8">
          <View className="h-20 w-20 items-center justify-center rounded-full bg-warning/10">
            <Icon name="Clock" size={36} color="warning" />
          </View>
          <Text variant="h4" className="text-center">
            Toujours en traitement
          </Text>
          {/* ⚠ Ce n'est PAS un échec, et le dire le serait. Le serveur confirme
              par trois voies indépendantes : cette sonde, le webhook de Moko et
              une tâche périodique. Écrire « réessayez » ferait payer deux fois. */}
          <Text variant="muted" className="text-center">
            Votre paiement n&apos;est pas perdu : dès que l&apos;opérateur le
            confirme, l&apos;abonnement s&apos;active tout seul. Ne le relancez
            pas.
          </Text>
          <View className="w-full gap-2">
            <Button
              fullWidth
              variant="outline"
              leftIcon="RefreshCw"
              onPress={() => reference && demarrerSondage(reference)}
            >
              Vérifier à nouveau
            </Button>
            <Button fullWidth variant="ghost" onPress={fermer}>
              Fermer
            </Button>
          </View>
        </View>
      </Sheet>
    );
  }

  return (
    <Sheet
      ouvert={ouvert}
      onFermer={verrouillee ? () => {} : fermer}
      titre={mode === "extend" ? "Prolonger l'abonnement" : "Régler l'abonnement"}
      pied={
        <Button
          fullWidth
          size="lg"
          disabled={!operateur || !numeroPret}
          onPress={() => void payer()}
        >
          {`Payer ${money.money(montant, plan.devise)}`}
        </Button>
      }
    >
      <View className="gap-5 py-2">
        {etape === "echoue" && message ? (
          <Banner tone="destructive" title="Paiement refusé" message={message} />
        ) : null}

        <View className="flex-row items-center gap-3 rounded-xl bg-primary/10 p-3">
          <View className="h-10 w-10 items-center justify-center rounded-lg bg-primary/15">
            <Icon name="Crown" size={20} color="primary" />
          </View>
          <View className="min-w-0 flex-1">
            <Text variant="label" numberOfLines={1}>
              {plan.nom}
            </Text>
            <Text variant="caption" numberOfLines={1}>
              {mode === "extend"
                ? "Prolongation de votre plan actuel"
                : "Nouvel abonnement"}
            </Text>
          </View>
        </View>

        {/* ---------------------------------------------------- fréquence */}
        <View className="gap-2">
          <Text variant="label">Fréquence</Text>
          {/* Le PRIX est dans la carte : c'est sur lui qu'on choisit, et un
              sélecteur qui ne montre que « Annuel » oblige à aller le chercher
              ailleurs pour décider. */}
          <View className="flex-row gap-2">
            {CYCLES.map((c) => {
              const actif = c.id === cycle;
              const prix = montantDuCycle(plan, c.id);
              return (
                <Pressable
                  key={c.id}
                  onPress={() => setCycle(c.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: actif }}
                  className={`flex-1 items-center rounded-xl border-2 p-3 ${
                    actif ? "border-primary bg-primary/5" : "border-border bg-card"
                  }`}
                >
                  <Text variant="caption" numberOfLines={1}>
                    {c.label}
                  </Text>
                  <Text
                    variant="body"
                    numeric
                    numberOfLines={1}
                    className="font-sans-semibold"
                  >
                    {money.money(prix, plan.devise)}
                  </Text>
                  {c.id === "yearly" && economie > 0 ? (
                    <View className="mt-1">
                      <Badge tone="success">{`-${economie} %`}</Badge>
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* ---------------------------------------------------- opérateur */}
        <View className="gap-2">
          <Text variant="label">Opérateur Mobile Money</Text>
          {/* On reconnaît son opérateur à son LOGO bien avant de lire son nom :
              c'est le geste le plus rapide de tout l'écran. */}
          <View className="flex-row flex-wrap gap-2">
            {OPERATEURS.map((o) => {
              const actif = o.id === operateur;
              return (
                <Pressable
                  key={o.id}
                  onPress={() => setOperateur(o.id)}
                  accessibilityRole="button"
                  accessibilityLabel={o.label}
                  accessibilityState={{ selected: actif }}
                  style={{ width: "48%" }}
                  className={`flex-row items-center gap-2 rounded-xl border-2 p-3 ${
                    actif ? "border-primary bg-primary/5" : "border-border bg-card"
                  }`}
                >
                  <Image
                    source={LOGOS[o.id]}
                    style={{ width: 32, height: 24 }}
                    resizeMode="contain"
                  />
                  <Text variant="bodySmall" numberOfLines={1} className="min-w-0 flex-1">
                    {o.court}
                  </Text>
                  {actif ? <Icon name="Check" size={16} color="primary" /> : null}
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* ------------------------------------------------------- numéro */}
        <View className="gap-2">
          <Text variant="label">
            Numéro Mobile Money <Text className="text-destructive">*</Text>
          </Text>
          <Input
            value={numero}
            onChangeText={setNumero}
            keyboardType="phone-pad"
            placeholder="0997057917"
            invalid={numero.length > 0 && !numeroPret}
            className="justify-center"
            style={{ textAlign: "center", letterSpacing: 2 }}
          />
          {numero.length > 0 && !numeroPret ? (
            <Text variant="caption" className="text-destructive">
              Ce numéro est trop court.
            </Text>
          ) : (
            <Text variant="caption">
              C&apos;est ce numéro qui recevra la demande de confirmation.
            </Text>
          )}
        </View>

        {/* -------------------------------------------------- récapitulatif */}
        <View className="gap-2 rounded-xl bg-muted p-4">
          {mode === "extend" && finActuelle && nouvelleFin ? (
            <>
              <View className="flex-row items-baseline justify-between gap-3">
                <Text variant="caption">Échéance actuelle</Text>
                <Text variant="bodySmall" numeric>
                  {formatDateFr(finActuelle)}
                </Text>
              </View>
              <View className="flex-row items-baseline justify-between gap-3">
                <Text variant="caption">Nouvelle échéance</Text>
                <Text variant="bodySmall" numeric className="font-sans-semibold text-success">
                  {formatDateFr(nouvelleFin)}
                </Text>
              </View>
              <Divider />
            </>
          ) : null}
          <View className="flex-row items-baseline justify-between gap-3">
            <Text variant="bodySmall" className="text-muted-foreground">
              Total à payer
            </Text>
            <Text variant="body" numeric className="font-sans-semibold">
              {money.money(montant, plan.devise)}
            </Text>
          </View>
        </View>
      </View>
    </Sheet>
  );
}
