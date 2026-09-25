/**
 * Dépenses. Miroir de `app/dashboard/cashbook/expenses/page.tsx`.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE CADRAN NE COMPTE QUE L'ARGENT RÉELLEMENT SORTI.                      │
 * │                                                                          │
 * │ `stats` du serveur filtre `status__in=['approved', 'paid']` sans jamais  │
 * │ le dire à l'écran, et le back-office le tait aussi. Un brouillon n'a pas │
 * │ encore fait sortir un billet - `create_expense` ne crée aucun mouvement  │
 * │ de caisse, seuls `approve` et `pay` le font - et l'inclure donnerait un  │
 * │ total supérieur à ce qui manque dans le tiroir. La règle est écrite sous │
 * │ le cadran : elle change le sens des trois chiffres qu'il porte.          │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import { useCallback, useMemo, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { formatDateFr, formatNumberFr } from "@vente-facile/core";

import { listeDepenses, type DepenseResume } from "@/data/caisse";
import { useMonnaie } from "@/data/devises";
import { useLecture } from "@/data/live";
import {
  contexteFileDe,
  perimetreAffichable,
} from "@/features/perimetre/filtre-perimetre";
import { usePerimetre } from "@/features/perimetre/use-perimetre";
import { libellePeriodeFiltre } from "@/data/periode-filtre";
import { STATUT_DEPENSE } from "@/data/types-caisse";
import { FeuilleNouvelleDepense } from "@/features/caisse/feuille-depense";
import { FeuilleFiltresDepense } from "@/features/caisse/feuille-filtres";
import {
  aDesFiltresDepense,
  FILTRES_DEPENSE_VIDES,
  nombreDeFiltresDepense,
  ORDRE_STATUTS_DEPENSE,
  resumeDesFiltresDepense,
  sansLeFiltreDepense,
  type FiltresDepense,
} from "@/features/caisse/filtres";
import { categoriesDepense } from "@/data/caisse";
import { BandeauEnvoi } from "@/features/sync/bandeau-envoi";
import { useSession } from "@/session/provider";
import {
  AppBar, Badge, BoutonFiltres, Chip, ChipRow, DataList, DataRow, Fab, IconButton, Mesure,
  MultiCurrencyTotal, Pastille, Screen, SearchInput, StatStrip, StatStripItem,
  Text, type OptionSelect,
} from "@/ui";

const TABLES = ["expenses", "expense_categories", "outbox_operations"];
const PAS_FENETRE = 60;

export default function Depenses() {
  const money = useMonnaie();
  const { can, snapshot } = useSession();

  const [filtres, setFiltres] = useState<FiltresDepense>(FILTRES_DEPENSE_VIDES);
  const [fenetre, setFenetre] = useState(PAS_FENETRE);
  const [feuille, setFeuille] = useState(false);
  const [feuilleDepense, setFeuilleDepense] = useState(false);

  const changerFiltres = useCallback((f: FiltresDepense) => {
    setFenetre(PAS_FENETRE);
    setFiltres(f);
  }, []);
  const changerRecherche = useCallback((v: string) => {
    setFenetre(PAS_FENETRE);
    setFiltres((f) => ({ ...f, recherche: v }));
  }, []);
  const changerStatut = useCallback((v: string | null) => {
    setFenetre(PAS_FENETRE);
    setFiltres((f) => ({ ...f, statut: v }));
  }, []);

  // La dépense PORTE son entrepôt : rien à dériver ici, contrairement au
  // journal de caisse.
  const perimetre = usePerimetre(filtres, true);
  const applique = perimetre.applique;
  const moi = snapshot?.user.id ?? null;
  // Voir `caisse.tsx` : ce que les lignes en file ont besoin qu'on sache.
  const file = useMemo(() => contexteFileDe(perimetre, moi), [perimetre, moi]);

  const charger = useCallback(
    () => listeDepenses({ ...filtres, ...applique }, fenetre, file),
    [filtres, applique, fenetre, file]
  );
  const { donnees, chargement } = useLecture(charger, {
    tables: TABLES,
    deps: [filtres, applique, fenetre, file],
  });
  const depenses = donnees?.elements ?? [];

  /**
   * Les décomptes des puces sont calculés SANS le filtre de statut.
   *
   * Avec, toutes les puces sauf l'active tomberaient à zéro - et une puce à
   * zéro se lit « il n'y en a pas », pas « vous ne les regardez pas ». La
   * RECHERCHE et les autres filtres, eux, y entrent : ils réduisent le
   * périmètre lui-même. Règle déjà posée sur les statuts de l'historique.
   */
  const chargerDecomptes = useCallback(
    () => listeDepenses({ ...filtres, ...applique, statut: null }, 5000, file),
    [filtres.recherche, filtres.categorie, filtres.devise, filtres.periode, applique, file]
  );
  const { donnees: tous } = useLecture(chargerDecomptes, {
    tables: TABLES,
    deps: [
      filtres.recherche, filtres.categorie, filtres.devise, filtres.periode,
      // Le périmètre réduit le périmètre lui-même : sans lui ici, les puces
      // annonceraient des décomptes d'un autre entrepôt que la liste.
      applique, file,
    ],
  });
  const parStatut = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of tous?.elements ?? []) m.set(d.statut, (m.get(d.statut) ?? 0) + 1);
    return m;
  }, [tous]);

  const { donnees: categories } = useLecture(categoriesDepense, {
    tables: ["expense_categories"],
  });
  const optionsCategorie: OptionSelect[] = useMemo(
    () => (categories ?? []).map((c) => ({ valeur: c.id, label: c.nom })),
    [categories]
  );
  const devises: OptionSelect[] = useMemo(
    () =>
      (snapshot?.currencies ?? []).map((d) => ({
        valeur: d.currency_code,
        label: d.currency_code,
      })),
    [snapshot?.currencies]
  );
  const puces = useMemo(
    () =>
      resumeDesFiltresDepense(
        { ...filtres, ...perimetreAffichable(perimetre) },
        {
          entrepot: perimetre.entrepots.find(
            (o) => o.valeur === perimetre.applique.entrepot
          )?.label,
          utilisateur: perimetre.utilisateurs.find(
            (o) => o.valeur === perimetre.applique.utilisateur
          )?.label,
          categorie: optionsCategorie.find((c) => c.valeur === filtres.categorie)?.label,
        },
        (p) => libellePeriodeFiltre(p)
      ),
    [filtres, perimetre, optionsCategorie]
  );

  const totaux = donnees?.totaux ?? [];
  const nombreEngageant = totaux.reduce((s, t) => s + t.nombre, 0);

  const rendu = (d: DepenseResume) => {
    const s = STATUT_DEPENSE[d.statut];
    return (
      <DataRow
        principal={d.description || d.reference || "Dépense"}
        // La pastille de la catégorie, comme la colonne du back-office : c'est
        // ce qui permet de retrouver « Carburant » d'un coup d'oeil dans une
        // liste de vingt. `vignette` occupe la case de l'icône, donc les
        // textes ne se décalent pas d'une rangée à l'autre.
        vignette={
          <View className="h-9 w-9 items-center justify-center">
            <Pastille couleur={d.couleur} taille={12} />
          </View>
        }
        secondaire={
          [
            d.categorie,
            d.beneficiaire,
            d.date ? formatDateFr(d.date) : null,
            // La référence ferme la ligne : c'est une colonne du back-office,
            // et c'est par elle qu'on rapproche une pièce d'un papier.
            d.reference,
          ]
            .filter(Boolean)
            .join(" · ") || null
        }
        badge={
          d.envoi ? (
            // Ce qui n'est pas encore parti PRIME sur le statut : le serveur
            // n'a pas encore vu cette dépense, annoncer « Brouillon » seul
            // laisserait croire qu'il la connaît.
            <Badge tone={d.envoi === "bloque" ? "warning" : "neutral"}>
              {d.envoi === "bloque" ? "Bloquée" : "En attente d'envoi"}
            </Badge>
          ) : s ? (
            <Badge tone={s.ton}>{s.label}</Badge>
          ) : undefined
        }
        valeur={<Mesure value={money.money(d.montant, d.devise)} tone="destructive" />}
        onPress={() => router.push(`/depense/${d.id}`)}
      />
    );
  };

  return (
    <Screen padded={false}>
      <AppBar
        title="Dépenses"
        subtitle="Sorties de caisse et charges"
        // Le bouton « Catégorie » de l'en-tête du back-office. Sans lui, une
        // rubrique ne se corrige que depuis l'intérieur d'un formulaire de
        // dépense, c'est-à-dire nulle part quand on vient exprès pour ça.
        right={
          can("cashbook.manage_categories") ? (
            <IconButton
              name="Tag"
              label="Rubriques de caisse"
              onPress={() => router.push("/caisse/categories")}
            />
          ) : undefined
        }
      />
      <DataList
        donnees={depenses}
        cle={(d) => d.id}
        rendu={rendu}
        chargement={chargement && depenses.length === 0}
        enTete={
          <View className="gap-3 px-4 pb-3 pt-2">
            <StatStrip>
              <StatStripItem label="Total dépensé" icon="Receipt">
                <MultiCurrencyTotal
                  lignes={totaux.map((t) => ({ devise: t.devise, montant: t.montant }))}
                  money={money.money}
                  tone={totaux.length > 0 ? "destructive" : "foreground"}
                />
              </StatStripItem>
              {/* Le cartouche « Équivalent en X » du back-office. Il n'a de
                  sens que s'il y a plusieurs devises : sur un établissement
                  mono-devise il répéterait la cellule voisine. */}
              {totaux.length > 1 ? (
                <StatStripItem
                  label={`Équivalent en ${money.primaryCode}`}
                  icon="ArrowLeftRight"
                  value={money.money(donnees?.totalPrincipal ?? 0, money.primaryCode)}
                />
              ) : null}
              <StatStripItem
                label="Dépenses engagées"
                icon="ClipboardList"
                value={formatNumberFr(nombreEngageant, 0)}
              />
            </StatStrip>
            <Text variant="caption">
              Le cadran ne compte que les dépenses approuvées ou payées : un
              brouillon n&apos;a pas encore fait sortir de billet.
            </Text>

            {/* ┌──────────────────────────────────────────────────────────┐
                │ LES DÉPENSES EN FILE SONT DANS LA LISTE, ET LE BANDEAU LE │
                │ DIT.                                                      │
                │                                                           │
                │ L'écran annonçait « Elles n'apparaissent pas encore dans   │
                │ cette liste » : honnête, et c'était le défaut. Corollaire  │
                │ de « les tables tirées ne sont écrites que par le tirage », │
                │ déjà refermé sur les retours, les devis et les ventes.     │
                │ Elles y figurent en BROUILLON, sans peser sur le cadran :  │
                │ créer une dépense ne fait pas encore sortir de billet.     │
                └───────────────────────────────────────────────────────────┘ */}
            {donnees && donnees.enFile.nombre > 0 ? (
              <BandeauEnvoi
                envoi={donnees.enFile.envoi}
                titre={
                  donnees.enFile.nombre === 1
                    ? "Une dépense attend son envoi"
                    : `${donnees.enFile.nombre} dépenses attendent leur envoi`
                }
                consequence="Elle est listée en brouillon et n'entre pas encore dans le total."
              />
            ) : null}

            <SearchInput
              valeur={filtres.recherche}
              onChange={changerRecherche}
              placeholder="Référence, description ou bénéficiaire..."
            />
            <ChipRow>
              <BoutonFiltres
                actifs={nombreDeFiltresDepense({ ...filtres, ...perimetreAffichable(perimetre) })}
                onPress={() => setFeuille(true)}
              />
              <Chip
                label={`Toutes (${tous?.elements.length ?? 0})`}
                actif={filtres.statut === null}
                onPress={() => changerStatut(null)}
              />
              {/* Les statuts VIDES disparaissent : un terminal ne produit ni
                  rejet ni annulation tous les jours, et quatre puces qui
                  répondent « aucune dépense » apprennent à ne plus lire la
                  rangée. L'active reste affichée même vidée par la recherche,
                  sinon on ne pourrait plus la désélectionner. */}
              {ORDRE_STATUTS_DEPENSE.filter(
                (s) => (parStatut.get(s) ?? 0) > 0 || filtres.statut === s
              ).map((s) => (
                <Chip
                  key={s}
                  label={`${STATUT_DEPENSE[s].label} (${parStatut.get(s) ?? 0})`}
                  actif={filtres.statut === s}
                  onPress={() => changerStatut(filtres.statut === s ? null : s)}
                />
              ))}
              {puces.map((puce) => (
                <Chip
                  key={puce.cle}
                  label={puce.label}
                  actif
                  onPress={() => changerFiltres(sansLeFiltreDepense(filtres, puce.cle))}
                />
              ))}
            </ChipRow>

            <Text variant="h4">{`Dépenses (${donnees?.nombre ?? 0})`}</Text>
          </View>
        }
        vide={{
          icon: "Receipt",
          titre: "Aucune dépense",
          message: aDesFiltresDepense(filtres)
            ? "Aucune dépense ne correspond à vos critères."
            : "Enregistrez vos charges pour suivre la caisse au plus juste.",
          action: aDesFiltresDepense(filtres)
            ? {
                label: "Réinitialiser les filtres",
                onPress: () => changerFiltres(FILTRES_DEPENSE_VIDES),
              }
            : undefined,
        }}
        onFin={() => {
          if (donnees?.tronque) setFenetre((f) => f + PAS_FENETRE);
        }}
        pied={
          donnees?.tronque ? (
            <View className="items-center px-4 py-4">
              <Text variant="caption">
                {`${depenses.length} sur ${donnees.nombre} - chargement de la suite...`}
              </Text>
            </View>
          ) : undefined
        }
      />
      <Fab
        icon="Plus"
        label="Nouvelle"
        onPress={() => setFeuilleDepense(true)}
        // Grisé avec sa raison plutôt que caché : un bouton absent enseigne que
        // la fonction n'existe pas, et personne ne cherche un droit manquant là
        // où il n'y a rien à voir.
        raison={
          can("cashbook.create_expense")
            ? undefined
            : "Votre compte ne peut pas enregistrer de dépense."
        }
      />

      {/* Montée CONDITIONNELLEMENT : chaque ouverture est un montage, donc un
          formulaire vierge, sans effet de remise à zéro à tenir en phase. */}
      {feuilleDepense ? (
        <FeuilleNouvelleDepense
          onFermer={() => setFeuilleDepense(false)}
          onCree={(id) => router.push(`/depense/${id}`)}
        />
      ) : null}

      <FeuilleFiltresDepense
        perimetre={perimetre}
        ouvert={feuille}
        onFermer={() => setFeuille(false)}
        valeur={filtres}
        onChanger={changerFiltres}
        nombreDeResultats={donnees?.nombre ?? 0}
        categories={optionsCategorie}
        devises={devises}
      />
    </Screen>
  );
}
