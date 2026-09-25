/**
 * Saisir un mouvement de stock, dans une FEUILLE plutôt que dans un écran.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CRÉER N'EST PAS NAVIGUER.                                               │
 * │                                                                          │
 * │ Le bouton poussait un écran entier : le journal disparaissait, le retour │
 * │ arrière devenait le seul moyen d'abandonner, et le magasinier perdait de │
 * │ vue ce qu'il était en train de faire. Une feuille qui monte du bas dit   │
 * │ ce qu'elle est - une parenthèse par-dessus la liste, qu'on referme d'un  │
 * │ appui à côté.                                                            │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN SEUL `Sheet`, DES PANNEAUX QU'ON ÉCHANGE.                            │
 * │                                                                          │
 * │ `Sheet` est un `Modal` : en empiler un second donne un voile sur un      │
 * │ voile et deux `onRequestClose` qui se disputent le bouton retour         │
 * │ d'Android. Le formulaire, le choix d'un article et les listes de choix   │
 * │ échangent donc le CONTENU de la même feuille, et la flèche de retour     │
 * │ RECULE d'un panneau au lieu de tout fermer.                              │
 * │                                                                          │
 * │ C'est aussi pourquoi les champs de choix posent `DeclencheurSelect` et   │
 * │ non `ChampSelect` : ce dernier ouvre SA feuille, et l'imbriquerait.      │
 * │ `ChampDate` échappe à la règle : son sélecteur est NATIF, pas un         │
 * │ `Modal` de React Native, et il s'ouvre par-dessus la feuille.            │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ TROIS COMPORTEMENTS, ET NON DEUX.                                        │
 * │                                                                          │
 * │ `getPackaging` du noyau décide, et lui seul : il impose le facteur >= 2  │
 * │ et distingue le `wholesale_only`. La version précédente ne connaissait   │
 * │ que « facteur ou pas » et proposait donc un champ « unités isolées » sur │
 * │ un article vendu en gros seul, qu'un contenant n'ouvre jamais.           │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * **La quantité ne se convertit pas ici.** Un `paquets × facteur + vrac`
 * calculé sur l'appareil serait une seconde arithmétique du conditionnement, à
 * tenir en phase avec celle du serveur. L'assemblage du corps vit dans
 * `payload-mouvement.ts`, avec ses tests.
 */
import { useCallback, useMemo, useState } from "react";
import { View } from "react-native";
import { formatNumberFr, pluralizeUnit } from "@vente-facile/core";

import {
  chercherArticlesPourMouvement,
  type ArticlePourMouvement,
} from "@/data/articles";
import { jourISO } from "@/data/dates";
import { useMonnaie } from "@/data/devises";
import { entrepotParDefaut } from "@/data/entrepot-defaut";
import { useLecture } from "@/data/live";
import { lireNombre, type LectureNombre } from "@/data/nombres";
import { emplacementsDeLEntrepot, entrepotsSansValorisation } from "@/data/stock";
import {
  TYPE_MOUVEMENT_STOCK,
  estEntreeValorisee,
  typesSaisissables,
} from "@/data/types-mouvement";
import { creerMouvement } from "@/features/stock/actes";
import { BlocCanal } from "@/features/stock/bloc-canal";
import {
  apercuDuCoutMelange,
  corpsDuMouvement,
  resumeDeConversion,
  verifierLaSaisie,
  type SaisieFormulaireMouvement,
} from "@/features/stock/payload-mouvement";
import { useSession } from "@/session/provider";
import {
  Banner, Button, ChampDate, DataRow, DeclencheurSelect, FormField, Input,
  ListeChoix, SearchInput, Sheet, Switch, Text, useToast,
  type DemandeChoix, type OptionSelect,
} from "@/ui";

const OPTIONS_TYPE: OptionSelect[] = typesSaisissables().map((t) => ({
  valeur: t,
  label: TYPE_MOUVEMENT_STOCK[t]?.label ?? t,
}));

/**
 * Ce qu'une saisie VAUT, et la phrase à écrire si elle ne vaut rien.
 *
 * `lireNombre` rend un MOTIF et non une phrase : un fonds de caisse négatif et
 * une quantité négative ne se disent pas de la même façon, et la phrase qu'un
 * marchand lit appartient à l'écran qui la lui montre. Le SENS d'un mouvement
 * vient de son type, jamais d'un signe - un « -5 » saisi ici augmenterait le
 * stock une fois sur deux.
 */
