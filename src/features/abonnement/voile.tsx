/**
 * La surcouche de blocage. Miroir de `SubscriptionBlockedOverlay` du web.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ELLE DIT POURQUOI, ET CE QUI N'EST PAS PERDU.                           │
 * │                                                                          │
 * │ Le marchand vient d'être coupé du comptoir avec lequel il gagne sa       │
 * │ journée. La première question qu'il se pose n'est pas « que dois-je      │
 * │ payer », c'est « où sont mes ventes ». Une surcouche qui se contente de  │
 * │ dire « bloqué » se lit comme une perte de données, et c'est la règle     │
 * │ déjà posée par `HorsLigneBloquant` : un blocage sans raison se lit comme │
 * │ une panne.                                                               │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * **Deux visages, selon le rôle.** Régler l'abonnement est réservé au
 * propriétaire (`moko_initiate` est `IsTenantOwner`). Offrir le bouton à un
 * caissier ferait saisir un numéro de téléphone pour se faire refuser ensuite :
 * on nomme qui doit payer, et c'est tout.
 */
import { useCallback, useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  etatAbonnement,
  plansDisponibles,
  type EtatAbonnement,
  type PlanAbonnement,
} from "@/data/abonnement";
import { useEnLigne } from "@/data/reseau";
import { useDeconnexion } from "@/session/deconnexion";
import { useSession } from "@/session/provider";
import { Badge, Button, Card, Icon, Text, useToast } from "@/ui";

import { planAProposer } from "./eligibilite";
import { FeuillePaiement } from "./feuille-paiement";
import type { MotifPorteFermee } from "./porte";

/** Le titre suit l'état réel, pas un texte unique qui vaudrait pour tout. */
function titreDe(statut: string, motif: MotifPorteFermee): string {
  if (statut === "none") return "Aucun abonnement actif";
  if (statut === "suspended") return "Compte suspendu";
  if (statut === "expired" || motif === "echeance") return "Votre abonnement a expiré";
  return "Renouvellement requis";
}

