/**
 * Le compte d'un client sur une période, sur sa fiche.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ AUCUN ÉCRAN NE RENDAIT CE COMPTE BORNÉ DANS LE TEMPS.                    │
 * │                                                                          │
 * │ La fiche montre ses ventes et ses écritures, jamais ce qu'il a rapporté   │
 * │ sur un mois - et nulle part sa fidélité GAGNÉE contre celle déjà          │
 * │ UTILISÉE. Le marchand additionnait sa liste de ventes à la main.          │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ IL EXIGE LE RÉSEAU, ET L'ÉCRAN LE DIT. `loyalty_transactions` n'est pas au
 * manifeste de tirage, et les montants sont convertis par le serveur au taux
 * FIGÉ sur chaque facture : les recalculer donnerait deux chiffres pour le même
 * client. Un tableau vide se lirait « rien à signaler », ce qui est faux quand
 * on n'a rien pu mesurer.
 *
 * ⚠ LA CAGNOTTE DISPONIBLE N'A PAS DE PÉRIODE : c'est un solde d'AUJOURD'HUI, et
 * son étiquette porte la date d'arrêté. Sans elle, elle se lirait comme un
 * chiffre de la fenêtre choisie.
 */
import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";

import { jourISO } from "@/data/dates";
import { useMonnaie } from "@/data/devises";
import { depuisQuand, type Periode } from "@/data/periodes";
import {
  chargerRapportClient,
  type RapportClient,
} from "@/data/rapport-client";
import { useEnLigne } from "@/data/reseau";
import { useSession } from "@/session/provider";
import { Banner, Card, Chip, ChipRow, Mesure, Section, Text } from "@/ui";

/**
 * Les quatre fenêtres, celles de `data/periodes` - la SEULE règle de périodes
 * du dépôt : `jour ⊆ 7 jours ⊆ 30 jours ⊆ tout`.
 *
 * ⚠ LE DÉFAUT EST « 30 JOURS », pas « tout » : un rapport sans borne sur un
 * client de trois ans ne répond à aucune question qu'on se pose devant sa
 * fiche.
 */
const FENETRES: { cle: Periode; label: string }[] = [
  { cle: "jour", label: "Jour" },
  { cle: "semaine", label: "7 jours" },
  { cle: "mois", label: "30 jours" },
  { cle: "tout", label: "Tout" },
];

