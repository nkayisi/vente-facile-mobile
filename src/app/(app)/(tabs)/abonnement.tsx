/**
 * Abonnement. Miroir de `app/dashboard/subscription/page.tsx`.
 *
 * La table `subscriptions` n'est pas au manifeste de tirage, et le tunnel de
 * paiement Moko reste celui du web : le plan approuvé le dit explicitement
 * (« Abonnement Moko : tunnel web existant »), et la WebView de ce tunnel est
 * par ailleurs un risque de refus App Store, à trancher au lot 11.
 */
import { PageHeader, PasEncore, Screen } from "@/ui";

export default function Abonnement() {
  return (
    <Screen scroll edges={[]}>
      <PageHeader
        title="Abonnement"
        subtitle="Gérez votre abonnement et consultez vos factures"
      />
      <PasEncore
        icon="Crown"
        lot={11}
        quoi="le plan en cours, les paiements et les factures"
        table="subscriptions"
      />
    </Screen>
  );
}
