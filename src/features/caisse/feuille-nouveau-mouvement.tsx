/**
 * Entrée ou sortie de caisse, hors vente. Dans une FEUILLE.
 *
 * Miroir du dialogue « Nouvelle entrée de caisse » de
 * `app/dashboard/cashbook/page.tsx`, avec le SENS en plus.
 *
 * ⚠ NE PAS CONFONDRE avec `feuille-mouvement.tsx`, qui rend le DÉTAIL d'un
 * mouvement déjà enregistré. Celle-ci le crée.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE SENS EST CHOISI, JAMAIS DÉDUIT D'UN SIGNE.                           │
 * │                                                                          │
 * │ Un écran qui demanderait un nombre signé ferait saisir des « -5000 » qui │
 * │ augmenteraient le tiroir une fois sur deux, et l'erreur ne se verrait    │
 * │ qu'au comptage du soir.                                                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ Le back-office ne sait créer qu'une ENTRÉE (`direction: "in"` et
 * `movement_type: "other_in"` codés en dur). Le terminal garde les deux sens,
 * et c'est un sur-ensemble assumé : un retrait de fonds n'est pas une dépense,
 * et sans lui il n'a aucune route - ni ici, ni au navigateur.
 *
 * ⚠ DEUX PANNEAUX, JAMAIS DEUX FEUILLES : `Sheet` est un `Modal`, et en
 * empiler un second donne un voile sur un voile. La création de rubrique
 * échange donc le CONTENU de cette feuille, et son geste de retour recule d'un
 * panneau au lieu d'effacer la saisie.
 */
import { useMemo, useState } from "react";

import { categoriesDepense, categoriesRecette, toutesCategoriesCaisse } from "@/data/caisse";
import { useMonnaie } from "@/data/devises";
import { useLecture } from "@/data/live";
import { lireNombre } from "@/data/nombres";
import { creerMouvementCaisse } from "@/features/caisse/actes";
import { FeuilleCategorieCaisse } from "@/features/caisse/feuille-categorie";
import { montrerConversion } from "@/features/caisse/montant-devise";
import { sessionOuverte } from "@/features/pos/caisse";
import { useSession } from "@/session/provider";
import {
  Banner, Button, ChampMontant, DeclencheurSelect, FormField, Input, ListeChoix,
  Segmented, Sheet, useToast, type OptionSelect,
} from "@/ui";

type Sens = "in" | "out";

/**
 * Trois panneaux, une seule feuille.
 *
 * `choix` liste les rubriques, `creation` en fabrique une. Les séparer plutôt
 * que d'empiler un `Modal` sur un autre est la règle du dépôt ; et la création
 * s'atteint DEPUIS la liste, parce que c'est là qu'on découvre que la rubrique
 * manque.
 */
type Panneau = "mouvement" | "choix" | "creation";