function lire(saisie: string, quoi: "quantité" | "coût"): {
  valeur: number | null;
  erreur?: string;
} {
  if (!saisie.trim()) return { valeur: null };
  const l: LectureNombre = lireNombre(saisie);
  if (l.ok) return { valeur: l.valeur ?? null };
  return {
    valeur: null,
    erreur:
      l.motif === "negatif"
        ? quoi === "quantité"
          ? "Pas de nombre négatif : c'est le TYPE qui décide du sens."
          : "Un montant négatif ne veut rien dire."
        : quoi === "quantité"
          ? "Quantité illisible. Écrivez par exemple 3 ou 1,5."
          : "Montant illisible. Écrivez par exemple 12 500 ou 12 500,50.",
  };
}

/**
 * Un prix de la fiche, prêt à être posé dans un champ.
 *
 * Un zéro rend le champ VIDE : `cost_price` est non nul en base et vaut souvent
 * « 0.00 » ; un « 0,00 » posé dans un champ de coût se lit comme un coût
 * déclaré nul, quand le repli sur le gabarit « 0 » dit la même chose sans
 * l'affirmer. Le back-office, lui, recopie la chaîne telle quelle.
 */
function prefill(brut: string | null): string {
  const n = Number(brut ?? 0);
  return Number.isFinite(n) && n > 0 ? formatNumberFr(n, 2) : "";
}

/**
 * Elle se monte à l'OUVERTURE, et c'est ce qui la remet à neuf : l'appelant la
 * rend conditionnellement plutôt que de lui passer un booléen. Chaque ouverture
 * est un montage, donc un état vierge, sans effet de remise à zéro à tenir en
 * phase avec les champs qu'on ajoutera.
 */
