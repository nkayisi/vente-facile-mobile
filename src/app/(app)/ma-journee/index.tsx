/**
 * Ma journée : ce qui s'est passé AUJOURD'HUI, et rien d'autre.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE CLOISONNEMENT AVAIT TOUT RETIRÉ AU CAISSIER, SA PROPRE LECTURE       │
 * │ COMPRISE.                                                                │
 * │                                                                          │
 * │ Les huit onglets de « Rapports & statistiques » sont gardés par          │
 * │ `reports.view`, accordé au seul propriétaire et au gérant. Cet écran est │
 * │ la lecture de journée de TOUS les rôles : ce qu'on compare à son tiroir  │
 * │ avant de rentrer.                                                        │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ PAR DÉFAUT, MES OPÉRATIONS - PROPRIÉTAIRE COMPRIS. LES FILTRES ÉLARGISSENT.│
 * │                                                                          │
 * │ Un entrepôt choisi montre TOUTE sa journée, une personne la sienne. Le   │
 * │ caissier n'a aucun filtre, quelles que soient ses cases. La règle vit    │
 * │ dans `@vente-facile/core` (`journee.ts`) ; le back-office et le serveur  │
 * │ l'appliquent aussi.                                                      │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ LA JOURNÉE SE CALCULE SUR LE TERMINAL, HORS LIGNE, ventes en file
 * comprises (`data/ma-journee.ts`). Elle lisait le serveur : sans réseau elle
 * ne montrait rien, et après une matinée hors ligne elle ignorait le journal.
 * Seul le DOCUMENT A4 demande le réseau ; le ticket s'imprime sans.
 *
 * ⚠ UN ÉCRAN DE PILE, PAS UN ONGLET : on y ARRIVE depuis le tiroir, donc la
 * flèche de retour paraît. Un onglet sans bouton serait un cul-de-sac.
 *
 * ⚠ AUCUNE FENÊTRE : le jour seul. Les 7 et 30 jours d'avant vivent dans les
 * rapports, qui sont l'outil d'analyse.
 */
