/**
 * Créer un devis, dans une FEUILLE plutôt que dans un écran.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CRÉER N'EST PAS NAVIGUER.                                               │
 * │                                                                          │
 * │ Le bouton « Nouveau » poussait un écran entier : la liste disparaissait, │
 * │ le retour arrière devenait le seul moyen d'abandonner, et le commerçant  │
 * │ perdait de vue ce qu'il était en train de faire. Une feuille qui monte   │
 * │ du bas dit ce qu'elle est - une parenthèse par-dessus la liste, qu'on    │
 * │ referme d'un geste vers le bas ou d'un appui à côté.                     │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ TROIS PANNEAUX DANS UNE SEULE FEUILLE, JAMAIS TROIS FEUILLES.           │
 * │                                                                          │
 * │ `Sheet` est un `Modal` de React Native : en empiler un second par-dessus │
 * │ donne un voile sur un voile et deux `onRequestClose` qui se disputent le │
 * │ bouton retour d'Android. L'ancien écran s'en tirait parce qu'il n'était  │
 * │ pas lui-même une feuille ; ici, le formulaire, le choix d'un client et   │
 * │ le choix d'un article échangent le CONTENU de la même feuille.           │
 * │                                                                          │
 * │ Le voile et le bouton retour RECULENT donc d'un panneau au lieu de tout  │
 * │ fermer : un geste destiné à revenir en arrière ne doit pas effacer une   │
 * │ saisie. Depuis le formulaire, ils ferment - et seulement là.             │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * **Un devis N'ENGAGE PAS LE STOCK.** C'est ce qui le distingue d'une vente :
 * on propose un prix, la marchandise reste disponible pour quelqu'un d'autre.
 * Elle ne sort du stock qu'à la conversion, et la feuille le dit - sans quoi
 * un commerçant croirait avoir mis de côté.
 *
 * **La date de validité est OBLIGATOIRE.** Le serveur refuse un devis qui
 * n'expire jamais : un prix proposé il y a six mois n'engage plus personne.
 */
import { useCallback, useState } from "react";
import { View } from "react-native";
import { formatDateFr } from "@vente-facile/core";

import { jourISO } from "@/data/dates";
import { useMonnaie } from "@/data/devises";
import { useLecture } from "@/data/live";
import { lireNombre } from "@/data/nombres";
import { chercherArticles } from "@/features/pos/catalogue";
import { useEntrepotsDuMembre } from "@/features/perimetre/use-entrepots";
import { chercherClients } from "@/features/pos/donnees";
import { creerDevis, type LigneDevisSaisie } from "@/features/ventes/retours-devis";
import {
  Banner, Button, ChampDate, Chip, ChipRow, DataRow, DeclencheurSelect, Divider, FormField,
  Icon, Input, ListeChoix, Pressable, SearchInput, Sheet, Text, useToast,
} from "@/ui";

/** Les échéances que le comptoir propose. Trente jours est l'usage courant. */
const ECHEANCES = [7, 15, 30, 60];

function dansNJours(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return jourISO(d);
}

type Panneau = "devis" | "client" | "article" | "entrepot";

