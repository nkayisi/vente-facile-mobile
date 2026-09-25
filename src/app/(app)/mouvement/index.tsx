/**
 * Mouvements de stock. Miroir de `app/dashboard/stock/movements/page.tsx`.
 *
 * Le back-office masque QUATRE de ses huit colonnes à cette largeur (entrepôt,
 * auteur, stock avant/après, valeur) et compense en glissant un rappel de
 * l'entrepôt sous le nom du produit. On garde cette intention : le nom, puis
 * l'entrepôt et la date, puis la quantité signée.
 *
 * La quantité est rendue dans les termes de la SAISIE D'ORIGINE, avec le
 * facteur figé sur la ligne, jamais redécoupée au conditionnement du jour.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CET ÉCRAN ÉTAIT UN ONGLET SANS BOUTON, ET DONC UN CUL-DE-SAC.           │
 * │                                                                          │
 * │ Il vivait dans `(tabs)/mouvements.tsx` avec `href: null` : aucun bouton  │
 * │ dans la barre, aucune entrée dans le tiroir, et le seul chemin qui y     │
 * │ mène est le raccourci « Mouvements » de « Gestion de stock ». Or on      │
 * │ n'ARRIVE pas sur un onglet, on BASCULE dessus : pas de pile, donc pas de │
 * │ flèche de retour, et le magasinier qui voulait vérifier une entrée se    │
 * │ retrouvait sans chemin vers le concentrateur d'où il venait - la barre   │
 * │ du bas ne portant même pas l'onglet où il se trouve.                     │
 * │                                                                          │
 * │ Il est donc passé dans la PILE, comme `/rayon`, `/transfert` et         │
 * │ `/ajustement` : les quatre destinations de la section « Opérations » se  │
 * │ comportent de la même façon, et toutes portent la flèche de retour       │
 * │ d'`AppBar`.                                                              │
 * │                                                                          │
 * │ SINGULIER, comme ses voisines. Le pluriel aurait fait deux nœuds pour    │
 * │ une seule rubrique.                                                      │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA SAISIE N'EST PLUS UNE ROUTE, C'EST UNE FEUILLE.                      │
 * │                                                                          │
 * │ `/mouvement/nouveau` est SUPPRIMÉ : créer n'est pas naviguer, et le      │
 * │ journal reste visible derrière. Le formulaire vit dans                   │
 * │ `features/stock/feuille-mouvement`, monté par cet écran ET par le        │
 * │ concentrateur « Gestion de stock » - deux points d'entrée, un seul       │
 * │ formulaire.                                                              │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN SEUL JEU DE FILTRES, DONC UNE SEULE RANGÉE.                          │
 * │                                                                          │
 * │ Le sens (« Tout », « Entrées », « Sorties ») et le type vivaient sur     │
 * │ DEUX rangées de puces superposées, la seconde en portant douze. Deux     │
 * │ rangées l'une sous l'autre se lisent comme un seul jeu, alors qu'elles   │
 * │ portent deux filtres indépendants qui se combinent - et les douze puces  │
 * │ mangeaient une ligne entière avant le premier mouvement.                 │
 * │                                                                          │
 * │ Le type passe donc dans un `ChampSelect`, à la suite des trois puces de  │
 * │ sens : le contrôle ANNONCE sa valeur au lieu de la laisser sortir de     │
 * │ l'écran, et la liste des douze s'ouvre en entier d'un coup d'œil. C'est  │
 * │ le `<Select>` que le back-office pose sur ce même écran.                 │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import { useCallback, useMemo, useState } from "react";
import { View } from "react-native";
import { formatNumberFr } from "@vente-facile/core";

import { ApiError } from "@/api/errors";
import { categoriesPourFiltre } from "@/data/categories";
import { dateCourteFr } from "@/data/dates";
import { useLecture } from "@/data/live";
import { journalMouvements } from "@/data/mouvements";
import { libellePeriodeFiltre } from "@/data/periode-filtre";
import { useEnLigne } from "@/data/reseau";
import { avertissementDeMouvementsEnFile } from "@/features/export/en-file";
import { perimetreAffichable } from "@/features/perimetre/filtre-perimetre";
import { usePerimetre } from "@/features/perimetre/use-perimetre";
import { FeuilleFormat } from "@/features/export/feuille-format";
import {
  telechargerDocument,
  type FormatExport,
} from "@/features/export/telecharger";
import { mouvementsEnAttente } from "@/features/stock/actes";
import { BandeauEnvoi } from "@/features/sync/bandeau-envoi";
import { FeuilleApprovisionnement, type PresentationAppro, type SourceEntrees }
  from "@/features/stock/feuille-approvisionnement";
import { FeuilleFiltresMouvements } from "@/features/stock/feuille-filtres-mouvements";
import { FeuilleNouveauMouvement } from "@/features/stock/feuille-mouvement";
import {
  FILTRES_VIDES,
  aDesFiltres,
  nombreDeFiltresActifs,
  parametresApprovisionnement,
  parametresDExport,
  resumeDesFiltres,
  sansLeFiltre,
  type FiltresEcran,
} from "@/features/stock/filtres-mouvements";
import { useSession } from "@/session/provider";
import {
  AppBar, Badge, BoutonFiltres, Chip, ChipRow, DataList, DataRow, Fab, Icon,
  IconButton, Screen, SearchInput, StatStrip, StatStripItem, Text, useToast,
  type OptionSelect,
} from "@/ui";

// `categories` entre dans les tables surveillées : le sous-arbre en dépend, et
// une catégorie tirée pendant que l'écran est ouvert doit changer la liste.
const TABLES = ["stock_movements", "products", "warehouses", "units", "categories"];

/** Ce que la fenêtre ramène, et de combien elle grandit. */
const PAS_FENETRE = 150;

