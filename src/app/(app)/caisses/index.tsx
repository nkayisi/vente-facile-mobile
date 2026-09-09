/**
 * Caisses. Miroir de `app/dashboard/sales/registers/page.tsx`.
 *
 * Une carte par comptoir, dans l'ordre du web : celle dont une session est
 * ouverte d'abord, puis les actives, puis les désactivées.
 *
 * **Créer, renommer ou supprimer une caisse ne se fait pas ici.** Le journal ne
 * porte pas d'acte `register.*` : le serveur ne saurait pas le rejouer, et un
 * bouton qui part en quarantaine est pire que pas de bouton. Cela se fait au
 * back-office, et l'écran le dit plutôt que de laisser chercher.
 *
 * **Trois états d'ouverture, trois traitements**, et le TITRE du panneau dit
 * ce qui est ACQUIS (« Session ouverte » : elle l'est, on vend dessus), la
 * ligne dessous ce qui ne l'est pas encore. La table des apparences et le
 * motif d'une clôture fermée vivent dans `features/caisse/apparence.ts`, que
 * la fiche d'une caisse rend aussi : deux écrans qui ne montrent pas la même
 * chose de la même caisse est la pire des situations pour qui cherche à
 * comprendre.
 *
 * **Le troisième bouton pleine largeur est parti.** « Clôtures passées » menait
 * à la fiche de la caisse, qui EST cet écran : la fiche s'ouvre désormais par
 * l'en-tête de la carte, avec son chevron et le nombre de clôtures. Un
 * compteur renseigne là où un libellé répétait la destination, et la carte
 * perd une rangée de quarante-quatre points sur deux.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import type { MoneyHelpers } from "@vente-facile/core";

import { parcDeCaisses, type CaisseParc } from "@/data/caisses";
import { useMonnaie } from "@/data/devises";
import { useLecture } from "@/data/live";
import { depuis } from "@/data/ventes";
import { ETAT_SESSION, motifClotureFermee } from "@/features/caisse/apparence";
import { analyserFond } from "@/features/caisse/fond";
import { ouvrirSession, sessionOuverte } from "@/features/pos/caisse";
import { libelleEnvoi } from "@/data/envoi";
import { useSession } from "@/session/provider";
import {
  Apparition, AppBar, Badge, Banner, Button, Card, EmptyState, FormField, Icon,
  Input, Mesure, MultiCurrencyTotal, Pressable, Screen, SearchInput, Sheet,
  Skeleton, Text, useToast,
} from "@/ui";

const TABLES = ["registers", "register_sessions", "warehouses", "sales", "users"];

/**
 * Au-delà, la recherche gagne sa place. En deçà, elle coûte soixante points
 * pour filtrer trois lignes qu'on voit toutes sans défiler - et c'est le cas
 * de la quasi-totalité des marchands, qui tiennent un ou deux comptoirs.
 */
const SEUIL_RECHERCHE = 5;