export function FeuilleNouveauMouvement({
  onFermer,
  onCree,
}: {
  onFermer: () => void;
  /** Le mouvement est entré au journal. La table tirée ne bougera qu'au tirage. */
  onCree: () => void;
}) {
  const toast = useToast();
  const money = useMonnaie();
  const { can } = useSession();

  const [entrepotChoisi, setEntrepotChoisi] = useState<string | null>(null);
  // Le défaut du back-office est `initial` : le premier mouvement d'un rayon
  // est presque toujours son stock de départ.
  const [type, setType] = useState<string>("initial");
  const [article, setArticle] = useState<ArticlePourMouvement | null>(null);
  const [contenants, setContenants] = useState("");
  const [vrac, setVrac] = useState("");
  const [coutDetail, setCoutDetail] = useState("");
  const [coutContenant, setCoutContenant] = useState("");
  const [prixDetail, setPrixDetail] = useState("");
  const [prixGros, setPrixGros] = useState("");
  const [reporterLesPrix, setReporterLesPrix] = useState(false);
  const [emplacement, setEmplacement] = useState<string | null>(null);
  const [peremption, setPeremption] = useState("");
  const [notes, setNotes] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [erreurs, setErreurs] = useState<{
    contenants?: string;
    vrac?: string;
    peremption?: string;
  }>({});

  /** `null` : le formulaire. Sinon le panneau ouvert par-dessus lui. */
  const [choix, setChoix] = useState<DemandeChoix | null>(null);
  const [panneauArticle, setPanneauArticle] = useState(false);
  const [recherche, setRecherche] = useState("");

  const { donnees: depots } = useLecture(entrepotsSansValorisation, { tables: ["warehouses"] });

  /**
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ LE DÉFAUT SE DÉRIVE, IL NE SE POSE PAS DANS UN EFFET.               │
   * │                                                                      │
   * │ Un `setState` synchrone dans un effet est un rendu de plus à chaque  │
   * │ arrivée de données, et une règle qui dépend de l'ORDRE des effets.   │
   * │ Dérivée, la valeur est juste dès le premier rendu où les dépôts sont │
   * │ là, et un choix explicite l'emporte.                                  │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  const entrepot = entrepotChoisi ?? entrepotParDefaut(depots);

  const chargerArticles = useCallback(
    () =>
      panneauArticle
        ? chercherArticlesPourMouvement(recherche, 30)
        : Promise.resolve([]),
    [panneauArticle, recherche]
  );
  const { donnees: articles } = useLecture(chargerArticles, {
    tables: ["products", "units"],
    deps: [panneauArticle, recherche],
  });

  const chargerEmplacements = useCallback(
    () => emplacementsDeLEntrepot(entrepot),
    [entrepot]
  );
  const { donnees: emplacements } = useLecture(chargerEmplacements, {
    tables: ["stock_locations"],
    deps: [entrepot],
  });

  const nContenants = lire(contenants, "quantité");
  const nVrac = lire(vrac, "quantité");
  const cond = article?.conditionnement ?? null;
  const entree = estEntreeValorisee(type);

  const saisie: SaisieFormulaireMouvement = useMemo(
    () => ({
      produit: article?.id ?? "",
      entrepot: entrepot ?? "",
      type,
      conditionnement: cond,
      aUneDatePeremption: article?.aUneDatePeremption ?? false,
      contenants: nContenants.valeur,
      vrac: nVrac.valeur,
      coutDetail: lire(coutDetail, "coût").valeur,
      coutContenant: lire(coutContenant, "coût").valeur,
      prixDetail: lire(prixDetail, "coût").valeur,
      prixGros: lire(prixGros, "coût").valeur,
      reporterLesPrix,
      emplacement,
      peremption: peremption || null,
      notes,
    }),
    [article, entrepot, type, cond, nContenants.valeur, nVrac.valeur, coutDetail,
     coutContenant, prixDetail, prixGros, reporterLesPrix, emplacement, peremption, notes]
  );

  const recap = resumeDeConversion(saisie);
  const coutMelange = apercuDuCoutMelange(saisie);
  const bloque = envoi || !entrepot || !article;

  const optionsEntrepot: OptionSelect[] = (depots ?? []).map((d) => ({
    valeur: d.id,
    label: d.nom,
  }));
  const nomEntrepot = optionsEntrepot.find((o) => o.valeur === entrepot)?.label;
  const optionsEmplacement: OptionSelect[] = (emplacements ?? []).map((e) => ({
    valeur: e.id,
    label: e.code ? `${e.nom} (${e.code})` : e.nom,
  }));
  const nomEmplacement = optionsEmplacement.find((o) => o.valeur === emplacement)?.label;

  const motPaquet = cond ? pluralizeUnit(cond.packageWord, 1) : "contenant";
  const motDetail = cond ? pluralizeUnit(cond.retailWord, 1) : (article ? "unité" : "unité");

  const valider = async () => {
    if (bloque || !entrepot || !article) return;

    // Une saisie illisible RÉPONDAIT en ne faisant rien : « 12 500 » avec son
    // séparateur donnait `NaN` puis zéro, et le bouton restait inerte.
    const mauvais: typeof erreurs = {};
    if (nContenants.erreur) mauvais.contenants = nContenants.erreur;
    if (nVrac.erreur) mauvais.vrac = nVrac.erreur;
    const metier = verifierLaSaisie(saisie);
    if (metier.contenants) mauvais.contenants = metier.contenants;
    if (metier.quantite) mauvais.vrac = metier.quantite;
    if (metier.peremption) mauvais.peremption = metier.peremption;
    setErreurs(mauvais);
    if (Object.keys(mauvais).length > 0) return;

    setEnvoi(true);
    try {
      await creerMouvement(corpsDuMouvement(saisie));
      toast.succes(
        reporterLesPrix
          ? "Mouvement mis en file. Les prix de la fiche suivront à la synchronisation."
          : "Mouvement mis en file. Il partira à la prochaine synchronisation."
      );
      onCree();
    } catch (e) {
      toast.erreur(e instanceof Error ? e.message : "Le mouvement n'a pas pu être enregistré.");
    } finally {
      setEnvoi(false);
    }
  };

  /** Le voile et le bouton retour reculent d'un panneau, puis ferment. */
  const reculer = () => {
    if (choix) return setChoix(null);
    if (panneauArticle) return setPanneauArticle(false);
    onFermer();
  };

  const titre = choix
    ? choix.titre
    : panneauArticle
      ? "Choisir un article"
      : "Nouveau mouvement";
  const surLeFormulaire = !choix && !panneauArticle;

  return (
    <Sheet
      ouvert
      onFermer={reculer}
      titre={titre}
      retour={surLeFormulaire ? undefined : reculer}
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
          messageVide={choix.messageVide}
        />
      ) : panneauArticle ? (
        <>
          <SearchInput
            valeur={recherche}
            onChange={setRecherche}
            placeholder="Rechercher un produit..."
          />
          {(articles ?? []).length === 0 ? (
            <Text variant="caption">
              {recherche
                ? "Aucun article ne correspond."
                : "Cherchez un article par son nom, son code ou son code-barres."}
            </Text>
          ) : (
            <View>
              {(articles ?? []).map((a) => (
                <DataRow
                  key={a.id}
                  principal={a.nom}
                  secondaire={a.sku}
                  // Pas de chevron : l'appui REVIENT au formulaire, il n'avance
                  // pas. `ListItem` réserve le chevron à une destination.
                  chevron={false}
                  onPress={() => {
                    // Tout se pose ICI, pas dans un effet : la ligne est
                    // complète au moment de l'appui, contrairement au
                    // back-office qui attend son cache.
                    setArticle(a);
                    setCoutDetail(prefill(a.coutDetail));
                    setCoutContenant(a.conditionnement ? prefill(a.coutContenant) : "");
                    setPrixDetail(prefill(a.prixDetail));
                    setPrixGros(a.conditionnement ? prefill(a.prixGros) : "");
                    // Une case restée cochée écraserait les prix du produit
                    // suivant, sans que personne ne l'ait demandé.
                    setReporterLesPrix(false);
                    setPeremption("");
                    setErreurs({});
                    setPanneauArticle(false);
                  }}
                />
              ))}
            </View>
          )}
        </>
      ) : (
        <>
          <FormField label="Article" required>
            <Button variant="outline" fullWidth onPress={() => setPanneauArticle(true)}>
              {article?.nom ?? "Choisir un article"}
            </Button>
          </FormField>

          <FormField label="Entrepôt" required>
            <DeclencheurSelect
              libelle={nomEntrepot ?? "Choisir un entrepôt"}
              actif={Boolean(nomEntrepot)}
              accessibilityLabel="Entrepôt"
              onPress={() =>
                setChoix({
                  titre: "Entrepôt",
                  options: optionsEntrepot,
                  valeur: entrepot,
                  onChoisir: (v) => {
                    // L'emplacement APPARTIENT à l'entrepôt : le garder ferait
                    // ranger une réception dans un rayon d'un autre dépôt.
                    // L'article, lui, reste : le catalogue n'est plus borné au
                    // dépôt, un mouvement d'entrée étant légitime sur un
                    // article qui n'y a pas encore de ligne.
                    if (v !== entrepot) setEmplacement(null);
                    setEntrepotChoisi(v);
                  },
                  messageVide: "Aucun entrepôt n'est encore descendu sur ce terminal.",
                })
              }
            />
          </FormField>

          <FormField
            label="Type de mouvement"
            required
            hint={
              (TYPE_MOUVEMENT_STOCK[type]?.entree ?? true)
                ? "Ce type AJOUTE du stock."
                : "Ce type RETIRE du stock."
            }
          >
            <DeclencheurSelect
              libelle={TYPE_MOUVEMENT_STOCK[type]?.label ?? type}
              actif
              accessibilityLabel="Type de mouvement"
              onPress={() =>
                setChoix({
                  titre: "Type de mouvement",
                  options: OPTIONS_TYPE,
                  valeur: type,
                  // Le type a toujours une valeur : le remettre à `null` ferait
                  // un formulaire sans sens de mouvement.
                  onChoisir: (v) => setType(v ?? type),
                })
              }
            />
          </FormField>

          {article ? (
            <>
              {/* Vendu en gros SEUL : le canal de détail n'existe pas, et un
                  contenant ne s'y ouvre jamais. */}
              {!cond?.packageOnly ? (
                <BlocCanal
                  titre={cond ? `Au détail · ${motDetail}` : "Quantité"}
                  // ┌──────────────────────────────────────────────────────┐
                  // │ « PAR » ET « EN », JAMAIS « UN » NI « UNE ».         │
                  // │                                                      │
                  // │ Le GENRE d'un nom d'unité n'est pas dérivable sans   │
                  // │ lexique, et le nom vient du marchand : le back-office │
                  // │ écrit « d'une {détail} » et « d'un {contenant} » en   │
                  // │ dur, d'où « Prix d'achat d'un BOITE ». « De » s'élide │
                  // │ en outre devant une voyelle (« Nombre de AMPOULES »). │
                  // │ Les deux locutions retenues sont invariables et ne    │
                  // │ s'élident pas. Même remède qu'au lot 7.               │
                  // └──────────────────────────────────────────────────────┘
                  libelleQuantite={
                    cond ? `Quantité en ${pluralizeUnit(cond.retailWord, 2)}` : "Quantité"
                  }
                  libelleCout={`Prix d'achat par ${motDetail}`}
                  libelleVente={`Prix de vente par ${motDetail}`}
                  symbole={money.symbolOf(money.primaryCode)}
                  quantite={vrac}
                  onQuantite={(v) => {
                    setVrac(v);
                    if (erreurs.vrac) setErreurs((e) => ({ ...e, vrac: undefined }));
                  }}
                  erreurQuantite={erreurs.vrac}
                  cout={coutDetail}
                  onCout={setCoutDetail}
                  prix={prixDetail}
                  onPrix={setPrixDetail}
                  prixVisibles={entree}
                />
              ) : null}

              {cond ? (
                <BlocCanal
                  titre={`En gros · ${motPaquet}`}
                  rappel={`1 ${motPaquet} = ${cond.factor} ${pluralizeUnit(cond.retailWord, cond.factor)}`}
                  libelleQuantite={`Quantité en ${pluralizeUnit(cond.packageWord, 2)}`}
                  libelleCout={`Prix d'achat par ${motPaquet}`}
                  libelleVente={`Prix de vente par ${motPaquet}`}
                  symbole={money.symbolOf(money.primaryCode)}
                  quantite={contenants}
                  onQuantite={(v) => {
                    setContenants(v);
                    if (erreurs.contenants) {
                      setErreurs((e) => ({ ...e, contenants: undefined }));
                    }
                  }}
                  erreurQuantite={erreurs.contenants}
                  cout={coutContenant}
                  onCout={setCoutContenant}
                  prix={prixGros}
                  onPrix={setPrixGros}
                  prixVisibles={entree}
                />
              ) : null}

              {recap ? (
                <Banner
                  tone="info"
                  title={recap}
                  message={
                    coutMelange != null
                      ? `Valorisées à ${money.money(coutMelange, money.primaryCode)} par ${motDetail}.`
                      : undefined
                  }
                />
              ) : null}

              {/* Jamais cochée d'avance : un achat à prix exceptionnel ne
                  retarife pas le catalogue à l'insu du marchand. Fermée sans
                  le droit, comme le back-office le fait par `PermissionGate` -
                  le serveur refuserait l'opération entière. */}
              {entree && can("products.edit") ? (
                <Switch
                  valeur={reporterLesPrix}
                  onChange={setReporterLesPrix}
                  label="Mettre à jour les prix de la fiche produit"
                  aide="Les prix de vente saisis servent au calcul de la marge. Activez pour les enregistrer aussi sur la fiche. Le coût de ce mouvement est enregistré dans tous les cas."
                />
              ) : null}

              {entree ? (
                <>
                  <FormField label="Emplacement (optionnel)">
                    <DeclencheurSelect
                      libelle={nomEmplacement ?? "Aucun emplacement"}
                      actif={Boolean(nomEmplacement)}
                      disabled={optionsEmplacement.length === 0}
                      accessibilityLabel="Emplacement"
                      onPress={() =>
                        setChoix({
                          titre: "Emplacement",
                          options: optionsEmplacement,
                          valeur: emplacement,
                          onChoisir: setEmplacement,
                          messageVide: "Aucun emplacement pour cet entrepôt.",
                        })
                      }
                    />
                  </FormField>

                  <FormField
                    label={
                      article.aUneDatePeremption
                        ? "Date d'expiration"
                        : "Date d'expiration (optionnel)"
                    }
                    required={article.aUneDatePeremption}
                    hint={
                      article.aUneDatePeremption
                        ? "Ce produit est périssable : sans date, son lot n'alertera jamais."
                        : "Pour les produits périssables uniquement."
                    }
                    error={erreurs.peremption}
                  >
                    <ChampDate
                      valeur={peremption}
                      onChange={(v) => {
                        setPeremption(v);
                        if (erreurs.peremption) {
                          setErreurs((e) => ({ ...e, peremption: undefined }));
                        }
                      }}
                      invalid={Boolean(erreurs.peremption)}
                      // Un lot déjà périmé à sa réception n'a pas de sens : le
                      // sélecteur ferme la porte plutôt que de laisser le
                      // serveur refuser après le voyage.
                      minimum={jourISO(new Date())}
                      accessibilityLabel="Date d'expiration"
                    />
                  </FormField>
                </>
              ) : null}
            </>
          ) : null}

          <FormField label="Notes">
            <Input value={notes} onChangeText={setNotes} placeholder="Fournisseur, motif…" />
          </FormField>

          {!entree ? (
            <Banner
              tone="warning"
              title="Ce mouvement retire du stock"
              message="Il sera appliqué à la synchronisation, et se corrige ensuite par un mouvement inverse."
            />
          ) : null}

          <Button fullWidth size="lg" disabled={bloque} onPress={() => void valider()}>
            {envoi ? "Enregistrement…" : "Enregistrer le mouvement"}
          </Button>
        </>
      )}
    </Sheet>
  );
}
