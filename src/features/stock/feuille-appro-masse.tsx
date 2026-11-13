/**
 * Approvisionnement de MASSE : un périmètre, une feuille, un envoi.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ L'APPROVISIONNEMENT NE SE FAISAIT QU'ARTICLE PAR ARTICLE.                │
 * │                                                                          │
 * │ `FeuilleNouveauMouvement` saisit UN produit à la fois. Un magasinier qui  │
 * │ reçoit une livraison de quarante références devait l'ouvrir quarante      │
 * │ fois, et retrouver chaque article dans un catalogue de centaines. On      │
 * │ désigne donc un PÉRIMÈTRE, comme une session d'inventaire désigne ce      │
 * │ qu'elle compte.                                                          │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ LA FEUILLE SE PRÉ-REMPLIT EN LOCAL, PAS PAR L'ENDPOINT. Un magasinier
 * prépare sa livraison au fond d'un dépôt, là où il y a le moins de réseau de
 * tout le magasin. Le serveur garde sa feuille pour le back-office ; ici c'est
 * `niveauxDeStock` qui la fournit, et `perimetre-appro.ts` qui traduit la
 * demande en filtres - EN SQL, jamais après la fenêtre.
 *
 * ⚠ TROIS PANNEAUX DANS UNE SEULE `Sheet`. C'est un `Modal` : en empiler un
 * second donne un voile sur un voile et deux `onRequestClose` qui se disputent
 * le bouton retour d'Android. D'où `DeclencheurSelect` et non `ChampSelect`,
 * qui ouvrirait SA propre feuille - un garde-fou de doctrine le refuse.
 *
 * ⚠ AUCUNE RÈGLE DE SAISIE N'EST RÉÉCRITE : `BlocCanal`, `lireNombre` et
 * `corpsJsonDuMouvement` sont ceux du formulaire d'un seul mouvement. Une
 * livraison est N mouvements, pas un autre genre d'écriture.
 */
import { useCallback, useMemo, useState } from "react";
import { View } from "react-native";

import { formatUnitQuantity, roundQuantity } from "@vente-facile/core";

import { accord, pluriel } from "@/data/accord";
import { useMonnaie } from "@/data/devises";
import { entrepotParDefaut } from "@/data/entrepot-defaut";
import { useLecture } from "@/data/live";
import { lireNombre, type LectureNombre } from "@/data/nombres";
import { categoriesPourFiltre } from "@/data/categories";
import { sousArbre } from "@/data/categories-arbre";
import { entrepotsSansValorisation } from "@/data/stock";
import { niveauxDeStock, type LigneNiveau } from "@/data/stock-niveaux";
import { TYPE_MOUVEMENT_STOCK, typesSaisissables } from "@/data/types-mouvement";
import { creerLivraison, type SaisieMouvement } from "@/features/stock/actes";
import { BlocCanal } from "@/features/stock/bloc-canal";
import {
  bornerFeuille,
  filtresDuPerimetre,
  manquePropose,
  retenirLesArticles,
  type PorteeAppro,
} from "@/features/stock/perimetre-appro";
import { useSession } from "@/session/provider";
import {
  Banner,
  Button,
  ChampDate,
  Checkbox,
  Chip,
  ChipRow,
  DataRow,
  DeclencheurSelect,
  Divider,
  FormField,
  Input,
  ListeChoix,
  ListeChoixMultiple,
  Sheet,
  Text,
  useToast,
  type OptionSelect,
} from "@/ui";

/** Les quatre portées, dans l'ordre où l'on y pense au dépôt. */
const PORTEES: { cle: PorteeAppro; label: string; aide: string }[] = [
  { cle: "bas", label: "Sous le seuil", aide: "Ce qu'il faut racheter en priorité." },
  { cle: "categorie", label: "Catégorie", aide: "Toute la catégorie, sous-catégories comprises." },
  { cle: "article", label: "Articles choisis", aide: "Une liste que vous composez." },
  { cle: "tout", label: "Tout", aide: "Tous les articles suivis en stock." },
];

