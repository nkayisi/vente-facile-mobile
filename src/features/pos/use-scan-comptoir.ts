/**
 * Le lecteur de codes intégré, branché sur un écran du comptoir.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE MÊME COMPORTEMENT QUE LA DOUCHETTE DU BACK-OFFICE.                    │
 * │                                                                          │
 * │ - un scan, où que soit le doigt, ouvre la saisie de quantité de          │
 * │   l'article (proposée à 1) ;                                             │
 * │ - un re-scan pendant cette saisie ajoute 1 au même article, et refuse un │
 * │   autre avec un avis ;                                                   │
 * │ - un code inconnu le DIT, et propose de créer l'article ;                │
 * │ - tapé dans la recherche, le scan la vide, et un premier caractère lu en │
 * │   retard est rattrapé par le champ ;                                     │
 * │ - rien pendant une feuille ou un dialogue (l'encaissement, le client).  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ « RIEN » VEUT DIRE QUE LA CAPTURE RESTE BRANCHÉE, PAS QU'ELLE SE RETIRE.
 * Relevé sur le rk3568 : capture retirée pendant la feuille d'encaissement,
 * la première touche du lecteur faisait passer Android en navigation au
 * clavier, le focus tombait sur le voile « Fermer » de la feuille, et l'Entrée
 * du scan l'actionnait : la feuille se fermait, la saisie du caissier avec.
 * Sur un autre écran, ce premier élément pressable aurait pu être un bouton
 * qui engage. La capture reste donc posée (le module natif consomme les
 * touches du lecteur, l'Entrée relâchée d'une modale comprise) et ce sont les
 * touches qu'on ignore ici, tant qu'une feuille est ouverte.
 */
import { useEffect, useRef } from "react";
import { useIsFocused } from "expo-router";

import type { EtatDouchette } from "@vente-facile/core/pos";

import { useModaleOuverte } from "@/ui";
import { articleParCodeBarres, type ArticlePos } from "./catalogue";
import { chercherLesCandidats } from "./candidats";
import {
  COMPTOIR_AU_REPOS,
  frapperAuComptoir,
  retenirTerme,
  scanDiffuse,
  termeCourant,
  type EffetTouche,
  type Recherche,
  type TermeTenu,
} from "./douchette-comptoir";
import { lecteurCodes, prendreCapture, rendreCapture } from "./lecteur-codes";
import { rescanDansLaSaisie, selecteurOuvert } from "./selecteur-actif";

export interface BranchementScan {
  /** Faux : l'écran ne veut pas du lecteur en ce moment. */
  actif?: boolean;
  /** L'entrepôt de la caisse, pour le stock de l'article trouvé. */
  entrepot: string | null | undefined;
  /**
   * La recherche de l'écran, s'il en a une. Lue au moment de chaque touche :
   * ce qui est tapé au clavier physique y est ajouté.
   */
  recherche?: () => Recherche;
  surTerme?: (terme: string) => void;
  /** Entrée sans rafale dans la recherche : la validation habituelle. */
  surValider?: (terme: string) => void;
  surTrouve: (article: ArticlePos) => void;
  surIntrouvable: (code: string) => void;
}

export function useScanComptoir(b: BranchementScan) {
  const focalise = useIsFocused();
  const modale = useModaleOuverte();
  const actif = (b.actif ?? true) && focalise;
  const modaleRef = useRef(modale);
  useEffect(() => {
    modaleRef.current = modale;
  }, [modale]);

  // Les rappels changent à chaque rendu ; l'abonnement natif, lui, ne doit pas
  // être refait pour autant.
  const rappels = useRef(b);
  useEffect(() => {
    rappels.current = b;
  });

  useEffect(() => {
    if (!actif) return;
    const natif = lecteurCodes();
    if (!natif) return;
    const jeton = prendreCapture();
    let etat: EtatDouchette = COMPTOIR_AU_REPOS;
    // Une recherche lancée par un scan ne doit pas être écrasée par celle d'un
    // scan plus ancien qui répondrait après elle.
    let sequence = 0;
    // Le terme écrit depuis le dernier rendu (`termeCourant`).
    let tenu: TermeTenu | null = null;
    let rendu = "";

    const ecrireTerme = (terme: string) => {
      tenu = retenirTerme(tenu, rendu, terme);
      rappels.current.surTerme?.(terme);
    };

    const traiter = (effet: EffetTouche) => {
      const r = rappels.current;
      switch (effet.type) {
        case "rien":
          return;
        case "terme":
          ecrireTerme(effet.terme);
          return;
        case "valider":
          r.surValider?.(effet.terme);
          return;
        case "scan": {
          if (effet.terme !== null) ecrireTerme(effet.terme);
          // Une saisie de quantité ouverte reçoit le re-scan : +1, ou l'avis.
          if (rescanDansLaSaisie(effet.candidats)) return;
          const ici = ++sequence;
          void chercherLesCandidats(effet.candidats, (code) => articleParCodeBarres(code, r.entrepot)).then((res) => {
            if (ici !== sequence || !res) return;
            if ("article" in res) rappels.current.surTrouve(res.article);
            else rappels.current.surIntrouvable(res.introuvable);
          });
          return;
        }
      }
    };

    const touches = natif.addListener("onTouche", ({ touche, instant }) => {
      // Une feuille ouverte : la touche est consommée, et on n'en fait rien.
      if (modaleRef.current) {
        etat = COMPTOIR_AU_REPOS;
        return;
      }
      // La saisie de quantité a le focus : la recherche, derrière, n'en a pas.
      const lue: Recherche = selecteurOuvert()
        ? { focalisee: false, terme: "" }
        : (rappels.current.recherche?.() ?? { focalisee: false, terme: "" });
      rendu = lue.terme;
      const courant = termeCourant(tenu, lue.terme);
      tenu = courant.tenu;
      const r = frapperAuComptoir(etat, touche, instant, { ...lue, terme: courant.terme });
      etat = r.etat;
      traiter(r.effet);
    });
    const diffusions = natif.addListener("onCodeDiffuse", ({ code }) => {
      if (!modaleRef.current) traiter(scanDiffuse(code));
    });

    return () => {
      touches.remove();
      diffusions.remove();
      rendreCapture(jeton);
    };
  }, [actif]);
}
