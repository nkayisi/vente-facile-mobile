/**
 * Encaisser : le moyen de paiement, le montant, le credit, les points.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ MEME ORDRE, MEMES REGLES QUE LA MODALE DU BACK-OFFICE.                   │
 * │                                                                          │
 * │ Un marchand qui revient du web doit retrouver ses gestes : les points    │
 * │ d'abord, le credit ensuite, le recapitulatif, le moyen de paiement, le   │
 * │ montant, et ce qu'il reste a faire. L'ordre n'est pas cosmetique - c'est │
 * │ celui dans lequel les decisions se prennent au comptoir.                 │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ UNE FEUILLE DANS UNE FEUILLE N'EST PAS UNE OPTION. `Sheet` est un `Modal` :
 * le choix du client, celui du moyen de paiement et la saisie des points
 * echangent le CONTENU de cette feuille, avec la fleche `retour` qui recule
 * d'un panneau. D'ou `DeclencheurSelect` et non `ChampSelect`, qui ouvrirait
 * SA propre feuille - un garde-fou de doctrine le refuse.
 *
 * La vente est mise en FILE, elle n'est pas envoyee. Le comptoir ne depend
 * jamais du reseau : l'operation part au journal, le caissier voit tout de
 * suite la monnaie a rendre, et le serveur rejouera l'acte par le meme chemin
 * que le back-office des qu'il sera joignable.
 *
 * AUCUN MONTANT N'EST CALCULE ICI. Tout vient du panier, donc de
 * `@vente-facile/core/pos`, y compris le corps de la requete : c'est ce qui
 * garantit qu'une vente saisie sur ce telephone laisse exactement le meme etat
 * qu'une vente saisie sur le back-office, ce que le backend verifie par test.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import * as Crypto from "expo-crypto";

import { formatNumberFr } from "@vente-facile/core";
import { buildSalePayload, loyaltyDiscount } from "@vente-facile/core/pos";

import { lireNombre, type LectureNombre } from "@/data/nombres";
import { jourISO } from "@/data/dates";
import { enregistrerDocument } from "@/printing/jobs";
import { useSession } from "@/session/provider";
import { enqueue } from "@/sync";
import {
  Banner,
  Button,
  ChampDate,
  ChampMontant,
  Checkbox,
  Chip,
  ChipRow,
  DataRow,
  DeclencheurSelect,
  Divider,
  FormField,
  Icon,
  Input,
  ListeChoix,
  Pressable,
  SearchInput,
  Sheet,
  Text,
  useToast,
  type IconName,
  type OptionSelect,
} from "@/ui";

import { sessionOuverte, type SessionCaisse } from "./caisse";
import {
  chercherClients,
  moyensDePaiement,
  type MoyenPaiement,
} from "./donnees";
import {
  blocageEncaissement,
  libelleConfirmation,
  libelleMontant,
  montantApresBasculeDevise,
  montantExigible,
  motifCreditFerme,
  OPTION_CREDIT,
  phraseBlocage,
  phraseCreditFerme,
  recalerReglement,
  suffixeOptionCredit,
  type ModeReglement,
} from "./encaissement";
import { pointsGagnes, soldeApresVente } from "./fidelite";
import { prochaineReference } from "./numerotation";
import { usePanier, type ClientPos } from "./panier";
import { donneesTicketVente } from "./ticket";

type Panneau = "formulaire" | "client" | "moyen" | "points";

/**
 * Glyphe d'un moyen de paiement, par son genre.
 *
 * Miroir strict de `methodIcon` du back-office : un caissier qui reconnait
 * « especes » a son billet sur un ecran doit le reconnaitre sur l'autre.
 */
function glypheDuMoyen(genre: string): IconName {
  switch (genre) {
    case "cash":
      return "Banknote";
    case "mobile_money":
      return "Smartphone";
    case "card":
    case "bank_transfer":
      return "CreditCard";
    default:
      return "CircleDollarSign";
  }
}

