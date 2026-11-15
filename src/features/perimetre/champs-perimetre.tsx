/**
 * Les deux champs de périmètre, posables dans n'importe quelle feuille de filtres.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN CHAMP QU'ON NE PEUT PAS CHANGER NE S'AFFICHE PAS (2026-11-15).       │
 * │                                                                          │
 * │ Les champs fermés « qui disent pourquoi » ont été retirés, sur décision  │
 * │ de l'utilisateur : un caissier sans case n'a rien à choisir, et un       │
 * │ composant de filtre qui ne lui propose rien ne lui apprend rien.         │
 * │                                                                          │
 * │ - Entrepôt : le propriétaire, et « Consulter tous les entrepôts ».       │
 * │ - Utilisateur : « Voir tout dans son entrepôt » (ou ce qui l'implique),  │
 * │   et seulement sur une donnée qui a un auteur.                           │
 * │                                                                          │
 * │ La décision est dans `offreDePerimetre` (`champEntrepot`,                │
 * │ `champUtilisateur`), d'après le noyau : le back-office (`PerimeterFilters`)│
 * │ applique la même. Ce composant ne fait que la lire.                      │
 * │                                                                          │
 * │ ⚠ MASQUER N'EST PAS LEVER : le périmètre appliqué garde ses verrous, et  │
 * │ le serveur borne toujours.                                               │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ Il ne rend AUCUNE `Sheet` : il reçoit le `setChoix` de la feuille hôte.
 * `Sheet` est un `Modal`, et en empiler un second donne un voile sur un voile
 * plus deux `onRequestClose` qui se disputent le bouton retour d'Android.
 */
import { DeclencheurSelect, FormField, type DemandeChoix } from "@/ui";

import {
  libelleDuVerrou,
  type FiltrePerimetre,
  type OffrePerimetre,
} from "./filtre-perimetre";

/* ┌──────────────────────────────────────────────────────────────────────────┐
   │ LA MÊME PHRASE SUR LE DÉCLENCHEUR ET SUR LA PREMIÈRE LIGNE DE LA LISTE. │
   │                                                                          │
   │ Ces deux chaînes servent DEUX fois chacune : en texte indicatif quand     │
   │ rien n'est choisi, et en entrée « aucun choix » une fois qu'une valeur    │
   │ l'est. Les écrire deux fois, c'est se donner rendez-vous pour qu'elles    │
   │ divergent - et la ligne qu'on touche doit lire exactement ce que lisait   │
   │ le déclencheur fermé, sinon on ne sait pas qu'on revient au point de      │
   │ départ.                                                                  │
   │                                                                          │
   │ ⚠ UN CHAMP AFFICHÉ PEUT ENCORE ÊTRE FERMÉ (rôle inconnu, liste           │
   │ d'utilisateurs pas encore reçue) : `disabled` ferme alors le déclencheur, │
   │ donc la sentinelle « Tous » est hors d'atteinte.                         │
   └──────────────────────────────────────────────────────────────────────────┘ */
const TOUS_ENTREPOTS = "Tous les entrepôts";
const TOUS_UTILISATEURS = "Tous les utilisateurs";

export function ChampsPerimetre({
  offre,
  valeur,
  onChanger,
  setChoix,
}: {
  offre: OffrePerimetre;
  valeur: FiltrePerimetre;
  onChanger: (f: FiltrePerimetre) => void;
  setChoix: (d: DemandeChoix | null) => void;
}) {
  const nomEntrepot = offre.entrepots.find(
    (o) => o.valeur === offre.applique.entrepot
  )?.label;
  const nomUtilisateur = offre.utilisateurs.find(
    (o) => o.valeur === offre.applique.utilisateur
  )?.label;

  return (
    <>
      {offre.champEntrepot ? (
        <FormField
          label="Entrepôt"
          hint={
            offre.entrepotVerrouille
              ? libelleDuVerrou(offre.entrepotVerrouille)
              : undefined
          }
        >
          <DeclencheurSelect
            libelle={nomEntrepot ?? TOUS_ENTREPOTS}
            actif={Boolean(nomEntrepot) && !offre.entrepotVerrouille}
            disabled={Boolean(offre.entrepotVerrouille)}
            accessibilityLabel="Entrepôt"
            onPress={() =>
              setChoix({
                titre: "Entrepôt",
                options: offre.entrepots,
                valeur: valeur.entrepot,
                onChoisir: (v) => onChanger({ ...valeur, entrepot: v }),
                libelleVide: TOUS_ENTREPOTS,
                messageVide:
                  "Aucun entrepôt n'est encore descendu sur ce terminal.",
              })
            }
          />
        </FormField>
      ) : null}

      {offre.champUtilisateur ? (
        <FormField
          label="Utilisateur"
          hint={
            offre.utilisateurVerrouille
              ? libelleDuVerrou(offre.utilisateurVerrouille)
              : undefined
          }
        >
          <DeclencheurSelect
            libelle={nomUtilisateur ?? TOUS_UTILISATEURS}
            actif={Boolean(nomUtilisateur) && !offre.utilisateurVerrouille}
            disabled={Boolean(offre.utilisateurVerrouille)}
            accessibilityLabel="Utilisateur"
            onPress={() =>
              setChoix({
                titre: "Utilisateur",
                options: offre.utilisateurs,
                valeur: valeur.utilisateur,
                onChoisir: (v) => onChanger({ ...valeur, utilisateur: v }),
                libelleVide: TOUS_UTILISATEURS,
                messageVide: "Aucun utilisateur à proposer.",
              })
            }
          />
        </FormField>
      ) : null}
    </>
  );
}