type LigneSaisie = LigneDevisSaisie & { nom: string };

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ELLE SE MONTE À L'OUVERTURE, ET C'EST CE QUI LA REMET À NEUF.           │
 * │                                                                          │
 * │ L'appelant la rend CONDITIONNELLEMENT plutôt que de lui passer un        │
 * │ booléen : chaque ouverture est un montage, donc un état vierge, sans     │
 * │ effet de remise à zéro à tenir en phase avec les champs qu'on ajoutera.  │
 * │ Un devis abandonné laisserait sinon ses articles dans le suivant, et le  │
 * │ commerçant facturerait à un client ce qu'il proposait à un autre.        │
 * │                                                                          │
 * │ Rien n'est perdu à la fermeture : `Sheet` est un `Modal`, dont le        │
 * │ contenu disparaît dès que `visible` retombe - l'animation de sortie ne   │
 * │ se voyait déjà pas.                                                      │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function FeuilleNouveauDevis({
  onFermer,
  onCree,
}: {
  onFermer: () => void;
  /** Le devis vient d'entrer au journal : à l'appelant d'ouvrir sa fiche. */
  onCree: (id: string) => void;
}) {
  const money = useMonnaie();
  const toast = useToast();

  const [panneau, setPanneau] = useState<Panneau>("devis");
  const [client, setClient] = useState<{ id: string; nom: string } | null>(null);
  const [validite, setValidite] = useState(dansNJours(30));
  const [notes, setNotes] = useState("");
  const [lignes, setLignes] = useState<LigneSaisie[]>([]);
  const [envoi, setEnvoi] = useState(false);

  const [recherche, setRecherche] = useState("");
  const [choisi, setChoisi] = useState<{ id: string; nom: string } | null>(null);
  const [quantite, setQuantite] = useState("");
  const [prix, setPrix] = useState("");
  const [erreurLigne, setErreurLigne] = useState<{ q?: string; p?: string }>({});

  // ┌──────────────────────────────────────────────────────────────────────┐
  // │ SANS PRINCIPAL, LE DEVIS NE SE REMPLISSAIT PAS.                      │
  // │                                                                      │
  // │ L'entrepôt était deviné (`entrepotParDefaut`) et le panneau des      │
  // │ articles n'en cherchait aucun sans lui : avec deux dépôts et aucun   │
  // │ principal, la recherche restait vide, sans un mot. L'entrepôt se     │
  // │ CHOISIT désormais, parmi ceux où le membre agit, et il part avec le  │
  // │ devis (`Quotation.warehouse`) : c'est lui qui le range dans un       │
  // │ périmètre. Le catalogue, lui, ne dépend plus de ce choix - on        │
  // │ propose un prix sur tout ce qui se vend, le stock n'étant engagé     │
  // │ qu'à la conversion.                                                  │
  // └──────────────────────────────────────────────────────────────────────┘
  const { actionnables, parDefaut } = useEntrepotsDuMembre();
  const [entrepotChoisi, setEntrepotChoisi] = useState<string | null>(null);
  const entrepot = entrepotChoisi ?? parDefaut;
  const nomEntrepot = actionnables.find((e) => e.id === entrepot)?.nom ?? null;

  const chargerClients = useCallback(
    () => (panneau === "client" ? chercherClients(recherche, 12) : Promise.resolve([])),
    [panneau, recherche]
  );
  const { donnees: clients } = useLecture(chargerClients, {
    tables: ["customers"],
    deps: [panneau, recherche],
  });

  const chargerArticles = useCallback(
    () =>
      panneau === "article"
        ? chercherArticles({
            // Le stock affiché est celui de l'entrepôt du devis, s'il en a un.
            warehouseId: entrepot,
            terme: recherche,
            limite: 20,
            // Le catalogue du comptoir est désormais TOUT le catalogue
            // vendable : un devis n'engage aucun stock.
          })
        : Promise.resolve([]),
    [panneau, recherche, entrepot]
  );
  const { donnees: articles } = useLecture(chargerArticles, {
    tables: ["products", "stocks"],
    deps: [panneau, recherche, entrepot],
  });

  const total = lignes.reduce((t, l) => t + l.quantite * l.prixUnitaire, 0);

  // ┌──────────────────────────────────────────────────────────────────────┐
  // │ UNE DATE PASSÉE ÉTAIT ACCEPTÉE, ET DONNAIT UN DEVIS PÉRIMÉ-NÉ.      │
  // │                                                                      │
  // │ Le contrôle ne portait que sur la FORME. Une date d'hier passe la    │
  // │ forme, le serveur enregistre, et la fiche annonce aussitôt « Périmé  │
  // │ - le serveur refusera de le convertir ». Le commerçant a proposé un  │
  // │ prix à son client sur un papier qui ne vaut déjà plus rien.          │
  // └──────────────────────────────────────────────────────────────────────┘
  const formeDate = /^\d{4}-\d{2}-\d{2}$/.test(validite);
  const datePassee = formeDate && validite < jourISO(new Date());
  const erreurDate = !formeDate
    ? "Format attendu : AAAA-MM-JJ."
    : datePassee
      ? "Cette date est passée : le devis serait périmé dès sa création."
      : undefined;

  const bloque = envoi || lignes.length === 0 || erreurDate !== undefined;

  const ajouter = () => {
    if (!choisi) return;
    const q = lireNombre(quantite);
    const p = lireNombre(prix);
    // Le bouton RÉPONDAIT en ne faisant rien : `q <= 0 || p <= 0` sortait en
    // silence, et le commerçant appuyait deux fois avant d'abandonner.
    const erreurs: { q?: string; p?: string } = {};
    if (!q.ok || q.valeur === null || q.valeur <= 0) {
      erreurs.q = !q.ok
        ? "Quantité illisible. Écrivez par exemple 3 ou 1,5."
        : "Indiquez une quantité.";
    }
    if (!p.ok || p.valeur === null || p.valeur <= 0) {
      erreurs.p = !p.ok
        ? "Prix illisible. Écrivez par exemple 12 500 ou 12 500,50."
        : "Indiquez un prix.";
    }
    setErreurLigne(erreurs);
    if (erreurs.q || erreurs.p) return;

    setLignes((l) => [
      ...l.filter((x) => x.produit !== choisi.id),
      {
        produit: choisi.id,
        nom: choisi.nom,
        quantite: (q as { valeur: number }).valeur,
        prixUnitaire: (p as { valeur: number }).valeur,
      },
    ]);
    setChoisi(null);
    setQuantite("");
    setPrix("");
    setErreurLigne({});
    setPanneau("devis");
  };

  const valider = async () => {
    if (bloque) return;
    setEnvoi(true);
    try {
      const id = await creerDevis({
        client: client?.id ?? null,
        entrepot,
        valideJusquau: validite,
        notes,
        lignes: lignes.map(({ produit, quantite: q, prixUnitaire }) => ({
          produit,
          quantite: q,
          prixUnitaire,
        })),
      });
      toast.succes("Devis créé. Il partira à la prochaine synchronisation.");
      onCree(id);
    } catch (e) {
      toast.erreur(e instanceof Error ? e.message : "Le devis n'a pas pu être enregistré.");
    } finally {
      setEnvoi(false);
    }
  };

  /** Le voile et le bouton retour reculent d'un panneau, puis ferment. */
  const reculer = () => {
    if (panneau === "devis") return onFermer();
    setChoisi(null);
    setErreurLigne({});
    setPanneau("devis");
  };

  const titre =
    panneau === "entrepot"
      ? "Entrepôt du devis"
      : panneau === "client"
      ? "Choisir un client"
      : panneau === "article"
        ? choisi
          ? choisi.nom
          : "Ajouter un article"
        : "Nouveau devis";

  return (
    <Sheet
      ouvert
      onFermer={reculer}
      titre={titre}
      retour={panneau === "devis" ? undefined : reculer}
    >
      {panneau === "entrepot" ? (
        <ListeChoix
          options={actionnables.map((e) => ({ valeur: e.id, label: e.nom }))}
          valeur={entrepot}
          onChoisir={(v) => {
            if (v) setEntrepotChoisi(v);
            setPanneau("devis");
          }}
          messageVide="Aucun entrepôt où vous pouvez agir : un entrepôt actif doit vous être affecté."
        />
      ) : panneau === "client" ? (
        <PanneauClient
          recherche={recherche}
          onRecherche={setRecherche}
          clients={clients ?? []}
          money={money}
          onChoisir={(c) => {
            setClient(c);
            setPanneau("devis");
          }}
          onRetirer={
            client
              ? () => {
                  setClient(null);
                  setPanneau("devis");
                }
              : undefined
          }
        />
      ) : panneau === "article" ? (
        choisi ? (
          <>
            <FormField label="Quantité" required error={erreurLigne.q}>
              <Input
                value={quantite}
                onChangeText={(v) => {
                  setQuantite(v);
                  if (erreurLigne.q) setErreurLigne((e) => ({ ...e, q: undefined }));
                }}
                invalid={Boolean(erreurLigne.q)}
                keyboardType="decimal-pad"
                autoFocus
              />
            </FormField>
            <FormField
              label={`Prix unitaire (${money.primaryCode})`}
              required
              error={erreurLigne.p}
              hint="Modifiable : c'est tout l'objet d'un devis."
            >
              <Input
                value={prix}
                onChangeText={(v) => {
                  setPrix(v);
                  if (erreurLigne.p) setErreurLigne((e) => ({ ...e, p: undefined }));
                }}
                invalid={Boolean(erreurLigne.p)}
                keyboardType="decimal-pad"
                leading={
                  <Text variant="caption" className="font-sans-medium">
                    {money.symbolOf(money.primaryCode)}
                  </Text>
                }
              />
            </FormField>
            <Button fullWidth size="lg" leftIcon="Plus" onPress={ajouter}>
              Ajouter au devis
            </Button>
          </>
        ) : (
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
                  : "Cherchez un article par son nom ou son code."}
              </Text>
            ) : (
              <View>
                {(articles ?? []).slice(0, 8).map((a) => (
                  <DataRow
                    key={a.id}
                    principal={a.name}
                    secondaire={a.sku}
                    valeur={
                      <Text variant="caption" numeric>
                        {money.money(Number(a.selling_price), money.primaryCode)}
                      </Text>
                    }
                    onPress={() => {
                      setChoisi({ id: a.id, nom: a.name });
                      // Le prix de vente n'est qu'un POINT DE DÉPART : un devis
                      // existe pour en proposer un autre.
                      setPrix(String(a.selling_price));
                      setQuantite("1");
                      setErreurLigne({});
                    }}
                  />
                ))}
              </View>
            )}
          </>
        )
      ) : (
        <>
          {/* Un choix unique n'est pas un choix : avec un seul entrepôt où
              agir, il part sans qu'on le demande. */}
          {actionnables.length > 1 ? (
            <FormField
              label="Entrepôt"
              hint="Le devis sera rangé dans cet entrepôt, et converti depuis lui."
            >
              <DeclencheurSelect
                libelle={nomEntrepot ?? "Choisir un entrepôt"}
                actif={Boolean(nomEntrepot)}
                accessibilityLabel="Entrepôt du devis"
                onPress={() => setPanneau("entrepot")}
              />
            </FormField>
          ) : null}

          <FormField label="Client" hint="Facultatif : un devis peut être anonyme.">
            <Button
              variant="outline"
              fullWidth
              leftIcon={client ? "User" : "Search"}
              onPress={() => {
                setRecherche("");
                setPanneau("client");
              }}
            >
              {client?.nom ?? "Choisir un client"}
            </Button>
          </FormField>

          <FormField
            label="Valable jusqu'au"
            required
            error={erreurDate}
            hint={
              erreurDate ? undefined : `Soit le ${formatDateFr(new Date(validite))}.`
            }
          >
            {/* ┌──────────────────────────────────────────────────────────┐
                │ QUATRE ÉCHÉANCES AVANT LE CHAMP, ET C'EST L'ESSENTIEL.  │
                │                                                          │
                │ Les puces couvrent d'un appui la valeur que tout le      │
                │ monde choisit ; le sélecteur reste, pour la date précise  │
                │ qu'un client a négociée. Elles restent utiles MALGRÉ le   │
                │ sélecteur : « 30 jours » est un appui, contre trois dans  │
                │ un calendrier qu'il faut d'abord ouvrir.                  │
                └──────────────────────────────────────────────────────────┘ */}
            <View className="mb-2">
              <ChipRow>
                {ECHEANCES.map((n) => {
                  const valeur = dansNJours(n);
                  return (
                    <Chip
                      key={n}
                      label={`${n} jours`}
                      actif={validite === valeur}
                      onPress={() => setValidite(valeur)}
                    />
                  );
                })}
              </ChipRow>
            </View>
            <ChampDate
              valeur={validite}
              onChange={setValidite}
              // Un devis déjà périmé à sa création : le serveur refuse de le
              // convertir, et le commerçant a proposé un prix sur un papier
              // qui ne vaut rien. Le sélecteur ferme la porte plutôt que de
              // laisser une date passée s'écrire.
              minimum={jourISO(new Date())}
              invalid={erreurDate !== undefined}
              accessibilityLabel="Date de validité du devis"
            />
          </FormField>

          <View>
            <View className="mb-2 flex-row items-center justify-between gap-3">
              <Text variant="label">{`Articles (${lignes.length})`}</Text>
              <Button
                size="sm"
                variant="outline"
                leftIcon="Plus"
                onPress={() => {
                  setRecherche("");
                  setChoisi(null);
                  setPanneau("article");
                }}
              >
                Ajouter
              </Button>
            </View>

            {lignes.length === 0 ? (
              <View className="rounded-lg border border-dashed border-border p-3">
                <Text variant="caption">
                  Aucun article proposé. Un devis sans article ne peut pas être
                  enregistré.
                </Text>
              </View>
            ) : (
              <View className="overflow-hidden rounded-lg border border-border">
                {lignes.map((l, i) => (
                  <View key={l.produit}>
                    {i > 0 ? <Divider /> : null}
                    <LigneProposee
                      ligne={l}
                      money={money}
                      onModifier={() => {
                        setChoisi({ id: l.produit, nom: l.nom });
                        setQuantite(String(l.quantite));
                        setPrix(String(l.prixUnitaire));
                        setErreurLigne({});
                        setPanneau("article");
                      }}
                      onRetirer={() =>
                        setLignes((x) => x.filter((y) => y.produit !== l.produit))
                      }
                    />
                  </View>
                ))}
                <View className="flex-row items-baseline justify-between border-t border-border bg-muted/40 px-3 py-2.5">
                  <Text variant="label">Total</Text>
                  <Text variant="body" numeric className="font-sans-medium">
                    {money.money(total, money.primaryCode)}
                  </Text>
                </View>
              </View>
            )}
          </View>

          <FormField label="Notes">
            <Input value={notes} onChangeText={setNotes} />
          </FormField>

          <Banner
            tone="info"
            title="Un devis n'engage pas le stock"
            message="La marchandise reste disponible pour quelqu'un d'autre. Elle ne sortira du stock qu'à la conversion en vente."
          />

          <Button fullWidth size="lg" disabled={bloque} loading={envoi} onPress={() => void valider()}>
            Créer le devis
          </Button>
        </>
      )}
    </Sheet>
  );
}

