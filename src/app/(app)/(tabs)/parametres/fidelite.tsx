/**
 * Paramètres, Fidélité. Miroir de `app/dashboard/settings/loyalty/page.tsx`.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ TROIS RÉGLAGES, LÀ OÙ IL Y EN AVAIT HUIT PLUS UN SECOND MÉCANISME.      │
 * │                                                                          │
 * │ Le programme portait un mode de calcul, des points par tranche, le       │
 * │ montant de la tranche, un pourcentage, la valeur d'un point, un minimum  │
 * │ d'utilisation, un plafond et une expiration - plus les récompenses. Il   │
 * │ reste un POURCENTAGE et un PLAFOND, et la cagnotte est de l'argent.      │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ UN APERÇU CHIFFRÉ VAUT MIEUX QU'UNE EXPLICATION, et c'est ce que le
 * back-office affiche sous les mêmes deux champs : « sur une facture de
 * 10 000 FC, le client gagne 200 FC ». Un pourcentage seul ne dit pas ce que le
 * marchand donne.
 *
 * Lecture depuis l'instantané de session, qui porte déjà le programme :
 * l'écran s'affiche hors ligne.
 */
import { View } from "react-native";

import { useMonnaie } from "@/data/devises";
import { devisePrincipale } from "@/data/devise-principale";
import { useSession } from "@/session/provider";
import { Badge, Card, Divider, EmptyState, ListItem, Section, Text } from "@/ui";

/** Facture témoin de l'aperçu : ronde, et du bon ordre de grandeur. */
const FACTURE_TEMOIN = 10000;

const nb = (v: string | number | null | undefined): number => {
  const n = typeof v === "string" ? parseFloat(v) : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

export default function Fidelite() {
  const { snapshot } = useSession();
  const money = useMonnaie();
  const p = snapshot?.loyalty_program ?? null;

  if (!p) {
    return (
      <View className="py-8">
        <EmptyState
          icon="Gift"
          title="Aucun programme de fidélité configuré"
          message="Créez un programme pour récompenser vos clients."
        />
      </View>
    );
  }

  // ⚠ LA CAGNOTTE EST TENUE EN DEVISE PRINCIPALE, et un montant sans devise est
  // interdit par la doctrine : un même chiffre vaut soit trois dollars, soit
  // trois francs.
  const argent = (montant: number) => money.money(montant, devisePrincipale());
  const gain = (FACTURE_TEMOIN * nb(p.earn_percent)) / 100;
  // Le plafond du MARCHAND, borné par celui du modèle serveur. Son repli est 70
  // et jamais 100 : « ce serait desserrer la garantie au lieu de la maintenir ».
  const plafond = Math.min(
    nb(p.max_redemption_percent),
    nb(p.max_redemption_percent_ceiling) || 70,
  );
  const reglable = (FACTURE_TEMOIN * plafond) / 100;

  return (
    <View className="p-4">
      <Section title={p.name}>
        <Card className="overflow-hidden p-0">
          <ListItem
            title="Statut"
            trailing={
              <Badge tone={p.is_active ? "success" : "neutral"}>
                {p.is_active ? "Actif" : "Inactif"}
              </Badge>
            }
          />
          <Divider inset />
          <ListItem title="Le client récupère" value={`${p.earn_percent} %`} />
          <Divider inset />
          <ListItem title="Part réglable par la cagnotte" value={`${plafond} %`} />
        </Card>
      </Section>

      <Section title="Sur une facture de 10 000">
        <Card>
          <Text variant="bodySmall" className="text-muted-foreground">
            Sur une facture de {argent(FACTURE_TEMOIN)} réglée, le client gagne{" "}
            {argent(gain)} dans sa cagnotte, et peut en régler jusqu&apos;à{" "}
            {argent(reglable)} d&apos;une facture.
          </Text>
          {/* ⚠ LA CAGNOTTE NE SOLDE JAMAIS TOUTE UNE FACTURE, et c'est le
          plafond qui le garantit : il reste toujours quelque chose à encaisser
          en monnaie. On le DIT ici, parce que c'est la seule règle de fidélité
          que le caissier verra mordre au comptoir. */}
          <Text variant="caption" className="mt-2">
            Le réglage se fait au back-office.
          </Text>
        </Card>
      </Section>
    </View>
  );
}
