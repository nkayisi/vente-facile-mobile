/**
 * L'état du panier, partagé par les trois écrans du comptoir.
 *
 * Le POS web tient tout dans une seule page de 3 300 lignes ; sur un téléphone
 * il faut trois écrans (grille, panier, encaissement), et un panier qui vivrait
 * dans l'un d'eux disparaîtrait en passant au suivant. D'où ce contexte.
 *
 * Il ne calcule RIEN lui-même. Chaque montant vient de `@vente-facile/core/pos`,
 * le même code que le back-office appelle. C'est la seule garantie que les deux
 * surfaces facturent le même centime, et elle ne tient que si personne ne
 * recalcule « juste ce petit total » sur place.
 */
import {
  createContext, useCallback, useContext, useEffect, useMemo, useReducer,
  useState, type ReactNode,
} from "react";

import {
  basketTotals,
  createCurrencyTable,
  evaluateCredit,
  loyaltyDiscount,
  maxGlobalDiscount,
  maxUsablePoints,
  minPointsToRedeem,
  tendersIn,
  saleCurrencyTotals,
  verifierAjout,
  MONEY_EPS,
  type BasketLine,
  type CreditVerdict,
  type CurrencyTable,
  type SaleCurrencyTotals,
  type Saisie,
} from "@vente-facile/core/pos";

import { useSession } from "@/session/provider";
import { pointsDuClient } from "./donnees";
import { detteEnAttente } from "./reserve-locale";
import {
  avertissementDeStock,
  motifDeRefus,
  motifsEncaissement,
  PANIER_VIDE,
  reducteurPanier,
  type ActionPanier,
  type ClientPos,
  type EtatPanier,
  type LignePanier,
} from "./etat-panier";

export type { ActionPanier, ClientPos, EtatPanier, LignePanier, Reglement } from "./etat-panier";
import type { ArticlePos } from "./catalogue";

export interface Totaux {
  /** En devise principale. */
  sousTotal: number;
  remiseLignes: number;
  remiseGlobale: number;
  remiseGlobaleMax: number;
  taxe: number;
  /** Total BRUT, avant points. */
  total: number;
  remiseFidelite: number;
  /** Ce que le client doit, points déduits, en devise principale. */
  net: number;

  /** En devise de facture. */
  totalFacture: number;
  payeFacture: number;
  restantFacture: number;
  monnaie: number;
  /**
   * La facture VENTILÉE, dans sa propre devise.
   *
   * ┌────────────────────────────────────────────────────────────────────────┐
   * │ C'EST CE BLOC QUE LE TICKET IMPRIME, JAMAIS CELUI DU DESSUS.          │
   * │                                                                        │
   * │ Les champs en devise principale servent aux CONTRÔLES - solde du       │
   * │ client, plafond de crédit, valeur des points, tous tenus en principale │
   * │ côté serveur. Ceux-ci servent à tout ce que le client LIT. Le ticket   │
   * │ prenait les premiers en les étiquetant de la devise de facture : sur   │
   * │ un établissement tenu en dollars qui facture en francs, il imprimait   │
   * │ un montant deux mille huit cents fois trop petit, sans que rien ne le  │
   * │ signale - les deux coïncident tant qu'on ne facture que dans sa devise │
   * │ principale, ce qui est le cas de toutes les données de développement.  │
   * └────────────────────────────────────────────────────────────────────────┘
   */
  facture: SaleCurrencyTotals;
  /** La même, points NON déduits : c'est elle que la PROFORMA imprime. */
  factureBrute: SaleCurrencyTotals;

  /** Solde de points du client, tel que le dernier tirage l'a déposé. */
  soldePoints: number;
  /** Points saisissables : bornés par le solde ET par le programme. */
  pointsMax: number;
  pointsMinimum: number;
  credit: CreditVerdict | null;
  /**
   * Dette des ventes à crédit de ce client encore en file, en devise
   * principale. Déjà comptée dans `credit` ; exposée pour que l'écran puisse
   * dire POURQUOI le solde opposé dépasse celui de la fiche client.
   */
  detteEnAttente: number;
  /** Le règlement couvre-t-il la facture ? */
  solde: boolean;
}