/** Ce que le formulaire retient d'une ligne, avant tout envoi. */
interface Saisie {
  contenants: string;
  vrac: string;
  coutDetail: string;
  coutContenant: string;
  /** Les prix de VENTE : ils servent la marge, et ne partent qu'au report. */
  prixDetail: string;
  prixGros: string;
  reporterLesPrix: boolean;
  /** « AAAA-MM-JJ ». Obligatoire sur un article périssable. */
  peremption: string;
}

const VIDE: Saisie = {
  contenants: "",
  vrac: "",
  coutDetail: "",
  coutContenant: "",
  prixDetail: "",
  prixGros: "",
  reporterLesPrix: false,
  peremption: "",
};

const prefill = (v: string | null | undefined): string => {
  const n = Number(v);
  return v != null && Number.isFinite(n) && n > 0 ? String(n) : "";
};

const lu = (s: string): number | null => {
  const r = lireNombre(s);
  return r.ok ? r.valeur : null;
};

export function FeuilleApproMasse({
  onFermer,
  onCree,
}: {
  onFermer: () => void;
  /** La livraison est au journal. La table tirée ne bougera qu'au tirage. */
  onCree: () => void;
}) {
  const toast = useToast();
  const money = useMonnaie();
  const { can } = useSession();
  // Le report des prix sur la FICHE est un droit distinct de celui de saisir
  // une entrée : c'est la même garde qu'au back-office.
  const peutRetarifer = can("products.edit");

  const [entrepotChoisi, setEntrepotChoisi] = useState<string | null>(null);
  // Le défaut est `purchase` : une livraison de masse vient du marché.
  const [type, setType] = useState("purchase");
  const [portee, setPortee] = useState<PorteeAppro>("bas");
  const [categories, setCategories] = useState<string[]>([]);
  const [articlesChoisis, setArticlesChoisis] = useState<string[]>([]);
  const [recherche, setRecherche] = useState("");
  const [notes, setNotes] = useState("");
  const [saisies, setSaisies] = useState<Record<string, Saisie>>({});
  const [prepare, setPrepare] = useState(false);
  const [envoi, setEnvoi] = useState(false);

  /** `null` : le formulaire ou la feuille. Sinon le panneau par-dessus. */
  const [choix, setChoix] = useState<
    | {
        titre: string;
        options: OptionSelect[];
        valeur: string | null;
        /**
         * ⚠ `null` EST POSSIBLE - c'est la sentinelle « aucun choix » de
         * `ListeChoix`. Aucun des deux panneaux de cette feuille n'en propose :
         * l'entrepôt est REQUIS (« aucun entrepôt » n'est pas « tous les
         * entrepôts », un approvisionnement entre quelque part) et le type
         * aussi. Le type le dit quand même, parce que c'est le contrat du
         * composant - et un futur panneau qui offrirait une sentinelle ne
         * devrait pas avoir à l'élargir.
         */
        onChoisir: (v: string | null) => void;
        libelleVide?: string;
      }
    | null
  >(null);
  const [panneauMultiple, setPanneauMultiple] = useState<"categories" | "articles" | null>(null);

  const { donnees: depots } = useLecture(entrepotsSansValorisation, {
    tables: ["warehouses"],
  });
  // Le défaut se DÉRIVE : un `setState` dans un effet serait un rendu de plus
  // et une règle qui dépend de l'ordre des effets.
  const entrepot = entrepotChoisi ?? entrepotParDefaut(depots);
  // ⚠ Résolu UNE FOIS : un montant sans devise ne dit rien dans une
  //   application où le même chiffre vaut soit trois dollars, soit trois
  //   francs, et un garde-fou de doctrine interdit la devise vide.
  const symbolePrincipal = money.symbolOf(money.primaryCode);

  // La feuille : lue quand on la demande, puis figée. Elle ne se relit PAS à
  // chaque changement de table - des saisies en cours seraient perdues sous les
  // doigts du magasinier au premier tirage.
  const [feuille, setFeuille] = useState<{
    lignes: LigneNiveau[];
    tronquee: boolean;
    limite: number;
  } | null>(null);

  const preparer = useCallback(async () => {
    if (!entrepot) return;
    setPrepare(true);
    try {
      // ⚠ LE SOUS-ARBRE EST RÉSOLU ICI, et c'est obligatoire : filtrer
      //   « Boissons » doit ramener « Boissons > Sodas ». Sans cela la feuille
      //   sous-estimerait EN SILENCE - le défaut que `subtree_ids` du serveur
      //   existe pour empêcher, et que ce dépôt a déjà payé sur les rapports.
      const arbre = await categoriesPourFiltre();
      const descendance = categories.flatMap(
        (c) => sousArbre(arbre, c) ?? [c]
      );
      const filtres = filtresDuPerimetre({
        portee,
        categories: descendance,
        recherche,
      });
      const { elements } = await niveauxDeStock({ ...filtres, entrepot });
      // La portée « liste » se filtre en mémoire : elle est bornée par ce que
      // le magasinier a tapé, jamais par la taille du catalogue.
      const retenues =
        portee === "article" ? retenirLesArticles(elements, articlesChoisis) : elements;
      const bornee = bornerFeuille(retenues);
      setFeuille(bornee);
      // ⚠ LES SAISIES SONT REMISES À PLAT : garder celles d'un périmètre
      //   précédent enverrait des quantités sur des articles qui ne sont plus à
      //   l'écran, et le magasinier ne les verrait jamais.
      setSaisies(
        Object.fromEntries(
          bornee.lignes.map((l) => [
            l.produitId,
            {
              ...VIDE,
              // Le manque est une PROPOSITION, et seulement sur la portée qui
              // la demande : préremplir « tout le catalogue » ferait saisir
              // une livraison que personne n'a reçue.
              vrac:
                portee === "bas" && !l.conditionnement
                  ? String(manquePropose(l))
                  : "",
              // ⚠ LES PRIX DE LA FICHE, et non `coutUnitaire` : celui-ci est la
              //   VALORISATION du rayon (`avg_cost`), pas ce qu'on paie. Une
              //   marge assise dessus ne dirait rien du marché d'aujourd'hui.
              //   C'est ce que pré-remplit le formulaire d'un seul mouvement.
              coutDetail: prefill(String(l.prixAchatDetail ?? "")),
              coutContenant: l.conditionnement
                ? prefill(String(l.prixAchatContenant ?? ""))
                : "",
              prixDetail: prefill(String(l.prixVenteDetail ?? "")),
              prixGros: l.conditionnement
                ? prefill(String(l.prixVenteGros ?? ""))
                : "",
            },
          ])
        )
      );
      if (bornee.lignes.length === 0) {
        toast.info("Aucun article dans ce périmètre");
      }
    } finally {
      setPrepare(false);
    }
  }, [entrepot, portee, categories, articlesChoisis, recherche, toast]);

  const chargerCategories = useCallback(
    () =>
      panneauMultiple === "categories"
        ? categoriesPourFiltre()
        : Promise.resolve([]),
    [panneauMultiple]
  );
  const { donnees: lesCategories } = useLecture(chargerCategories, {
    tables: ["categories"],
    deps: [panneauMultiple],
  });

  const chargerArticles = useCallback(
    () =>
      panneauMultiple === "articles"
        ? niveauxDeStock({ entrepot, recherche, limite: 60 }).then((r) => r.elements)
        : Promise.resolve([]),
    [panneauMultiple, entrepot, recherche]
  );
  const { donnees: lesArticles } = useLecture(chargerArticles, {
    tables: ["products", "stocks"],
    deps: [panneauMultiple, entrepot, recherche],
  });

  const majSaisie = (id: string, patch: Partial<Saisie>) =>
    setSaisies((s) => ({ ...s, [id]: { ...VIDE, ...s[id], ...patch } }));

  /** Les lignes retenues : celles dont une quantité est saisie et lisible. */
  const retenues = useMemo(() => {
    if (!feuille) return [];
    const sorties: { ligne: LigneNiveau; saisie: SaisieMouvement; total: number }[] = [];
    for (const ligne of feuille.lignes) {
      const s = saisies[ligne.produitId] ?? VIDE;
      const contenants = lu(s.contenants);
      const vrac = lu(s.vrac);
      const cond = ligne.conditionnement;
      const total = cond
        ? (contenants ?? 0) * cond.factor + (vrac ?? 0)
        : (vrac ?? 0);
      if (total <= 0) continue;

      const coutDetail = lu(s.coutDetail);
      const coutContenant = lu(s.coutContenant);
      const prixDetail = lu(s.prixDetail);
      const prixGros = lu(s.prixGros);
      sorties.push({
        ligne,
        total,
        saisie: {
          produit: ligne.produitId,
          entrepot: entrepot ?? "",
          type,
          ...(cond
            ? {
                ...(contenants ? { contenants } : {}),
                ...(vrac ? { vrac } : {}),
                ...(coutContenant ? { coutContenant } : {}),
              }
            : { quantite: total }),
          ...(coutDetail ? { coutUnitaire: coutDetail } : {}),
          ...(s.peremption ? { peremption: s.peremption } : {}),
          ...(s.reporterLesPrix
            ? {
                reporterLesPrix: true,
                ...(prixDetail ? { prixDetail } : {}),
                ...(cond && prixGros ? { prixGros } : {}),
              }
            : {}),
        },
      });
    }
    return sorties;
  }, [feuille, saisies, entrepot, type]);

  /**
   * Ce que l'envoi engage.
   *
   * ⚠ UN SEUL TOTAL, en devise PRINCIPALE : les coûts saisis y sont libellés -
   * le catalogue n'a pas de devise - donc il n'y a rien à ventiler. Sommer des
   * devises serait précisément ce que la doctrine interdit partout ailleurs.
   */
  const cadran = useMemo(() => {
    let unites = 0;
    let valeur = 0;
    for (const { ligne, saisie, total } of retenues) {
      unites += total;
      if (ligne.conditionnement) {
        valeur +=
          (saisie.contenants ?? 0) * (saisie.coutContenant ?? 0) +
          (saisie.vrac ?? 0) * (saisie.coutUnitaire ?? 0);
      } else {
        valeur += total * (saisie.coutUnitaire ?? 0);
      }
    }
    return { lignes: retenues.length, unites, valeur };
  }, [retenues]);

  const envoyer = async () => {
    if (!entrepot || retenues.length === 0) return;
    setEnvoi(true);
    try {
      await creerLivraison({
        entrepot,
        type,
        notes: notes.trim() || undefined,
        lignes: retenues.map((r) => r.saisie),
      });
      toast.succes(`${pluriel(retenues.length, "entrée mise", "entrées mises")} en file`);
      onCree();
    } catch {
      toast.erreur("La livraison n'a pas pu être mise en file");
    } finally {
      setEnvoi(false);
    }
  };

  const reculer = () => {
    if (choix) return setChoix(null);
    if (panneauMultiple) return setPanneauMultiple(null);
    if (feuille) return setFeuille(null);
    onFermer();
  };

  const surLeFormulaire = !choix && !panneauMultiple;
  const titre = choix
    ? choix.titre
    : panneauMultiple === "categories"
      ? "Catégories"
      : panneauMultiple === "articles"
        ? "Articles"
        : feuille
          ? "Feuille de livraison"
          : "Approvisionner en masse";

  /**
   * Les lignes dont une quantité est ILLISIBLE.
   *
   * ┌────────────────────────────────────────────────────────────────────────┐
   * │ UNE SAISIE ILLISIBLE SE DIT, ET ELLE RETIENT L'ENVOI.                 │
   * │                                                                        │
   * │ `lireNombre` refuse le négatif et l'illisible, et la ligne affiche son │
   * │ motif sous le champ fautif - c'est déjà le cas. Mais une ligne refusée │
   * │ vaut zéro, donc `retenues` la saute et elle SORT du corps envoyé : le  │
   * │ magasinier enverrait trente-neuf lignes sur quarante en croyant les    │
   * │ avoir toutes passées. Le serveur ne peut rien y faire, elle ne lui     │
   * │ parvient pas.                                                          │
   * └────────────────────────────────────────────────────────────────────────┘
   */
  const illisibles = useMemo(() => {
    if (!feuille) return 0;
    return feuille.lignes.filter((l) => {
      const s = saisies[l.produitId] ?? VIDE;
      return !lireNombre(s.contenants).ok || !lireNombre(s.vrac).ok;
    }).length;
  }, [feuille, saisies]);

  const motifFerme = !can("stock_movements.create")
    ? "Vous n'avez pas le droit d'enregistrer une entrée de stock."
    : !entrepot
      ? "Aucun entrepôt n'est encore descendu sur ce terminal."
      : null;

  return (
    <Sheet
      ouvert
      onFermer={reculer}
      titre={titre}
      retour={surLeFormulaire && !feuille ? undefined : reculer}
      pied={
        feuille && feuille.lignes.length > 0 && surLeFormulaire ? (
          <View className="gap-2">
            {/* ⚠ UN REFUS CONDAMNE TOUTE LA LIVRAISON : une moitié de bon
            enregistrée est pire que rien, et c'est pourquoi le serveur écrit
            tout d'un bloc. On le DIT avant l'envoi. */}
            <Text variant="caption">
              Tout part d&apos;un bloc : si une ligne est refusée, rien
              n&apos;entre en stock.
            </Text>
            <Button
              fullWidth
              onPress={envoyer}
              disabled={retenues.length === 0 || illisibles > 0 || envoi}
              loading={envoi}
            >
              {retenues.length > 0
                ? `Enregistrer ${pluriel(retenues.length, "entrée", "entrées")}`
                : "Enregistrer"}
            </Button>
            {illisibles > 0 ? (
              <Text variant="caption">
                {`${pluriel(illisibles, "ligne porte", "lignes portent")} une quantité illisible : ${accord(illisibles, "corrigez-la, sinon elle n'entrera", "corrigez-les, sinon elles n'entreront")} pas en stock.`}
              </Text>
            ) : retenues.length === 0 ? (
              <Text variant="caption">Saisissez au moins une quantité.</Text>
            ) : null}
          </View>
        ) : undefined
      }
    >
      {choix ? (
        <ListeChoix
          options={choix.options}
          valeur={choix.valeur}
          onChoisir={(v) => {
            choix.onChoisir(v);
            setChoix(null);
          }}
          libelleVide={choix.libelleVide}
        />
      ) : panneauMultiple === "categories" ? (
        <ListeChoixMultiple
          options={(lesCategories ?? []).map((c) => ({
            valeur: c.id,
            label: c.nom,
          }))}
          valeurs={categories}
          onBasculer={(v) =>
            setCategories((liste) =>
              liste.includes(v) ? liste.filter((x) => x !== v) : [...liste, v]
            )
          }
          messageVide="Aucune catégorie n'est encore descendue sur ce terminal."
        />
      ) : panneauMultiple === "articles" ? (
        <ListeChoixMultiple
          options={(lesArticles ?? []).map((a) => ({
            valeur: a.produitId,
            label: a.produit,
            detail: a.quantiteAffichee,
          }))}
          valeurs={articlesChoisis}
          onBasculer={(v) =>
            setArticlesChoisis((liste) =>
              liste.includes(v) ? liste.filter((x) => x !== v) : [...liste, v]
            )
          }
          messageVide="Aucun article dans ce dépôt."
        />
      ) : feuille ? (
        <>
          {feuille.tronquee ? (
            <Banner
              tone="warning"
              title={`Plus de ${feuille.limite} articles`}
              message={`Seuls les ${feuille.limite} premiers sont affichés. Resserrez le périmètre, sinon la livraison serait saisie à moitié sans que rien ne le dise.`}
            />
          ) : null}

          <View className="flex-row flex-wrap gap-x-4 gap-y-1">
            <Text variant="caption">
              {`${pluriel(cadran.lignes, "ligne saisie", "lignes saisies")} sur ${feuille.lignes.length}`}
            </Text>
            <Text variant="caption">{formatUnitQuantity(roundQuantity(cadran.unites), "unité")}</Text>
            <Text variant="caption">
              {money.money(cadran.valeur, money.primaryCode)}
            </Text>
          </View>

          {feuille.lignes.length === 0 ? (
            <Text variant="caption">
              Aucun article dans ce périmètre. Élargissez-le, ou choisissez
              « Tout ».
            </Text>
          ) : (
            feuille.lignes.map((ligne) => {
              const s = saisies[ligne.produitId] ?? VIDE;
              const cond = ligne.conditionnement;
              // ┌──────────────────────────────────────────────────────────┐
              // │ UNE SAISIE ILLISIBLE SE DIT, ELLE NE SE JETTE PAS.      │
              // │                                                          │
              // │ `lireNombre` refuse le négatif et l'illisible, et une    │
              // │ première écriture jetait son verdict : « -5 » ou         │
              // │ « 12,5,0 » faisait disparaître la ligne de la livraison  │
              // │ SANS un mot, et le magasinier croyait l'article          │
              // │ enregistré. C'est le défaut exact que ce lot a dû        │
              // │ corriger côté SERVEUR, par l'autre bout.                 │
              // └──────────────────────────────────────────────────────────┘
              const luContenants = lireNombre(s.contenants);
              const luVrac = lireNombre(s.vrac);
              const refusContenants = refusDeQuantite(luContenants);
              const refusVrac = refusDeQuantite(luVrac);
              // ┌──────────────────────────────────────────────────────────┐
              // │ LES PRIX SE DÉPLIENT SUR LES LIGNES RÉELLEMENT REÇUES.  │
              // │                                                          │
              // │ `prixVisibles` valait FAUX en dur, et c'était un défaut  │
              // │ et non une mise en page : `BlocCanal` ne rend alors que  │
              // │ sa quantité, donc `coutContenant` et `coutDetail`        │
              // │ restaient vides POUR TOUJOURS sur tout article           │
              // │ conditionné. Le corps partait sans `unit_cost` ni        │
              // │ `package_unit_cost`, le serveur valorisait l'entrée à    │
              // │ l'ancien prix, et le coût moyen pondéré du rayon partait │
              // │ faux - en silence, sur une feuille qui existe POUR dire  │
              // │ ce qu'on a payé.                                         │
              // │                                                          │
              // │ On ne les ouvre pas toutes pour autant : la feuille      │
              // │ porte jusqu'à `LIGNES_MAX` articles, et trois champs par │
              // │ canal sur chacun donneraient un écran qu'on ne peut plus │
              // │ parcourir. C'est le motif du back-office.                │
              // └──────────────────────────────────────────────────────────┘
              const totalLigne = cond
                ? (luContenants.ok ? (luContenants.valeur ?? 0) : 0) * cond.factor +
                  (luVrac.ok ? (luVrac.valeur ?? 0) : 0)
                : luVrac.ok
                  ? (luVrac.valeur ?? 0)
                  : 0;
              const prixVisibles = totalLigne > 0;
              // Le mot du marchand, jamais « unité » : c'est celui que la
              // ligne affiche déjà dans son rayon.
              const motDetail = cond?.retailWord ?? ligne.uniteDetail ?? "unité";
              return (
                <View key={ligne.produitId} className="gap-2">
                  <Divider />
                  <DataRow
                    principal={ligne.produit}
                    secondaire={ligne.sku}
                    chevron={false}
                    // Le partage ACTUEL du rayon : c'est lui qui permet de
                    // juger ce qu'il faut commander.
                    valeur={<Text variant="caption">{ligne.quantiteAffichee}</Text>}
                  />
                  {cond ? (
                    <BlocCanal
                      titre="En gros"
                      rappel={`1 ${cond.packageWord} = ${cond.factor} ${cond.retailWord}`}
                      libelleQuantite={`Quantité en ${cond.packageWord}`}
                      libelleCout={`Prix payé par ${cond.packageWord}`}
                      libelleVente={`Prix de vente par ${cond.packageWord}`}
                      symbole={symbolePrincipal}
                      quantite={s.contenants}
                      onQuantite={(v) => majSaisie(ligne.produitId, { contenants: v })}
                      erreurQuantite={refusContenants}
                      cout={s.coutContenant}
                      onCout={(v) => majSaisie(ligne.produitId, { coutContenant: v })}
                      prix={s.prixGros}
                      onPrix={(v) => majSaisie(ligne.produitId, { prixGros: v })}
                      prixVisibles={prixVisibles}
                    />
                  ) : null}
                  {/* ⚠ UN ARTICLE VENDU EN GROS SEUL N'A PAS DE CANAL DÉTAIL :
                      un contenant ne s'y ouvre jamais, et lui proposer une
                      saisie à l'unité ferait saisir ce que le serveur refuse.
                      C'est `isPackageOnly` du back-office. */}
                  {!cond?.packageOnly ? (
                    <BlocCanal
                      titre="Au détail"
                      libelleQuantite={`Quantité en ${motDetail}`}
                      libelleCout={`Prix payé par ${motDetail}`}
                      libelleVente={`Prix de vente par ${motDetail}`}
                      symbole={symbolePrincipal}
                      quantite={s.vrac}
                      onQuantite={(v) => majSaisie(ligne.produitId, { vrac: v })}
                      erreurQuantite={refusVrac}
                      cout={s.coutDetail}
                      onCout={(v) => majSaisie(ligne.produitId, { coutDetail: v })}
                      prix={s.prixDetail}
                      onPrix={(v) => majSaisie(ligne.produitId, { prixDetail: v })}
                      prixVisibles={prixVisibles}
                    />
                  ) : null}

                  {prixVisibles ? (
                    <View className="gap-2">
                      <FormField
                        label="Date de péremption"
                        required={ligne.perissable}
                        hint={
                          ligne.perissable
                            ? "Ce produit est périssable : le serveur l'exige."
                            : undefined
                        }
                      >
                        <ChampDate
                          valeur={s.peremption}
                          onChange={(v) => majSaisie(ligne.produitId, { peremption: v })}
                          placeholder="Aucune"
                          accessibilityLabel={`Date de péremption de ${ligne.produit}`}
                        />
                      </FormField>
                      {/* Jamais coché d'avance : un achat à prix exceptionnel
                          ne doit pas retarifer le catalogue à l'insu du
                          marchand. Fermé sans le droit, comme au back-office. */}
                      {peutRetarifer ? (
                        <Checkbox
                          coche={s.reporterLesPrix}
                          onBasculer={() =>
                            majSaisie(ligne.produitId, {
                              reporterLesPrix: !s.reporterLesPrix,
                            })
                          }
                          label="Mettre à jour les prix de la fiche"
                          accessibilityHint="Les prix de vente servent à la marge. Cochez pour les enregistrer aussi sur la fiche ; le coût de cette entrée l'est dans tous les cas."
                        />
                      ) : null}
                    </View>
                  ) : null}
                </View>
              );
            })
          )}
        </>
      ) : (
        <>
          {motifFerme ? <Banner tone="warning" title={motifFerme} /> : null}

          <FormField label="Entrepôt" required>
            <DeclencheurSelect
              libelle={
                depots?.find((d) => d.id === entrepot)?.nom ?? "Choisir un entrepôt"
              }
              actif={Boolean(entrepot)}
              accessibilityLabel="Entrepôt"
              onPress={() =>
                setChoix({
                  titre: "Entrepôt",
                  options: (depots ?? []).map((d) => ({ valeur: d.id, label: d.nom })),
                  valeur: entrepot,
                  onChoisir: setEntrepotChoisi,
                })
              }
            />
          </FormField>

          <FormField
            label="Type d'entrée"
            required
            hint="Un approvisionnement n'enregistre que des ENTRÉES."
          >
            <DeclencheurSelect
              libelle={TYPE_MOUVEMENT_STOCK[type]?.label ?? type}
              actif
              accessibilityLabel="Type d'entrée"
              onPress={() =>
                setChoix({
                  titre: "Type d'entrée",
                  // ⚠ LES ENTRÉES SEULES : ce n'est pas un panier d'écritures
                  //   hétérogènes, et le serveur refuse une sortie.
                  options: typesSaisissables()
                    .filter((c) => TYPE_MOUVEMENT_STOCK[c]?.entree)
                    .map((c) => ({
                      valeur: c,
                      label: TYPE_MOUVEMENT_STOCK[c]?.label ?? c,
                    })),
                  valeur: type,
                  // Ce panneau n'offre aucune sentinelle : `null` ne peut pas
                  // arriver, et le garder ferait un type d'entrée VIDE.
                  onChoisir: (v) => v && setType(v),
                })
              }
            />
          </FormField>

          <FormField label="Quels articles ?" hint={PORTEES.find((p) => p.cle === portee)?.aide}>
            <ChipRow>
              {PORTEES.map((p) => (
                <Chip
                  key={p.cle}
                  label={p.label}
                  actif={portee === p.cle}
                  onPress={() => setPortee(p.cle)}
                />
              ))}
            </ChipRow>
          </FormField>

          {portee === "categorie" ? (
            <FormField label="Catégories" required>
              <DeclencheurSelect
                libelle={
                  categories.length
                    ? pluriel(categories.length, "catégorie", "catégories")
                    : "Choisir des catégories"
                }
                actif={categories.length > 0}
                accessibilityLabel="Catégories"
                onPress={() => setPanneauMultiple("categories")}
              />
            </FormField>
          ) : null}

          {portee === "article" ? (
            <FormField label="Articles" required>
              <DeclencheurSelect
                libelle={
                  articlesChoisis.length
                    ? pluriel(articlesChoisis.length, "article", "articles")
                    : "Choisir des articles"
                }
                actif={articlesChoisis.length > 0}
                accessibilityLabel="Articles"
                onPress={() => setPanneauMultiple("articles")}
              />
            </FormField>
          ) : null}

          <FormField label="Filtrer par nom ou code">
            <Input
              value={recherche}
              onChangeText={setRecherche}
              placeholder="Optionnel"
            />
          </FormField>

          <FormField label="Note de la livraison">
            <Input
              value={notes}
              onChangeText={setNotes}
              placeholder="Fournisseur, numéro de bon…"
              multiline
            />
          </FormField>

          <Button
            fullWidth
            onPress={preparer}
            disabled={Boolean(motifFerme) || prepare}
            loading={prepare}
          >
            Préparer la feuille
          </Button>
        </>
      )}
    </Sheet>
  );
}

/**
 * Ce qui empêche de retenir une quantité, en une phrase.
 *
 * ⚠ `data/nombres` NE REND QUE LE MOTIF, délibérément : « un fonds de caisse
 * négatif et une quantité négative ne se disent pas de la même façon, et la
 * phrase qu'un marchand lit appartient à l'écran qui la lui montre ». Celle-ci
 * parle d'une quantité REÇUE, et elle dit pourquoi le négatif n'a pas de sens
 * ici : une livraison apporte de la marchandise, elle n'en retire pas. Le
 * serveur oppose désormais la même règle (« Une entrée de stock ne peut pas
 * être négative »), et c'est ce lot qui l'y a posée.
 */
function refusDeQuantite(lecture: LectureNombre): string | undefined {
  if (lecture.ok) return undefined;
  return lecture.motif === "negatif"
    ? "Une livraison apporte de la marchandise : saisissez un nombre positif."
    : "Quantité illisible. Chiffres, et une seule virgule.";
}
