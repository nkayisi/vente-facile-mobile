/**
 * Feuille de comptage. Miroir de `app/dashboard/inventory/[id]/page.tsx`.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ C'EST L'ÉCRAN QUI JUSTIFIE LE MOBILE. On compte DEBOUT, dans le rayon,   │
 * │ souvent au fond d'un dépôt sans réseau.                                  │
 * │                                                                          │
 * │ Trois conséquences, et aucune n'est négociable :                         │
 * │  - la feuille est descendue AVEC sa session, elle s'ouvre hors ligne ;   │
 * │  - le comptage part au journal, pas dans la table tirée ;                │
 * │  - ce qui vient d'être saisi se lit sur la ligne, marqué « à envoyer ».  │
 * │    Sans cela, le magasinier recompterait ce qu'il vient de compter.      │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * **On compte en CONTENANTS + UNITÉS**, parce que c'est ainsi qu'on compte un
 * rayon : trois casiers et sept bouteilles, pas quarante-trois.
 */
import { useCallback, useMemo, useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { formatDateTimeFr, formatPrice, pluralizeUnit } from "@vente-facile/core";

import { useLecture } from "@/data/live";
import {
  STATUT_INVENTAIRE,
  detailSession,
  type LigneComptage,
} from "@/data/inventaire";
import {
  comptagesEnAttente,
  creationsEnAttente,
  enregistrerComptages,
  sessionsEnAttente,
  transitionSession,
  type TransitionSession,
} from "@/features/inventaire/actes";
import { useSession } from "@/session/provider";
import {
  AlertDialog, AppBar, Badge, Banner, Button, Card, CardHeader, DataList,
  DataRow, EmptyState, FormField, Input, ProgressBar, Screen, Sheet, Spinner,
  Text, useToast,
} from "@/ui";

const TABLES = ["inventory_sessions", "inventory_counts", "products", "warehouses", "units"];

/**
 * Ce qui est proposé, selon l'état de la session ET LE DROIT.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ SEUL LE COMPTAGE ÉTAIT GARDÉ, LES QUATRE TRANSITIONS NE L'ÉTAIENT PAS.  │
 * │                                                                          │
 * │ Démarrer, soumettre, valider et annuler étaient proposés à quiconque     │
 * │ atteignait cet écran. Le back-office les réserve depuis toujours         │
 * │ (`InventorySessionViewSet.action_permissions`), et le serveur les refuse │
 * │ désormais aussi sur le chemin du journal : sans ce filtre, le magasinier │
 * │ verrait un bouton « Valider » qui part en opération bloquée.             │
 * │                                                                          │
 * │ Le motif est celui de `transfert/[id].tsx`, qui le fait déjà bien.       │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const ACTIONS: Record<
  TransitionSession,
  {
    label: string;
    depuis: string[];
    permission: string;
    question: string;
    destructif?: boolean;
  }
> = {
  start: {
    label: "Démarrer le comptage",
    depuis: ["draft"],
    permission: "inventory.start",
    question:
      "Le stock des produits visés est VERROUILLÉ et la feuille de comptage est engendrée avec le stock théorique du moment.",
  },
  submit: {
    label: "Soumettre pour révision",
    depuis: ["in_progress"],
    permission: "inventory.submit",
    question:
      "Toutes les lignes doivent être comptées. La session passe en révision, le stock ne bouge pas encore.",
  },
  validate: {
    label: "Valider l'inventaire",
    depuis: ["review"],
    permission: "inventory.validate",
    question:
      "Les écarts sont APPLIQUÉS au stock et des mouvements sont écrits. Cette opération ne se défait pas.",
  },
  cancel: {
    label: "Annuler la session",
    depuis: ["draft", "in_progress", "review"],
    permission: "inventory.cancel",
    question: "La session est annulée, le stock se déverrouille et ne bouge pas.",
    destructif: true,
  },
};

export default function FeuilleComptage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const toast = useToast();
  const { can } = useSession();

  const [ligneOuverte, setLigneOuverte] = useState<LigneComptage | null>(null);
  const [contenants, setContenants] = useState("");
  const [vrac, setVrac] = useState("");
  const [confirmation, setConfirmation] = useState<TransitionSession | null>(null);
  const [envoi, setEnvoi] = useState(false);

  const charger = useCallback(() => detailSession(id), [id]);
  const { donnees: s, chargement } = useLecture(charger, { tables: TABLES, deps: [id] });
  const chargerAttente = useCallback(() => comptagesEnAttente(id), [id]);
  const { donnees: attente } = useLecture(chargerAttente, {
    tables: ["outbox_operations"],
    deps: [id],
  });
  const { donnees: sessionsFile } = useLecture(sessionsEnAttente, {
    tables: ["outbox_operations"],
  });
  // Une session tout juste créée n'est PAS dans la table tirée, et ne doit pas
  // y être. Sans cette lecture, sa propre fiche la déclarerait introuvable
  // trois secondes après l'avoir créée.
  const { donnees: creations } = useLecture(creationsEnAttente, {
    tables: ["outbox_operations"],
  });

  /**
   * La feuille FUSIONNE la table tirée et le journal.
   *
   * La table dit ce que le serveur sait ; le journal, ce que le magasinier
   * vient de saisir. Sans cette fusion, il recompterait ce qu'il vient de
   * compter - c'est la contrepartie directe de « on n'écrit rien dans une
   * table tirée ».
   */
  const lignes = useMemo(() => {
    if (!s) return [];
    return s.lignes.map((l) => {
      const saisi = attente?.get(l.id);
      if (!saisi) return { ...l, enAttente: false };
      const compte = saisi.total;
      const contenants = saisi.contenants ?? 0;
      const vracSaisi = saisi.vrac ?? compte;
      const mot = (n: number) => pluralizeUnit(l.uniteDetail ?? "unité", n);
      return {
        ...l,
        estCompte: true,
        enAttente: true,
        compte,
        compteContenants: contenants,
        compteVrac: vracSaisi,
        compteAffiche: l.facteur
          ? `${contenants} ${pluralizeUnit(l.uniteContenant ?? "contenant", contenants)} + ${vracSaisi} ${mot(vracSaisi)}`
          : `${compte} ${mot(compte)}`,
        ecart: compte - l.attendu,
        ecartAffiche: `${compte - l.attendu > 0 ? "+" : ""}${compte - l.attendu}`,
      };
    });
  }, [s, attente]);

  const comptees = lignes.filter((l) => l.estCompte).length;

  if (chargement && !s) {
    return (
      <Screen>
        <AppBar title="Inventaire" />
        <View className="flex-1 items-center justify-center">
          <Spinner />
        </View>
      </Screen>
    );
  }

  if (!s) {
    const creee = creations?.find((c) => c.id === id);
    if (creee) {
      return (
        <Screen scroll padded={false}>
          <AppBar
            title={creee.nom}
            right={<Badge tone="warning">En attente d&apos;envoi</Badge>}
          />
          <View className="gap-4 p-4">
            <Banner
              tone="info"
              title="Session créée, pas encore envoyée"
              message="Elle partira à la prochaine synchronisation."
            />
            {/*
              LA FEUILLE EST ENGENDRÉE PAR LE SERVEUR, au démarrage. C'est une
              vraie limite du hors-ligne, et la dire vaut mieux que d'afficher
              une feuille vide : le magasinier saurait sinon qu'il peut compter,
              et son travail n'aurait nulle part où aller.
            */}
            <Card>
              <CardHeader title="Le comptage attend la synchronisation" />
              <Text variant="bodySmall">
                La feuille de comptage est engendrée par le serveur au
                démarrage de la session, avec le stock théorique du moment.
                Tant que la session n&apos;est pas partie, il n&apos;y a rien à
                compter.
              </Text>
            </Card>
            <Button variant="outline" fullWidth onPress={() => router.back()}>
              Revenir aux sessions
            </Button>
          </View>
        </Screen>
      );
    }
    return (
      <Screen padded={false}>
        <AppBar title="Inventaire" />
        <EmptyState
          icon="ClipboardList"
          title="Session introuvable"
          message="Elle n'est pas encore descendue sur ce terminal, ou elle a été supprimée."
          action={{ label: "Retour", onPress: () => router.back() }}
        />
      </Screen>
    );
  }

  const st = STATUT_INVENTAIRE[s.statut];
  const enFile = sessionsFile?.has(s.id) ?? false;
  const possibles = (Object.keys(ACTIONS) as TransitionSession[]).filter(
    (a) => ACTIONS[a].depuis.includes(s.statut) && can(ACTIONS[a].permission)
  );
  const peutCompter = s.statut === "in_progress" && can("inventory.count");

  const ouvrir = (l: LigneComptage) => {
    setLigneOuverte(l);
    setContenants(l.estCompte ? String(l.compteContenants) : "");
    setVrac(l.estCompte ? String(l.compteVrac) : "");
  };

  const enregistrer = async () => {
    if (!ligneOuverte || envoi) return;
    const nc = Number(contenants.replace(",", ".")) || 0;
    const nv = Number(vrac.replace(",", ".")) || 0;
    const total = ligneOuverte.facteur ? nc * ligneOuverte.facteur + nv : nv;
    setEnvoi(true);
    try {
      await enregistrerComptages(s.id, [
        {
          ligne: ligneOuverte.id,
          total,
          ...(ligneOuverte.facteur ? { contenants: nc, vrac: nv } : {}),
        },
      ]);
      setLigneOuverte(null);
    } catch (e) {
      toast.erreur(e instanceof Error ? e.message : "Le comptage n'a pas pu être enregistré.");
    } finally {
      setEnvoi(false);
    }
  };

  const executer = async (transition: TransitionSession) => {
    if (envoi) return;
    setEnvoi(true);
    try {
      await transitionSession(s.id, transition);
      setConfirmation(null);
      toast.succes("Opération mise en file. Elle partira à la prochaine synchronisation.");
    } catch (e) {
      toast.erreur(e instanceof Error ? e.message : "L'opération n'a pas pu être mise en file.");
    } finally {
      setEnvoi(false);
    }
  };

  const enTete = (
    <View className="gap-4 px-4 pb-3 pt-2">
      {enFile ? (
        <Banner
          tone="warning"
          title="Une opération attend son envoi"
          message="Le statut ne changera qu'après synchronisation."
        />
      ) : null}

      {s.lignes.length > 0 ? (
        <Card>
          <View className="flex-row items-baseline justify-between gap-3">
            <Text variant="caption">Avancement du comptage</Text>
            <Text variant="bodySmall" numeric className="font-sans-medium">
              {`${comptees} / ${s.lignes.length}`}
            </Text>
          </View>
          <View className="mt-2">
            <ProgressBar valeur={comptees} max={s.lignes.length || 1} />
          </View>
          {s.valeurEcart !== 0 ? (
            <Text variant="caption" className="mt-2">
              {`Valeur de l'écart : ${formatPrice(s.valeurEcart)}`}
            </Text>
          ) : null}
        </Card>
      ) : null}

      {possibles.length > 0 && !enFile ? (
        <View className="gap-2">
          {possibles
            .filter((a) => a !== "cancel")
            .map((a) => (
              <Button key={a} fullWidth size="lg" onPress={() => setConfirmation(a)}>
                {ACTIONS[a].label}
              </Button>
            ))}
          {possibles.includes("cancel") ? (
            <Button
              variant="destructive"
              fullWidth
              leftIcon="XCircle"
              onPress={() => setConfirmation("cancel")}
            >
              Annuler la session
            </Button>
          ) : null}
        </View>
      ) : null}

      {s.statut === "draft" ? (
        <Banner
          tone="info"
          title="La feuille n'existe pas encore"
          message="Elle est engendrée au démarrage, avec le stock théorique du moment. C'est cet instantané qui sert de référence à l'écart."
        />
      ) : null}
    </View>
  );

  return (
    <Screen padded={false}>
      <AppBar
        title={s.nom}
        subtitle={[s.reference, s.entrepot].filter(Boolean).join(" · ")}
        right={st ? <Badge tone={st.ton}>{st.label}</Badge> : undefined}
      />
      <DataList
        donnees={lignes}
        cle={(l) => l.id}
        enTete={enTete}
        vide={{
          icon: "ClipboardList",
          titre: s.statut === "draft" ? "Comptage pas encore démarré" : "Aucune ligne",
          message:
            s.statut === "draft"
              ? "Démarrez la session pour engendrer la feuille."
              : "Cette session ne vise aucun produit en stock.",
        }}
        rendu={(l) => (
          <DataRow
            principal={l.produit}
            secondaire={`Théorique ${l.attenduAffiche}`}
            badge={
              l.enAttente ? (
                <Badge tone="warning">À envoyer</Badge>
              ) : l.estCompte ? (
                <Badge tone="success">Compté</Badge>
              ) : undefined
            }
            valeur={
              <Text
                variant="bodySmall"
                numeric
                className={`font-sans-medium ${
                  !l.estCompte
                    ? "text-muted-foreground"
                    : l.ecart < 0
                      ? "text-destructive"
                      : l.ecart > 0
                        ? "text-success"
                        : ""
                }`}
              >
                {l.estCompte ? l.compteAffiche : "À compter"}
              </Text>
            }
            sousValeur={l.estCompte && l.ecart !== 0 ? l.ecartAffiche : null}
            onPress={peutCompter ? () => ouvrir(l) : undefined}
          />
        )}
      />

      <Sheet
        ouvert={ligneOuverte !== null}
        onFermer={() => setLigneOuverte(null)}
        titre={ligneOuverte?.produit}
      >
        {ligneOuverte ? (
          <>
            <Text variant="caption">
              {`Théorique : ${ligneOuverte.attenduAffiche}`}
            </Text>
            {ligneOuverte.facteur ? (
              <FormField
                label={`Contenants (${pluralizeUnit(ligneOuverte.uniteContenant ?? "contenant", 2)})`}
                hint={`Chacun vaut ${ligneOuverte.facteur} ${pluralizeUnit(ligneOuverte.uniteDetail ?? "unité", ligneOuverte.facteur)}.`}
              >
                <Input
                  value={contenants}
                  onChangeText={setContenants}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  autoFocus
                />
              </FormField>
            ) : null}
            <FormField
              label={
                ligneOuverte.facteur
                  ? `Unités isolées (${pluralizeUnit(ligneOuverte.uniteDetail ?? "unité", 2)})`
                  : `Quantité comptée (${pluralizeUnit(ligneOuverte.uniteDetail ?? "unité", 2)})`
              }
              required
            >
              <Input
                value={vrac}
                onChangeText={setVrac}
                keyboardType="decimal-pad"
                placeholder="0"
                autoFocus={!ligneOuverte.facteur}
              />
            </FormField>
            <Button fullWidth size="lg" disabled={envoi} onPress={() => void enregistrer()}>
              {envoi ? "Enregistrement…" : "Enregistrer le comptage"}
            </Button>
          </>
        ) : null}
      </Sheet>

      <AlertDialog
        ouvert={confirmation !== null}
        titre={confirmation ? ACTIONS[confirmation].label + " ?" : ""}
        message={confirmation ? ACTIONS[confirmation].question : undefined}
        confirmer={confirmation ? ACTIONS[confirmation].label : ""}
        annuler="Revenir"
        destructif={confirmation ? Boolean(ACTIONS[confirmation].destructif) : false}
        enCours={envoi}
        onConfirmer={() => confirmation && void executer(confirmation)}
        onAnnuler={() => setConfirmation(null)}
      />
    </Screen>
  );
}