export function FeuilleEncaissement({ onFermer }: { onFermer: () => void }) {
  const panier = usePanier();
  const { snapshot } = useSession();
  const toast = useToast();
  const { etat, totaux, devises, deviseFacture, deviseMonnaie, argent } =
    panier;
  const { envoyer, rafraichirClient } = panier;

  const [panneau, setPanneau] = useState<Panneau>("formulaire");
  const [moyens, setMoyens] = useState<MoyenPaiement[]>([]);
  const [session, setSession] = useState<SessionCaisse | null>(null);
  const [chargement, setChargement] = useState(true);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [recherche, setRecherche] = useState("");
  const [clients, setClients] = useState<ClientPos[]>([]);
  const [saisiePoints, setSaisiePoints] = useState("");
  const verrou = useRef(false);

  const mode: ModeReglement = etat.aCredit ? "credit" : "comptant";
  const reglement = etat.reglements[0];
  const moyenChoisi = moyens.find((m) => m.id === reglement?.method);
  const programme = snapshot?.loyalty_program ?? null;

  const devisesActives = useMemo(
    () => (snapshot?.currencies ?? []).filter((c) => c.is_active !== false),
    [snapshot],
  );
  const devisesChoisissables = useMemo(
    () =>
      devisesActives.map((c) => ({
        code: c.currency_code,
        symbole: devises.symbolOf(c.currency_code),
      })),
    [devisesActives, devises],
  );

  const patcher = useCallback(
    (patch: Partial<NonNullable<typeof reglement>>) =>
      envoyer({
        type: "reglements",
        reglements: reglement ? [{ ...reglement, ...patch }] : [],
      }),
    [envoyer, reglement],
  );

  /**
   * Le montant a reposer dans le champ, ou `null` s'il ne faut pas y toucher.
   *
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ IL REND UNE VALEUR, IL N'ECRIT PAS - ET C'EST OBLIGATOIRE.           │
   * │                                                                      │
   * │ `patcher` compose `{ ...reglement, ...patch }` depuis la fermeture du │
   * │ rendu courant. Deux appels successifs dans un meme gestionnaire       │
   * │ lisent donc le MEME reglement perime, et le second efface le premier :│
   * │ choisir un moyen de paiement puis recaler le montant reperdait le    │
   * │ moyen, en silence. On compose UN seul patch.                          │
   * └──────────────────────────────────────────────────────────────────────┘
   *
   * Miroir de `syncTenderToTotal` du back-office. `totalFacture` est passe
   * EXPLICITEMENT parce que les `envoyer` qui precedent l'appel ne sont pas
   * encore repercutes : le total lu ici serait celui d'avant.
   */
  const montantRecale = useCallback(
    (totalFacture: number, modeVise: ModeReglement, deviseRecue: string) =>
      recalerReglement({
        mode: modeVise,
        totalFacture,
        deviseFacture,
        deviseReglement: deviseRecue,
        // ⚠ `convert`, PAS `convertMoney` : celle-ci arrondit et ferait
        // reapparaitre le sous-paiement. Voir `montantExigible`.
        convertirBrut: devises.convert,
        decimalesDe: devises.decimalsOf,
      }),
    [deviseFacture, devises],
  );

  /** Le recalage seul, quand aucun autre champ du reglement ne bouge. */
  const recaler = useCallback(
    (totalFacture: number, modeVise: ModeReglement, deviseRecue: string) => {
      const montant = montantRecale(totalFacture, modeVise, deviseRecue);
      if (montant !== null) patcher({ amount: montant });
    },
    [montantRecale, patcher],
  );

  // Une synchronisation a pu passer pendant que le panier etait ouvert : le
  // solde de points et la dette en file viennent de la base locale, que seul le
  // tirage ecrit. On les relit en OUVRANT la feuille, la seule surface ou ils
  // decident de quelque chose.
  useEffect(() => {
    rafraichirClient();
  }, [rafraichirClient]);

  // ┌────────────────────────────────────────────────────────────────────────┐
  // │ LE MONTANT S'OUVRE SUR LE TOTAL EXACT, comme au back-office.           │
  // │                                                                        │
  // │ Le champ s'ouvrait VIDE, et le credit etait alors DEDUIT du reste a    │
  // │ payer : a l'arrivee sur l'ecran, avant la moindre frappe, le bouton    │
  // │ annoncait deja « Enregistrer a credit » et un bandeau reclamait un     │
  // │ client. La vente de comptoir la plus frequente ne doit demander qu'un  │
  // │ seul geste.                                                            │
  // └────────────────────────────────────────────────────────────────────────┘
  useEffect(() => {
    let vivant = true;
    Promise.all([moyensDePaiement(), sessionOuverte()]).then(([liste, s]) => {
      if (!vivant) return;
      setMoyens(liste);
      setSession(s);
      setChargement(false);
      // Le mode, les points et l'echeance sont remis a plat a CHAQUE ouverture :
      // une deduction abandonnee par un premier passage s'appliquerait sinon en
      // silence a la vente suivante. Le back-office le fait au meme endroit.
      envoyer({ type: "credit", actif: false });
      envoyer({ type: "points", points: 0 });
      if (liste.length > 0) {
        envoyer({
          type: "reglements",
          reglements: [
            {
              cle: "r1",
              method: liste[0].id,
              currency: deviseFacture,
              amount: String(
                devises.round(totaux.factureBrute.total, deviseFacture),
              ),
            },
          ],
        });
      }
    });
    return () => {
      vivant = false;
    };
    // Au MONTAGE seulement : recalculer a chaque frappe empecherait le caissier
    // de saisir un montant partiel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (panneau !== "client") return;
    let vivant = true;
    chercherClients(recherche).then((r) => {
      if (vivant) setClients(r);
    });
    return () => {
      vivant = false;
    };
  }, [panneau, recherche]);

  const lectureMontant = lireNombre(reglement?.amount ?? "");
  const creditFerme = motifCreditFerme(etat.client);
  const credit = totaux.credit;

  const blocage = blocageEncaissement({
    mode,
    nbLignes: etat.lignes.length,
    sessionOuverte: Boolean(session),
    moyenChoisi: Boolean(reglement?.method),
    referenceExigee: Boolean(moyenChoisi?.requiresReference),
    reference: reglement?.reference ?? "",
    montantLisible: lectureMontant.ok,
    totalFacture: totaux.totalFacture,
    payeFacture: totaux.payeFacture,
    client: etat.client,
    creditBloque: Boolean(credit?.blocked),
  });

  const manque = Math.max(0, totaux.restantFacture);

  // --- Les gestes ---------------------------------------------------------

  const choisirMoyen = (valeur: string | null) => {
    if (valeur === OPTION_CREDIT) {
      if (creditFerme) {
        // On NOMME le motif plutot que de ne rien faire : un choix qui ne
        // repond pas enseigne que la fonction n'existe pas.
        toast.erreur(phraseCreditFerme(creditFerme, etat.client?.name ?? null));
        return;
      }
      envoyer({ type: "credit", actif: true });
      // L'acompte repart de zero. Le champ etait preremplig au total ; en
      // basculant en credit ce montant restait, si bien que la « vente a
      // credit » etait en fait soldee et n'inscrivait AUCUNE dette.
      patcher({ amount: "" });
      setPanneau("formulaire");
      return;
    }
    if (!valeur) return;
    envoyer({ type: "credit", actif: false });
    // Le moyen ET le montant dans le MEME patch : voir `montantRecale`.
    const deviseRecue = reglement?.currency ?? deviseFacture;
    const montant = montantRecale(totaux.totalFacture, "comptant", deviseRecue);
    patcher({
      method: valeur,
      ...(montant !== null ? { amount: montant } : {}),
    });
    setPanneau("formulaire");
  };

  const retirerPoints = () => {
    envoyer({ type: "points", points: 0 });
    recaler(
      totaux.factureBrute.total,
      mode,
      reglement?.currency ?? deviseFacture,
    );
  };

  const validerPoints = () => {
    const lecture = lireNombre(saisiePoints);
    const points = lecture.ok
      ? Math.min(lecture.valeur ?? 0, totaux.pointsMax)
      : 0;
    envoyer({ type: "points", points });
    // Le total NET d'apres cette saisie, pour que le champ montant suive. Le
    // panier ne l'a pas encore recalcule : on demande au NOYAU la remise qu'il
    // accordera - la meme fonction que le panier appelle, jamais une regle de
    // trois ecrite ici.
    const remise = devises.convertMoney(
      loyaltyDiscount(totaux.total, points, programme),
      devises.primary,
      deviseFacture,
    );
    recaler(
      devises.round(totaux.factureBrute.total - remise, deviseFacture),
      mode,
      reglement?.currency ?? deviseFacture,
    );
    setPanneau("formulaire");
  };

  const valider = async () => {
    // Verrou SYNCHRONE avant tout `setState` : un double appui creerait deux
    // ventes, et la seconde sortirait le stock une fois de trop.
    if (verrou.current || blocage || !session) return;
    verrou.current = true;
    setEnvoi(true);
    setErreur(null);

    try {
      const id = Crypto.randomUUID();
      const reference = await prochaineReference(
        snapshot?.device?.device_code ?? null,
      );

      const corps = buildSalePayload({
        lines: etat.lignes.map((l) => ({
          ...l,
          product: { ...l.product, id: l.product.id },
        })),
        currencies: devises,
        invoiceCurrency: deviseFacture,
        changeCurrency: deviseMonnaie,
        globalDiscountAmount: etat.remiseGlobale,
        tenders: etat.reglements,
        register: session.registerId,
        warehouse: session.warehouseId,
        customer: etat.client?.id,
        isCredit: mode === "credit",
        dueDate: etat.echeance,
        loyaltyProgram: programme,
        pointsToUse: etat.points,
        isPos: true,
      });

      await enqueue(id, "sale.create", {
        id,
        reference,
        // La session est nommee explicitement : le serveur la retrouverait par
        // la caisse, mais une session ouverte hors ligne n'existe encore que
        // dans le journal, et c'est celle-la qu'il faut viser.
        session: session.id,
        ...corps,
      });

      const monnaie = totaux.monnaie;

      // ┌──────────────────────────────────────────────────────────────────┐
      // │ LE CLIENT VIENT LIRE SON CUMUL, ET LE TICKET NE LE DISAIT PAS.  │
      // │                                                                  │
      // │ Le bloc fidelite ne sortait QUE lorsque des points etaient       │
      // │ depenses : `pointsGagnes` et `pointsRestants` etaient declares   │
      // │ dans le contexte du ticket et personne ne les passait. Le        │
      // │ back-office, lui, les imprime depuis la reponse du serveur.      │
      // └──────────────────────────────────────────────────────────────────┘
      const gagnes = pointsGagnes({
        programme,
        totalFacture: totaux.totalFacture,
        taux: devises.rateOf(deviseFacture),
        // Le serveur n'attribue que sur une vente `completed` : une vente a
        // credit ne rapporte rien a l'emission.
        venteSoldee: totaux.restantFacture <= 0,
      });

      // Le document est range AVANT de vider le panier : apres, il n'y a plus
      // rien a decrire. Il est range, pas imprime : l'ecran suivant s'en
      // charge, pour que le caissier voie la monnaie a rendre meme si
      // l'imprimante est en panne de papier.
      const ticket = await enregistrerDocument({
        kind: "sale",
        documentNumber: reference,
        label: etat.client?.name ?? `Vente ${reference}`,
        donnees: donneesTicketVente({
          reference,
          date: new Date(),
          etat,
          totaux,
          deviseFacture,
          snapshot,
          registerName: session.registerName,
          warehouseName: session.warehouseName ?? undefined,
          // La liste sert a NOMMER le reglement : sans elle, le libelle de la
          // ligne serait l'identifiant du moyen de paiement.
          moyens,
          pointsGagnes: gagnes,
          // Sans programme actif il n'y a pas de solde a annoncer, et
          // « Solde de points : 0 pts » serait une ligne de bruit sur le
          // papier d'un etablissement qui ne fait pas de fidelite.
          pointsRestants: programme?.is_active
            ? soldeApresVente(totaux.soldePoints, etat.points, gagnes)
            : undefined,
          restantDu: mode === "credit" ? totaux.restantFacture : 0,
          aCredit: mode === "credit",
        }),
      });

      envoyer({ type: "vider" });
      onFermer();
      // ⚠ `push` ET NON `replace` : la feuille s'ouvre aussi depuis l'ONGLET
      // de vente, ou il n'y a rien a remplacer - `replace` y ecraserait la
      // barre d'onglets elle-meme. L'ecran d'arrivee se remplace de toute
      // facon lui-meme en sortant, donc la pile ne grossit pas.
      router.push({
        pathname: "/pos/termine",
        params: {
          reference,
          monnaie: String(monnaie),
          devise: deviseMonnaie,
          credit: mode === "credit" ? "1" : "",
          ticket,
        },
      });
    } catch (e) {
      setErreur(
        e instanceof Error
          ? e.message
          : "La vente n'a pas pu être mise en file.",
      );
    } finally {
      verrou.current = false;
      setEnvoi(false);
    }
  };

  /**
   * Fermer ABANDONNE la deduction et le mode credit.
   *
   * Sans cela, ils survivent a l'annulation et grevent le panier HORS de toute
   * feuille - le total de la grille et la proforma baissent, et plus rien ne
   * l'annonce.
   */
  const annuler = () => {
    envoyer({ type: "points", points: 0 });
    envoyer({ type: "credit", actif: false });
    onFermer();
  };

  const reculer = () => {
    if (panneau === "formulaire") return annuler();
    setPanneau("formulaire");
  };

  const titre =
    panneau === "client"
      ? "Choisir un client"
      : panneau === "moyen"
        ? "Moyen de paiement"
        : panneau === "points"
          ? "Points à utiliser"
          : "Encaissement";

  // --- Les panneaux -------------------------------------------------------

  const contenuPanneau =
    panneau === "formulaire" ? null : (
      <>
        {panneau === "client" ? (
          <PanneauClient
            recherche={recherche}
            onRecherche={setRecherche}
            clients={clients}
            argent={argent}
            principale={devises.primary}
            onChoisir={(c) => {
              envoyer({ type: "client", client: c });
              setPanneau("formulaire");
            }}
            onRetirer={
              etat.client
                ? () => {
                    // Retirer le client retire sa remise et sort du credit : le
                    // reducteur s'en charge. Le montant recu remonte donc au
                    // total brut.
                    envoyer({ type: "client", client: null });
                    recaler(
                      totaux.factureBrute.total,
                      "comptant",
                      reglement?.currency ?? deviseFacture,
                    );
                    setPanneau("formulaire");
                  }
                : undefined
            }
          />
        ) : panneau === "moyen" ? (
          <ListeChoix
            options={optionsDeMoyen(
              moyens,
              creditFerme,
              etat.client?.name ?? null,
            )}
            valeur={
              mode === "credit" ? OPTION_CREDIT : (reglement?.method ?? null)
            }
            onChoisir={choisirMoyen}
            messageVide="Aucun moyen de paiement. Synchronisez pour les recevoir."
          />
        ) : (
          <PanneauPoints
            saisie={saisiePoints}
            onSaisie={setSaisiePoints}
            solde={totaux.soldePoints}
            maximum={totaux.pointsMax}
            minimum={totaux.pointsMinimum}
            onValider={validerPoints}
          />
        )}
      </>
    );

  // --- Le formulaire ------------------------------------------------------

  const f = totaux.facture;
  const nbArticles = etat.lignes.reduce((s, l) => s + l.quantity, 0);
  const deviseRecue = reglement?.currency ?? deviseFacture;
  // ⚠ LE BOUTON AFFICHE CE QUE LE CHAMP PORTE, pas une seconde conversion.
  // `convertMoney` nu rendrait 11,6 $ pendant que le champ prerempli tient
  // 11,61 : le caissier lirait deux nombres pour un seul encaissement.
  const montantBouton = argent(
    montantExigible({
      totalFacture: totaux.totalFacture,
      deviseFacture,
      deviseReglement: deviseRecue,
      convertirBrut: devises.convert,
      decimalesDe: devises.decimalsOf,
    }),
    deviseRecue,
  );

  return (
    // ┌──────────────────────────────────────────────────────────────────────┐
    // │ UNE SEULE `Sheet` POUR LES QUATRE PANNEAUX.                          │
    // │                                                                      │
    // │ En rendre une par panneau demonterait le `Modal` et le remonterait a │
    // │ chaque aller-retour : la feuille redescendrait puis remonterait sous │
    // │ le doigt du caissier, au milieu d'un encaissement. On echange le     │
    // │ CONTENU, jamais la feuille.                                          │
    // └──────────────────────────────────────────────────────────────────────┘
    <Sheet
      ouvert
      // Le voile et le bouton retour d'Android RECULENT d'un panneau avant de
      // fermer : un geste destine a revenir en arriere ne perd pas la saisie.
      onFermer={reculer}
      titre={titre}
      retour={panneau === "formulaire" ? undefined : reculer}
      pied={
        panneau !== "formulaire" ? undefined : (
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Button
                variant="outline"
                onPress={annuler}
                disabled={envoi}
                fullWidth
              >
                Annuler
              </Button>
            </View>
            <View className="flex-[2]">
              <Button
                onPress={() => void valider()}
                disabled={Boolean(blocage)}
                loading={envoi}
                leftIcon="Printer"
                fullWidth
              >
                {libelleConfirmation(mode, montantBouton)}
              </Button>
            </View>
          </View>
        )
      }
    >
      {contenuPanneau ?? (
        <>
          <Text variant="muted">
            Sélectionnez le mode de paiement et confirmez le montant
          </Text>

          {/* ⚠ LE CLIENT VIT DANS LA FEUILLE, et c'est un ecart ASSUME avec le web.
          Le back-office choisit le sien sur la PAGE du point de vente ; sur ce
          terminal il n'existe aucun selecteur de client ailleurs - ni au
          panier, ni sur l'onglet de vente. Le retirer d'ici rendrait impossible
          d'attacher un client, donc d'accorder des points. */}
          <RangeeClient
            client={etat.client}
            alerte={mode === "credit"}
            onChoisir={() => setPanneau("client")}
            onRetirer={() => {
              envoyer({ type: "client", client: null });
              recaler(
                totaux.factureBrute.total,
                "comptant",
                reglement?.currency ?? deviseFacture,
              );
            }}
          />

          {/* Points de fidelite : visible des qu'un client est rattache et qu'un
          programme tourne. Le bloc restait invisible tant que le solde
          n'atteignait pas le minimum : le vendeur ne savait ni que le client
          avait des points, ni combien il lui en manquait. */}
          {etat.client && programme?.is_active ? (
            <Rubrique
              titre={`Points de fidélité (${formatNumberFr(totaux.soldePoints, 2)} pts)`}
            >
              <View className="rounded-xl border border-warning/30 bg-warning/10 p-3">
                <Checkbox
                  coche={etat.points > 0}
                  disabled={totaux.soldePoints < totaux.pointsMinimum}
                  label="Déduire mes points sur la facture"
                  accessibilityHint="Ouvre la saisie du nombre de points"
                  onBasculer={() => {
                    // Decocher est une ANNULATION : immediate, sans rien demander.
                    if (etat.points > 0) return retirerPoints();
                    setSaisiePoints(String(totaux.pointsMax));
                    setPanneau("points");
                  }}
                />
                {totaux.soldePoints < totaux.pointsMinimum ? (
                  <View className="mt-2 border-t border-warning/30 pt-2">
                    <Text variant="caption">
                      Encore{" "}
                      {formatNumberFr(
                        totaux.pointsMinimum - totaux.soldePoints,
                        2,
                      )}{" "}
                      pts avant de pouvoir les utiliser (minimum{" "}
                      {formatNumberFr(totaux.pointsMinimum, 2)} pts).
                    </Text>
                  </View>
                ) : null}
                {totaux.remiseFidelite > 0 ? (
                  <View className="mt-2 flex-row items-center justify-between border-t border-warning/30 pt-2">
                    <Text variant="caption" className="min-w-0 flex-1">
                      {formatNumberFr(etat.points, 2)} pts appliqués ·{" "}
                      {argent(f.loyaltyDiscount)}
                    </Text>
                    <Button
                      variant="ghost"
                      size="sm"
                      onPress={() => {
                        setSaisiePoints(String(etat.points));
                        setPanneau("points");
                      }}
                    >
                      Modifier
                    </Button>
                  </View>
                ) : null}
              </View>
            </Rubrique>
          ) : null}

          {mode === "credit" ? (
            <View className="gap-2">
              <View className="rounded-xl border border-warning/30 bg-warning/10 p-3">
                <View className="flex-row items-center gap-2">
                  <Icon name="AlertTriangle" size={16} color="warning" />
                  <Text variant="label" className="min-w-0 flex-1">
                    Vente à crédit — un client est obligatoire
                  </Text>
                </View>
                {!etat.client ? (
                  <View className="mt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      leftIcon="User"
                      onPress={() => setPanneau("client")}
                    >
                      Sélectionner un client
                    </Button>
                  </View>
                ) : null}
              </View>

              {credit?.blocked ? (
                <Banner
                  tone="destructive"
                  title={
                    credit.notAllowed
                      ? "Crédit non autorisé pour ce client"
                      : "Limite de crédit dépassée"
                  }
                  message={credit.reason ?? ""}
                />
              ) : etat.client ? (
                <Text variant="caption">
                  Dette actuelle :{" "}
                  {argent(credit?.currentBalance ?? 0, devises.primary)} · après
                  cette vente :{" "}
                  {argent(credit?.projectedBalance ?? 0, devises.primary)}
                </Text>
              ) : null}

              {totaux.detteEnAttente > 0 ? (
                // ⚠ UN CHIFFRE QUI NE S'EXPLIQUE PAS SE LIT COMME UNE ERREUR. La
                // fiche du client vient du tirage et ignore ce que ce terminal a
                // vendu depuis ; sans cette ligne, le caissier lirait « dette :
                // 90 $ » sur un compte que la liste annonce a 30 $, et conclurait a
                // un bug plutot qu'a un retard de synchronisation.
                <Text variant="caption">
                  Dont {argent(totaux.detteEnAttente, devises.primary)} de
                  ventes à crédit qui attendent leur envoi.
                </Text>
              ) : null}
            </View>
          ) : null}

          <Rubrique titre="Récapitulatif">
            <View className="gap-1.5 rounded-xl bg-muted p-3">
              <Ligne
                libelle={`Sous-total (${formatNumberFr(nbArticles, 0)} article${nbArticles > 1 ? "s" : ""})`}
                valeur={argent(f.subtotal)}
              />
              {f.itemDiscount > 0 ? (
                <Ligne
                  libelle="Remises articles"
                  valeur={`-${argent(f.itemDiscount)}`}
                  ton="primary"
                />
              ) : null}
              {f.globalDiscount > 0 ? (
                <Ligne
                  libelle="Remise"
                  valeur={`-${argent(f.globalDiscount)}`}
                  ton="primary"
                />
              ) : null}
              {/* Isolee des remises commerciales, comme sur le recu : sinon le total
              baisse sans que le caissier puisse dire d'ou vient l'ecart. */}
              {f.loyaltyDiscount > 0 ? (
                <Ligne
                  libelle={`Remise fidélité (${formatNumberFr(etat.points, 2)} pts)`}
                  valeur={`-${argent(f.loyaltyDiscount)}`}
                  ton="warning"
                />
              ) : null}
              {f.tax > 0 ? (
                <Ligne
                  libelle="Taxes (TVA)"
                  valeur={`+${argent(f.tax)}`}
                  ton="muted"
                />
              ) : null}
              <View className="my-1">
                <Divider />
              </View>
              <View className="flex-row items-baseline justify-between">
                <Text variant="label">Total à payer</Text>
                <Text variant="h4" className="text-primary" numeric>
                  {argent(totaux.totalFacture)}
                </Text>
              </View>
              {deviseRecue !== deviseFacture ? (
                <View className="flex-row items-baseline justify-between">
                  <Text variant="caption">≈ à encaisser en {deviseRecue}</Text>
                  <Text variant="caption" numeric>
                    {argent(
                      devises.convertMoney(
                        totaux.totalFacture,
                        deviseFacture,
                        deviseRecue,
                      ),
                      deviseRecue,
                    )}
                  </Text>
                </View>
              ) : null}
            </View>
          </Rubrique>

          <Rubrique titre="Moyen de paiement">
            <DeclencheurSelect
              libelle={
                mode === "credit"
                  ? "Crédit"
                  : (moyenChoisi?.name ?? "Choisir un moyen de paiement")
              }
              actif={Boolean(moyenChoisi) || mode === "credit"}
              icon={
                mode === "credit"
                  ? "HandCoins"
                  : glypheDuMoyen(moyenChoisi?.methodType ?? "")
              }
              onPress={() => setPanneau("moyen")}
              disabled={chargement}
              accessibilityLabel="Moyen de paiement"
            />
          </Rubrique>

          <ChampMontant
            label={libelleMontant(mode)}
            requis={mode === "comptant"}
            valeur={reglement?.amount ?? ""}
            onChangeValeur={(v) => patcher({ amount: v })}
            devise={deviseRecue}
            onChangeDevise={(code) =>
              // On CONVERTIT, on n'efface jamais : 20 USD tapes puis bascules en
              // francs restent la meme somme. Mais une bascule ne doit pas
              // rendre INSUFFISANT un reglement qui soldait - la conversion au
              // plus proche perdait jusqu'a une unite mineure, et le bouton se
              // fermait sur une vente que l'ecran venait de preremplir.
              // La regle entiere vit dans `montantApresBasculeDevise`.
              patcher({
                currency: code,
                amount: montantApresBasculeDevise({
                  mode,
                  saisie: reglement?.amount ?? "",
                  deviseAvant: deviseRecue,
                  totalFacture: totaux.totalFacture,
                  deviseFacture,
                  deviseReglement: code,
                  // ⚠ `convert`, PAS `convertMoney` : le plafond a besoin de la
                  // conversion BRUTE. Voir `montantExigible`.
                  convertirBrut: devises.convert,
                  convertirArrondi: devises.convertMoney,
                  decimalesDe: devises.decimalsOf,
                }),
              })
            }
            devises={devisesChoisissables}
            conversion={{
              convertir: devises.convertMoney,
              decimales: devises.decimalsOf,
            }}
            principale={devises.primary}
            repere={repereDeConversion(
              reglement?.amount ?? "",
              deviseRecue,
              deviseFacture,
              devises,
              argent,
            )}
            erreur={motifDeSaisie(lectureMontant, "Le montant")}
          />

          {moyenChoisi?.requiresReference && mode === "comptant" ? (
            <FormField label={`Référence ${moyenChoisi.name}`} required>
              <Input
                value={reglement?.reference ?? ""}
                onChangeText={(v) => patcher({ reference: v })}
                autoCapitalize="characters"
                placeholder="N° transaction, référence..."
              />
            </FormField>
          ) : null}

          <View className="gap-2 rounded-xl bg-muted p-3">
            <Ligne libelle="Total payé" valeur={argent(totaux.payeFacture)} />

            {mode === "credit" && manque > 0 ? (
              <>
                <View className="flex-row items-baseline justify-between">
                  <Text variant="label" className="text-primary">
                    Montant à crédit
                  </Text>
                  <Text variant="h4" className="text-primary" numeric>
                    {argent(manque)}
                  </Text>
                </View>
                {/* `due_date` existait dans le modele et dans l'API sans qu'AUCUNE
                surface du terminal ne la renseigne : il n'y avait donc aucune
                notion de retard pour une vente saisie au comptoir. Facultative,
                tous les marchands ne fixent pas de terme. */}
                <View className="mt-1">
                  <Text variant="caption" className="mb-1">
                    Échéance (facultative)
                  </Text>
                  <ChampDate
                    valeur={etat.echeance ?? ""}
                    onChange={(jour) =>
                      envoyer({ type: "credit", actif: true, echeance: jour })
                    }
                    minimum={jourISO(new Date())}
                    placeholder="Aucune échéance"
                    accessibilityLabel="Échéance de la vente à crédit"
                  />
                </View>
              </>
            ) : null}

            {mode === "comptant" && manque > 0 ? (
              <View className="flex-row items-baseline justify-between">
                <View className="flex-row items-center gap-1.5">
                  <Icon name="AlertTriangle" size={14} color="destructive" />
                  <Text variant="label" className="text-destructive">
                    Il manque
                  </Text>
                </View>
                <Text variant="label" className="text-destructive" numeric>
                  {argent(manque)}
                </Text>
              </View>
            ) : null}

            {mode === "comptant" && totaux.monnaie > 0 ? (
              <View className="gap-2 border-t border-border pt-2">
                <View className="flex-row items-center justify-between">
                  <Text variant="label" className="text-success">
                    Monnaie à rendre
                  </Text>
                  {devisesActives.length > 1 ? (
                    <ChipRow>
                      {devisesActives.map((c) => (
                        <Chip
                          key={c.currency_code}
                          label={c.currency_code}
                          actif={deviseMonnaie === c.currency_code}
                          onPress={() =>
                            envoyer({
                              type: "deviseMonnaie",
                              code: c.currency_code,
                            })
                          }
                        />
                      ))}
                    </ChipRow>
                  ) : null}
                </View>
                <Text variant="h3" className="text-right text-success" numeric>
                  {argent(totaux.monnaie, deviseMonnaie)}
                </Text>
              </View>
            ) : null}
          </View>

          {!session && !chargement ? (
            <Banner
              tone="destructive"
              title="Aucune caisse ouverte"
              message="Ouvrez une session de caisse avant d'encaisser."
            />
          ) : null}

          {erreur ? (
            <Banner
              tone="destructive"
              title="Vente non enregistrée"
              message={erreur}
            />
          ) : null}

          {/* Un bouton ferme sans motif est un cul-de-sac. Les empechements deja
          chiffres ou expliques plus haut rendent `null` : les repeter ici
          ferait douter qu'il s'agisse du meme. */}
          {phraseBlocage(blocage) ? (
            <Text variant="caption" className="text-destructive">
              {phraseBlocage(blocage)}
            </Text>
          ) : null}
        </>
      )}
    </Sheet>
  );
}