export function SectionRapportClient({ clientId }: { clientId: string }) {
  const money = useMonnaie();
  const enLigne = useEnLigne();
  const { snapshot } = useSession();
  const organisation = snapshot?.organization.id ?? "";

  const [periode, setPeriode] = useState<Periode>("mois");
  const [rapport, setRapport] = useState<RapportClient | null>(null);
  const [charge, setCharge] = useState(false);
  const [echec, setEchec] = useState<string | null>(null);

  const charger = useCallback(async () => {
    if (!organisation || !enLigne) return;
    setCharge(true);
    try {
      const debut = depuisQuand(periode);
      const d = await chargerRapportClient({
        organisation,
        client: clientId,
        ...(debut ? { debut: jourISO(debut), fin: jourISO(new Date()) } : {}),
      });
      setRapport(d);
      setEchec(null);
    } catch {
      // ⚠ ON GARDE LE DERNIER ÉTAT CONNU et on DIT qu'il est daté : effacer les
      //   chiffres qu'on était en train de lire est pire que de les montrer
      //   périmés. C'est la règle du verrou d'inventaire au comptoir, et celle
      //   que l'écran des créances applique déjà.
      setEchec("Le rapport n'a pas pu être chargé.");
    } finally {
      setCharge(false);
    }
  }, [organisation, clientId, periode, enLigne]);

  useEffect(() => {
    // ┌──────────────────────────────────────────────────────────────────────┐
    // │ `set-state-in-effect` NE SAIT PAS EXPRIMER « CHARGER UN RAPPORT EN  │
    // │ LIGNE À L'ARRIVÉE ET À CHAQUE CHANGEMENT DE FENÊTRE ».              │
    // │                                                                      │
    // │ `charger` pose son `setCharge(true)` avant le premier `await` - sans │
    // │ quoi aucun indicateur ne paraît et l'écran semble figé - et la règle │
    // │ perd sa trace des `await` en traversant le bloc gardé.               │
    // │                                                                      │
    // │ Ce que la règle protège n'est pas en jeu : le chemin court une fois  │
    // │ par fenêtre choisie et s'arrête sur un état stable, il ne cascade    │
    // │ pas. C'est exactement la forme de `(tabs)/rapports.tsx`, qui porte   │
    // │ déjà cette erreur pour la même raison - huit onglets de rapports     │
    // │ servis par le serveur se chargent ainsi.                             │
    // └──────────────────────────────────────────────────────────────────────┘
    // eslint-disable-next-line react-hooks/set-state-in-effect -- chargement en ligne, voir ci-dessus
    void charger();
  }, [charger]);

  const argent = (montant: number, devise?: string) =>
    money.money(montant, devise || rapport?.devisePrincipale || money.primaryCode);

  return (
    <Section title="Rapport du client">
      <ChipRow>
        {FENETRES.map((f) => (
          <Chip
            key={f.cle}
            label={f.label}
            actif={periode === f.cle}
            onPress={() => setPeriode(f.cle)}
          />
        ))}
      </ChipRow>

      {!enLigne && !rapport ? (
        <Banner
          tone="info"
          title="Ce rapport demande le réseau"
          message="Les montants sont convertis par le serveur au taux de chaque facture, et la fidélité d'une période ne descend pas sur le terminal. La cagnotte ci-dessus, elle, reste lisible hors ligne."
        />
      ) : null}

      {echec ? (
        <Banner
          tone="warning"
          title={echec}
          message={
            rapport
              ? "Les chiffres ci-dessous sont ceux du dernier chargement."
              : undefined
          }
          action={{ label: "Réessayer", onPress: () => void charger(), loading: charge }}
        />
      ) : null}

      {rapport ? (
        <>
          <Card>
            <View className="flex-row flex-wrap">
              <Releve
                label="Chiffre d'affaires"
                valeur={argent(rapport.chiffre)}
              />
              <Releve label="Ventes" valeur={String(rapport.nombreVentes)} />
              <Releve label="Panier moyen" valeur={argent(rapport.panierMoyen)} />
              <Releve
                label="Articles achetés"
                valeur={String(rapport.articles)}
              />
              <Releve label="Encaissé" valeur={argent(rapport.encaisse)} />
              <Releve label="Reste dû" valeur={argent(rapport.resteDu)} />
            </View>
            <Text variant="caption" className="mt-2">
              {`Montants convertis en ${rapport.devisePrincipale}, au taux figé sur chaque facture.`}
            </Text>
          </Card>

          {/* La ventilation par devise : jamais sommée nativement. Elle ne
          paraît que sur une période réellement multi-devise, sinon elle
          répéterait le chiffre d'affaires juste au-dessus. */}
          {rapport.parDevise.length > 1 ? (
            <Card>
              <Text variant="caption">Facturé par devise</Text>
              {rapport.parDevise.map((d) => (
                <View
                  key={d.devise}
                  className="mt-1 flex-row items-center justify-between gap-3"
                >
                  <Text variant="caption" className="min-w-0 flex-1">
                    {`${d.devise} · ${d.nombre} vente(s)`}
                  </Text>
                  <Mesure value={argent(d.totalNatif, d.devise)} />
                </View>
              ))}
            </Card>
          ) : null}

          {rapport.fidelite.aUnProgramme ? (
            <Card>
              <Text variant="caption">Cagnotte de fidélité</Text>
              <View className="mt-1 flex-row flex-wrap">
                <Releve
                  label="Gagnée sur la période"
                  valeur={argent(rapport.fidelite.gagnee)}
                />
                <Releve
                  label="Utilisée sur la période"
                  valeur={argent(rapport.fidelite.utilisee)}
                />
                {/* ⚠ CE CHIFFRE N'A PAS DE PÉRIODE, et l'étiquette le dit. */}
                <Releve
                  label={`Disponible au ${rapport.arreteAu ?? "jour"}`}
                  valeur={argent(rapport.fidelite.cagnotte)}
                />
              </View>
            </Card>
          ) : null}
        </>
      ) : null}
    </Section>
  );
}

/**
 * Un relevé du cadran : la moitié de la largeur.
 *
 * ⚠ `Mesure` ET NON `StatValue` : celui-ci part d'un titre en gras, parce que
 * dans une cellule de cadran le nombre EST le contenu. Ici les relevés vivent
 * dans une carte à deux colonnes - deux par rangée tiennent les six chiffres
 * sur un même écran, trois seraient de trop.
 */
function Releve({ label, valeur }: { label: string; valeur: string }) {
  return (
    <View className="mb-3 pr-3" style={{ width: "50%" }}>
      <Text variant="caption">{label}</Text>
      <Mesure value={valeur} />
    </View>
  );
}