export function VoileAbonnement({
  motif,
  enAttente,
  onActualiser,
}: {
  motif: MotifPorteFermee;
  /** Opérations encore dans le journal : ce qui n'est pas perdu. */
  enAttente: number;
  onActualiser: () => Promise<void>;
}) {
  const { snapshot } = useSession();
  // ⚠ Jamais `logout()` en direct : la séquence de déconnexion tente D'ABORD
  // de vider la file, et elle NOMME ce qui ne peut pas partir. Sous un voile
  // d'abonnement, rien ne peut partir - c'est exactement ce que le marchand
  // doit lire avant de quitter, plutôt que de l'apprendre plus tard.
  const { demander: demanderDeconnexion } = useDeconnexion();
  const enLigne = useEnLigne();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const [actualisation, setActualisation] = useState(false);
  const [feuille, setFeuille] = useState(false);
  const [plans, setPlans] = useState<PlanAbonnement[]>([]);
  const [etat, setEtat] = useState<EtatAbonnement | null>(null);

  const abonnement = snapshot?.subscription ?? null;
  const peutRegler = abonnement?.can_manage ?? false;
  const organisation = snapshot?.organization.id ?? null;

  /**
   * Les plans se chargent EN AVANCE, pendant que le marchand lit le voile.
   *
   * Sans cela, « Régler mon abonnement » ouvrirait une feuille vide le temps
   * d'un aller-retour - sur un écran où l'on vient justement de lui dire que
   * sa caisse est fermée, une seconde d'attente de plus se lit comme une
   * panne de plus.
   */
  useEffect(() => {
    if (!organisation || !peutRegler || !enLigne) return;
    let vivant = true;
    void (async () => {
      try {
        const [liste, lu] = await Promise.all([
          plansDisponibles(organisation),
          etatAbonnement(organisation).catch(() => null),
        ]);
        if (!vivant) return;
        setPlans(liste);
        setEtat(lu);
      } catch {
        // La feuille dira elle-même qu'elle n'a rien à proposer.
      }
    })();
    return () => {
      vivant = false;
    };
  }, [organisation, peutRegler, enLigne]);

  /**
   * Le plan proposé d'emblée, et il doit être PAYABLE.
   *
   * ⚠ Ici personne ne choisit : le voile ouvre sa feuille directement. Prendre
   * le premier plan venu menait au mur - le marchand saisissait son numéro
   * pour lire ensuite que le serveur refuse cette offre-là.
   */
  const propose = planAProposer(plans, etat);

  const fermerFeuille = useCallback(() => setFeuille(false), []);

  const actualiser = async () => {
    if (!enLigne) {
      // ⚠ Ni « réessayez », ni « synchronisez » : hors ligne, les deux sont
      // sans effet, et les proposer envoie chercher une panne qui n'existe pas.
      toast.erreur("Sans réseau, l'abonnement ne peut pas être relu.");
      return;
    }
    setActualisation(true);
    try {
      await onActualiser();
    } finally {
      setActualisation(false);
    }
  };

  return (
    <View
      className="absolute inset-0 z-50 bg-background"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
        className="px-6"
      >
        <View className="items-center gap-3">
          <View className="h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
            <Icon name="Lock" size={32} color="destructive" />
          </View>
          <Text variant="h4" className="text-center">
            {titreDe(abonnement?.status ?? "none", motif)}
          </Text>
          {abonnement?.message ? (
            <Text variant="muted" className="text-center">
              {abonnement.message}
            </Text>
          ) : (
            <Text variant="muted" className="text-center">
              Pour continuer à utiliser Vente Facile, l&apos;abonnement doit être réglé.
            </Text>
          )}
          {motif === "echeance" ? (
            <Badge tone="warning">État arrêté au dernier passage en ligne</Badge>
          ) : null}
        </View>

        {/* Ce qui n'est PAS perdu : la question que le marchand se pose. */}
        <Card className="mt-6">
          <View className="flex-row items-start gap-3">
            <Icon name="ShieldAlert" size={18} color="mutedForeground" />
            <View className="min-w-0 flex-1 gap-1">
              <Text variant="label">Vos ventes sont intactes</Text>
              <Text variant="bodySmall" className="text-muted-foreground">
                {enAttente > 0
                  ? `${enAttente} opération${enAttente > 1 ? "s" : ""} attendent sur ce terminal. Elles repartiront seules dès que l'abonnement sera réglé. Rien n'est perdu.`
                  : "Tout ce qui a été encaissé sur ce terminal est conservé et repartira dès que l'abonnement sera réglé."}
              </Text>
            </View>
          </View>
        </Card>

        <View className="mt-6 gap-3">
          {peutRegler ? (
            <Button
              fullWidth
              leftIcon="CreditCard"
              disabled={!enLigne || !propose}
              onPress={() => setFeuille(true)}
            >
              Régler mon abonnement
            </Button>
          ) : (
            <Card>
              <Text variant="bodySmall">
                Seul le propriétaire du compte peut régler l&apos;abonnement.
                Prévenez-le : il peut le faire depuis son propre terminal ou
                depuis un navigateur.
              </Text>
            </Card>
          )}

          <Button
            fullWidth
            variant="outline"
            leftIcon="RefreshCw"
            loading={actualisation}
            onPress={() => void actualiser()}
          >
            Actualiser
          </Button>

          <Button
            fullWidth
            variant="ghost"
            leftIcon="LogOut"
            onPress={demanderDeconnexion}
          >
            Se déconnecter
          </Button>
        </View>

        {!enLigne && peutRegler ? (
          <Text variant="caption" className="mt-3 text-center">
            Le paiement demande une connexion : il passe par votre opérateur
            Mobile Money.
          </Text>
        ) : null}
      </ScrollView>

      {/*
        La feuille est portée par le VOILE, pas par une route. Un `Modal` de
        React Native s'affiche au-dessus de tout - voile compris - ce qui
        permet de payer sans ouvrir de brèche dans la porte.
      */}
      <FeuillePaiement
        ouvert={feuille}
        onFermer={fermerFeuille}
        plan={propose?.plan ?? null}
        mode={propose?.mode ?? "new"}
        finActuelle={etat?.finPeriode ?? null}
      />
    </View>
  );
}
