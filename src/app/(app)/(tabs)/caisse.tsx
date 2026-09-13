/**
 * Livre de caisse. Miroir de `app/dashboard/cashbook/page.tsx`.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CHAQUE RELEVÉ PORTE UNE LIGNE PAR DEVISE.                               │
 * │                                                                          │
 * │ Un solde de caisse est une somme d'espèces PHYSIQUES : le tiroir         │
 * │ contient des liasses distinctes, qui ne s'additionnent pas. Les          │
 * │ mouvements sont d'ailleurs déjà enregistrés dans la devise des billets.  │
 * │ `MultiCurrencyTotal` rend donc les lignes, et `StatStripItem` l'accepte  │
 * │ en CONTENU : les aplatir en une chaîne remettrait une somme              │
 * │ inter-devises là où le composant existe pour l'empêcher.                 │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LES QUATRE RELEVÉS SONT UN CADRAN, PAS QUATRE CARTES.                   │
 * │                                                                          │
 * │ Ils vivaient dans quatre `Card` empilées : même fond, même ombre, même   │
 * │ rayon, même arrondi que les tuiles cliquables du reste de l'application, │
 * │ et rien pour dire que ces quatre-là ne réagissent pas au toucher. C'est  │
 * │ le défaut « deux registres, deux formes » déjà corrigé sur « Gestion de  │
 * │ stock » puis sur le hub Ventes ; le livre de caisse en était le dernier  │
 * │ porteur. `StatStrip` en fait UN panneau à filets, qui se lit comme un    │
 * │ cadran d'instrument - et ses deux colonnes tiennent les quatre chiffres  │
 * │ sur un même écran, là où l'empilement en occupait deux.                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ Le cadran ne suit PAS les filtres, contrairement au journal des
 * mouvements de stock : le solde du tiroir est une RÉFÉRENCE à laquelle on
 * compare ce qu'on compte, et le faire bouger à chaque puce ferait perdre le
 * chiffre auquel on compare. C'est l'arbitrage des créances, et celui du
 * back-office, dont les quatre cartes viennent de `/cash-movements/balance/`.
 */
