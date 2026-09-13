/**
 * Créer ou modifier une catégorie, une marque ou une unité.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN SEUL `Sheet`, DES PANNEAUX QU'ON ÉCHANGE.                            │
 * │                                                                          │
 * │ `Sheet` est un `Modal` : en empiler un second donne un voile sur un      │
 * │ voile et deux `onRequestClose` qui se disputent le bouton retour         │
 * │ d'Android. Le formulaire et le choix du parent vivent donc dans la MÊME  │
 * │ feuille, et le bouton de retour RECULE d'un panneau au lieu de tout      │
 * │ fermer. C'est aussi pourquoi le champ de choix pose `DeclencheurSelect`  │
 * │ et non `ChampSelect`, qui porte sa propre feuille.                       │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * **Un composant, deux modes.** Ce sont les mêmes champs : deux composants
 * seraient deux endroits où tenir la règle d'unicité en phase, et deux endroits
 * où ajouter `description` le jour où on le voudra.
 *
 * **Montage conditionnel, `ouvert` en dur.** Chaque ouverture est un montage,
 * donc un état vierge, sans effet de remise à zéro à tenir en phase avec les
 * champs. Ici cela pèse : un ensemencement périmé renommerait la MAUVAISE fiche.
 */
import { useState } from "react";

import type { EntreeReferentiel } from "@/data/articles";
import {
  Button, DeclencheurSelect, FormField, Input, ListeChoix, SearchInput, Sheet,
  Switch, useToast,
} from "@/ui";

import { creerReferentiel, modifierReferentiel } from "./actes";
import {
  optionsDeParent,
  slugDisponible,
  verifierReferentiel,
  type ErreursReferentiel,
  type GenreReferentiel,
  type SaisieReferentiel,
} from "./referentiel";

export type CibleReferentiel =
  | { mode: "creation"; genre: GenreReferentiel }
  | { mode: "edition"; genre: GenreReferentiel; fiche: EntreeReferentiel };

const SINGULIER: Record<GenreReferentiel, string> = {
  categories: "catégorie",
  marques: "marque",
  unites: "unité",
};

const ACCORD: Record<GenreReferentiel, string> = {
  categories: "Catégorie",
  marques: "Marque",
  unites: "Unité",
};

/** Le panneau ouvert par-dessus le formulaire. */
type Panneau = "formulaire" | "parent";