/**
 * Une ligne proposée : on la MODIFIE en la touchant, on la retire par sa croix.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ TOUCHER UNE LIGNE LA SUPPRIMAIT, SANS RIEN DEMANDER.                    │
 * │                                                                          │
 * │ La rangée n'avait pas de chevron - donc rien ne promettait un appui -    │
 * │ et son `onPress` retirait l'article. Le geste naturel pour corriger un   │
 * │ prix effaçait donc la ligne, en silence, et il fallait recommencer la    │
 * │ recherche. Toucher OUVRE désormais la ligne à la correction, et le       │
 * │ retrait a son propre bouton, à sa propre cible tactile.                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
function LigneProposee({
  ligne: l,
  money,
  onModifier,
  onRetirer,
}: {
  ligne: LigneSaisie;
  money: ReturnType<typeof useMonnaie>;
  onModifier: () => void;
  onRetirer: () => void;
}) {
  return (
    <View className="flex-row items-center">
      <Pressable
        onPress={onModifier}
        accessibilityRole="button"
        accessibilityLabel={`Modifier ${l.nom}`}
        className="min-w-0 flex-1 flex-row items-center gap-3 px-3 py-2.5"
        pressedClassName="active:opacity-60"
      >
        <View className="min-w-0 flex-1">
          <Text variant="bodySmall" numberOfLines={1} className="font-sans-medium">
            {l.nom}
          </Text>
          <Text variant="caption" numberOfLines={1}>
            {`${l.quantite} × ${money.money(l.prixUnitaire, money.primaryCode)}`}
          </Text>
        </View>
        <Text variant="bodySmall" numeric className="shrink-0 font-sans-medium">
          {money.money(l.quantite * l.prixUnitaire, money.primaryCode)}
        </Text>
      </Pressable>
      <Pressable
        onPress={onRetirer}
        accessibilityRole="button"
        accessibilityLabel={`Retirer ${l.nom} du devis`}
        className="h-11 w-11 items-center justify-center"
        pressedClassName="active:opacity-60"
      >
        <Icon name="X" size={16} color="mutedForeground" />
      </Pressable>
    </View>
  );
}

function PanneauClient({
  recherche,
  onRecherche,
  clients,
  money,
  onChoisir,
  onRetirer,
}: {
  recherche: string;
  onRecherche: (v: string) => void;
  clients: { id: string; name: string; current_balance?: string | number | null }[];
  money: ReturnType<typeof useMonnaie>;
  onChoisir: (c: { id: string; nom: string }) => void;
  onRetirer?: () => void;
}) {
  return (
    <>
      <SearchInput
        valeur={recherche}
        onChange={onRecherche}
        placeholder="Nom, code, téléphone..."
      />
      {onRetirer ? (
        <Button variant="outline" fullWidth leftIcon="X" onPress={onRetirer}>
          Devis sans client
        </Button>
      ) : null}
      {clients.length === 0 ? (
        <Text variant="caption">
          {recherche ? "Aucun client ne correspond." : "Cherchez un client par son nom."}
        </Text>
      ) : (
        <View>
          {clients.slice(0, 8).map((c) => (
            <DataRow
              key={c.id}
              principal={c.name}
              // `ClientPos` ne porte que ce dont le comptoir a besoin pour
              // décider d'un crédit : pas de téléphone. On montre plutôt ce
              // qui compte ici - le client doit-il déjà de l'argent.
              secondaire={
                Number(c.current_balance ?? 0) > 0
                  ? `Doit ${money.money(Number(c.current_balance), money.primaryCode)}`
                  : null
              }
              onPress={() => onChoisir({ id: c.id, nom: c.name })}
            />
          ))}
        </View>
      )}
    </>
  );
}