import { useCallback, useMemo, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";

import { dateCourteFr } from "@/data/dates";
import { useMonnaie } from "@/data/devises";
import { useLecture } from "@/data/live";
import { libellePeriodeFiltre } from "@/data/periode-filtre";
import { journalCaisse, relevesCaisse, type MouvementCaisse } from "@/data/caisse";
import { libelleTypeCaisse } from "@/data/types-caisse";
import { enAttenteCaisse } from "@/features/caisse/actes";
import { FeuilleFiltresCaisse } from "@/features/caisse/feuille-filtres";
import { FeuilleMouvement } from "@/features/caisse/feuille-mouvement";
import { FeuilleNouveauMouvement } from "@/features/caisse/feuille-nouveau-mouvement";
import {
  aDesFiltresCaisse,
  FILTRES_CAISSE_VIDES,
  nombreDeFiltresCaisse,
  resumeDesFiltresCaisse,
  sansLeFiltreCaisse,
  type FiltresCaisse,
} from "@/features/caisse/filtres";
import { BandeauEnvoi } from "@/features/sync/bandeau-envoi";
import { useSession } from "@/session/provider";
import {
  Badge, BoutonFiltres, Button, Chip, ChipRow, DataList, Icon, Mesure,
  MultiCurrencyTotal, PageHeader, Pressable, Screen, SearchInput, StatStrip,
  StatStripItem, Text, type IconName, type OptionSelect,
} from "@/ui";

const TABLES = [
  "cash_movements",
  "expenses",
  "expense_categories",
  "users",
  "sales",
  // Sans elles, un mouvement saisi au comptoir n'apparaîtrait qu'au prochain
  // tirage - c'est-à-dire pas du tout, tant que le réseau manque.
  "outbox_operations",
];

/** Ce que la fenêtre ramène, et de combien elle grandit. */
const PAS_FENETRE = 60;

export default function Caisse() {
  const money = useMonnaie();
  const { can, snapshot } = useSession();

  const [filtres, setFiltres] = useState<FiltresCaisse>(FILTRES_CAISSE_VIDES);
  const [fenetre, setFenetre] = useState(PAS_FENETRE);
  // UNE seule feuille à la fois, et c'est un état et non deux booléens :
  // `Sheet` est un `Modal`, deux drapeaux sont deux façons d'en ouvrir deux.
  const [feuilleFiltres, setFeuilleFiltres] = useState(false);
  const [feuilleMouvement, setFeuilleMouvement] = useState(false);
  const [ouvert, setOuvert] = useState<MouvementCaisse | null>(null);

  /**
   * Les rappels de filtre sont STABLES, et ce n'est pas du confort.
   *
   * `SearchInput` porte son débounce et garde `onChange` dans les DÉPENDANCES
   * de son effet : un rappel fabriqué à chaque rendu y relance la temporisation
   * à chaque rendu du parent, et la frappe peut ne jamais remonter. Or ce
   * parent se rend à chaque relecture de la base.
   */
  const changerFiltres = useCallback((f: FiltresCaisse) => {
    setFenetre(PAS_FENETRE);
    setFiltres(f);
  }, []);
  const changerRecherche = useCallback((v: string) => {
    setFenetre(PAS_FENETRE);
    setFiltres((f) => ({ ...f, recherche: v }));
  }, []);
  const changerSens = useCallback((v: "in" | "out" | null) => {
    setFenetre(PAS_FENETRE);
    setFiltres((f) => ({ ...f, sens: v }));
  }, []);

  const { donnees: r } = useLecture(relevesCaisse, { tables: TABLES });
  const { donnees: attente } = useLecture(enAttenteCaisse, {
    tables: ["outbox_operations"],
  });

  const charger = useCallback(
    () => journalCaisse(filtres, fenetre),
    [filtres, fenetre]
  );
  const { donnees, chargement } = useLecture(charger, {
    tables: TABLES,
    deps: [filtres, fenetre],
  });
  const mouvements = donnees?.elements ?? [];

  const devises: OptionSelect[] = useMemo(
    () =>
      (snapshot?.currencies ?? []).map((d) => ({
        valeur: d.currency_code,
        label: d.currency_code,
      })),
    [snapshot?.currencies]
  );
  const puces = useMemo(
    () => resumeDesFiltresCaisse(filtres, (p) => libellePeriodeFiltre(p)),
    [filtres]
  );

  return (
    <Screen edges={[]} padded={false}>
      <DataList
        donnees={mouvements}
        cle={(m) => m.id}
        chargement={chargement && mouvements.length === 0}
        enTete={
          <View className="gap-3 px-4 pb-3">
            <PageHeader
              title="Livre de caisse"
              subtitle="Suivi des entrées et sorties de caisse"
              actions={
                <>
                  {can("cashbook.create_expense") ? (
                    <Button
                      variant="outline"
                      size="sm"
                      leftIcon="Receipt"
                      onPress={() => router.push("/depense")}
                    >
                      Dépenses
                    </Button>
                  ) : undefined}
                  {can("cashbook.view_reports") ? (
                    <Button
                      variant="outline"
                      size="sm"
                      leftIcon="Calendar"
                      onPress={() => router.push("/caisse/rapports")}
                    >
                      Rapports
                    </Button>
                  ) : undefined}
                  {can("cashbook.create_movement") ? (
                    <Button
                      size="sm"
                      leftIcon="Plus"
                      onPress={() => setFeuilleMouvement(true)}
                    >
                      Nouveau mouvement
                    </Button>
                  ) : undefined}
                </>
              }
            />

            <StatStrip>
              <StatStripItem label="Solde de caisse" icon="Wallet">
                <MultiCurrencyTotal lignes={r?.solde ?? []} money={money.money} />
              </StatStripItem>
              <StatStripItem label="Entrées du jour" icon="TrendingUp">
                <MultiCurrencyTotal
                  lignes={r?.entreesDuJour ?? []}
                  money={money.money}
                  // Une entrée reste VERTE, une sortie ROUGE : c'est la lecture
                  // du back-office, et sur ce cadran-là le sens de l'argent est
                  // précisément ce qu'on vient lire.
                  tone={(r?.entreesDuJour.length ?? 0) > 0 ? "success" : "foreground"}
                />
              </StatStripItem>
              <StatStripItem label="Sorties du jour" icon="TrendingDown">
                <MultiCurrencyTotal
                  // Le SIGNE est porté par le montant, comme au back-office :
                  // « -12 500 FC » sous un libellé qui dit déjà « sorties » se
                  // lit une fois, pas deux.
                  lignes={(r?.sortiesDuJour ?? []).map((l) => ({
                    ...l,
                    montant: -Math.abs(l.montant),
                  }))}
                  money={money.money}
                  tone={(r?.sortiesDuJour.length ?? 0) > 0 ? "destructive" : "foreground"}
                />
              </StatStripItem>
              <StatStripItem label="Net du jour" icon="ArrowLeftRight">
                <MultiCurrencyTotal lignes={r?.netDuJour ?? []} money={money.money} />
              </StatStripItem>
            </StatStrip>

            {/* Les mouvements en file SONT comptés dans le cadran : les billets
                sont déjà dans le tiroir. On le dit tout de même, parce qu'un
                total qui contient du non-confirmé n'est pas un total arrêté. */}
            {r && r.enFile.nombre > 0 ? (
              <BandeauEnvoi
                envoi={r.enFile.envoi}
                titre={
                  r.enFile.nombre === 1
                    ? "Un mouvement attend son envoi"
                    : `${r.enFile.nombre} mouvements attendent leur envoi`
                }
                consequence="Ils sont déjà comptés dans le solde : l'argent est dans le tiroir."
              />
            ) : null}

            <SearchInput
              valeur={filtres.recherche}
              onChange={changerRecherche}
              placeholder="Référence, description ou note..."
            />
            <ChipRow>
              <BoutonFiltres
                actifs={nombreDeFiltresCaisse(filtres)}
                onPress={() => setFeuilleFiltres(true)}
              />
              <Chip label="Tout" actif={filtres.sens === null} onPress={() => changerSens(null)} />
              <Chip label="Entrées" actif={filtres.sens === "in"} onPress={() => changerSens("in")} />
              <Chip label="Sorties" actif={filtres.sens === "out"} onPress={() => changerSens("out")} />
              {puces.map((puce) => (
                <Chip
                  key={puce.cle}
                  label={puce.label}
                  actif
                  onPress={() => changerFiltres(sansLeFiltreCaisse(filtres, puce.cle))}
                />
              ))}
            </ChipRow>

            {/* Le compte porte le PÉRIMÈTRE, jamais la fenêtre chargée :
                « Mouvements (30) » annonçait la limite de la requête, et les
                autres n'étaient atteignables par aucun geste. */}
            <Text variant="h4">{`Mouvements (${donnees?.nombre ?? 0})`}</Text>
          </View>
        }
        vide={{
          icon: "Wallet",
          titre: "Aucun mouvement",
          // Un état vide SOUS UN FILTRE ne dit pas que la caisse est vide, il
          // dit que ce filtre-là l'est - et il rend le chemin du retour.
          message: aDesFiltresCaisse(filtres)
            ? "Aucun mouvement ne correspond à vos critères."
            : "Les entrées et sorties de caisse apparaîtront ici.",
          action: aDesFiltresCaisse(filtres)
            ? {
                label: "Réinitialiser les filtres",
                onPress: () => changerFiltres(FILTRES_CAISSE_VIDES),
              }
            : can("cashbook.create_movement")
              ? {
                  label: "Nouveau mouvement",
                  onPress: () => setFeuilleMouvement(true),
                }
              : undefined,
        }}
        // La fenêtre S'AGRANDIT, elle ne pagine pas : cet écran se relit dès
        // qu'une table bouge, et des pages accumulées dans l'état seraient
        // perdues à chaque tirage.
        onFin={() => {
          if (donnees?.tronque) setFenetre((f) => f + PAS_FENETRE);
        }}
        pied={
          donnees?.tronque ? (
            <View className="items-center px-4 py-4">
              <Text variant="caption">
                {`${mouvements.length} sur ${donnees.nombre} - chargement de la suite...`}
              </Text>
            </View>
          ) : undefined
        }
        rendu={(m) => {
          const entree = m.direction === "in";
          return (
            <RangeeMouvement
              m={m}
              entree={entree}
              money={money.money}
              onPress={() => setOuvert(m)}
            />
          );
        }}
      />

      <FeuilleFiltresCaisse
        ouvert={feuilleFiltres}
        onFermer={() => setFeuilleFiltres(false)}
        valeur={filtres}
        onChanger={changerFiltres}
        nombreDeResultats={donnees?.nombre ?? 0}
        devises={devises}
      />
      {/* Montée CONDITIONNELLEMENT : chaque ouverture est un montage, donc un
          formulaire vierge, sans effet de remise à zéro à tenir en phase. */}
      {feuilleMouvement ? (
        <FeuilleNouveauMouvement onFermer={() => setFeuilleMouvement(false)} />
      ) : null}
      <FeuilleMouvement
        // Le remontage remet le formulaire à zéro : voir sa docstring.
        key={ouvert?.id ?? "aucun"}
        mouvement={ouvert}
        onFermer={() => setOuvert(null)}
        annulationEnFile={ouvert ? attente?.annulations.get(ouvert.id) : undefined}
      />
    </Screen>
  );
}

function RangeeMouvement({
  m,
  entree,
  money,
  onPress,
}: {
  m: MouvementCaisse;
  entree: boolean;
  money: (montant: number | string, devise: string) => string;
  onPress: () => void;
}) {
  const secondaire = [
    libelleTypeCaisse(m.type),
    m.date ? dateCourteFr(m.date) : null,
    m.refVente ?? m.refDepense ?? m.reference,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <DataListRow
      onPress={onPress}
      annule={m.annule}
      principal={m.description?.trim() || libelleTypeCaisse(m.type)}
      secondaire={secondaire}
      icone={entree ? "ArrowDownRight" : "ArrowUpRight"}
      ton={entree ? "success" : "destructive"}
      valeur={`${entree ? "+" : "-"}${money(m.montant, m.devise)}`}
      badge={
        m.annule ? (
          <Badge tone="neutral">Annulé</Badge>
        ) : m.envoi ? (
          <Badge tone={m.envoi === "bloque" ? "warning" : "neutral"}>
            {m.envoi === "bloque" ? "Bloqué" : "En attente"}
          </Badge>
        ) : undefined
      }
    />
  );
}

/**
 * La rangée d'un mouvement.
 *
 * `DataRow` ne porte pas de pastille d'icône à gauche ; ici elle est ce qui
 * dit le SENS d'un coup d'oeil, avant même de lire le signe du montant.
 */
function DataListRow({
  onPress,
  annule,
  principal,
  secondaire,
  icone,
  ton,
  valeur,
  badge,
}: {
  onPress: () => void;
  annule: boolean;
  principal: string;
  secondaire: string;
  icone: IconName;
  ton: "success" | "destructive";
  valeur: string;
  badge?: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${principal}, ${valeur}`}
      className={`flex-row items-center gap-3 px-4 py-3 ${annule ? "opacity-50" : ""}`}
    >
      <View
        className={`h-9 w-9 items-center justify-center rounded-lg ${
          ton === "success" ? "bg-success/15" : "bg-destructive/15"
        }`}
      >
        <Icon name={icone} size={16} color={ton} />
      </View>
      <View className="min-w-0 flex-1">
        <Text variant="bodySmall" numberOfLines={1} className="font-sans-medium">
          {principal}
        </Text>
        <Text variant="caption" numberOfLines={1}>
          {secondaire}
        </Text>
      </View>
      <View className="shrink-0 items-end gap-1">
        <Mesure value={valeur} tone={ton} />
        {badge}
      </View>
    </Pressable>
  );
}