/**
 * Le refus d'une saisie, en francais.
 *
 * `lireNombre` rend un MOTIF et non une phrase : un fonds de caisse negatif et
 * une quantite negative ne se disent pas de la meme facon, et c'est l'ecran qui
 * sait lequel des deux il montre.
 */
function motifDeSaisie(
  lecture: LectureNombre,
  sujet: string,
): string | undefined {
  if (lecture.ok) return undefined;
  return lecture.motif === "negatif"
    ? `${sujet} ne peut pas être négatif.`
    : `${sujet} n'est pas lisible. Exemple : 12500 ou 12,5.`;
}

// --- Morceaux -------------------------------------------------------------

function Rubrique({
  titre,
  children,
}: {
  titre: string;
  children: React.ReactNode;
}) {
  return (
    <View className="gap-2">
      <Text variant="label" className="uppercase text-muted-foreground">
        {titre}
      </Text>
      {children}
    </View>
  );
}

function Ligne({
  libelle,
  valeur,
  ton,
}: {
  libelle: string;
  valeur: string;
  ton?: "primary" | "warning" | "muted";
}) {
  const couleur =
    ton === "primary"
      ? "text-primary"
      : ton === "warning"
        ? "text-warning"
        : undefined;
  return (
    <View className="flex-row items-baseline justify-between">
      <Text variant="bodySmall" className={couleur ?? "text-muted-foreground"}>
        {libelle}
      </Text>
      <Text variant="bodySmall" className={couleur} numeric>
        {valeur}
      </Text>
    </View>
  );
}

