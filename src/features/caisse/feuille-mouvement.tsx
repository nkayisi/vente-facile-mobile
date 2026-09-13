/**
 * La fiche d'un mouvement de tiroir, et son annulation.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UNE RANGÉE QUI NE S'OUVRE PAS CACHAIT QUATRE COLONNES DU BACK-OFFICE.   │
 * │                                                                          │
 * │ Le web rend « Solde après », « Par », la référence et les pièces liées   │
 * │ (vente, dépense). Sur une rangée de téléphone, rien de tout cela ne      │
 * │ tient - et « Solde après » est précisément le seul chiffre qui permette  │
 * │ de rapprocher une ligne d'un comptage de tiroir.                         │
 * │                                                                          │
 * │ Le back-office range l'annulation dans un menu « ⋯ » ; ici elle vit au    │
 * │ pied de la fiche, sous les chiffres qu'elle engage. C'est la grammaire   │
 * │ déjà retenue pour la fiche de vente et celle d'un retour : la décision   │
 * │ se prend sous le montant, pas quinze centimètres plus haut.              │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import { useState } from "react";
import { View } from "react-native";

import { dateLongueFr } from "@/data/dates";
import { useMonnaie } from "@/data/devises";
import { libelleTypeCaisse } from "@/data/types-caisse";
import type { MouvementCaisse } from "@/data/caisse";
import { annulerMouvementCaisse } from "@/features/caisse/actes";
import { BandeauEnvoi } from "@/features/sync/bandeau-envoi";
import { useSession } from "@/session/provider";
import type { EtatEnvoi } from "@/sync";
import {
  Badge, Button, Divider, FormField, Icon, Input, Sheet, StatValue, Text,
  useToast,
} from "@/ui";

function Paire({ label, valeur }: { label: string; valeur: string }) {
  return (
    <View className="flex-row items-baseline justify-between gap-3 py-1.5">
      <Text variant="bodySmall" numberOfLines={1} className="min-w-0 flex-1 text-muted-foreground">
        {label}
      </Text>
      <Text variant="bodySmall" numeric className="shrink-0 font-sans-medium">
        {valeur}
      </Text>
    </View>
  );
}

/**
 * ⚠ L'APPELANT POSE `key={mouvement?.id}` : chaque ouverture est alors un
 * MONTAGE, donc un formulaire vierge, sans effet de remise à zéro à tenir en
 * phase avec les champs qu'on ajoutera. Un motif tapé pour un mouvement ne
 * doit pas se retrouver sur le suivant. C'est le motif déjà retenu pour les
 * feuilles de devis et de retour, et il évite un `setState` dans un effet -
 * un rendu de plus et un ordre à défendre.
 */