export default function Caisses() {
  const money = useMonnaie();
  const toast = useToast();
  const { can } = useSession();

  const [recherche, setRecherche] = useState("");
  const [aOuvrir, setAOuvrir] = useState<CaisseParc | null>(null);
  const [fond, setFond] = useState("");
  const [erreurFond, setErreurFond] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const verrou = useRef(false);

  const charger = useCallback(() => parcDeCaisses(recherche), [recherche]);
  const { donnees, chargement, recharger } = useLecture(charger, {
    tables: [...TABLES, "outbox_operations"],
    deps: [recherche],
  });

  /**
   * La session que le COMPTOIR tient déjà, s'il y en a une.
   *
   * ┌────────────────────────────────────────────────────────────────────────┐
   * │ ON LA DEMANDE AU COMPTOIR, PAS À LA LISTE AFFICHÉE.                    │
   * │                                                                        │
   * │ `sessionOuverte` est exactement la lecture que fera le point de vente : │
   * │ table tirée, clôtures en file retirées, journal en dernier recours. La  │
   * │ déduire des cartes à l'écran donnerait une réponse FILTRÉE - la caisse  │
   * │ ouverte disparaît dès qu'on tape une recherche, et l'avertissement      │
   * │ avec elle, au moment précis où le caissier cherche un autre comptoir.   │
   * │                                                                        │
   * │ Le comptoir n'en sert qu'une à la fois : en ouvrir une seconde sans le  │
   * │ savoir, c'est vendre sur un comptoir en croyant vendre sur l'autre, et  │
   * │ découvrir le désaccord au Z du soir.                                   │
   * └────────────────────────────────────────────────────────────────────────┘
   */
  const { donnees: sessionDuComptoir } = useLecture(sessionOuverte, {
    tables: [...TABLES, "outbox_operations"],
  });

  const parc = useMemo(() => donnees?.caisses ?? [], [donnees]);
  const ouvertes = donnees?.nbSessionsOuvertes ?? 0;

  const dejaOuverte =
    sessionDuComptoir && sessionDuComptoir.registerId !== aOuvrir?.id
      ? sessionDuComptoir
      : null;

  const ouvrir = async () => {
    // Verrou SYNCHRONE avant tout `setState` : deux appuis rapprochés
    // ouvriraient deux sessions sur le même comptoir, dont l'une serait
    // refusée avec toutes les ventes qui s'y rattachent.
    if (verrou.current || !aOuvrir) return;

    // La saisie est lue AVANT le verrou : un refus de forme n'est pas un envoi,
    // il ne doit ni bloquer le bouton ni afficher un chargement.
    const lu = analyserFond(fond);
    if (!lu.ok) {
      setErreurFond(lu.message);
      return;
    }

    verrou.current = true;
    setEnCours(true);
    try {
      await ouvrirSession(aOuvrir.id, lu.montant);
      setAOuvrir(null);
      setFond("");
      setErreurFond(null);
      toast.succes(`Session ouverte sur ${aOuvrir.nom}.`);
    } catch (e) {
      toast.erreur(e instanceof Error ? e.message : "La session n'a pas pu être ouverte.");
    } finally {
      verrou.current = false;
      setEnCours(false);
    }
  };

  const sousTitre =
    parc.length === 0
      ? undefined
      : `${parc.length} caisse${parc.length > 1 ? "s" : ""} · ${
          ouvertes > 0
            ? `${ouvertes} session${ouvertes > 1 ? "s" : ""} ouverte${ouvertes > 1 ? "s" : ""}`
            : "aucune session ouverte"
        }`;

  // La recherche reste à l'écran dès qu'un terme est tapé : la faire
  // disparaître au premier filtrage enfermerait le caissier sur trois lignes
  // sans moyen d'effacer.
  const rechercheVisible = parc.length >= SEUIL_RECHERCHE || recherche !== "";

  return (
    <Screen
      scroll
      padded={false}
      onRefresh={recharger}
      // Le tourniquet du tirer-pour-rafraîchir ne tourne qu'au RAFRAÎCHISSEMENT :
      // au premier chargement, c'est le squelette qui parle, et deux
      // indicateurs pour la même attente se lisent comme deux chargements.
      refreshing={chargement && donnees !== null}
    >
      <AppBar title="Caisses" subtitle={sousTitre} />

      <View className="gap-4 p-4">
        {rechercheVisible ? (
          <SearchInput
            valeur={recherche}
            onChange={setRecherche}
            placeholder="Rechercher une caisse..."
            accessibilityLabel="Rechercher une caisse"
          />
        ) : null}

        {chargement && !donnees ? (
          // Un squelette plutôt qu'un tourniquet centré : il montre la FORME
          // de ce qui arrive, donc l'écran ne se réorganise pas sous les yeux.
          <SqueletteParc />
        ) : parc.length === 0 ? (
          <EmptyState
            icon="Calculator"
            title={recherche ? "Aucune caisse ne correspond" : "Aucune caisse"}
            message={
              recherche
                ? "Essayez un autre nom ou un autre code."
                : "Aucune caisse n'est descendue sur ce terminal. Créez-en une au back-office, puis synchronisez."
            }
            action={
              recherche
                ? { label: "Effacer la recherche", onPress: () => setRecherche("") }
                : undefined
            }
          />
        ) : (
          parc.map((c, i) => (
            <Apparition key={c.id} index={i}>
              <CarteCaisse
                caisse={c}
                money={money}
                peutOuvrir={can("sales.create")}
                onOuvrir={() => {
                  setAOuvrir(c);
                  setFond("");
                  setErreurFond(null);
                }}
              />
            </Apparition>
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

        {dejaOuverte ? (
          <View className="mt-3">
            <Banner
              tone="warning"
              title={`Une session est déjà ouverte sur ${dejaOuverte.registerName}`}
              // On ne promet PAS lequel des deux comptoirs le point de vente
              // retiendra : cela dépend de l'état d'envoi de chacun, et une
              // règle annoncée de travers est pire que la prudence.
              message="Le comptoir n'en sert qu'une à la fois : ouvrir ici ne bascule pas forcément la vente sur cette caisse. Clôturez l'autre d'abord si vous changez de comptoir."
            />
          </View>
        ) : null}

        <View className="mt-4">
          <FormField
            // ┌────────────────────────────────────────────────────────────┐
            // │ UN MONTANT SANS DEVISE NE VEUT RIEN DIRE ICI.             │
            // │                                                            │
            // │ Le champ demandait « Fond de caisse » et son contenu part  │
            // │ en devise PRINCIPALE, ce que rien n'écrivait. Sur un        │
            // │ établissement qui compte en dollars et encaisse aussi des   │
            // │ francs, « 50 000 » tapé pour des francs ouvre le tiroir à   │
            // │ cinquante mille dollars, et le Z du soir constate un        │
            // │ manquant du même ordre.                                     │
            // └────────────────────────────────────────────────────────────┘
            label={`Fond de caisse (${money.primaryCode})`}
            error={erreurFond ?? undefined}
            hint={hintFond(aOuvrir, money)}
          >
            <Input
              value={fond}
              onChangeText={(v) => {
                setFond(v);
                // On efface le refus dès la première correction : le laisser
                // sous un champ qu'on vient de réparer fait douter du remède.
                if (erreurFond) setErreurFond(null);
              }}
              invalid={erreurFond !== null}
              keyboardType="decimal-pad"
              placeholder="0"
              autoFocus
              leading={
                <Text variant="caption" className="font-sans-medium">
                  {money.symbolOf(money.primaryCode)}
                </Text>
              }
              accessibilityLabel={`Fond de caisse en ${money.primaryCode}`}
            />
          </FormField>
        </View>

        <Button fullWidth size="lg" loading={enCours} onPress={() => void ouvrir()}>
          Ouvrir la session
        </Button>
      </Sheet>
    </Screen>
  );
}

/**
 * L'aide sous le champ : ce que « vide » veut dire, et ce qu'il vaut.
 *
 * Le serveur HÉRITE le tiroir de la dernière clôture quand aucun fonds n'est
 * envoyé. L'écrire sans donner le chiffre demanderait au caissier de faire
 * confiance à un montant qu'il ne voit pas ; le donner quand on le connaît
 * transforme une règle en information.
 */
function hintFond(caisse: CaisseParc | null, money: MoneyHelpers): string {
  const laisse = caisse?.derniereCloture;
  if (laisse && laisse.compte !== null) {
    return `La dernière clôture a laissé ${money.money(
      laisse.compte,
      money.primaryCode
    )} dans ce tiroir. Laissez vide pour le reprendre, ou écrivez 0 si le tiroir est vide.`;
  }
  return "Ce qui est déjà dans le tiroir. Laissez vide pour reprendre ce que la dernière clôture y a laissé, ou écrivez 0 si le tiroir est vide.";
}

function CarteCaisse({
  caisse: c,
  money,
  peutOuvrir,
  onOuvrir,
}: {
  caisse: CaisseParc;
  money: MoneyHelpers;
  peutOuvrir: boolean;
  onOuvrir: () => void;
}) {
  const etat = c.session ? ETAT_SESSION[c.session.envoi] : null;
  const envoi = c.session ? libelleEnvoi(c.session.envoi) : null;
  const motif = c.session ? motifClotureFermee(c.session.envoi) : "";

  return (
    <Card className="p-0">
      {/* L'EN-TÊTE EST LE LIEN vers la fiche : le chevron et le compteur de
          clôtures disent où il mène, ce qu'un troisième bouton pleine largeur
          faisait en occupant une rangée entière. */}
      <Pressable
        onPress={() => router.push(`/caisses/${c.id}`)}
        accessibilityRole="link"
        accessibilityLabel={
          c.nbClotures > 0
            ? `${c.nom}, ${c.nbClotures} clôture${c.nbClotures > 1 ? "s" : ""} passée${
                c.nbClotures > 1 ? "s" : ""
              }. Ouvrir la fiche`
            : `${c.nom}. Ouvrir la fiche`
        }
        className="flex-row items-center gap-3 p-4"
        pressedClassName="active:opacity-60"
      >
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
          <View className="flex-row items-center gap-2">
            <Text variant="label" numberOfLines={1} className="min-w-0 shrink">
              {c.nom}
            </Text>
            {/* Seul l'état EXCEPTIONNEL porte une pastille : « Active » sur
                chaque carte est du bruit, et à force on ne voit plus celle qui
                dit vraiment quelque chose. */}
            {!c.actif ? <Badge tone="neutral">Inactive</Badge> : null}
          </View>
          <Text variant="caption" numberOfLines={1}>
            {[c.code, c.entrepot ?? "Aucun entrepôt"].join(" · ")}
          </Text>
        </View>
        <View className="shrink-0 flex-row items-center gap-1">
          {c.nbClotures > 0 ? (
            <Text variant="caption" numeric>
              {`${c.nbClotures} clôture${c.nbClotures > 1 ? "s" : ""}`}
            </Text>
          ) : null}
          <Icon name="ChevronRight" size={16} color="mutedForeground" />
        </View>
      </Pressable>

      <View className="px-4 pb-4">
        {c.session && etat ? (
          <View className={`rounded-lg border border-solid p-3 ${etat.boite}`}>
            <View className="flex-row items-center justify-between gap-2">
              <View className="min-w-0 flex-row items-center gap-2">
                <Icon name={etat.icone} size={16} color={etat.couleur} />
                {/* Le TITRE dit l'acquis : la session est ouverte, on vend
                    dessus. Ce qui ne l'est pas encore va dans la ligne
                    dessous, avec le mot qui appelle le bon geste. */}
                <Text variant="bodySmall" className="font-sans-medium">
                  Session ouverte
                </Text>
              </View>
              {c.session.ouverteLe ? (
                <Text variant="caption" className="shrink-0">
                  {depuis(c.session.ouverteLe)}
                </Text>
              ) : null}
            </View>

            {/* L'ÉTAT ici, la CONSÉQUENCE sous le bouton. Les deux portaient
                le détail complet, et la carte disait deux fois « à la
                prochaine synchronisation » à quatre lignes d'intervalle : une
                phrase répétée se lit comme un écran mal fini, et on finit par
                n'en lire aucune des deux. */}
            {envoi ? (
              <Text variant="caption" className="mt-1">
                {envoi.court}
              </Text>
            ) : null}
            {c.session.parQui ? (
              <Text variant="caption" numberOfLines={1} className="mt-1">
                {`Par ${c.session.parQui}`}
              </Text>
            ) : null}

            <View className={`mt-2.5 flex-row items-start justify-between gap-3 border-t pt-2.5 ${etat.filet}`}>
              <View className="min-w-0">
                <Text variant="caption">Ventes</Text>
                {/* L'ÉCHELLE EST CELLE D'UNE RANGÉE, pas d'un cadran : ici le
                    contenu est la CAISSE, le montant en est la mesure. En
                    `StatValue`, « 0 $ » sortait à vingt-quatre points en gras,
                    plus gros que le nom du comptoir juste au-dessus. */}
                <Mesure value={String(c.session.nbVentes)} />
              </View>
              <View className="min-w-0 items-end">
                <Text variant="caption">Encaissé</Text>
                {/* Une ligne PAR DEVISE : un tiroir contient des billets de
                    plusieurs devises, qui ne s'additionnent pas. */}
                <MultiCurrencyTotal
                  lignes={c.session.encaisseParDevise}
                  money={money.money}
                  taille="mesure"
                />
                {c.session.sansMontant > 0 ? (
                  // Un total donné pour complet alors qu'un ticket manque se
                  // compare au tiroir et tombe faux.
                  <Text variant="caption" className="mt-0.5">
                    {`+${c.session.sansMontant} sans montant`}
                  </Text>
                ) : null}
              </View>
            </View>
          </View>
        ) : (
          <View className="rounded-lg border border-dashed border-border bg-muted/40 p-3">
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

        <View className="mt-3">
          {c.session ? (
            <>
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
              {motif ? (
                <Text variant="caption" className="mt-2">
                  {motif}
                </Text>
              ) : null}
            </>
          ) : peutOuvrir ? (
            <Button fullWidth leftIcon="Plus" disabled={!c.actif} onPress={onOuvrir}>
              Ouvrir une session
            </Button>
          ) : null}
        </View>
      </View>
    </Card>
  );
}

/** Le squelette reprend la FORME d'une carte : en-tête, panneau, boutons. */
function SqueletteParc() {
  return (
    <View className="gap-4">
      {[0, 1].map((i) => (
        <Card key={i} className="p-0">
          <View className="flex-row items-center gap-3 p-4">
            <Skeleton className="h-10 w-10 rounded-lg" />
            <View className="flex-1">
              <Skeleton className="h-3.5 w-1/2" />
              <Skeleton className="mt-2 h-3 w-2/3" />
            </View>
          </View>
          <View className="px-4 pb-4">
            <Skeleton className="h-20 w-full rounded-lg" />
            <Skeleton className="mt-3 h-11 w-full rounded-lg" />
          </View>
        </Card>
      ))}
    </View>
  );
}