function RangeeClient({
  client,
  alerte,
  onChoisir,
  onRetirer,
}: {
  client: ClientPos | null;
  alerte: boolean;
  onChoisir: () => void;
  onRetirer: () => void;
}) {
  return (
    <View
      className={`flex-row items-center gap-2 rounded-xl border px-3 py-2 ${
        alerte ? "border-warning/40 bg-warning/10" : "border-border"
      }`}
    >
      <Icon
        name="User"
        size={16}
        color={alerte ? "warning" : "mutedForeground"}
      />
      <Text
        variant="body"
        numberOfLines={1}
        className={`min-w-0 flex-1 ${client ? "" : "text-muted-foreground"}`}
      >
        {client?.name ?? "Aucun client (vente au comptant)"}
      </Text>
      <Button variant="ghost" size="sm" onPress={onChoisir}>
        {client ? "Changer" : "Choisir"}
      </Button>
      {client ? (
        <Pressable
          onPress={onRetirer}
          accessibilityRole="button"
          accessibilityLabel="Retirer le client"
          className="h-11 w-11 items-center justify-center rounded-lg"
        >
          <Icon name="X" size={16} color="destructive" />
        </Pressable>
      ) : null}
    </View>
  );
}

function PanneauClient({
  recherche,
  onRecherche,
  clients,
  argent,
  principale,
  onChoisir,
  onRetirer,
}: {
  recherche: string;
  onRecherche: (v: string) => void;
  clients: ClientPos[];
  argent: (m: number, code?: string) => string;
  principale: string;
  onChoisir: (c: ClientPos) => void;
  onRetirer?: () => void;
}) {
  return (
    <>
      <SearchInput
        valeur={recherche}
        onChange={onRecherche}
        placeholder="Nom, téléphone ou code"
      />
      {onRetirer ? (
        <Button variant="outline" fullWidth leftIcon="X" onPress={onRetirer}>
          Aucun client (vente au comptant)
        </Button>
      ) : null}
      {clients.length === 0 ? (
        <Text variant="caption">
          {recherche
            ? "Aucun client ne correspond. Essayez le téléphone ou le code."
            : "Cherchez un client par son nom, son téléphone ou son code."}
        </Text>
      ) : (
        // ⚠ PAS DE `FlatList` ICI : le contenu d'une feuille est deja un
        // defilement, et une liste virtualisee imbriquee avertit et defile mal.
        // `chercherClients` borne deja a vingt-cinq.
        <View>
          {clients.map((c) => (
            <DataRow
              key={c.id}
              principal={c.name}
              secondaire={libelleSolde(c, argent, principale)}
              onPress={() => onChoisir(c)}
              chevron={false}
              badge={
                c.allow_credit === false ? (
                  <Icon name="Ban" size={16} color="destructive" />
                ) : undefined
              }
            />
          ))}
        </View>
      )}
    </>
  );
}