interface ValeurPanier {
  etat: EtatPanier;
  devises: CurrencyTable;
  deviseFacture: string;
  deviseMonnaie: string;
  totaux: Totaux;
  /** Formate un montant dans une devise, décimales comprises. */
  argent: (montant: number, code?: string) => string;
  /**
   * Relit ce qui dépend du CLIENT : solde de points, dette en file.
   *
   * Ces deux valeurs viennent de la base locale, que seul le tirage écrit. Une
   * synchronisation pendant qu'un panier est ouvert les change donc sous les
   * pieds de l'écran, et l'effet ne se rejoue pas : ni le client ni le nombre
   * de lignes n'ont bougé. Relevé à l'écran : le terminal annonçait encore
   * « 372,65 points » alors que la base venait d'en recevoir 704,13, et le
   * caissier synchronise précisément pour avoir le bon chiffre.
   *
   * L'écran déclenche, le panier calcule : c'est le partage déjà en place
   * partout ailleurs.
   */
  rafraichirClient: () => void;
  /** Refus éventuel d'un ajout, en français, sans modifier l'état. */
  verifier: (article: ArticlePos, saisie: Saisie) => string | null;
  /**
   * Refus éventuel de la MODIFICATION d'une ligne déjà au panier.
   *
   * Distinct de `verifier`, et il faut qu'il le soit : le contrôle se fait sur
   * le panier PRIVÉ de cette ligne, sinon les trois casiers qu'on remplace se
   * comptent contre les quatre qu'on demande et le comptoir refuse une
   * correction parfaitement possible. C'est la règle que le réducteur applique
   * déjà pour l'action « modifier » ; l'écran doit la lire de la même façon.
   */
  verifierModification: (index: number, saisie: Saisie) => string | null;
  /**
   * Ce que le stock ne couvre pas, sans rien fermer à l'ajout.
   *
   * Le caissier doit le savoir en composant - le découvrir en rendant la
   * monnaie serait pire que le refus qu'on vient de retirer.
   */
  avertir: (article: ArticlePos, saisie: Saisie) => string | null;
  /**
   * Ce qui ferme l'ENCAISSEMENT, ligne par ligne. Vide = le panier s'encaisse.
   *
   * La proforma, elle, reste ouverte quoi qu'il arrive : c'est tout l'intérêt
   * de séparer les deux.
   */
  ruptures: string[];
  envoyer: (action: ActionPanier) => void;
}

const Contexte = createContext<ValeurPanier | null>(null);

