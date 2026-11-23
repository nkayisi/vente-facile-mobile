/**
 * Enregistrer une dépense, dans une FEUILLE plutôt que dans un écran.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CRÉER N'EST PAS NAVIGUER.                                               │
 * │                                                                          │
 * │ Le `Fab` poussait un écran entier : la liste disparaissait, le retour    │
 * │ arrière devenait le seul moyen d'abandonner, et le caissier perdait de   │
 * │ vue ce qu'il faisait. Le Livre de caisse était le DERNIER module du      │
 * │ terminal à créer par un écran plein - devis, retour, transfert,          │
 * │ ajustement et inventaire ouvrent tous une feuille.                       │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ TROIS PANNEAUX DANS UNE SEULE FEUILLE, JAMAIS TROIS FEUILLES.           │
 * │                                                                          │
 * │ `Sheet` est un `Modal` de React Native : en empiler un second donne un   │
 * │ voile sur un voile et deux `onRequestClose` qui se disputent le bouton   │
 * │ retour d'Android. C'est aussi pourquoi l'entrepôt passe par              │
 * │ `DeclencheurSelect` + `ListeChoix` et non par `ChampSelect`, qui ouvre   │
 * │ SA propre feuille - un garde-fou de doctrine le refuse (`ui/doctrine`).  │
 * │                                                                          │
 * │ Le voile et le bouton retour RECULENT donc d'un panneau au lieu de tout  │
 * │ fermer : un geste destiné à revenir en arrière ne doit pas effacer une   │
 * │ saisie. Depuis le formulaire, ils ferment - et seulement là.             │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * **Une dépense SORT de la caisse.** Le montant est saisi positif et le sens
 * est porté par l'acte : demander un nombre signé ferait saisir des « -5000 »
 * qui augmenteraient le tiroir une fois sur deux.
 *
 * La DEVISE est celle des billets sortis, jamais une devise de référence : le
 * tiroir contient des liasses distinctes, et convertir avant d'enregistrer
 * ferait diverger le comptage du soir.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA DEMANDE SORT AU COMPTOIR, SOUS UN NUMÉRO DÉFINITIF.                  │
 * │                                                                          │
 * │ Aucun argent ne sort à la saisie : la dépense naît en brouillon, et     │
 * │ c'est le PAIEMENT qui sort les billets et imprime le reçu (depuis la    │
 * │ fiche). Ce qui sort ici est une demande, qui le dit sur le papier.       │
 * │ Hors ligne il n'y a pas de serveur : le terminal alloue son numéro dans │
 * │ une série dense par appareil, et le serveur le reprend. La demande et le │
 * │ reçu qui suivra portent ce même numéro.                                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import { useMemo, useState } from "react";

import { categoriesDepense, toutesCategoriesCaisse } from "@/data/caisse";
import { jourISO } from "@/data/dates";
import { useMonnaie } from "@/data/devises";
import { useLecture } from "@/data/live";
import { lireNombre } from "@/data/nombres";
import { creerDepense } from "@/features/caisse/actes";
import { FeuilleCategorieCaisse } from "@/features/caisse/feuille-categorie";
import { montrerConversion } from "@/features/caisse/montant-devise";
import {
  depenseSeraitInvisible,
  entrepotDeLaDepense,
  saisieSansIssue,
} from "@/features/caisse/perimetre";
import { libelleDuVerrou } from "@/features/perimetre/filtre-perimetre";
import { useEntrepotsDuMembre } from "@/features/perimetre/use-entrepots";
import { moyensDePaiement } from "@/features/pos/donnees";
import { chromeDeLaSession } from "@/features/pos/ticket";
import { demandeDeDepense } from "@/features/caisse/papiers-depense";
import { imprimerDemandeDeDepense } from "@/printing/jobs";
import { useSession } from "@/session/provider";
import {
  Banner, Button, ChampDate, ChampMontant, Chip, ChipRow, DeclencheurSelect,
  FormField, Input, ListeChoix, Sheet, Text, useToast, type OptionSelect,
} from "@/ui";

type Panneau = "depense" | "entrepot" | "categorie";

/**
 * ⚠ Elle se monte à l'OUVERTURE, et c'est ce qui la remet à neuf. L'appelant la
 * rend CONDITIONNELLEMENT plutôt que de lui passer un booléen : chaque
 * ouverture est un montage, donc un état vierge, sans effet de remise à zéro à
 * tenir en phase avec les champs qu'on ajoutera.
 */