function PanneauPoints({
  saisie,
  onSaisie,
  solde,
  maximum,
  minimum,
  onValider,
}: {
  saisie: string;
  onSaisie: (v: string) => void;
  solde: number;
  maximum: number;
  minimum: number;
  onValider: () => void;
}) {
  const lecture = lireNombre(saisie);
  const points = lecture.ok ? (lecture.valeur ?? 0) : 0;
  const tropHaut = points > maximum;

  return (
    <>
      <Text variant="bodySmall" className="text-muted-foreground">
        {formatNumberFr(solde, 2)} point{solde > 1 ? "s" : ""} disponible
        {solde > 1 ? "s" : ""}. Au plus {formatNumberFr(maximum, 2)} utilisable
        {maximum > 1 ? "s" : ""} sur cette vente.
      </Text>
      <FormField
        label="Points à utiliser"
        hint={`Minimum ${formatNumberFr(minimum, 2)}. En dessous, aucune remise n'est accordée.`}
        error={
          motifDeSaisie(lecture, "Le nombre de points") ??
          (tropHaut
            ? `Au plus ${formatNumberFr(maximum, 2)} sur cette vente.`
            : undefined)
        }
      >
        <Input
          value={saisie}
          onChangeText={onSaisie}
          keyboardType="decimal-pad"
          placeholder="0"
          invalid={!lecture.ok || tropHaut}
          // ⚠ PAS D'`autoFocus` : releve sur le terminal du comptoir (720x1280).
          // Le clavier decimal prend plus de la moitie de la hauteur et
          // recouvre le panneau ENTIER - le caissier ouvre la saisie et ne voit
          // ni le solde, ni le plafond, ni le bouton. Le champ arrive de toute
          // facon prerempli au maximum utilisable : dans le cas le plus
          // frequent, on appuie sur « Appliquer » sans jamais ouvrir le clavier.
        />
      </FormField>
      <Button onPress={onValider} disabled={!lecture.ok || tropHaut} fullWidth>
        Appliquer
      </Button>
    </>
  );
}