export function PanierProvider({ children }: { children: ReactNode }) {
  const { snapshot } = useSession();
  const [etat, envoyer] = useReducer(reducteurPanier, PANIER_VIDE);

  const devises = useMemo(
    () =>
      createCurrencyTable(snapshot?.currencies ?? [], {
        code: snapshot?.organization.currency ?? "CDF",
        decimal_places: 2,
      }),
    [snapshot]
  );

  const deviseFacture = etat.deviseFacture ?? devises.primary;
  const deviseMonnaie = etat.deviseMonnaie ?? deviseFacture;
  const programme = snapshot?.loyalty_program ?? null;

  // La dette que les ventes à crédit DÉJÀ EN FILE ajouteront au compte de ce
  // client. Elle n'est nulle part dans `customers`, que seul le tirage écrit :
  // sans elle, un client à 40 $ de plafond peut repartir trois fois de suite
  // avec 30 $ de marchandise, et le serveur refusera les deux dernières ventes
  // une fois les tickets imprimés.
  const clientId = etat.client?.id ?? null;
  const [detteFile, setDetteFile] = useState<Map<string, number>>(new Map());
  // ┌────────────────────────────────────────────────────────────────────────┐
  // │ LA FIDÉLITÉ ÉTAIT INERTE : le solde était passé EN DUR à zéro.        │
  // │                                                                        │
  // │ `maxUsablePoints` borne par le solde ; avec zéro, il rend toujours     │
  // │ zéro. Relevé à l'écran : « 372,65 points disponibles. Au plus 0        │
  // │ utilisable sur cette vente. » Le comptoir affichait donc les points du │
  // │ client, promettait une remise, et n'en laissait saisir aucune. Le      │
  // │ back-office, lui, l'accorde.                                           │
  // │                                                                        │
  // │ Le solde vit ICI et non dans l'écran d'encaissement : c'est le panier  │
  // │ qui totalise, et un plafond calculé dans un écran serait un second     │
  // │ calcul de vente, précisément ce que la doctrine interdit.              │
  // └────────────────────────────────────────────────────────────────────────┘
  const [soldePoints, setSoldePoints] = useState(0);
  const [relecture, setRelecture] = useState(0);
  // ┌────────────────────────────────────────────────────────────────────────┐
  // │ CETTE FONCTION DOIT ÊTRE STABLE, ET CE N'EST PAS UNE OPTIMISATION.     │
  // │                                                                        │
  // │ L'écran d'encaissement l'appelle depuis un `useFocusEffect` qui en     │
  // │ dépend. Fabriquée dans le `useMemo` de la valeur du contexte, elle     │
  // │ changeait d'identité à chaque recalcul des totaux ; or l'appeler       │
  // │ change les totaux, `detteEnAttente` rendant une carte NEUVE à chaque   │
  // │ lecture. L'effet se relançait donc en boucle, sans fin, tant que       │
  // │ l'écran restait ouvert : deux requêtes SQLite par tour, sur le seul    │
  // │ écran où le caissier attend le client. Rien à voir - pas d'erreur,     │
  // │ pas de clignotement, juste un téléphone qui chauffe.                   │
  // │                                                                        │
  // │ `setRelecture` est stable, donc cette fonction l'est aussi, et le      │
  // │ rafraîchissement n'a plus lieu qu'à l'arrivée sur l'écran.             │
  // └────────────────────────────────────────────────────────────────────────┘
  const rafraichirClient = useCallback(() => setRelecture((n) => n + 1), []);
  useEffect(() => {
    let vivant = true;
    // Les deux lectures dépendent du même client et se rafraîchissent au même
    // moment : les séparer ferait deux effets sur la même clé.
    Promise.all([
      detteEnAttente(clientId),
      clientId ? pointsDuClient(clientId) : Promise.resolve(0),
    ]).then(([dette, points]) => {
      if (!vivant) return;
      setDetteFile(dette);
      setSoldePoints(points);
    });
    return () => {
      vivant = false;
    };
    // `etat.reglements` n'entre pas ici : ni la dette en file ni le solde de
    // points ne changent pendant qu'on encaisse. Ils changent à l'encaissement
    // d'une AUTRE vente, donc au retour sur le comptoir.
  }, [clientId, etat.lignes.length, relecture]);

  const totaux = useMemo<Totaux>(() => {
    const brut = basketTotals({
      lines: etat.lignes,
      globalDiscountAmount: etat.remiseGlobale,
    });
    const remiseFidelite = loyaltyDiscount(brut.total, etat.points, programme);
    const facture = saleCurrencyTotals({
      lines: etat.lignes,
      currencies: devises,
      invoiceCurrency: deviseFacture,
      globalDiscountAmount: etat.remiseGlobale,
      loyaltyDiscount: remiseFidelite,
    });
    // Points NON déduits : la proforma ne les réserve pas.
    const factureBrute =
      remiseFidelite > 0
        ? saleCurrencyTotals({
            lines: etat.lignes,
            currencies: devises,
            invoiceCurrency: deviseFacture,
            globalDiscountAmount: etat.remiseGlobale,
            loyaltyDiscount: 0,
          })
        : facture;
    const totalFacture = facture.total;
    const payeFacture = tendersIn(etat.reglements, devises, deviseFacture);
    const excedent = payeFacture - totalFacture;

    // Chaque devise est convertie SÉPARÉMENT vers la principale, jamais sommée
    // avant : c'est dans cette devise que le serveur tient `current_balance` et
    // `credit_limit`, et additionner des francs à des dollars donnerait un
    // plafond franchi ou respecté au hasard du taux.
    let dettePrimaire = 0;
    for (const [code, montant] of detteFile) {
      dettePrimaire += devises.convertMoney(montant, code, devises.primary);
    }
    // Le solde OPPOSÉ au caissier, pas celui de la fiche : la fiche vient du
    // tirage et ignore ce que ce terminal a vendu depuis. On ajuste l'objet
    // client plutôt que le noyau, dont le contrat ne change pas.
    const clientAJour = etat.client
      ? {
          ...etat.client,
          current_balance: String(Number(etat.client.current_balance ?? 0) + dettePrimaire),
        }
      : etat.client;

    return {
      sousTotal: brut.subtotal,
      remiseLignes: brut.itemDiscount,
      remiseGlobale: brut.globalDiscount,
      remiseGlobaleMax: maxGlobalDiscount(etat.lignes),
      taxe: brut.tax,
      total: brut.total,
      remiseFidelite,
      net: brut.total - remiseFidelite,
      totalFacture,
      facture,
      factureBrute,
      payeFacture,
      restantFacture: Math.max(0, devises.round(-excedent, deviseFacture)),
      monnaie:
        excedent > MONEY_EPS
          ? devises.convertMoney(excedent, deviseFacture, deviseMonnaie)
          : 0,
      soldePoints,
      pointsMax: maxUsablePoints(brut.total, soldePoints, programme),
      pointsMinimum: minPointsToRedeem(programme),
      detteEnAttente: dettePrimaire,
      credit: evaluateCredit(
        clientAJour,
        brut.total - remiseFidelite,
        tendersIn(etat.reglements, devises, devises.primary),
        (montant) => devises.money(montant, devises.primary)
      ),
      solde: excedent >= -MONEY_EPS,
    };
  }, [etat, devises, deviseFacture, deviseMonnaie, programme, detteFile, soldePoints]);

  const valeur = useMemo<ValeurPanier>(
    () => ({
      etat,
      devises,
      deviseFacture,
      deviseMonnaie,
      totaux,
      argent: (montant, code) => devises.money(montant, code ?? deviseFacture),
      rafraichirClient,
      // LE VERROU D'INVENTAIRE PASSE AVANT LE STOCK, et c'est l'ordre du
      // serveur : `SaleCreateSerializer.validate` refuse les produits bloqués
      // AVANT de regarder les quantités. Dire « stock insuffisant » sur un
      // article sous inventaire enverrait le caissier chercher au dépôt une
      // marchandise qui est là, mais interdite à la vente.
      verifier: (article, saisie) => motifDeRefus(article, etat.lignes, saisie),
      avertir: (article, saisie) => avertissementDeStock(article, etat.lignes, saisie),
      ruptures: motifsEncaissement(etat.lignes),
      verifierModification: (index, saisie) => {
        const courante = etat.lignes[index];
        if (!courante) return null;
        const autres = etat.lignes.filter((_, i) => i !== index);
        return motifDeRefus(courante.product, autres, saisie);
      },
      envoyer,
    }),
    [etat, devises, deviseFacture, deviseMonnaie, totaux, rafraichirClient]
  );

  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>;
}

export function usePanier(): ValeurPanier {
  const valeur = useContext(Contexte);
  if (!valeur) throw new Error("usePanier hors de PanierProvider");
  return valeur;
}
