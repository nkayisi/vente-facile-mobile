/**
 * Abonnement.
 *
 * Miroir de `app/dashboard/subscription/page.tsx` du back-office : même titre, même sous-titre, même place
 * dans le menu. La STRUCTURE est en place ; le lot 11 branche les données et
 * les actions.
 */
import { PageHeader, PasEncore, Screen } from "@/ui";

export default function Abonnement() {
  return (
    <Screen scroll>
      <PageHeader title="Abonnement" subtitle="Gérez votre abonnement et consultez vos factures" />
      <PasEncore icon="Crown" lot={11} quoi="le plan en cours, les paiements et les factures" table="subscriptions" />
    </Screen>
  );
}
