/**
 * Les deux champs de périmètre, posables dans n'importe quelle feuille de filtres.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN VERROU DE DROIT S'AFFICHE FERMÉ ; UNE DONNÉE SANS AUTEUR DISPARAÎT. │
 * │                                                                          │
 * │ La frontière n'est pas cosmétique, elle tient à CE QUE LE VERROU DIT.   │
 * │                                                                          │
 * │ `cashier`, `un-seul-entrepot` et `aucun-entrepot` parlent de VOUS : on   │
 * │ vous refuse quelque chose que d'autres ont. Retirer le contrôle se       │
 * │ lirait alors comme une fonction manquante - le caissier conclurait que   │
 * │ l'application ne sait pas filtrer, et le signalerait comme un défaut.    │
 * │ Un contrôle fermé QUI DIT POURQUOI se lit comme une règle.               │
 * │                                                                          │
 * │ `sans-auteur` parle de la DONNÉE : un niveau de stock n'a jamais eu      │
 * │ d'auteur, pour personne. Afficher un champ grisé qui explique l'absence  │
 * │ d'une chose que nul n'a demandée est du bruit permanent sur chaque écran │
 * │ de stock. On le retire.                                                  │
 * │                                                                          │
 * │ ⚠ LE WEB SUIT LA MÊME RÈGLE (`PerimeterFilters`, prop `withUser`). Les   │
 * │ deux surfaces divergeaient sur ce point à l'écriture, et deux écrans qui │
 * │ traitent différemment le même verrou font douter qu'il s'agisse du même. │
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
      <FormField
        label="Entrepôt"
        hint={offre.entrepotVerrouille ? libelleDuVerrou(offre.entrepotVerrouille) : undefined}
      >
        <DeclencheurSelect
          libelle={nomEntrepot ?? "Tous les entrepôts"}
          actif={Boolean(nomEntrepot) && !offre.entrepotVerrouille}
          disabled={Boolean(offre.entrepotVerrouille)}
          accessibilityLabel="Entrepôt"
          onPress={() =>
            setChoix({
              titre: "Entrepôt",
              options: offre.entrepots,
              valeur: valeur.entrepot,
              onChoisir: (v) => onChanger({ ...valeur, entrepot: v }),
              messageVide: "Aucun entrepôt n'est encore descendu sur ce terminal.",
            })
          }
        />
      </FormField>

      {offre.utilisateurVerrouille === "sans-auteur" ? null : (
        <FormField
          label="Utilisateur"
          hint={
            offre.utilisateurVerrouille
              ? libelleDuVerrou(offre.utilisateurVerrouille)
              : undefined
          }
        >
          <DeclencheurSelect
            libelle={nomUtilisateur ?? "Tous les utilisateurs"}
            actif={Boolean(nomUtilisateur) && !offre.utilisateurVerrouille}
            disabled={Boolean(offre.utilisateurVerrouille)}
            accessibilityLabel="Utilisateur"
            onPress={() =>
              setChoix({
                titre: "Utilisateur",
                options: offre.utilisateurs,
                valeur: valeur.utilisateur,
                onChoisir: (v) => onChanger({ ...valeur, utilisateur: v }),
                messageVide: "Aucun utilisateur à proposer.",
              })
            }
          />
        </FormField>
      )}
    </>
  );
}
