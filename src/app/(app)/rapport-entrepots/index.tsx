/**
 * Rapport financier VENTILÉ par entrepôt, caisse comprise. **Miroir de
 * `app/dashboard/reports/by-warehouse/page.tsx`.**
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UNE RUBRIQUE, PAS UN NEUVIÈME ONGLET.                                   │
 * │                                                                          │
 * │ Les huit onglets de « Rapports & statistiques » se FILTRENT par dépôt :  │
 * │ on en lit un à la fois. Comparer deux boutiques demandait de changer le  │
 * │ filtre, de relever les chiffres à la main et de les additionner soi-même │
 * │ - avec le risque d'additionner deux devises. C'est T6 du retour de test, │
 * │ et c'est le même rangement que les créances.                             │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ Comme les huit onglets, il EXIGE le réseau : ses agrégats viennent du
 * serveur, dont les définitions sont subtiles (périmètre par rôle, caisse
 * DÉRIVÉE par trois chemins, conversions au taux figé sur chaque pièce). Les
 * recalculer ici donnerait deux chiffres pour le même établissement, et le
 * marchand n'aurait aucun moyen de savoir lequel croire.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";

import { ApiError } from "@/api/errors";
import { bornesRapport, type PeriodeRapport } from "@/data/periodes-rapports";
import {
  chargerRapportEntrepots,
  type LigneEntrepot,
  type RapportEntrepots,
} from "@/data/rapport-entrepots";
import { useMonnaie } from "@/data/devises";
import { useEnLigne } from "@/data/reseau";
import { useSession } from "@/session/provider";
import {
  AppBar, Banner, Card, CardHeader, Screen, Segmented, Spinner, StatStrip,
  StatStripItem, Tableau, Text, type ColonneTableau,
} from "@/ui";

/** Les trois fenêtres glissantes, celles que le serveur emboîte. */
const FENETRES: { valeur: PeriodeRapport; label: string }[] = [
  { valeur: "last_7_days", label: "7 jours" },
  { valeur: "last_30_days", label: "30 jours" },
  { valeur: "last_12_months", label: "12 mois" },
];

export default function RapportEntrepotsEcran() {
  const { snapshot } = useSession();
  const money = useMonnaie();
  const enLigne = useEnLigne();

  const [fenetre, setFenetre] = useState<PeriodeRapport>("last_30_days");
  const [donnees, setDonnees] = useState<RapportEntrepots | null>(null);
  const [chargement, setChargement] = useState(true);
  const [rafraichissement, setRafraichissement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const vivant = useRef(true);
  useEffect(() => {
    vivant.current = true;
    return () => {
      vivant.current = false;
    };
  }, []);

  const organisation = snapshot?.organization.id ?? "";

  const charger = useCallback(
    async (mode: "initial" | "rafraichir" = "initial") => {
      if (!organisation) return;
      if (mode === "rafraichir") setRafraichissement(true);

      const { debut, fin } = bornesRapport(fenetre);
      try {
        const d = await chargerRapportEntrepots({ organisation, debut, fin });
        if (!vivant.current) return;
        setDonnees(d);
        setErreur(null);
      } catch (e) {
        if (!vivant.current) return;
        setErreur(
          e instanceof ApiError ? e.message : "Le rapport n'a pas pu être chargé."
        );
      } finally {
        if (vivant.current) {
          setChargement(false);
          setRafraichissement(false);
        }
      }
    },
    [organisation, fenetre]
  );

  useEffect(() => {
    // Hors ligne on ne tente rien : le bandeau est DÉRIVÉ de `enLigne`, et
    // `enLigne` étant dans les dépendances de cet effet, le retour du réseau
    // relance la lecture de lui-même.
    if (!enLigne) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- faux positif : `charger` n'écrit rien avant son premier `await` sur ce chemin
    void charger("initial");
  }, [charger, enLigne]);

  const m = (v: number) => money.money(v, donnees?.devise || money.primaryCode);

  const colonnes: ColonneTableau<LigneEntrepot>[] = [
    { cle: "nom", entete: "Entrepôt", largeur: 150, valeur: (l) => l.nom,
      sousValeur: (l) => l.code || null },
    { cle: "ventes", entete: "Ventes", largeur: 120, mesure: true, valeur: (l) => m(l.ventes) },
    { cle: "dep", entete: "Dépenses", largeur: 120, mesure: true, valeur: (l) => m(l.depenses) },
    { cle: "caisse", entete: "Caisse (net)", largeur: 120, mesure: true,
      valeur: (l) => m(l.caisseNette) },
    { cle: "stock", entete: "Valeur du stock", largeur: 130, mesure: true,
      valeur: (l) => m(l.valeurStock) },
    { cle: "res", entete: "Résultat", largeur: 120, mesure: true, valeur: (l) => m(l.resultat) },
  ];

  return (
    <Screen
      scroll
      padded={false}
      onRefresh={() => void charger("rafraichir")}
      refreshing={rafraichissement}
    >
      <AppBar
        title="Par entrepôt"
        subtitle={
          donnees
            ? `Du ${donnees.debut} au ${donnees.fin}`
            : "Ventes, dépenses, caisse et stock"
        }
      />

      <View className="gap-4 px-4 pb-6">
        <Segmented
          options={FENETRES}
          valeur={fenetre}
          onChange={(v) => {
            setFenetre(v as PeriodeRapport);
            setChargement(true);
          }}
        />

        {!enLigne ? (
          <Banner
            tone="warning"
            title="Ce rapport demande une connexion"
            message="Ses chiffres viennent du serveur, pour qu'ils ne diffèrent jamais de ceux du back-office. Vendre et encaisser, eux, marchent hors ligne."
          />
        ) : erreur ? (
          <Banner
            tone="destructive"
            title="Le rapport n'a pas pu être chargé"
            message={erreur}
            action={{ label: "Réessayer", onPress: () => void charger("rafraichir") }}
          />
        ) : null}

        {chargement && !donnees && enLigne ? (
          <View className="items-center py-12">
            <Spinner />
          </View>
        ) : donnees ? (
          <>
            <StatStrip>
              <StatStripItem label="Ventes" value={m(donnees.total.ventes)} icon="TrendingUp" />
              <StatStripItem
                label="Dépenses"
                value={m(donnees.total.depenses)}
                icon="Wallet"
                tone={donnees.total.depenses > 0 ? "warn" : "neutral"}
              />
              <StatStripItem
                label="Valeur du stock"
                value={m(donnees.total.valeurStock)}
                icon="Boxes"
              />
              <StatStripItem
                label="Résultat"
                value={m(donnees.total.resultat)}
                icon="CircleDollarSign"
                tone={donnees.total.resultat < 0 ? "alert" : "neutral"}
              />
            </StatStrip>

            <Card className="overflow-hidden p-0">
              <CardHeader
                title={
                  donnees.lignes.length > 1
                    ? `${donnees.lignes.length} entrepôts`
                    : "Mon entrepôt"
                }
              />
              <Tableau
                colonnes={colonnes}
                lignes={donnees.lignes}
                cle={(l) => l.id}
                messageVide="Aucun entrepôt dans votre périmètre."
              />
            </Card>

            {donnees.horsEntrepot !== 0 ? (
              <Text variant="caption" className="text-muted-foreground">
                {m(donnees.horsEntrepot)} de ventes ne sont rattachées à aucun entrepôt
                et n&apos;entrent donc dans aucune ligne : ventes anciennes, ou
                opérations d&apos;établissement. Elles sont comptées dans le total.
              </Text>
            ) : null}
          </>
        ) : null}
      </View>
    </Screen>
  );
}
