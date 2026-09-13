/**
 * Créer un article, dans la structure et les mots du back-office.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ QUATRE CHAMPS ÉTAIENT DES RANGÉES DE PUCES, ET ELLES DISPARAISSAIENT.   │
 * │                                                                          │
 * │ Catégorie, marque, unité et contenant vivaient dans un `ChipRow` : sur   │
 * │ un établissement à trente catégories, la rangée défilait horizontalement │
 * │ sans que rien n'indique où elle s'arrête, et il fallait la parcourir au  │
 * │ doigt pour trouver une entrée. Pire, le champ ENTIER disparaissait quand │
 * │ la liste était vide : sur un établissement neuf, le marchand ne pouvait  │
 * │ ni voir que le champ existait, ni savoir où le remplir.                  │
 * │                                                                          │
 * │ Ce sont désormais des `ChampSelect` : un déclencheur qui NOMME le choix  │
 * │ courant, une feuille qui liste, et un message quand il n'y a rien à      │
 * │ lister. Le champ ne disparaît plus jamais.                               │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * **Trois modes de vente, comme le back-office**, et non plus le seul détail
 * avec un conditionnement facultatif. Chaque canal porte son couple achat /
 * vente : le détail à l'unité, le gros pour un CONTENANT entier. Le canal
 * détail est toujours exprimé à l'unité de détail, qui est aussi l'unité de
 * base du stock : c'est la seule grandeur avec laquelle le coût moyen pondéré
 * et les lots FIFO savent travailler.
 *
 * **Le SKU est saisi, et il est unique par établissement.** Deux terminaux
 * hors ligne peuvent en fabriquer le même ; le second sera refusé - refus
 * DÉTERMINISTE, donc quarantaine, avec le message qui va bien. C'est le prix
 * d'une création hors ligne, et il est assumé : mieux vaut un refus lisible
 * qu'un code inventé par la machine que personne ne reconnaît en rayon.
 */
