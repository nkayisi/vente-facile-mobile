/**
 * Documents imprimés, et leur réimpression.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ L'IMPRESSION NE SE REJOUE PAS TOUTE SEULE.                              │
 * │                                                                          │
 * │ Un ticket qui n'est pas sorti parce que le rouleau était vide se         │
 * │ redemande d'un GESTE. Un automate le sortirait dix minutes plus tard,    │
 * │ client parti, et remettrait en circulation un papier que personne        │
 * │ n'attend. C'est toute la différence avec le journal d'opérations, qui,   │
 * │ lui, doit rejouer.                                                       │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * **Le numéro ne change jamais.** Une réimpression porte le numéro de
 * l'original et se distingue par sa pastille DUPLICATA, pas par un second
 * numéro. Le compteur n'avance que si l'impression a RÉUSSI : l'incrémenter
 * d'avance ferait sortir le premier vrai ticket marqué duplicata après un
 * rouleau vide.
 *
 * Cet écran manquait au lot 5 : la file existait, rien n'y donnait accès.
 */
import { useCallback, useState } from "react";
import { View } from "react-native";
import { formatDateTimeFr } from "@vente-facile/core";

import { useLecture } from "@/data/live";
import { libelleTransport } from "@/printing";
import {
  derniersDocuments,
  imprimerDocument,
  type DocumentImprimable,
  type GenreDocument,
} from "@/printing/jobs";
import {
  AppBar, Badge, Chip, ChipRow, DataList, DataRow, Screen, Text, useToast,
} from "@/ui";

/** Les quatre documents du comptoir, dans les mots du papier. */
const GENRE: Record<GenreDocument, string> = {
  sale: "Ticket de vente",
  payment: "Reçu de règlement",
  cash_session: "Clôture de caisse (Z)",
  expense: "Reçu de dépense",
};

export default function Documents() {
  const toast = useToast();
  const [genre, setGenre] = useState<GenreDocument | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);

  const { donnees, chargement, recharger } = useLecture(
    useCallback(() => derniersDocuments(100), []),
    { tables: ["print_jobs"] }
  );

  const documents = (donnees ?? []).filter((d) => !genre || d.kind === genre);

  const reimprimer = async (d: DocumentImprimable) => {
    if (enCours) return;
    setEnCours(d.id);
    try {
      const transport = await imprimerDocument(d.id);
      toast.succes(
        d.printCount > 0
          ? `Duplicata sorti (${libelleTransport(transport)}). Le numéro est inchangé.`
          : `Document sorti (${libelleTransport(transport)}).`
      );
      recharger();
    } catch (e) {
      toast.erreur(
        e instanceof Error ? e.message : "Le document n'a pas pu être imprimé."
      );
    } finally {
      setEnCours(null);
    }
  };

  const enTete = (
    <View className="gap-3 px-4 pb-3 pt-2">
      <ChipRow>
        <Chip label="Tous" actif={genre === null} onPress={() => setGenre(null)} />
        {(Object.keys(GENRE) as GenreDocument[]).map((g) => (
          <Chip
            key={g}
            label={GENRE[g]}
            actif={genre === g}
            onPress={() => setGenre(g)}
          />
        ))}
      </ChipRow>
      <Text variant="caption">
        Un document se réimprime d&apos;un geste. La copie porte le même numéro
        et la pastille DUPLICATA.
      </Text>
    </View>
  );

  const rendu = (d: DocumentImprimable) => (
    <DataRow
      principal={d.documentNumber}
      secondaire={[GENRE[d.kind], d.label].filter(Boolean).join(" · ")}
      sousValeur={formatDateTimeFr(d.createdAt)}
      badge={
        d.printCount === 0 ? (
          <Badge tone="warning">Jamais imprimé</Badge>
        ) : d.printCount > 1 ? (
          <Badge tone="neutral">{`${d.printCount} sorties`}</Badge>
        ) : undefined
      }
      chevron={false}
      // Un appui pendant l'impression relancerait un second passage papier :
      // `reimprimer` sort tout de suite tant qu'une sortie est en cours.
      onPress={() => void reimprimer(d)}
    />
  );

  return (
    <Screen padded={false}>
      <AppBar
        title="Documents imprimés"
        subtitle="Réimpression des tickets, reçus et Z"
      />
      <DataList
        donnees={documents}
        cle={(d) => d.id}
        rendu={rendu}
        enTete={enTete}
        chargement={chargement && documents.length === 0}
        vide={{
          icon: "Printer",
          titre: "Aucun document",
          message:
            "Les tickets, reçus et clôtures produits sur ce terminal apparaîtront ici, prêts à être réimprimés.",
        }}
      />
    </Screen>
  );
}
