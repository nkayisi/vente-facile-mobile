/**
 * Caisses. Miroir de `app/dashboard/sales/registers/page.tsx`.
 *
 * Une carte par comptoir, dans l'ordre du web : celle dont une session est
 * ouverte d'abord, puis les actives, puis les désactivées.
 *
 * **Le même bloc des deux côtés, session ouverte ou non.** C'est ce qui aligne
 * les cartes et évite le trou sous celle qui n'a rien à dire, exactement comme
 * le back-office l'a appris.
 *
 * **Créer, renommer ou supprimer une caisse ne se fait pas ici.** Le journal ne
 * porte pas d'acte `register.*` : le serveur ne saurait pas le rejouer, et un
 * bouton qui part en quarantaine est pire que pas de bouton. Cela se fait au
 * back-office, et l'écran le dit plutôt que de laisser chercher.
 */
import { useCallback, useRef, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";

import { parcDeCaisses, type CaisseParc } from "@/data/caisses";
import { useMonnaie } from "@/data/devises";
import { useLecture } from "@/data/live";
import { depuis } from "@/data/ventes";
import { ouvrirSession } from "@/features/pos/caisse";
import { libelleEnvoi } from "@/data/envoi";
import { useSession } from "@/session/provider";
import {
  AppBar, Badge, Banner, Button, Card, Divider, EmptyState, FormField, Icon,
  Input, MultiCurrencyTotal, Screen, SearchInput, Sheet, Spinner, Text, useToast,
} from "@/ui";

const TABLES = ["registers", "register_sessions", "warehouses", "sales", "users"];

export default function Caisses() {
  const money = useMonnaie();
  const toast = useToast();
  const { can } = useSession();

  const [recherche, setRecherche] = useState("");
  const [aOuvrir, setAOuvrir] = useState<CaisseParc | null>(null);
  const [fond, setFond] = useState("");
  const [enCours, setEnCours] = useState(false);
  const verrou = useRef(false);

  const charger = useCallback(() => parcDeCaisses(recherche), [recherche]);
  const { donnees, chargement } = useLecture(charger, {
    tables: [...TABLES, "outbox_operations"],
    deps: [recherche],
  });

  const ouvrir = async () => {
    // Verrou SYNCHRONE avant tout `setState` : deux appuis rapprochés
    // ouvriraient deux sessions sur le même comptoir, dont l'une serait
    // refusée avec toutes les ventes qui s'y rattachent.
    if (verrou.current || !aOuvrir) return;
    verrou.current = true;
    setEnCours(true);
    try {
      await ouvrirSession(aOuvrir.id, fond);
      setAOuvrir(null);
      setFond("");
      toast.succes(`Session ouverte sur ${aOuvrir.nom}.`);
    } catch (e) {
      toast.erreur(e instanceof Error ? e.message : "La session n'a pas pu être ouverte.");
    } finally {
      verrou.current = false;
      setEnCours(false);
    }
  };

  const parc = donnees?.caisses ?? [];
  const ouvertes = donnees?.nbSessionsOuvertes ?? 0;

  const sousTitre =
    parc.length === 0
      ? undefined
      : `${parc.length} caisse${parc.length > 1 ? "s" : ""} · ${
          ouvertes > 0
            ? `${ouvertes} session${ouvertes > 1 ? "s" : ""} ouverte${ouvertes > 1 ? "s" : ""}`
            : "aucune session ouverte"
        }`;

  if (chargement && !donnees) {
    return (
      <Screen>
        <AppBar title="Caisses" />
        <View className="flex-1 items-center justify-center">
          <Spinner />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll padded={false}>
      <AppBar title="Caisses" subtitle={sousTitre} />

      <View className="gap-4 p-4">
        <SearchInput
          valeur={recherche}
          onChange={setRecherche}
          placeholder="Rechercher une caisse..."
          accessibilityLabel="Rechercher une caisse"
        />

        {parc.length === 0 ? (
          <EmptyState
            icon="Calculator"
            title={recherche ? "Aucune caisse ne correspond" : "Aucune caisse"}
            message={
              recherche
                ? "Essayez un autre nom ou un autre code."
                : "Aucune caisse n'est descendue sur ce terminal. Créez-en une au back-office, puis synchronisez."
            }
          />
        ) : (
          parc.map((c) => (
            <Card key={c.id} className="p-4">
              <View className="flex-row items-start gap-3">
                <View
                  className={`h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                    c.session ? "bg-success/15" : "bg-muted"
                  }`}
                >
                  <Icon
                    name="Calculator"
                    size={20}
                    color={c.session ? "success" : "mutedForeground"}
                  />
                </View>
                <View className="min-w-0 flex-1">
                  <Text variant="label" numberOfLines={1}>
                    {c.nom}
                  </Text>
                  <Text variant="caption" numberOfLines={1}>
                    {c.code}
                  </Text>
                </View>
              </View>

              <View className="mt-3 flex-row flex-wrap items-center gap-2">
                <Badge tone={c.actif ? "success" : "neutral"}>
                  {c.actif ? "Active" : "Inactive"}
                </Badge>
                <Badge tone="neutral">{c.entrepot ?? "Aucun entrepôt"}</Badge>
              </View>

              {c.session ? (
                // Une ouverture BLOQUÉE n'est pas une session ouverte : la
                // peindre en vert la ferait passer pour acquise, alors qu'elle
                // attend une décision et ne partira pas d'elle-même.
                <View
                  className={
                    c.session.envoi === "bloque"
                      ? "mt-3 rounded-lg border border-solid border-warning/40 bg-warning/10 p-3"
                      : "mt-3 rounded-lg border border-solid border-success/30 bg-success/10 p-3"
                  }
                >
                  <View className="flex-row items-center justify-between gap-2">
                    <View className="min-w-0 flex-row items-center gap-2">
                      <Icon
                        name={c.session.envoi === "bloque" ? "AlertTriangle" : "CheckCircle2"}
                        size={16}
                        color={c.session.envoi === "bloque" ? "warning" : "success"}
                      />
                      <Text variant="bodySmall" className="font-sans-medium">
                        {libelleEnvoi(c.session.envoi)?.court ?? "Session ouverte"}
                      </Text>
                    </View>
                    {c.session.ouverteLe ? (
                      <Text variant="caption" className="shrink-0">
                        {depuis(c.session.ouverteLe)}
                      </Text>
                    ) : null}
                  </View>
                  {c.session.parQui ? (
                    <Text variant="caption" numberOfLines={1} className="mt-1">
                      {`Par ${c.session.parQui}`}
                    </Text>
                  ) : null}
                  <View className="mt-2 border-t border-success/30 pt-2">
                    <View className="flex-row items-start justify-between gap-3">
                      <View>
                        <Text variant="caption">Ventes</Text>
                        <Text variant="bodySmall" numeric className="font-sans-semibold">
                          {String(c.session.nbVentes)}
                        </Text>
                      </View>
                      <View className="items-end">
                        <Text variant="caption">Encaissé</Text>
                        {/* Une ligne PAR DEVISE : un tiroir contient des billets
                            de plusieurs devises, qui ne s'additionnent pas. */}
                        <MultiCurrencyTotal
                          lignes={c.session.encaisseParDevise}
                          money={money.money}
                          vide={money.money(0, money.primaryCode)}
                        />
                      </View>
                    </View>
                  </View>
                </View>
              ) : (
                <View className="mt-3 rounded-lg border border-dashed border-border bg-muted/40 p-3">
                  <View className="flex-row items-center gap-2">
                    <Icon name="PauseCircle" size={16} color="mutedForeground" />
                    <Text variant="bodySmall" className="font-sans-medium">
                      Aucune session ouverte
                    </Text>
                  </View>
                  <Text variant="caption" className="mt-1">
                    {c.actif
                      ? "Ouvrez une session pour encaisser sur cette caisse."
                      : "Cette caisse est désactivée : réactivez-la au back-office pour l'utiliser."}
                  </Text>
                </View>
              )}

              <View className="mt-3 gap-2">
                {c.session ? (
                  <View className="flex-row gap-2">
                    <Button
                      variant="outline"
                      className="flex-1"
                      leftIcon="Calculator"
                      // Une ouverture non confirmée n'a pas de session côté
                      // serveur : la clôturer partirait forcément en refus.
                      disabled={c.session.envoi !== "envoye"}
                      onPress={() => router.push(`/cloture/${c.session?.id}`)}
                    >
                      Clôturer
                    </Button>
                    <Button
                      className="flex-1"
                      leftIcon="ShoppingCart"
                      onPress={() => router.push("/vendre")}
                    >
                      Continuer
                    </Button>
                  </View>
                ) : can("sales.create") ? (
                  <Button
                    fullWidth
                    leftIcon="Plus"
                    disabled={!c.actif}
                    onPress={() => {
                      setAOuvrir(c);
                      setFond("");
                    }}
                  >
                    Ouvrir une session
                  </Button>
                ) : null}
                <Button
                  variant="ghost"
                  fullWidth
                  leftIcon="Receipt"
                  onPress={() => router.push(`/caisses/${c.id}`)}
                >
                  Clôtures passées
                </Button>
              </View>
            </Card>
          ))
        )}

        <Banner
          tone="info"
          title="Les caisses se créent au back-office"
          message="Renommer, désactiver ou supprimer une caisse n'est pas un acte que le terminal sait mettre en file. Faites-le au back-office, puis synchronisez."
        />
      </View>

      <Sheet
        ouvert={aOuvrir !== null}
        onFermer={() => setAOuvrir(null)}
        titre={aOuvrir ? `Ouvrir ${aOuvrir.nom}` : "Ouvrir la caisse"}
      >
        <Text variant="bodySmall">
          Une vente s&apos;attache à une session de caisse : c&apos;est elle qui
          dit d&apos;où sort le stock et où entre l&apos;argent.
        </Text>
        <FormField
          label="Fond de caisse"
          hint="Ce qui est déjà dans le tiroir. Il se corrige à la clôture."
        >
          <Input
            value={fond}
            onChangeText={setFond}
            keyboardType="decimal-pad"
            placeholder="0"
            autoFocus
          />
        </FormField>
        <Button fullWidth size="lg" disabled={enCours} onPress={() => void ouvrir()}>
          {enCours ? "Ouverture..." : "Ouvrir la session"}
        </Button>
      </Sheet>
    </Screen>
  );
}
