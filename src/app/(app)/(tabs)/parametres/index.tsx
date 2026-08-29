/**
 * Paramètres, Infos générales.
 *
 * Miroir de `app/dashboard/settings/page.tsx` : deux cartes, « Informations de
 * l'établissement » puis « Paramètres généraux » avec ses trois sous-sections.
 *
 * **La LECTURE vient des tables tirées** (`organizations`,
 * `organization_settings`), donc l'écran s'affiche entièrement HORS LIGNE, avec
 * les vraies valeurs. **L'ÉCRITURE est en ligne uniquement** : aucun `kind` de
 * paramètres n'existe côté serveur - les neuf handlers de poussée sont des
 * actes métier - et en fabriquer un est du travail backend. Le dire est plus
 * honnête que le simuler.
 */
import { View } from "react-native";

import { useLecture } from "@/data/live";
import { etablissement, parametresRecu } from "@/data/organisation";
import { Card, CardHeader, Divider, ListItem, Section, Spinner, Text } from "@/ui";

export default function InfosGenerales() {
  const { donnees: etab, chargement } = useLecture(etablissement, { tables: ["organizations"] });
  const { donnees: recu } = useLecture(parametresRecu, { tables: ["organization_settings"] });

  if (chargement && !etab) {
    return (
      <View className="py-16">
        <Spinner size="large" />
      </View>
    );
  }

  return (
    <View className="gap-6 p-4">
      <Section title="Informations de l'établissement">
        <Card className="overflow-hidden p-0">
          <ListItem title="Nom" value={etab?.nom ?? "—"} />
          <Divider inset />
          <ListItem
            title="Type d'activité"
            value={etab?.typeAffiche ?? "—"}
            subtitle="Non modifiable après la création"
          />
          <Divider inset />
          <ListItem title="Téléphone" value={etab?.telephone ?? "—"} />
          <Divider inset />
          <ListItem title="Email" value={etab?.email ?? "—"} />
          <Divider inset />
          <ListItem title="Adresse" value={etab?.adresse ?? "—"} />
          <Divider inset />
          <ListItem title="Ville" value={etab?.ville ?? "—"} />
          <Divider inset />
          <ListItem title="Pays" value={etab?.pays ?? "—"} />
          <Divider inset />
          <ListItem title="N° impôt (NIF)" value={etab?.nif ?? "—"} />
          <Divider inset />
          <ListItem title="RCCM" value={etab?.rccm ?? "—"} />
          <Divider inset />
          <ListItem title="ID National" value={etab?.idNat ?? "—"} />
        </Card>
      </Section>

      <Section title="Paramètres généraux">
        <Card>
          <CardHeader title="Reçus" subtitle="Ce qui s'imprime en tête et en pied de ticket" />
          <Text variant="caption">En-tête</Text>
          <Text variant="bodySmall">{recu?.enTete?.trim() || "Aucun"}</Text>
          <Text variant="caption" className="mt-3">
            Pied de page
          </Text>
          <Text variant="bodySmall">{recu?.pied?.trim() || "Aucun"}</Text>
          <Text variant="caption" className="mt-3">
            Largeur du papier du ticket
          </Text>
          <Text variant="bodySmall">{`${recu?.largeurPapier ?? 58} mm`}</Text>
        </Card>
        <Card className="mt-3">
          <CardHeader title="Notifications" />
          <ListItem
            title="Seuil d'alerte stock bas"
            value={recu?.seuilStockBas != null ? String(recu.seuilStockBas) : "—"}
          />
        </Card>
        <Card className="mt-3">
          <CardHeader title="Affichage sur les reçus" />
          <ListItem
            title="Afficher les points de fidélité sur les reçus"
            value={recu?.pointsSurRecu ? "Oui" : "Non"}
          />
        </Card>
      </Section>
    </View>
  );
}