export function FeuilleNouvelleDepense({
  onFermer,
  onCree,
}: {
  onFermer: () => void;
  /** La dépense est au journal : à l'appelant d'ouvrir sa fiche s'il le veut. */
  onCree: (id: string, reference: string) => void;
}) {
  const toast = useToast();
  const money = useMonnaie();
  const { snapshot } = useSession();
  const devises = snapshot?.currencies ?? [];
  const principale = money.primaryCode;
  // Le membre et ses entrepôts viennent d'UN seul endroit : les saisies n'y
  // prennent que les ACTIONNABLES, jamais toute la table locale.
  const { membre, tous, actionnables, verrouAction } = useEntrepotsDuMembre();

  const [panneau, setPanneau] = useState<Panneau>("depense");
  const [categorieChoisie, setCategorie] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [montant, setMontant] = useState("");
  const [devise, setDevise] = useState(principale);
  const [date, setDate] = useState(() => jourISO(new Date()));
  /**
   * `undefined` : le marchand n'a pas tranché, on propose le défaut.
   * `null` : il a explicitement choisi « aucun entrepôt ».
   *
   * Les distinguer est ce qui permet de dériver le défaut sans effet - un
   * `setState` dans un effet est un rendu de plus et un ordre à défendre, pour
   * une question qui n'est qu'une dérivation.
   */
  const [entrepotChoisi, setEntrepot] = useState<string | null | undefined>(undefined);
  const [beneficiaire, setBeneficiaire] = useState("");
  const [methode, setMethode] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [envoi, setEnvoi] = useState(false);

  const { donnees: categories } = useLecture(categoriesDepense, {
    tables: ["expense_categories", "outbox_operations"],
  });
  const chargerToutes = useMemo(() => () => toutesCategoriesCaisse("depense"), []);
  const { donnees: toutesRubriques } = useLecture(chargerToutes, {
    tables: ["expense_categories", "outbox_operations"],
  });
  const { donnees: moyens } = useLecture(moyensDePaiement, {
    tables: ["payment_methods"],
  });
  const sansIssue = saisieSansIssue(membre, tous);

  // Une catégorie unique n'est pas un choix : elle se propose d'elle-même.
  const categorie =
    categorieChoisie ?? (categories?.length === 1 ? categories[0].id : null);

  // L'entrepôt se propose parmi les ACTIONNABLES, jamais dans toute la table :
  // un entrepôt hors périmètre d'action est refusé par le serveur, donc mis en
  // quarantaine, à chaque dépense.
  const entrepot =
    entrepotChoisi === undefined ? entrepotDeLaDepense(membre, tous) : entrepotChoisi;

  const lecture = lireNombre(montant);
  const somme = lecture.ok ? (lecture.valeur ?? 0) : 0;
  const refusMontant = !lecture.ok
    ? lecture.motif === "negatif"
      ? "Une dépense se saisit en positif : elle sort de la caisse par nature."
      : "Montant illisible. Chiffres, et une seule virgule."
    : undefined;
  const bloque =
    envoi || sansIssue || !lecture.ok || !categorie ||
    description.trim().length === 0 || somme <= 0 || !date;

  const repere = useMemo(() => {
    if (!montrerConversion(montant, devise, principale, devises.length)) return undefined;
    return `= ${money.money(money.convMoney(somme, devise, principale), principale)} · ${money.rateLabel(devise, principale)}`;
  }, [montant, devise, principale, devises.length, somme, money]);

  const optionsEntrepot: OptionSelect[] = useMemo(
    () => actionnables.map((d) => ({ valeur: d.id, label: d.nom })),
    [actionnables]
  );
  const nomEntrepot =
    optionsEntrepot.find((o) => o.valeur === entrepot)?.label ??
    "Aucun (charge d'établissement)";

  const valider = async () => {
    if (bloque || !categorie) return;
    setEnvoi(true);
    try {
      const { id, reference } = await creerDepense({
        categorie,
        description,
        // Le montant part en CHAÎNE : un montant en CDF à sept chiffres perd
        // ses unités en virgule flottante.
        montant: String(somme),
        devise,
        date,
        entrepot,
        beneficiaire,
        methode,
        notes,
        deviceCode: snapshot?.device?.device_code ?? null,
      });

      // ┌──────────────────────────────────────────────────────────────────┐
      // │ ON IMPRIME APRÈS L'ENREGISTREMENT, comme le back-office.         │
      // │                                                                  │
      // │ La DEMANDE, pas le reçu : rien n'est encore sorti du tiroir. Elle│
      // │ ne se range pas (doctrine de la proforma : elle ne prouve aucune │
      // │ sortie), et se réimprime depuis la fiche. Un échec d'impression  │
      // │ ne défait PAS la dépense.                                        │
      // └──────────────────────────────────────────────────────────────────┘
      try {
        await imprimerDemandeDeDepense(
          demandeDeDepense({
            reference,
            chrome: chromeDeLaSession(snapshot),
            demandeur: snapshot?.user.full_name,
            categorie: (categories ?? []).find((c) => c.id === categorie)?.nom,
            beneficiaire: beneficiaire.trim(),
            montant: somme,
            devise,
            description: description.trim(),
            le: new Date(),
          })
        );
        toast.succes(`Dépense ${reference} enregistrée. Demande envoyée à l'imprimante.`);
      } catch {
        toast.succes(
          `Dépense ${reference} enregistrée. La demande n'a pas pu être imprimée : réessayez depuis sa fiche.`
        );
      }
      onCree(id, reference);
      onFermer();
    } catch (e) {
      toast.erreur(e instanceof Error ? e.message : "La dépense n'a pas pu être enregistrée.");
    } finally {
      setEnvoi(false);
    }
  };

  if (panneau === "categorie") {
    return (
      <FeuilleCategorieCaisse
        cible={{ mode: "creation", genre: "depense" }}
        connues={toutesRubriques ?? []}
        onFermer={onFermer}
        retour={() => setPanneau("depense")}
        onEnregistre={(id) => {
          // Présélectionnée : la créer pour devoir ensuite la chercher dans la
          // rangée serait un geste de plus pour rien.
          setCategorie(id);
          setPanneau("depense");
        }}
      />
    );
  }

  if (panneau === "entrepot") {
    return (
      <Sheet
        ouvert
        onFermer={onFermer}
        titre="Entrepôt"
        retour={() => setPanneau("depense")}
      >
        <ListeChoix
          options={optionsEntrepot}
          valeur={entrepot}
          onChoisir={(v) => {
            setEntrepot(v);
            setPanneau("depense");
          }}
          // Le propriétaire peut n'en attacher aucun : c'est le seul moyen
          // d'enregistrer un loyer ou un salaire, et le serveur lui réserve ces
          // charges-là. Pour un rôle borné, le bandeau du formulaire dit ce que
          // ça coûte.
          libelleVide="Aucun (charge d'établissement)"
        />
      </Sheet>
    );
  }

  return (
    <Sheet ouvert onFermer={onFermer} titre="Nouvelle dépense"
      pied={
        <Button fullWidth size="lg" disabled={bloque} loading={envoi} onPress={() => void valider()}>
          Enregistrer et imprimer la demande
        </Button>
      }>
      {/* ┌──────────────────────────────────────────────────────────────┐
          │ UN RÔLE BORNÉ SANS AFFECTATION NE PEUT PAS SAISIR UTILEMENT. │
          │                                                              │
          │ `ExpenseViewSet.get_queryset` borne les gérants et les       │
          │ magasiniers par entrepôt, `include_null_warehouse=False` :   │
          │ sans affectation, tout ce qu'il enregistrerait lui           │
          │ deviendrait invisible à l'envoi. On le DIT plutôt que de     │
          │ laisser saisir une pièce que personne ne reverra.            │
          └──────────────────────────────────────────────────────────────┘ */}
      {sansIssue ? (
        <Banner
          tone="warning"
          // Deux causes, deux remèdes : rien d'affecté, ou seulement des
          // entrepôts désactivés. Le motif vient du noyau.
          title={
            verrouAction === "entrepot-inactif"
              ? "Votre entrepôt est désactivé"
              : "Aucun entrepôt ne vous est assigné"
          }
          message={`Une dépense sans entrepôt ne vous serait plus visible après envoi. ${libelleDuVerrou(
            verrouAction ?? "aucun-entrepot"
          )}`}
        />
      ) : null}

      <FormField label="Catégorie" required>
        <ChipRow>
          {(categories ?? []).map((c) => (
            <Chip
              key={c.id}
              label={c.enFile ? `${c.nom} ·` : c.nom}
              pastille={c.couleur}
              actif={categorie === c.id}
              onPress={() => setCategorie(c.id)}
            />
          ))}
          {/* Sans ce bouton, une catégorie manquante bloque la dépense jusqu'au
              prochain passage sur ordinateur - et sortir d'ici, c'est perdre
              le montant qu'on vient de taper. */}
          <Chip label="+ Nouvelle" icon="Plus" onPress={() => setPanneau("categorie")} />
        </ChipRow>
      </FormField>

      <ChampMontant
        valeur={montant}
        onChangeValeur={setMontant}
        devise={devise}
        onChangeDevise={(code, converti) => {
          setDevise(code);
          setMontant(converti);
        }}
        devises={devises.map((d) => ({ code: d.currency_code, symbole: d.currency_symbol }))}
        conversion={{ convertir: money.convMoney, decimales: money.decimalsOf }}
        principale={principale}
        repere={repere}
        erreur={refusMontant}
      />

      <FormField label="Description" required>
        <Input
          value={description}
          onChangeText={setDescription}
          placeholder="Transport, électricité, fournitures…"
        />
      </FormField>

      <FormField label="Bénéficiaire">
        <Input
          value={beneficiaire}
          onChangeText={setBeneficiaire}
          placeholder="Nom du bénéficiaire"
        />
      </FormField>

      {/* ┌──────────────────────────────────────────────────────────────┐
          │ LA DATE SE CHOISIT : C'EST CELLE DU CONSTAT.                 │
          │                                                              │
          │ Une dépense notée samedi soir et saisie dimanche             │
          │ appartiendrait au dimanche, et le rapport de caisse la       │
          │ rangerait au mauvais jour. AUCUNE borne haute : le           │
          │ back-office n'en met pas, et un loyer noté pour le 1er du    │
          │ mois prochain est légitime.                                  │
          └──────────────────────────────────────────────────────────────┘ */}
      <FormField label="Date" required>
        <ChampDate valeur={date} onChange={setDate} accessibilityLabel="Date de la dépense" />
      </FormField>

      {/* Un choix unique n'est pas un choix : avec un seul entrepôt
          accessible, il part sans qu'on le demande. */}
      {optionsEntrepot.length > 1 ? (
        <FormField
          label="Entrepôt"
          hint="Elle sera visible par les responsables de cet entrepôt."
        >
          <DeclencheurSelect
            libelle={nomEntrepot}
            actif={entrepot !== null}
            onPress={() => setPanneau("entrepot")}
            accessibilityLabel="Entrepôt"
          />
        </FormField>
      ) : null}

      {depenseSeraitInvisible(membre, entrepot) && !sansIssue ? (
        <Banner
          tone="warning"
          title="Sans entrepôt, vous ne reverrez pas cette dépense"
          message="Les charges d'établissement sans entrepôt sont réservées au propriétaire. Choisissez un entrepôt pour la retrouver dans votre liste."
        />
      ) : null}

      {(moyens?.length ?? 0) > 1 ? (
        <FormField label="Moyen de paiement">
          <ChipRow>
            {(moyens ?? []).map((m) => (
              <Chip
                key={m.id}
                label={m.name}
                actif={methode === m.id}
                onPress={() => setMethode(methode === m.id ? null : m.id)}
              />
            ))}
          </ChipRow>
        </FormField>
      ) : null}

      <FormField label="Notes">
        <Input
          value={notes}
          onChangeText={setNotes}
          placeholder="Notes supplémentaires…"
          multiline
          numberOfLines={2}
        />
      </FormField>
      <Text variant="caption">
        La dépense part en brouillon. L&apos;argent sortira de la caisse au paiement,
        contre le reçu de dépense : c&apos;est lui qui entre dans le rapport de caisse
        et dans le solde attendu à la clôture.
      </Text>
    </Sheet>
  );
}