export function FeuilleNouveauMouvement({ onFermer }: { onFermer: () => void }) {
  const toast = useToast();
  const money = useMonnaie();
  const { snapshot } = useSession();
  const devises = snapshot?.currencies ?? [];
  const principale = money.primaryCode;

  /**
   * L'instant du geste, figé à l'OUVERTURE.
   *
   * Le back-office capture le sien à l'ouverture de sa boîte de dialogue. La
   * différence n'est pas cosmétique hors ligne : un caissier qui commence à
   * 23 h 55 et valide à 00 h 02 rangerait son apport au mauvais jour, dans un
   * cadran borné à aujourd'hui. `useState` à initialisation PARESSEUSE, et non
   * `new Date()` en plein rendu, qui serait une impureté.
   */
  const [instant] = useState(() => new Date().toISOString());

  const [panneau, setPanneau] = useState<Panneau>("mouvement");
  const [sens, setSens] = useState<Sens>("in");
  const [montant, setMontant] = useState("");
  const [devise, setDevise] = useState(principale);
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [categorie, setCategorie] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  const { donnees: recettes } = useLecture(categoriesRecette, {
    tables: ["income_categories", "outbox_operations"],
  });
  const { donnees: depenses } = useLecture(categoriesDepense, {
    tables: ["expense_categories", "outbox_operations"],
  });
  const { donnees: session } = useLecture(sessionOuverte, {
    tables: ["register_sessions", "outbox_operations"],
  });

  const genre = sens === "in" ? ("recette" as const) : ("depense" as const);
  const chargerToutes = useMemo(() => () => toutesCategoriesCaisse(genre), [genre]);
  const { donnees: toutesRubriques } = useLecture(chargerToutes, {
    tables:
      genre === "recette"
        ? ["income_categories", "outbox_operations"]
        : ["expense_categories", "outbox_operations"],
    deps: [genre],
  });

  const categories = sens === "in" ? recettes : depenses;
  const libelleChamp = sens === "in" ? "Type d'entrée" : "Catégorie";

  /**
   * ⚠ La pastille voyage AVEC l'option. C'est elle qui permet de retrouver
   * « Carburant » d'un coup d'oeil, et c'est pour cela qu'on fait choisir une
   * couleur à la création. Le point médian d'une rubrique encore en file est
   * repris tel quel des anciennes puces.
   */
  const optionsCategorie: OptionSelect[] = useMemo(
    () =>
      (categories ?? []).map((c) => ({
        valeur: c.id,
        label: c.enFile ? `${c.nom} ·` : c.nom,
        couleur: c.couleur,
      })),
    [categories]
  );
  const libelleCategorie =
    optionsCategorie.find((o) => o.valeur === categorie)?.label ?? "Aucune";

  const lecture = lireNombre(montant);
  const somme = lecture.ok ? (lecture.valeur ?? 0) : 0;
  const refusMontant = !lecture.ok
    ? lecture.motif === "negatif"
      ? "Un mouvement se saisit en positif : c'est le SENS qui dit s'il entre ou sort."
      : "Montant illisible. Chiffres, et une seule virgule."
    : undefined;
  const bloque =
    envoi || !lecture.ok || somme <= 0 || description.trim().length === 0;

  const repere = useMemo(() => {
    if (!montrerConversion(montant, devise, principale, devises.length)) return undefined;
    return `= ${money.money(money.convMoney(somme, devise, principale), principale)} · ${money.rateLabel(devise, principale)}`;
  }, [montant, devise, principale, devises.length, somme, money]);

  const valider = async () => {
    if (bloque) return;
    setEnvoi(true);
    try {
      await creerMouvementCaisse({
        sens,
        // Le montant part en CHAÎNE, tel que le champ le porte : le reformater
        // en nombre lui ferait perdre ses unités sur sept chiffres.
        montant: String(somme),
        devise,
        description,
        notes,
        categorieRecette: sens === "in" ? categorie : null,
        categorieDepense: sens === "out" ? categorie : null,
        instant,
        // La session n'est PAS envoyée : le serveur la résout depuis la session
        // ouverte de l'utilisateur, comme il le fait pour le back-office. Elle
        // rattache le mouvement à une caisse, donc à un entrepôt, donc au
        // périmètre de visibilité des magasiniers - et un client qui la
        // désignerait pourrait viser celle d'un autre.
      });
      toast.succes("Mouvement enregistré. Il partira à la prochaine synchronisation.");
      onFermer();
    } catch (e) {
      toast.erreur(e instanceof Error ? e.message : "Le mouvement n'a pas pu être enregistré.");
    } finally {
      setEnvoi(false);
    }
  };

  if (panneau === "creation") {
    return (
      <FeuilleCategorieCaisse
        cible={{ mode: "creation", genre }}
        connues={toutesRubriques ?? []}
        onFermer={onFermer}
        retour={() => setPanneau("choix")}
        onEnregistre={(id) => {
          // Présélectionnée, et on retourne AU FORMULAIRE : la créer pour
          // devoir ensuite la rechercher dans la liste serait un geste de plus
          // pour rien.
          setCategorie(id);
          setPanneau("mouvement");
        }}
      />
    );
  }

  if (panneau === "choix") {
    return (
      <Sheet
        ouvert
        onFermer={onFermer}
        titre={libelleChamp}
        retour={() => setPanneau("mouvement")}
      >
        <ListeChoix
          options={optionsCategorie}
          valeur={categorie}
          onChoisir={(v) => {
            setCategorie(v);
            setPanneau("mouvement");
          }}
          // La rubrique est FACULTATIVE : le serveur l'accepte nulle, et le
          // back-office n'en impose pas non plus sur une sortie.
          libelleVide="Aucune"
          messageVide="Aucune rubrique pour l'instant."
        />
        {/* La création s'atteint D'ICI, et c'est le bon endroit : on découvre
            qu'une rubrique manque en parcourant la liste, pas avant de
            l'ouvrir. */}
        <Button
          variant="outline"
          fullWidth
          leftIcon="Plus"
          onPress={() => setPanneau("creation")}
        >
          {genre === "recette" ? "Nouveau type d'entrée" : "Nouvelle catégorie"}
        </Button>
      </Sheet>
    );
  }

  return (
    <Sheet ouvert onFermer={onFermer} titre="Nouveau mouvement">
      <FormField label="Sens" required>
        <Segmented
          options={[
            { valeur: "in", label: "Entrée", icon: "ArrowDownRight" },
            { valeur: "out", label: "Sortie", icon: "ArrowUpRight" },
          ]}
          valeur={sens}
          onChange={(v) => {
            setSens(v as Sens);
            setCategorie(null);
          }}
        />
      </FormField>

      {/* ┌──────────────────────────────────────────────────────────────┐
          │ LE CHAMP NE DISPARAÎT PAS QUAND LA LISTE EST VIDE.           │
          │                                                              │
          │ C'est justement là qu'il faut pouvoir CRÉER la rubrique      │
          │ manquante : sortir d'ici, c'est perdre le montant qu'on      │
          │ vient de taper.                                              │
          └──────────────────────────────────────────────────────────────┘ */}
      {/* ⚠ UN DÉCLENCHEUR, PAS UN `ChampSelect` : celui-ci ouvre SA propre
          feuille, et `Sheet` est un `Modal` qu'on n'empile pas. Un garde-fou
          de doctrine le refuse (`ui/doctrine.test.ts`). */}
      <FormField label={libelleChamp}>
        <DeclencheurSelect
          libelle={libelleCategorie}
          actif={categorie !== null}
          onPress={() => setPanneau("choix")}
          accessibilityLabel={libelleChamp}
        />
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
          placeholder={sens === "in" ? "Apport de fonds…" : "Retrait, avance…"}
        />
      </FormField>

      {/* Le back-office porte des notes depuis toujours : c'est là qu'on écrit
          le numéro du bordereau ou le nom de celui qui a apporté l'argent. */}
      <FormField label="Notes">
        <Input
          value={notes}
          onChangeText={setNotes}
          placeholder="Notes supplémentaires…"
          multiline
          numberOfLines={2}
        />
      </FormField>

      {session ? (
        <Banner
          tone="info"
          title={`Rattaché à la session ${session.registerName}`}
          message="Le mouvement entrera dans le solde attendu à la clôture."
        />
      ) : (
        <Banner
          tone="warning"
          title="Aucune session ouverte"
          // ⚠ La seconde phrase n'est pas du zèle : `CashMovementViewSet` borne
          // les gérants et magasiniers par la vente, la dépense ou la SESSION
          // liée. Un mouvement manuel sans session n'a rien qui le rattache à
          // un entrepôt, et devient invisible à tous sauf au propriétaire - y
          // compris à son auteur.
          message="Le mouvement n'entrera dans aucun Z de caisse, et seul le propriétaire pourra le retrouver. Ouvrez votre caisse d'abord."
        />
      )}

      <Button fullWidth size="lg" disabled={bloque} loading={envoi} onPress={() => void valider()}>
        Enregistrer le mouvement
      </Button>
    </Sheet>
  );
}