import { useCallback, useMemo, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { formatNumberFr, formatTimeFr } from "@vente-facile/core";

import { ApiError } from "@/api/errors";
import { accord, pluriel } from "@/data/accord";
import { jourEnLettresFr, jourISO } from "@/data/dates";
import { useMonnaie } from "@/data/devises";
import { libelleEnvoi } from "@/data/envoi";
import { useLecture } from "@/data/live";
import { lireMaJournee, TABLES_MA_JOURNEE, type MaJourneeLue } from "@/data/ma-journee";
import { CHEMIN_RAPPORT_JOURNEE } from "@/data/rapports";
import { useEnLigne } from "@/data/reseau";
import { STATUT_VENTE } from "@/data/statuts-vente";
import { avertissementDeFile } from "@/features/export/en-file";
import { telechargerDocument, type FormatExport } from "@/features/export/telecharger";
import type { JourneeLocale } from "@/features/ma-journee/agregats";
import { ticketDeLaJournee } from "@/features/ma-journee/agregats";
import { FeuilleRapportJournee } from "@/features/ma-journee/feuille-rapport";
import { useOffreDeLaJournee } from "@/features/ma-journee/use-offre";
import { FeuilleFiltresPerimetre } from "@/features/perimetre/feuille-perimetre";
import {
  afficheFiltresDePerimetre,
  nombreDeFiltresPerimetre,
  PERIMETRE_VIDE,
  resumeDuPerimetre,
  sansLeFiltrePerimetre,
  type FiltrePerimetre,
} from "@/features/perimetre/filtre-perimetre";
import { chromeDeLaSession } from "@/features/pos/ticket";
import { imprimerRapportDeLaJournee } from "@/printing/jobs";
import { useSession } from "@/session/provider";
import {
  AppBar,
  BarChart,
  BoutonFiltres,
  Card,
  CardHeader,
  Chip,
  ChipRow,
  Colonnes,
  Divider,
  EmptyState,
  Flux,
  Icon,
  IconButton,
  ListItem,
  Pressable,
  ProgressBar,
  Screen,
  Spinner,
  StatStrip,
  StatStripItem,
  Text,
  useToast,
} from "@/ui";

/** Au-delà, la liste renvoie à l'historique plutôt que de s'allonger. */
const VISIBLES = 50;

export default function MaJourneeEcran() {
  const { snapshot, can } = useSession();
  const money = useMonnaie();
  const enLigne = useEnLigne();
  const toast = useToast();

  const [choix, setChoix] = useState<FiltrePerimetre>(PERIMETRE_VIDE);
  const offre = useOffreDeLaJournee(choix);
  const [feuilleFiltres, setFeuilleFiltres] = useState(false);
  const [feuilleRapport, setFeuilleRapport] = useState(false);
  const [envoi, setEnvoi] = useState(false);

  const droits = useMemo(
    () => ({ ventes: can("sales.view"), stock: can("stock_movements.view") }),
    [can]
  );
  const monNom = snapshot?.user.full_name || snapshot?.user.email || null;
  const versPrincipale = useCallback(
    (montant: number, devise: string) => montant * money.rateOf(devise),
    [money]
  );

  // Le jour fait partie de la clé : un écran resté ouvert passé minuit doit
  // relire SA journée, pas garder celle d'hier sous le titre d'aujourd'hui.
  const jour = jourISO(new Date());
  const charger = useCallback(
    () =>
      lireMaJournee({
        perimetre: offre.applique,
        file: offre.file,
        droits,
        monNom,
        versPrincipale,
      }),
    [offre.applique, offre.file, droits, monNom, versPrincipale]
  );
  const { donnees, chargement, recharger } = useLecture<MaJourneeLue>(charger, {
    tables: [...TABLES_MA_JOURNEE],
    deps: [offre.applique, offre.file, droits, monNom, versPrincipale, jour],
  });

  const principal = useCallback((v: number) => money.money(v, money.primaryCode), [money]);
  const puces = useMemo(() => resumeDuPerimetre(offre), [offre]);
  const maintenant = new Date();

  const imprimer = useCallback(async () => {
    if (!donnees) return;
    setEnvoi(true);
    try {
      await imprimerRapportDeLaJournee(
        ticketDeLaJournee(donnees.journee, {
          chrome: chromeDeLaSession(snapshot),
          jour: jourEnLettresFr(new Date()),
          arreteA: formatTimeFr(new Date()),
          portee: offre.libelle,
          devise: money.primaryCode,
          imprimePar: monNom ?? undefined,
          listeVentes: droits.ventes,
        })
      );
      setFeuilleRapport(false);
      toast.succes("Ticket de la journée envoyé à l'imprimante.");
    } catch {
      toast.erreur("Le ticket n'a pas pu être imprimé.");
    } finally {
      setEnvoi(false);
    }
  }, [donnees, snapshot, offre.libelle, money.primaryCode, monNom, droits.ventes, toast]);

  const exporter = useCallback(
    async (format: FormatExport) => {
      setEnvoi(true);
      try {
        await telechargerDocument(
          `/reports/statistics/${CHEMIN_RAPPORT_JOURNEE}/`,
          offre.parametres,
          format,
          `Rapport de la journée ${jour}`
        );
        setFeuilleRapport(false);
      } catch (e) {
        toast.erreur(
          e instanceof ApiError ? e.message : "Le document n'a pas pu être téléchargé."
        );
      } finally {
        setEnvoi(false);
      }
    },
    [offre.parametres, jour, toast]
  );

  return (
    <Screen scroll padded={false} onRefresh={recharger} refreshing={false}>
      <AppBar
        title="Ma journée"
        // La date ET la portée : on vérifie d'un coup d'œil que l'écran parle
        // d'aujourd'hui, et de qui.
        subtitle={`${jourEnLettresFr(maintenant)} · ${offre.libelle}`}
        right={
          <View className="flex-row items-center gap-2">
            {/* Le caissier n'a aucun filtre : pas de bouton, pas de feuille. Un
                bouton qui ouvre une feuille vide se lirait comme une panne. Le
                bouton vit dans la barre : seul dans une rangée, il laissait une
                bande vide au-dessus du cadran. */}
            {afficheFiltresDePerimetre(offre) ? (
              <BoutonFiltres
                actifs={nombreDeFiltresPerimetre(offre)}
                onPress={() => setFeuilleFiltres(true)}
              />
            ) : null}
            <IconButton
              name="FileText"
              label="Rapport de la journée"
              texte="Rapport"
              variant="ghost"
              onPress={() => setFeuilleRapport(true)}
              disabled={!donnees}
            />
          </View>
        }
      />

      <View className="gap-4 px-4 pb-6 pt-4">
        {puces.length > 0 ? (
          <ChipRow>
            {puces.map((p) => {
              const retirer = () => setChoix(sansLeFiltrePerimetre(choix, p.cle));
              return (
                <Chip key={p.cle} label={p.label} actif onPress={retirer} onRetirer={retirer} />
              );
            })}
          </ChipRow>
        ) : null}

        {chargement && !donnees ? (
          <View className="items-center py-12">
            <Spinner />
          </View>
        ) : donnees ? (
          <Contenu
            j={donnees.journee}
            principal={principal}
            money={money}
            droits={droits}
            montreVendeur={offre.portee.kind !== "moi" && offre.applique.utilisateur === null}
          />
        ) : null}
      </View>

      <FeuilleFiltresPerimetre
        ouvert={feuilleFiltres}
        onFermer={() => setFeuilleFiltres(false)}
        valeur={choix}
        onChanger={setChoix}
        offre={offre}
        libelleResultats="Voir la journée"
      />
      <FeuilleRapportJournee
        ouvert={feuilleRapport}
        onFermer={() => setFeuilleRapport(false)}
        onImprimer={() => void imprimer()}
        onExporter={(f) => void exporter(f)}
        enLigne={enLigne}
        avertissement={donnees ? avertissementDeFile(donnees.ventesEnFile) : null}
        envoi={envoi}
      />
    </Screen>
  );
}

function Contenu({
  j,
  principal,
  money,
  droits,
  montreVendeur,
}: {
  j: JourneeLocale;
  principal: (v: number) => string;
  money: ReturnType<typeof useMonnaie>;
  droits: { ventes: boolean; stock: boolean };
  montreVendeur: boolean;
}) {
  return (
    <View className="gap-4">
      {/* Quatre relevés, ceux du back-office : vendu, encaissé, dépensé, et ce
          qui reste au tiroir. Un cadran, pas quatre cartes. */}
      <StatStrip>
        <StatStripItem
          label={`Ventes (${formatNumberFr(j.ventes.nombre, 0)})`}
          value={principal(j.ventes.total)}
          icon="ShoppingCart"
        />
        <StatStripItem
          label="Encaissé net"
          value={principal(j.encaisse.net)}
          icon="Banknote"
          tone="accent"
        />
        <StatStripItem
          label={`Dépenses (${formatNumberFr(j.depenses.nombre, 0)})`}
          value={principal(j.depenses.total)}
          icon="Receipt"
        />
        <StatStripItem label="Caisse nette" value={principal(j.caisse.net)} icon="Wallet" />
      </StatStrip>

      {j.ventes.aCredit > 0.005 || j.ventes.sansMontant > 0 ? (
        <View className="-mt-2 gap-0.5">
          {j.ventes.aCredit > 0.005 ? (
            <Text variant="caption" className="text-warning">
              Dont {principal(j.ventes.aCredit)} à crédit sur{" "}
              {pluriel(j.ventes.nombreACredit, "vente", "ventes")}.
            </Text>
          ) : null}
          {j.ventes.sansMontant > 0 ? (
            // `null` ne se lit jamais comme zéro : le total ne les compte pas,
            // et il le dit.
            <Text variant="caption">
              {pluriel(j.ventes.sansMontant, "vente", "ventes")} sans montant connu (ticket
              introuvable) : {j.ventes.sansMontant > 1 ? "elles ne sont" : "elle n'est"} pas
              dans le total.
            </Text>
          ) : null}
        </View>
      ) : null}

      <Colonnes>
        <Flux className="gap-4">
          <CarteMoyens j={j} principal={principal} />
          <CarteHeures j={j} principal={principal} />
          <CarteCaisse j={j} principal={principal} />
          {droits.stock && j.stock ? <CarteStock stock={j.stock} /> : null}
        </Flux>
        {droits.ventes ? (
          <CarteVentes j={j} money={money} montreVendeur={montreVendeur} />
        ) : null}
      </Colonnes>
    </View>
  );
}

function CarteMoyens({ j, principal }: { j: JourneeLocale; principal: (v: number) => string }) {
  const max = Math.max(0, ...j.encaisse.parMoyen.map((m) => m.total));
  return (
    <Card>
      <CardHeader title="Encaissé par moyen" />
      {j.encaisse.parMoyen.length === 0 ? (
        <Text variant="bodySmall" className="text-muted-foreground">
          Aucun encaissement aujourd&apos;hui.
        </Text>
      ) : (
        <View className="gap-3">
          {j.encaisse.parMoyen.map((m) => (
            <View key={m.moyen} className="gap-1">
              <View className="flex-row items-baseline justify-between gap-3">
                <Text variant="bodySmall" numberOfLines={1} className="min-w-0 flex-1">
                  {m.moyen}{" "}
                  <Text variant="caption">({pluriel(m.nombre, "règlement", "règlements")})</Text>
                </Text>
                <Text variant="bodySmall" numeric className="font-sans-medium">
                  {principal(m.total)}
                </Text>
              </View>
              <ProgressBar valeur={m.total} max={max} tone="success" />
            </View>
          ))}
        </View>
      )}
      {j.encaisse.monnaie > 0.005 ? (
        // La monnaie rendue à part, pour que le remis et le net se rapprochent
        // à l'œil : sans elle, « Encaissé » dépasse la vente et se lit comme
        // une erreur.
        <View className="mt-4 gap-1 border-t border-border pt-3">
          <View className="flex-row justify-between gap-3">
            <Text variant="bodySmall" className="text-muted-foreground">
              Monnaie rendue
            </Text>
            <Text variant="bodySmall" numeric className="text-destructive">
              -{principal(j.encaisse.monnaie)}
            </Text>
          </View>
          <View className="flex-row justify-between gap-3">
            <Text variant="bodySmall" className="font-sans-medium">
              Encaissé net
            </Text>
            <Text variant="bodySmall" numeric className="font-sans-semibold">
              {principal(j.encaisse.net)}
            </Text>
          </View>
        </View>
      ) : null}
    </Card>
  );
}

function CarteHeures({ j, principal }: { j: JourneeLocale; principal: (v: number) => string }) {
  const vendues = j.heures.filter((h) => h.nombre > 0);
  return (
    <Card>
      <CardHeader title="Ventes heure par heure" />
      {vendues.length === 0 ? (
        <Text variant="bodySmall" className="text-muted-foreground">
          Aucune vente aujourd&apos;hui.
        </Text>
      ) : vendues.length === 1 ? (
        // ⚠ Un graphique de comparaison exige DEUX heures VENDUES : une seule
        // barre pleine à côté de seaux vides remplit la carte d'un bloc, et se
        // lit comme un défaut d'affichage (vu sur l'émulateur, une vente à
        // 1 h consultée à 2 h). Le back-office suit la même règle.
        <Text variant="bodySmall" className="text-muted-foreground">
          Toutes les ventes de la journée à {vendues[0].heure} h :{" "}
          {pluriel(vendues[0].nombre, "vente", "ventes")},{" "}
          <Text variant="bodySmall" className="font-sans-medium text-foreground">
            {principal(vendues[0].total)}
          </Text>
          .
        </Text>
      ) : (
        <BarChart
          points={j.heures.map((h) => ({ label: `${h.heure}h`, valeur: h.total }))}
          formater={principal}
        />
      )}
    </Card>
  );
}

function CarteCaisse({ j, principal }: { j: JourneeLocale; principal: (v: number) => string }) {
  return (
    <Card className="overflow-hidden p-0">
      {/* La carte est en `p-0` pour ses RANGÉES, pleine largeur : son titre,
          lui, garde le retrait de ses voisines, sinon il colle au bord. */}
      <View className="p-4 pb-0">
        <CardHeader title="Caisse et dépenses" />
      </View>
      <ListItem icon="ArrowDownRight" title="Entrées de caisse" value={principal(j.caisse.entrees)} />
      <Divider inset />
      <ListItem icon="ArrowUpRight" title="Sorties de caisse" value={principal(j.caisse.sorties)} />
      <Divider inset />
      <ListItem icon="Wallet" title="Solde net" value={principal(j.caisse.net)} />
      <Divider />
      <ListItem
        icon="Receipt"
        title={`Dépenses (${formatNumberFr(j.depenses.nombre, 0)})`}
        subtitle={`dont payées : ${principal(j.depenses.payees)}`}
        value={principal(j.depenses.total)}
      />
    </Card>
  );
}

function CarteStock({ stock }: { stock: NonNullable<JourneeLocale["stock"]> }) {
  return (
    <Card className="overflow-hidden p-0">
      <View className="p-4 pb-0">
        <CardHeader
          title="Mouvements de stock"
          subtitle="Hors ventes et retours clients"
          right={
            <Text variant="caption">{pluriel(stock.nombre, "mouvement", "mouvements")}</Text>
          }
        />
      </View>
      {stock.nombre === 0 ? (
        <Text variant="bodySmall" className="px-4 pb-4 text-muted-foreground">
          Aucun mouvement aujourd&apos;hui.
        </Text>
      ) : (
        <>
          <View className="flex-row flex-wrap gap-2 px-4 pb-3">
            {stock.parType.map((t) => (
              <View key={t.type} className="rounded-full bg-muted px-3 py-1">
                <Text variant="caption" className="text-foreground">
                  {t.libelle} · {formatNumberFr(t.nombre, 0)}
                </Text>
              </View>
            ))}
          </View>
          {stock.lignes.slice(0, 20).map((m, i) => (
            <View key={m.id}>
              {i > 0 ? <Divider inset /> : null}
              <ListItem
                icon={m.entree ? "ArrowDownRight" : "ArrowUpRight"}
                title={m.produit}
                subtitle={[
                  m.libelle,
                  m.date ? formatTimeFr(m.date) : null,
                  m.entrepot,
                  libelleEnvoi(m.envoi)?.court,
                ]
                  .filter(Boolean)
                  .join(" · ")}
                value={`${m.entree ? "+" : "-"}${m.quantite}`}
                valueTone={m.entree ? "success" : "destructive"}
              />
            </View>
          ))}
          {stock.lignes.length > 20 ? (
            <Text variant="caption" className="px-4 pb-4 pt-2">
              Et {pluriel(stock.lignes.length - 20, "autre mouvement", "autres mouvements")}{" "}
              : le rapport de la journée les liste tous.
            </Text>
          ) : null}
        </>
      )}
    </Card>
  );
}

function CarteVentes({
  j,
  money,
  montreVendeur,
}: {
  j: JourneeLocale;
  money: ReturnType<typeof useMonnaie>;
  montreVendeur: boolean;
}) {
  const lignes = j.ventes.lignes;
  return (
    <Card className="overflow-hidden p-0">
      <View className="p-4 pb-0">
        <CardHeader
          title="Ventes de la journée"
          right={<Text variant="caption">{pluriel(lignes.length, "vente", "ventes")}</Text>}
        />
      </View>
      {lignes.length === 0 ? (
        <View className="pb-4">
          <EmptyState
            variante="carte"
            title="Aucune vente aujourd'hui"
            message="Les ventes encaissées s'afficheront ici, même sans réseau."
          />
        </View>
      ) : (
        <>
          {lignes.slice(0, VISIBLES).map((v, i) => {
            const st = STATUT_VENTE[v.statut] ?? { label: v.statut, ton: "neutral" as const };
            const envoi = libelleEnvoi(v.envoi);
            return (
              <View key={v.id}>
                {i > 0 ? <Divider /> : null}
                <Pressable
                  onPress={() => router.push(`/vente/${v.id}`)}
                  accessibilityRole="button"
                  accessibilityLabel={`Vente ${v.reference}`}
                  className="flex-row items-center gap-3 px-4 py-3"
                >
                  <View className="min-w-0 flex-1">
                    <Text variant="bodySmall" numberOfLines={1} className="font-sans-medium">
                      {v.reference}
                    </Text>
                    <Text variant="caption" numberOfLines={1}>
                      {[
                        v.date ? formatTimeFr(v.date) : null,
                        v.client ?? "Client anonyme",
                        montreVendeur ? v.vendeur : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </Text>
                    {envoi ? (
                      <View className="mt-0.5 flex-row items-center gap-1">
                        <Icon
                          name={v.envoi === "bloque" ? "AlertTriangle" : "CloudDownload"}
                          size={12}
                          color={v.envoi === "bloque" ? "warning" : "mutedForeground"}
                        />
                        <Text
                          variant="caption"
                          className={v.envoi === "bloque" ? "text-warning" : undefined}
                        >
                          {envoi.court}
                        </Text>
                      </View>
                    ) : st.ton !== "success" ? (
                      <Text variant="caption" className="mt-0.5">
                        {st.label}
                      </Text>
                    ) : null}
                  </View>
                  <View className="items-end">
                    <Text variant="bodySmall" numeric className="font-sans-medium">
                      {v.total === null ? "-" : money.money(v.total, v.devise)}
                    </Text>
                    {v.resteDu > 0.005 ? (
                      <Text variant="caption" numeric className="text-warning">
                        Reste {money.money(v.resteDu, v.devise)}
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
              </View>
            );
          })}
          {lignes.length > VISIBLES ? (
            <Pressable
              onPress={() => router.push({ pathname: "/vente/historique", params: { periode: "jour" } })}
              accessibilityRole="link"
              className="border-t border-border px-4 py-3"
            >
              <Text variant="bodySmall" className="text-primary">
                Voir les {formatNumberFr(lignes.length - VISIBLES, 0)}{" "}
                {accord(lignes.length - VISIBLES, "autre", "autres")} dans l&apos;historique
              </Text>
            </Pressable>
          ) : null}
        </>
      )}
    </Card>
  );
}