import { useMemo, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { computeMargin, formatFixedFr, pluralizeUnit } from "@vente-facile/core";

import { referentiel } from "@/data/articles";
import { useMonnaie } from "@/data/devises";
import { useLecture } from "@/data/live";
import {
  lireChamp,
  refusDeSaisie,
  saisiePrete,
} from "@/features/inventaire/saisie-article";
import {
  creationsReferentielEnAttente,
  creerArticle,
  modificationsReferentielEnAttente,
  type ModeVente,
} from "@/features/inventaire/actes";
import { ChampPhoto, type PhotoChoisie } from "@/features/inventaire/champ-photo";
import { rangerPhoto } from "@/features/inventaire/photos";
import {
  MESSAGE_VIDE,
  optionsReferentiel,
} from "@/features/inventaire/options-referentiel";
import { TuilesModeVente } from "@/features/inventaire/tuile-mode-vente";
import {
  AppBar, Banner, Button, Card, CardHeader, ChampSelect, FormField, Input,
  Screen, Switch, Text, useToast,
} from "@/ui";

export default function NouvelArticle() {
  const toast = useToast();
  const money = useMonnaie();

  const [nom, setNom] = useState("");
  const [sku, setSku] = useState("");
  const [codeBarres, setCodeBarres] = useState("");
  const [categorie, setCategorie] = useState<string | null>(null);
  const [marque, setMarque] = useState<string | null>(null);
  const [unite, setUnite] = useState<string | null>(null);
  const [photo, setPhoto] = useState<PhotoChoisie | null>(null);

  const [mode, setMode] = useState<ModeVente>("retail_only");
  const [prixAchat, setPrixAchat] = useState("");
  const [prixVente, setPrixVente] = useState("");
  const [parContenant, setParContenant] = useState("");
  const [uniteContenant, setUniteContenant] = useState<string | null>(null);
  const [prixAchatGros, setPrixAchatGros] = useState("");
  const [prixVenteGros, setPrixVenteGros] = useState("");
  const [ouvertureAuto, setOuvertureAuto] = useState(true);

  const [taxable, setTaxable] = useState(false);
  const [tauxTva, setTauxTva] = useState("");
  const [suitLeStock, setSuitLeStock] = useState(true);
  const [seuil, setSeuil] = useState("");
  const [envoi, setEnvoi] = useState(false);

  const { donnees: cats } = useLecture(() => referentiel("categories"), {
    tables: ["categories", "products"],
  });
  const { donnees: marques } = useLecture(() => referentiel("marques"), {
    tables: ["brands", "products"],
  });
  const { donnees: unites } = useLecture(() => referentiel("unites"), {
    tables: ["units", "products"],
  });
  // Le journal, sans quoi une catégorie créée hors ligne il y a deux minutes
  // n'est proposée nulle part - sur le terminal fait pour travailler ainsi.
  const { donnees: creations } = useLecture(creationsReferentielEnAttente, {
    tables: ["outbox_operations"],
  });
  const { donnees: retouches } = useLecture(modificationsReferentielEnAttente, {
    tables: ["outbox_operations"],
  });

  const optCats = useMemo(
    () => optionsReferentiel(cats, creations, retouches, "categories"),
    [cats, creations, retouches]
  );
  const optMarques = useMemo(
    () => optionsReferentiel(marques, creations, retouches, "marques"),
    [marques, creations, retouches]
  );
  const optUnites = useMemo(
    () => optionsReferentiel(unites, creations, retouches, "unites"),
    [unites, creations, retouches]
  );
  // ⚠ Le contenant EXCLUT l'unité de détail : « 1 BOITE contient 12 BOITES »
  // passe le serveur et ne se lit pas en rayon.
  const optContenants = useMemo(
    () => optionsReferentiel(unites, creations, retouches, "unites", { exclure: unite }),
    [unites, creations, retouches, unite]
  );

  const conditionne = mode !== "retail_only";
  const nomDe = (options: { valeur: string; label: string }[], id: string | null) =>
    options.find((o) => o.valeur === id)?.label.trim() ?? null;
  // Les libellés viennent du produit, jamais d'un mot figé, pour que le
  // formulaire parle la langue du marchand (paquet, carton, casier…).
  const motDetail = nomDe(optUnites, unite) ?? "unité";
  const motContenant = nomDe(optContenants, uniteContenant) ?? "contenant";
  const plurielDetail = pluralizeUnit(motDetail, 2);

  const achat = lireChamp(prixAchat);
  const vente = lireChamp(prixVente);
  const achatGros = lireChamp(prixAchatGros);
  const venteGros = lireChamp(prixVenteGros);
  const facteur = lireChamp(parContenant);

  const margeDetail = computeMargin(achat.valeur ?? 0, vente.valeur ?? 0);
  const margeGros = computeMargin(achatGros.valeur ?? 0, venteGros.valeur ?? 0);

  // Les refus vivent dans le module PUR : une règle écrite dans un écran est
  // ce qu'il existe pour empêcher, et celle-ci doit rester le miroir exact de
  // `_validate_packaging`.
  const brute = {
    nom, sku, mode, unite, uniteContenant,
    parContenant, prixVente, prixVenteGros,
  };
  const refus = refusDeSaisie(brute);
  const bloque = envoi || !saisiePrete(brute);

  const valider = async () => {
    if (bloque) return;
    setEnvoi(true);
    try {
      const id = await creerArticle({
        nom,
        sku,
        codeBarres,
        categorie,
        marque,
        unite,
        modeVente: mode,
        prixVente: vente.valeur ?? 0,
        prixAchat: achat.valeur ?? 0,
        ...(conditionne
          ? {
              prixVenteGros: venteGros.valeur ?? undefined,
              prixAchatGros: achatGros.valeur ?? undefined,
              unitesParContenant: facteur.valeur ?? undefined,
              uniteContenant,
              ouvertureAutomatique: ouvertureAuto,
            }
          : {}),
        taxable,
        tauxTva: taxable ? (lireChamp(tauxTva).valeur ?? 0) : undefined,
        suitLeStock,
        seuilReassort: seuil.trim() ? (lireChamp(seuil).valeur ?? undefined) : undefined,
      });

      // La photo suit sa propre voie : elle exige du multipart, que le journal
      // ne transporte pas. Un échec ici ne perd PAS l'article, qui est en file.
      if (photo) await rangerPhoto(id, photo);

      toast.succes(
        photo
          ? "Article créé. Il partira, photo comprise, à la prochaine synchronisation."
          : "Article créé. Il partira à la prochaine synchronisation."
      );
      router.replace(`/article/${id}`);
    } catch (e) {
      toast.erreur(
        e instanceof Error ? e.message : "L'article n'a pas pu être enregistré."
      );
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <Screen scroll padded={false}>
      <AppBar title="Nouvel article" />

      <View className="gap-4 p-4">
        {/* --- Identification, dans l'ordre du back-office --------------- */}
        <ChampPhoto photo={photo} onChange={setPhoto} />

        <Card>
          <CardHeader title="Identification" />
          <FormField label="Nom du produit" required>
            <Input value={nom} onChangeText={setNom} placeholder="Eau 50cl" autoFocus />
          </FormField>
          <FormField label="Code SKU" required hint="Unique dans l'établissement.">
            <Input
              value={sku}
              onChangeText={setSku}
              placeholder="EAU-50"
              autoCapitalize="characters"
            />
          </FormField>
          <FormField label="Code-barres">
            <Input value={codeBarres} onChangeText={setCodeBarres} keyboardType="numeric" />
          </FormField>
          <FormField label="Catégorie">
            <ChampSelect
              valeur={categorie}
              onChange={setCategorie}
              options={optCats}
              titre="Catégorie"
              libelleVide="Aucune catégorie"
              messageVide={MESSAGE_VIDE.categories}
            />
          </FormField>
          <FormField label="Marque">
            <ChampSelect
              valeur={marque}
              onChange={setMarque}
              options={optMarques}
              titre="Marque"
              libelleVide="Aucune marque"
              messageVide={MESSAGE_VIDE.marques}
            />
          </FormField>
        </Card>

        {/* --- Vente et prix -------------------------------------------- */}
        <TuilesModeVente valeur={mode} onChange={setMode} />

        <Card>
          <FormField
            label={conditionne ? "Unité (détail)" : "Unité"}
            required={conditionne}
            error={refus.unite}
          >
            <ChampSelect
              valeur={unite}
              onChange={setUnite}
              options={optUnites}
              titre="Unité de détail"
              libelleVide="Aucune unité"
              messageVide={MESSAGE_VIDE.unites}
              invalid={!!refus.unite}
            />
          </FormField>

          {conditionne ? (
            <>
              <FormField label="Contenant" required error={refus.contenant}>
                <ChampSelect
                  valeur={uniteContenant}
                  onChange={setUniteContenant}
                  options={optContenants}
                  titre="Contenant"
                  libelleVide="Aucun contenant"
                  messageVide={MESSAGE_VIDE.unites}
                  invalid={!!refus.contenant}
                />
              </FormField>
              <FormField
                label={`1 ${motContenant} contient`}
                required
                hint={`En ${plurielDetail}.`}
                error={refus.facteur}
              >
                <Input
                  value={parContenant}
                  onChangeText={setParContenant}
                  keyboardType="number-pad"
                  placeholder="12"
                  invalid={!!refus.facteur}
                />
              </FormField>
            </>
          ) : null}
        </Card>

        {/* Un bloc par canal : le marchand lit d'un trait ce que lui coûte et
            ce que lui rapporte la bouteille, puis le carton. */}
        {mode !== "wholesale_only" ? (
          <Card>
            <CardHeader title={`Vente au détail · ${motDetail}`} />
            {/* « par X », jamais « d'un X » ni « d'une X » : le GENRE d'un nom
                d'unité n'est pas dérivable sans lexique, et le nom vient du
                marchand. « par » est invariable et ne s'élide pas. */}
            <FormField label={`Prix d'achat par ${motDetail}`}>
              <Input
                value={prixAchat}
                onChangeText={setPrixAchat}
                keyboardType="decimal-pad"
                placeholder="0"
                invalid={achat.refus != null}
              />
            </FormField>
            <FormField
              label={`Prix de vente par ${motDetail}`}
              required
              hint={
                margeDetail
                  ? `Marge sur prix de vente : ${formatFixedFr(margeDetail.rate, 1)} %`
                  : undefined
              }
              error={
                refus.prixVente ??
                (margeDetail?.isNonPositive ? "Vous vendez à perte." : undefined)
              }
            >
              <Input
                value={prixVente}
                onChangeText={setPrixVente}
                keyboardType="decimal-pad"
                placeholder="0"
                invalid={!!refus.prixVente || !!margeDetail?.isNonPositive}
              />
            </FormField>
          </Card>
        ) : null}

        {conditionne ? (
          <Card>
            <CardHeader title={`Vente en gros · ${motContenant}`} />
            {facteur.valeur && facteur.valeur > 1 ? (
              <Text variant="caption" className="mb-3">
                1 {motContenant} = {facteur.valeur} {plurielDetail}
              </Text>
            ) : null}
            <FormField label={`Prix d'achat par ${motContenant}`}>
              <Input
                value={prixAchatGros}
                onChangeText={setPrixAchatGros}
                keyboardType="decimal-pad"
                placeholder="0"
                invalid={achatGros.refus != null}
              />
            </FormField>
            <FormField
              label={`Prix de vente par ${motContenant}`}
              required
              hint={
                margeGros
                  ? `Marge sur prix de vente : ${formatFixedFr(margeGros.rate, 1)} %`
                  : undefined
              }
              error={
                refus.prixVenteGros ??
                (margeGros?.isNonPositive ? "Vous vendez à perte." : undefined)
              }
            >
              <Input
                value={prixVenteGros}
                onChangeText={setPrixVenteGros}
                keyboardType="decimal-pad"
                placeholder="0"
                invalid={!!refus.prixVenteGros || !!margeGros?.isNonPositive}
              />
            </FormField>
            {venteGros.valeur && facteur.valeur && facteur.valeur > 1 ? (
              <Text variant="caption">
                {/* « achetée » s'accorderait avec un nom dont on ignore le genre. */}
                Soit {money.money(venteGros.valeur / facteur.valeur, money.primaryCode)} par{" "}
                {motDetail} en achat de gros.
              </Text>
            ) : null}
            {mode === "wholesale_and_retail" ? (
              <View className="mt-3 flex-row items-start justify-between gap-4">
                <View className="min-w-0 flex-1">
                  <Text variant="bodySmall" className="font-sans-medium">
                    Ouvrir des {pluralizeUnit(motContenant, 2)} automatiquement
                  </Text>
                  <Text variant="caption" className="mt-0.5">
                    Quand il ne reste plus de {plurielDetail} à l&apos;unité, on ouvre
                    un contenant pour servir le client.
                  </Text>
                </View>
                <Switch valeur={ouvertureAuto} onChange={setOuvertureAuto} />
              </View>
            ) : null}
          </Card>
        ) : null}

        {/* --- Taxe ------------------------------------------------------ */}
        <Card>
          <CardHeader title="Taxe" />
          <View className="flex-row items-start justify-between gap-4">
            <View className="min-w-0 flex-1">
              <Text variant="bodySmall" className="font-sans-medium">
                Produit taxable
              </Text>
              <Text variant="caption" className="mt-0.5">
                Appliquer la TVA à la vente.
              </Text>
            </View>
            <Switch valeur={taxable} onChange={setTaxable} />
          </View>
          {taxable ? (
            <View className="mt-3">
              <FormField label="Taux de TVA (%)">
                <Input
                  value={tauxTva}
                  onChangeText={setTauxTva}
                  keyboardType="decimal-pad"
                  placeholder="16"
                />
              </FormField>
            </View>
          ) : null}
        </Card>

        {/* --- Suivi du stock -------------------------------------------- */}
        <Card>
          <CardHeader title="Suivi du stock" />
          <View className="flex-row items-start justify-between gap-4">
            <View className="min-w-0 flex-1">
              <Text variant="bodySmall" className="font-sans-medium">
                Suivre le stock
              </Text>
              <Text variant="caption" className="mt-0.5">
                Décompter les quantités à chaque vente. Désactivé, l&apos;article se
                vend sans jamais être compté : services, consignes, coupe.
              </Text>
            </View>
            <Switch valeur={suitLeStock} onChange={setSuitLeStock} />
          </View>
          {suitLeStock ? (
            <View className="mt-3">
              <FormField label="Seuil d'alerte" hint="Déclenche l'alerte de stock bas.">
                <Input
                  value={seuil}
                  onChangeText={setSeuil}
                  keyboardType="number-pad"
                  placeholder="0"
                />
              </FormField>
            </View>
          ) : null}
        </Card>

        <Banner
          tone="info"
          title="Le SKU doit être unique"
          message="Deux terminaux hors ligne peuvent saisir le même : le second sera refusé et attendra dans « Opérations à corriger »."
        />

        <Button fullWidth size="lg" disabled={bloque} onPress={() => void valider()}>
          {envoi ? "Enregistrement…" : "Créer l'article"}
        </Button>
      </View>
    </Screen>
  );
}