export function FeuilleReferentiel({
  cible,
  connues,
  enFile,
  onFermer,
  onEnregistre,
}: {
  cible: CibleReferentiel;
  /** Tout ce qui existe déjà pour ce genre, journal COMPRIS. */
  connues: EntreeReferentiel[];
  /** Les fiches encore dans le journal : elles décident des dépendances. */
  enFile: Set<string>;
  onFermer: () => void;
  onEnregistre: () => void;
}) {
  const toast = useToast();
  const { genre } = cible;
  const depart = cible.mode === "edition" ? cible.fiche : null;

  const [nom, setNom] = useState(depart?.nom ?? "");
  const [symbole, setSymbole] = useState(depart?.symbole ?? "");
  const [parent, setParent] = useState<string | null>(depart?.parentId ?? null);
  const [actif, setActif] = useState(depart?.actif ?? true);
  const [erreurs, setErreurs] = useState<ErreursReferentiel>({});
  const [panneau, setPanneau] = useState<Panneau>("formulaire");
  const [recherche, setRecherche] = useState("");
  const [envoi, setEnvoi] = useState(false);

  const saisie: SaisieReferentiel = { genre, nom, symbole, parent, actif };
  const edite = cible.mode === "edition" ? cible.fiche.id : null;

  const parents = optionsDeParent(connues, edite, depart?.parentId ?? null, recherche);
  const nomDuParent = parent ? connues.find((c) => c.id === parent)?.nom : null;

  const valider = async () => {
    if (envoi) return;
    const fautes = verifierReferentiel(saisie, connues, edite);
    setErreurs(fautes);
    if (Object.keys(fautes).length > 0) return;

    setEnvoi(true);
    try {
      // Le parent encore en file doit partir AVANT son enfant : sans la
      // dépendance, un parent refusé fait partir l'enfant avec un identifiant
      // qui n'existe pas.
      const dependDe = [
        ...(edite && enFile.has(edite) ? [edite] : []),
        ...(genre === "categories" && parent && enFile.has(parent) ? [parent] : []),
      ];

      if (cible.mode === "edition") {
        await modifierReferentiel(cible.fiche.id, saisie, { dependDe });
      } else {
        const prises = connues.map((c) => c.slug).filter(Boolean) as string[];
        await creerReferentiel(saisie, slugDisponible(nom, prises), { dependDe });
      }
      toast.succes(
        `${ACCORD[genre]} ${cible.mode === "edition" ? "modifiée" : "créée"}. ` +
          "Elle partira à la prochaine synchronisation."
      );
      onEnregistre();
    } catch (e) {
      toast.erreur(
        e instanceof Error ? e.message : "L'enregistrement a échoué."
      );
    } finally {
      setEnvoi(false);
    }
  };

  /** Le voile et le bouton retour reculent d'un panneau, puis ferment. */
  const reculer = () => {
    if (panneau !== "formulaire") {
      // Le terme s'efface en reculant : rouvrir le panneau sur une recherche
      // oubliée ferait chercher pourquoi une catégorie a disparu.
      setRecherche("");
      return setPanneau("formulaire");
    }
    onFermer();
  };

  const titre =
    panneau === "parent"
      ? "Catégorie parente"
      : cible.mode === "edition"
        ? `Modifier la ${SINGULIER[genre]}`
        : `Nouvelle ${SINGULIER[genre]}`;

  return (
    <Sheet
      ouvert
      onFermer={reculer}
      titre={titre}
      retour={panneau === "formulaire" ? undefined : reculer}
    >
      {panneau === "parent" ? (
        <>
          <SearchInput
            valeur={recherche}
            onChange={setRecherche}
            placeholder="Rechercher une catégorie..."
          />
          <ListeChoix
            options={parents}
            valeur={parent}
            onChoisir={(v) => {
              setParent(v);
              if (erreurs.parent) setErreurs({ ...erreurs, parent: undefined });
              setRecherche("");
              setPanneau("formulaire");
            }}
            // « Aucune » ne se propose que HORS recherche : personne ne tape un
            // nom pour détacher, et la garder ferait une ligne qui ne
            // correspond à aucun terme.
            libelleVide={recherche.trim() ? undefined : "Aucune (catégorie racine)"}
            messageVide={
              recherche.trim()
                ? `Aucune catégorie ne correspond à « ${recherche.trim()} ».`
                : "Aucune autre catégorie ne peut l'accueillir."
            }
          />
        </>
      ) : (
        <>
          <FormField label="Nom" required error={erreurs.nom}>
            <Input
              value={nom}
              onChangeText={(v) => {
                setNom(v);
                if (erreurs.nom) setErreurs({ ...erreurs, nom: undefined });
              }}
              invalid={Boolean(erreurs.nom)}
              // À la MODIFICATION, un champ prérempli plus le clavier
              // masqueraient l'interrupteur d'activité.
              autoFocus={cible.mode === "creation"}
            />
          </FormField>

          {genre === "unites" ? (
            <FormField
              label="Symbole"
              required
              error={erreurs.symbole}
              hint="Ce qui s'imprime sur un ticket : kg, L, pce."
            >
              <Input
                value={symbole}
                onChangeText={(v) => {
                  setSymbole(v);
                  if (erreurs.symbole) setErreurs({ ...erreurs, symbole: undefined });
                }}
                invalid={Boolean(erreurs.symbole)}
                maxLength={10}
              />
            </FormField>
          ) : null}

          {genre === "categories" ? (
            <FormField label="Catégorie parente" error={erreurs.parent}>
              <DeclencheurSelect
                libelle={nomDuParent ?? "Aucune (catégorie racine)"}
                actif={Boolean(parent)}
                invalid={Boolean(erreurs.parent)}
                accessibilityLabel="Catégorie parente"
                onPress={() => setPanneau("parent")}
              />
            </FormField>
          ) : null}

          {/* Une UNITÉ n'a pas de drapeau d'activité : en dessiner un
              promettrait ce que le serveur ne tient pas. */}
          {genre === "unites" ? null : (
            <Switch
              valeur={actif}
              onChange={setActif}
              label="Actif"
              aide={`Une ${SINGULIER[genre]} inactive n'est plus proposée à la création d'un article.`}
            />
          )}

          <Button
            fullWidth
            size="lg"
            // `disabled` UNIQUEMENT pendant l'envoi : un appui doit RÉPONDRE
            // par un message sous le champ fautif plutôt que de ne rien faire.
            disabled={envoi}
            loading={envoi}
            onPress={() => void valider()}
          >
            {cible.mode === "edition" ? "Enregistrer" : "Créer"}
          </Button>
        </>
      )}
    </Sheet>
  );
}