export function FeuilleMouvement({
  mouvement,
  onFermer,
  annulationEnFile,
}: {
  mouvement: MouvementCaisse | null;
  onFermer: () => void;
  /** L'annulation déjà mise en file pour ce mouvement, s'il y en a une. */
  annulationEnFile?: EtatEnvoi;
}) {
  const money = useMonnaie();
  const toast = useToast();
  const { can } = useSession();
  const [motif, setMotif] = useState("");
  const [confirme, setConfirme] = useState(false);
  const [envoi, setEnvoi] = useState(false);

  if (!mouvement) return null;
  const m = mouvement;
  const entree = m.direction === "in";

  const annuler = async () => {
    if (envoi) return;
    setEnvoi(true);
    try {
      await annulerMouvementCaisse(m.id, motif);
      toast.succes("Annulation enregistrée. Elle partira à la prochaine synchronisation.");
      onFermer();
    } catch (e) {
      toast.erreur(
        e instanceof Error ? e.message : "L'annulation n'a pas pu être enregistrée."
      );
    } finally {
      setEnvoi(false);
    }
  };

  /**
   * Le bouton se ferme, et il DIT pourquoi.
   *
   * Trois raisons distinctes, trois phrases : un bouton grisé muet est le
   * cul-de-sac que ce dépôt a déjà corrigé ailleurs. Et une ligne encore en
   * file n'a pas d'identifiant côté serveur : l'annuler enverrait un acte sur
   * un mouvement que le serveur ne connaît pas encore.
   */
  const raison = m.annule
    ? "Ce mouvement est déjà annulé."
    : m.envoi
      ? "Ce mouvement n'est pas encore arrivé au serveur : il n'y a rien à y annuler."
      : annulationEnFile
        ? "Une annulation attend déjà son envoi pour ce mouvement."
        : !can("cashbook.cancel_movement")
          ? "Vous n'avez pas le droit d'annuler un mouvement de caisse."
          : undefined;

  return (
    <Sheet
      ouvert
      onFermer={onFermer}
      titre={m.description?.trim() || libelleTypeCaisse(m.type)}
    >
      <View className="items-center gap-1 py-2">
        <View className="flex-row items-center gap-2">
          <Icon
            name={entree ? "ArrowDownRight" : "ArrowUpRight"}
            size={20}
            color={entree ? "success" : "destructive"}
          />
          <StatValue
            value={`${entree ? "+" : "-"}${money.money(m.montant, m.devise)}`}
            tone={entree ? "success" : "destructive"}
          />
        </View>
        <Badge tone={entree ? "success" : "destructive"}>
          {libelleTypeCaisse(m.type)}
        </Badge>
      </View>

      {m.envoi ? (
        <BandeauEnvoi
          envoi={m.envoi}
          titre="Ce mouvement attend son envoi"
          consequence="Son numéro et son solde après seront posés par le serveur."
        />
      ) : null}

      <View>
        {m.reference ? <Paire label="Référence" valeur={m.reference} /> : null}
        <Paire
          label="Date"
          valeur={m.date ? dateLongueFr(m.date) : "—"}
        />
        {/* Le seul chiffre qui permette de rapprocher la ligne d'un comptage.
            `null` ne se lit jamais comme zéro : un tiret dit que le serveur ne
            l'a pas encore calculé. */}
        <Paire
          label="Solde après, en caisse"
          valeur={
            m.soldeApres == null ? "—" : money.money(m.soldeApres, m.devise)
          }
        />
        {m.auteur ? <Paire label="Enregistré par" valeur={m.auteur} /> : null}
        {m.refVente ? <Paire label="Vente" valeur={m.refVente} /> : null}
        {m.refDepense ? <Paire label="Dépense" valeur={m.refDepense} /> : null}
      </View>

      {m.notes ? (
        <View className="mt-1">
          <Text variant="caption" className="mb-1">
            Notes
          </Text>
          <Text variant="bodySmall">{m.notes}</Text>
        </View>
      ) : null}

      {m.annule ? (
        <View className="mt-1 rounded-lg border border-border bg-muted/40 p-3">
          <Text variant="bodySmall" className="font-sans-medium">
            Mouvement annulé
          </Text>
          {/* Un motif d'annulation vide se DIT : « aucun motif » est une
              information, une ligne absente se lit comme un oubli d'affichage. */}
          <Text variant="caption">
            {m.motifAnnulation || "Aucun motif n'a été enregistré."}
          </Text>
        </View>
      ) : null}

      <Divider />

      {raison ? (
        <Text variant="caption">{raison}</Text>
      ) : confirme ? (
        <>
          {/* ┌──────────────────────────────────────────────────────────────┐
              │ ON MARQUE, ON NE SUPPRIME PAS - ET ON LE DIT.                │
              │                                                              │
              │ Un mouvement de caisse est une écriture comptable : elle se  │
              │ contrepasse et ne se rature pas. Le taire ferait croire à    │
              │ une suppression, et le marchand chercherait ensuite une      │
              │ ligne qu'il retrouve pourtant dans son rapport de caisse.    │
              └──────────────────────────────────────────────────────────────┘ */}
          <FormField
            label="Motif de l'annulation"
            hint="Il reste attaché à l'écriture, qui n'est pas supprimée."
          >
            <Input value={motif} onChangeText={setMotif} autoFocus />
          </FormField>
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Button variant="outline" fullWidth onPress={() => setConfirme(false)}>
                Non, garder
              </Button>
            </View>
            <View className="flex-1">
              <Button
                variant="destructive"
                fullWidth
                loading={envoi}
                onPress={() => void annuler()}
              >
                Annuler
              </Button>
            </View>
          </View>
        </>
      ) : (
        <Button
          variant="outline"
          fullWidth
          leftIcon="XCircle"
          onPress={() => setConfirme(true)}
        >
          Annuler ce mouvement
        </Button>
      )}
    </Sheet>
  );
}