// --- Helpers de presentation ----------------------------------------------

/** Les moyens de paiement, plus le credit, dans l'ordre du back-office. */
function optionsDeMoyen(
  moyens: MoyenPaiement[],
  creditFerme: ReturnType<typeof motifCreditFerme>,
  nomClient: string | null,
): OptionSelect[] {
  return [
    ...moyens.map((m) => ({
      valeur: m.id,
      label: m.name,
      icon: glypheDuMoyen(m.methodType),
    })),
    {
      valeur: OPTION_CREDIT,
      label: `Crédit${suffixeOptionCredit(creditFerme)}`,
      // Le motif est ECRIT plutot que l'entree simplement grisee : une option
      // sourde enseigne que la fonction n'existe pas, et personne ne cherche un
      // bug la ou il n'y a pas d'erreur.
      detail: creditFerme
        ? phraseCreditFerme(creditFerme, nomClient)
        : undefined,
      icon: "HandCoins" as const,
    },
  ];
}

/**
 * Le solde d'un client, dit dans le sens du commercant.
 *
 * « Doit 45 000 FC » se comprend d'un coup d'oeil, la ou « solde : 45 000 »
 * laisse ouverte la question de savoir qui doit a qui.
 */
function libelleSolde(
  client: ClientPos,
  argent: (m: number, code?: string) => string,
  principale: string,
): string {
  if (client.allow_credit === false) return "Crédit non autorisé";
  const solde = Number(client.current_balance) || 0;
  if (solde > 0) return `Doit ${argent(solde, principale)}`;
  if (solde < 0) return `Avance de ${argent(-solde, principale)}`;
  return "À jour";
}

/** « = 46 000 FC · 1 USD = 2 300 FC », les trois conditions du back-office. */
function repereDeConversion(
  saisie: string,
  deviseRecue: string,
  deviseFacture: string,
  devises: { convertMoney: (m: number, de: string, vers: string) => number },
  argent: (m: number, code?: string) => string,
): string | undefined {
  if (deviseRecue === deviseFacture) return undefined;
  const lecture = lireNombre(saisie);
  if (!lecture.ok || !lecture.valeur) return undefined;
  const converti = devises.convertMoney(
    lecture.valeur,
    deviseRecue,
    deviseFacture,
  );
  const taux = devises.convertMoney(1, deviseRecue, deviseFacture);
  return `= ${argent(converti, deviseFacture)} · 1 ${deviseRecue} = ${argent(taux, deviseFacture)}`;
}