export default function Mouvements() {
  const { can } = useSession();
  const toast = useToast();
  const enLigne = useEnLigne();

  const [filtres, setFiltres] = useState<FiltresEcran>(FILTRES_VIDES);
  const [fenetre, setFenetre] = useState(PAS_FENETRE);
  /**
   * UNE seule feuille à la fois, et c'est un état et non quatre booléens.
   *
   * `Sheet` est un `Modal` : quatre drapeaux indépendants, c'est quatre façons
   * d'en ouvrir deux. Un seul état rend l'exclusion structurelle.
   */
  const [feuille, setFeuille] = useState<
    null | "saisie" | "filtres" | "format" | "approvisionnement"
  >(null);
  const [envoiExport, setEnvoiExport] = useState(false);
  const [source, setSource] = useState<SourceEntrees>("all");
  const [presentation, setPresentation] = useState<PresentationAppro>("product");

  /**
   * Les trois rappels de filtre sont STABLES, et ce n'est pas du confort.
   *
   * `SearchInput` porte son débounce lui-même et garde `onChange` dans les
   * DÉPENDANCES de son effet : un rappel fabriqué à chaque rendu y relance la
   * temporisation à chaque rendu du parent, et la frappe peut ne jamais
   * remonter. Or ce parent se rend à chaque relecture de la base. C'est la
   * famille de défaut qui a fait tourner l'écran d'encaissement en boucle -
   * rien ne se voit, rien ne se journalise.
   *
   * Chacun REMET LA FENÊTRE au début : la garder agrandie ferait relire mille
   * lignes pour une recherche qui en rend trois, et laisserait le défilement
   * déjà au-delà d'une liste qui vient de raccourcir.
   */
  const changerFiltres = useCallback((f: FiltresEcran) => {
    setFenetre(PAS_FENETRE);
    setFiltres(f);
  }, []);
  const changerRecherche = useCallback((v: string) => {
    setFenetre(PAS_FENETRE);
    setFiltres((f) => ({ ...f, recherche: v }));
  }, []);
  const changerSens = useCallback((v: boolean | null) => {
    setFenetre(PAS_FENETRE);
    setFiltres((f) => ({ ...f, sens: v }));
  }, []);

  const { recherche, sens } = filtres;

  // Le périmètre décide de ce qui est proposé ET de ce qui est appliqué : un
  // magasinier n'y voit que ses dépôts, et le filtre « Utilisateur » se ferme
  // avec son motif s'il n'a pas de roster.
  const perimetre = usePerimetre(filtres, true);
  const applique = perimetre.applique;

  const charger = useCallback(
    () =>
      journalMouvements({
        recherche: filtres.recherche,
        type: filtres.type,
        entree: filtres.sens,
        // ⚠ LE PÉRIMÈTRE APPLIQUÉ, JAMAIS `filtres.entrepot`. C'est ce qui fait
        // qu'un rôle borné ne peut pas lire au-delà de ses dépôts, même avec un
        // état d'écran resté d'une session précédente ou d'un rôle changé
        // au back-office pendant qu'il travaillait.
        entrepot: applique.entrepot,
        utilisateur: applique.utilisateur,
        categorie: filtres.categorie,
        periode: filtres.periode,
        limite: fenetre,
      }),
    [filtres, applique, fenetre]
  );
  const { donnees, chargement } = useLecture(charger, {
    tables: TABLES,
    deps: [filtres, applique, fenetre],
  });
  const mouvements = donnees?.elements ?? [];
  const releves = donnees?.releves;

  const { donnees: cats } = useLecture(categoriesPourFiltre, { tables: ["categories"] });
  const optionsCategorie: OptionSelect[] = useMemo(
    () =>
      (cats ?? []).map((c) => ({
        valeur: c.id,
        // L'indentation passe par le LIBELLÉ : `OptionSelect` ne porte pas de
        // sous-titre, et « Sodas » doit se lire SOUS « Boissons ».
        label: `${"    ".repeat(c.profondeur)}${c.nom}`,
      })),
    [cats]
  );
  const nomEntrepot = perimetre.entrepots.find(
    (o) => o.valeur === perimetre.applique.entrepot
  )?.label;
  const nomUtilisateur = perimetre.utilisateurs.find(
    (o) => o.valeur === perimetre.applique.utilisateur
  )?.label;
  const nomCategorie = (cats ?? []).find((c) => c.id === filtres.categorie)?.nom;
  const puces = useMemo(
    () =>
      resumeDesFiltres(
        // ⚠ LE PÉRIMÈTRE APPLIQUÉ, JAMAIS LE CHOIX BRUT. Un caissier porte deux
        // contraintes qu'il n'a pas posées : les afficher en puces retirables
        // lui promettrait de pouvoir les retirer.
        { ...filtres, ...perimetreAffichable(perimetre) },
        { entrepot: nomEntrepot, utilisateur: nomUtilisateur, categorie: nomCategorie },
        (pp) => libellePeriodeFiltre(pp)
      ),
    [filtres, perimetre, nomEntrepot, nomUtilisateur, nomCategorie]
  );

  // Les saisies encore dans le journal ne sont NI dans la liste (la table est
  // tirée) NI dans le document. On les compte pour le dire avant le partage.
  //
  // ⚠ Le LOT ENTIER, jamais son seul nombre : `mouvementsEnAttente` rend déjà
  // l'état d'envoi, et le réduire à un compteur faisait annoncer
  // « Synchronisez » sur une saisie bloquée, que la synchronisation
  // n'enverra jamais.
  const { donnees: enFile } = useLecture(mouvementsEnAttente, {
    tables: ["outbox_operations"],
  });
  const avertissementExport = useMemo(
    () => avertissementDeMouvementsEnFile(enFile ?? { nombre: 0, envoi: undefined }),
    [enFile]
  );

  const peutSaisir = can("stock_movements.create");
  // Le serveur garde son export par `stock_movements.view`. Les trois rôles
  // qui portent `.create` le portent aussi, mais un droit accordé à la main
  // (`extra_permissions`) peut les dissocier : offrir le bouton sans le droit
  // le ferait répondre 403 après le choix du format, et le magasinier y lirait
  // une panne plutôt qu'un droit manquant.
  const peutVoir = can("stock_movements.view");
  // Fermé hors ligne, AVEC sa raison : le document vient du serveur, et
  // échouer après le choix du format ferait croire à une panne. Un bouton
  // grisé muet est le cul-de-sac que ce dépôt a déjà corrigé ailleurs.
  const raisonExport = !enLigne
    ? "L'export est fabriqué par le serveur : il demande une connexion."
    : envoiExport
      ? "Export en cours…"
      : // Le mot du back-office, qui ferme son menu d'export de la même façon
        // (`disabledReason="Aucun mouvement à exporter"`). Un document vide
        // n'est pas faux, il est inutile - et le produire quand même ferait
        // douter du périmètre plutôt que du filtre.
        releves && releves.nombre === 0
        ? "Aucun mouvement à exporter."
        : undefined;

  /**
   * L'export est fabriqué par le SERVEUR, comme tous les autres documents.
   *
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ LES FILTRES DE L'ÉCRAN PARTENT AVEC LE DOCUMENT.                     │
   * │                                                                      │
   * │ `StockMovementFilter` sert la liste du back-office ET son export, et │
   * │ `search` s'y écrit exactement comme ici. Un fichier qui couvrirait   │
   * │ un autre périmètre que la liste qui l'a déclenché est le défaut que  │
   * │ tous les exports de ce dépôt ont dû corriger.                        │
   * │                                                                      │
   * │ ⚠ LE SENS PART EN LISTE DE TYPES, JAMAIS EN `direction`. Le serveur  │
   * │ n'y range PAS `unpack` : ni `STOCK_IN_MOVEMENT_TYPES` ni son pendant │
   * │ ne le contiennent, si bien que `?direction=in` l'exclut alors que la │
   * │ liste, elle, le montre parmi les entrées. `codesParSens` part de la  │
   * │ table qui filtre l'écran, donc les deux ne peuvent pas diverger.     │
   * │                                                                      │
   * │ La FENÊTRE de la liste, elle, ne part pas : ce que l'écran a chargé  │
   * │ au doigt n'est pas le périmètre du rapport. Le cadran, lui, compte   │
   * │ déjà tout le périmètre - c'est le même que celui du document.        │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  const exporter = async (format: FormatExport) => {
    setFeuille(null);
    setEnvoiExport(true);
    try {
      await telechargerDocument(
        "/stock-movements/export/",
        parametresDExport({ ...filtres, ...applique }),
        format,
        // La PÉRIODE nomme le fichier, et non la date du jour : deux tirages
        // du même mois écraseraient sinon deux périmètres sous un seul nom.
        `Mouvements de stock ${libellePeriodeFiltre(filtres.periode)}`
      );
    } catch (erreur) {
      toast.erreur(
        erreur instanceof ApiError
          ? erreur.message
          : "L'export n'a pas pu être produit."
      );
    } finally {
      setEnvoiExport(false);
    }
  };

  /**
   * Le rapport d'approvisionnement, fabriqué par le SERVEUR lui aussi.
   *
   * ⚠ Il HÉRITE l'entrepôt, la catégorie et la période, mais NI le type NI la
   * recherche : il porte sur les entrées de stock, et y superposer le filtre
   * de type de la liste le viderait dès qu'une sortie est sélectionnée. C'est
   * ce que fait le back-office, et la feuille le dit avant le choix du format.
   */
  const exporterApprovisionnement = async (format: FormatExport) => {
    setFeuille(null);
    setEnvoiExport(true);
    try {
      await telechargerDocument(
        "/stock-movements/supplies-export/",
        { ...parametresApprovisionnement({ ...filtres, ...applique }), source, group_by: presentation },
        format,
        `Approvisionnement ${libellePeriodeFiltre(filtres.periode)}`
      );
    } catch (erreur) {
      toast.erreur(
        erreur instanceof ApiError
          ? erreur.message
          : "Le rapport n'a pas pu être produit."
      );
    } finally {
      setEnvoiExport(false);
    }
  };

  return (
    <Screen padded={false}>
      <AppBar
        title="Mouvements de stock"
        subtitle="Historique des entrées et sorties de stock"
        // ┌──────────────────────────────────────────────────────────────┐
        // │ LES DEUX DOCUMENTS VIVENT DANS LA BARRE, CÔTE À CÔTE.        │
        // │                                                              │
        // │ `Fab` n'accepte QU'UNE action secondaire : y poser le second │
        // │ document ferait deux ronds sans libellé qu'on ne             │
        // │ distinguerait pas l'un de l'autre. Et c'est la place du       │
        // │ back-office, où les deux boutons se suivent en tête de page. │
        // │ Le repli « pas de droit de saisie, donc l'export remonte      │
        // │ dans la barre » disparaît avec sa branche conditionnelle.     │
        // └──────────────────────────────────────────────────────────────┘
        right={
          peutVoir ? (
            <View className="flex-row items-center">
              <IconButton
                name="Truck"
                label="Rapport d'approvisionnement"
                variant="ghost"
                onPress={() => setFeuille("approvisionnement")}
                disabled={!enLigne || envoiExport}
              />
              <IconButton
                name="Download"
                label="Exporter les mouvements"
                variant="ghost"
                onPress={() => setFeuille("format")}
                disabled={Boolean(raisonExport)}
              />
            </View>
          ) : undefined
        }
      />
      <DataList
        donnees={mouvements}
        cle={(m) => m.id}
        chargement={chargement && mouvements.length === 0}
        enTete={
          <View className="gap-3 px-4 pb-3 pt-2">
            {/* ┌──────────────────────────────────────────────────────────┐
                │ LE CADRAN SUIT LES FILTRES, ET IL EST CALCULÉ EN SQL.    │
                │                                                          │
                │ La question posée devant un journal est « combien pèse   │
                │ ce que je regarde » : un total de période affiché         │
                │ au-dessus d'une liste filtrée sur les pertes ne          │
                │ composerait rien de ce qui est à l'écran. Il diffère en   │
                │ cela du cadran des créances, où tout est dû par          │
                │ construction et où le chiffre sert de RÉFÉRENCE.         │
                │                                                          │
                │ Les quatre relevés sont ceux de la synthèse du document, │
                │ au libellé près : un cadran qui compterait autrement que │
                │ le fichier qu'il déclenche donnerait deux chiffres pour  │
                │ la même journée.                                          │
                │                                                          │
                │ L'ORDRE, lui, diffère du document, et c'est voulu : à    │
                │ deux colonnes, « Entrées » et « Sorties » DOIVENT tenir  │
                │ sur la même rangée. L'ordre du document les séparerait,  │
                │ et deux nombres qu'on vient comparer ne se lisent pas    │
                │ l'un au-dessus de l'autre en diagonale.                   │
                └──────────────────────────────────────────────────────────┘ */}
            <StatStrip>
              <StatStripItem
                label="Mouvements"
                icon="ClipboardList"
                value={formatNumberFr(releves?.nombre ?? 0, 0)}
              />
              {/* « 44 mouvements sur 6 articles » ne se lit nulle part
                  ailleurs, et c'est ce qui dit si la période a remué tout le
                  rayon ou toujours le même produit. */}
              <StatStripItem
                label="Articles concernés"
                icon="Package"
                value={formatNumberFr(releves?.articles ?? 0, 0)}
              />
              {/* Les deux quantités restent NEUTRES et POSITIVES. Une sortie
                  est le métier, pas une anomalie : la peindre en rouge ferait
                  du rouge la couleur normale de l'écran, et on ne verrait plus
                  le vrai. Ce sont les FLÈCHES qui portent le sens, les mêmes
                  que sur les rangées juste dessous - et un nombre négatif sous
                  un libellé qui dit déjà « sorties » se lit deux fois. */}
              <StatStripItem
                label="Entrées (unités)"
                icon="ArrowDownRight"
                value={formatNumberFr(releves?.entrees ?? 0, 3)}
              />
              <StatStripItem
                label="Sorties (unités)"
                icon="ArrowUpRight"
                value={formatNumberFr(releves?.sorties ?? 0, 3)}
              />
            </StatStrip>

            {/* Le cadran ne compte QUE ce que le tirage a descendu : une saisie
                encore en file n'est ni dans la liste ni dans le total, et le
                taire ferait passer un compte partiel pour un compte arrêté.
                C'est ce que dit déjà la feuille d'export, avant le partage. */}
            {enFile && enFile.nombre > 0 ? (
              <BandeauEnvoi
                envoi={enFile.envoi}
                titre={
                  enFile.nombre === 1
                    ? "Un mouvement attend son envoi"
                    : `${enFile.nombre} mouvements attendent leur envoi`
                }
                consequence="Ils ne sont comptés ni dans ce cadran ni dans le document."
              />
            ) : null}

            <SearchInput
              valeur={recherche}
              onChange={changerRecherche}
              placeholder="Produit, code ou note..."
            />
            {/* ┌──────────────────────────────────────────────────────────┐
                │ LE BOUTON EN TÊTE, LE SENS EN LIGNE, LE RESTE EN FEUILLE.│
                │                                                          │
                │ `BoutonFiltres` est visible sans défiler et porte son     │
                │ décompte : « sous combien de filtres suis-je » se lit     │
                │ alors sans parcourir la rangée. Le sens garde ses puces,  │
                │ c'est la coupe la plus fréquente d'un journal.            │
                │                                                          │
                │ Suivent les puces RETIRABLES des filtres posés : elles    │
                │ rendent ce que le champ de choix donnait (la valeur est   │
                │ ANNONCÉE) et ajoutent une annulation par filtre, que le   │
                │ back-office n'a pas - il n'a qu'un « Réinitialiser »      │
                │ global.                                                   │
                └──────────────────────────────────────────────────────────┘ */}
            <ChipRow>
              <BoutonFiltres
                actifs={nombreDeFiltresActifs({ ...filtres, ...perimetreAffichable(perimetre) })}
                onPress={() => setFeuille("filtres")}
              />
              <Chip label="Tout" actif={sens === null} onPress={() => changerSens(null)} />
              <Chip label="Entrées" actif={sens === true} onPress={() => changerSens(true)} />
              <Chip label="Sorties" actif={sens === false} onPress={() => changerSens(false)} />
              {puces.map((puce) => (
                <Chip
                  key={puce.cle}
                  label={puce.label}
                  actif
                  onPress={() => changerFiltres(sansLeFiltre(filtres, puce.cle))}
                />
              ))}
            </ChipRow>
          </View>
        }
        vide={{
          icon: "ClipboardList",
          titre: "Aucun mouvement",
          // Un état vide SOUS UN FILTRE ne dit pas que la période est vide, il
          // dit que ce filtre-là l'est - et il rend le chemin du retour.
          message: aDesFiltres(filtres)
            ? "Aucun mouvement ne correspond à vos critères."
            : "Les mouvements de stock apparaîtront ici.",
          action: aDesFiltres(filtres)
            ? {
                label: "Réinitialiser les filtres",
                onPress: () => changerFiltres(FILTRES_VIDES),
              }
            : peutSaisir
              ? { label: "Nouveau mouvement", onPress: () => setFeuille("saisie") }
              : undefined,
        }}
        // ┌────────────────────────────────────────────────────────────────┐
        // │ LA FENÊTRE S'AGRANDIT, ELLE NE PAGINE PAS.                     │
        // │                                                                │
        // │ Cet écran se relit dès qu'une table bouge : des pages           │
        // │ accumulées dans l'état seraient perdues à chaque tirage, et la  │
        // │ liste sauterait à son début pendant qu'on la parcourt. Pire, un │
        // │ rang de départ fige une position dans un classement qui bouge - │
        // │ un mouvement inséré par la synchronisation décale tout ce qui   │
        // │ suit, et la page suivante répète une ligne ou en saute une.     │
        // │                                                                │
        // │ Sans cela, le cadran annoncerait « 347 mouvements » au-dessus   │
        // │ de cent cinquante lignes, les autres n'étant atteignables par   │
        // │ aucun geste.                                                    │
        // └────────────────────────────────────────────────────────────────┘
        onFin={() => {
          if (donnees?.tronque) setFenetre((f) => f + PAS_FENETRE);
        }}
        // Le pied DIT où l'on en est. Sans lui, le cadran annoncerait
        // « 347 mouvements » au-dessus d'une liste qui s'arrête à cent
        // cinquante, et rien ne dirait que la suite arrive.
        pied={
          donnees?.tronque ? (
            <View className="items-center px-4 py-4">
              <Text variant="caption">
                {mouvements.length} sur {releves?.nombre ?? 0} - chargement de la
                suite...
              </Text>
            </View>
          ) : undefined
        }
        rendu={(m) => (
          <DataRow
            principal={m.produit}
            secondaire={[m.entrepot, m.date ? dateCourteFr(m.date) : null]
              .filter(Boolean)
              .join(" · ") || null}
            badge={<Badge tone={m.entree ? "success" : "destructive"}>{m.typeLabel}</Badge>}
            valeur={
              <View className="flex-row items-center gap-1">
                <Icon
                  name={m.entree ? "ArrowDownRight" : "ArrowUpRight"}
                  size={14}
                  color={m.entree ? "success" : "destructive"}
                />
                <Text
                  variant="bodySmall"
                  numeric
                  className={
                    m.entree
                      ? "font-sans-semibold text-success"
                      : "font-sans-semibold text-destructive"
                  }
                >
                  {m.quantiteAffichee}
                </Text>
              </View>
            }
            chevron={false}
          />
        )}
      />
      {/* L'action primaire d'une LISTE descend dans un `Fab` : le haut d'un
          écran de six pouces est hors de portée du pouce, et une liste se
          parcourt vers le bas. C'est déjà ce que font `/transfert` et
          `/ajustement`, ses deux voisines de la section « Opérations ».

          Les DEUX DOCUMENTS sont montés dans la barre : `Fab` n'accepte qu'une
          action secondaire, et deux ronds sans libellé ne se distingueraient
          pas l'un de l'autre. */}
      {peutSaisir ? (
        <Fab icon="Plus" label="Nouveau mouvement" onPress={() => setFeuille("saisie")} />
      ) : null}

      {/* Rendue CONDITIONNELLEMENT, jamais avec un booléen : chaque ouverture
          est un montage, donc un formulaire vierge. Voir sa docstring. */}
      {feuille === "saisie" ? (
        <FeuilleNouveauMouvement
          onFermer={() => setFeuille(null)}
          // Rien à ouvrir : un mouvement n'a pas de fiche, et il entre au
          // JOURNAL - la table tirée ne bougera qu'au prochain tirage. Le
          // décompte « en attente » du cadran s'en charge.
          onCree={() => setFeuille(null)}
        />
      ) : null}

      <FeuilleFiltresMouvements
        ouvert={feuille === "filtres"}
        onFermer={() => setFeuille(null)}
        valeur={filtres}
        onChanger={changerFiltres}
        nombreDeResultats={releves?.nombre ?? 0}
        perimetre={perimetre}
        categories={optionsCategorie}
      />

      <FeuilleFormat
        ouvert={feuille === "format"}
        onFermer={() => setFeuille(null)}
        onChoisir={(f) => void exporter(f)}
        titre="Exporter les mouvements"
        avertissement={avertissementExport}
        envoi={envoiExport}
      />

      <FeuilleApprovisionnement
        ouvert={feuille === "approvisionnement"}
        onFermer={() => setFeuille(null)}
        libellePeriode={libellePeriodeFiltre(filtres.periode)}
        source={source}
        onSource={setSource}
        presentation={presentation}
        onPresentation={setPresentation}
        avertissement={avertissementExport}
        envoi={envoiExport}
        onExporter={(f) => void exporterApprovisionnement(f)}
      />
    </Screen>
  );
}
