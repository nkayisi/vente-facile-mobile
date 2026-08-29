/**
 * Rapports & Statistiques.
 *
 * Miroir de `app/dashboard/reports/page.tsx` du back-office : même titre, même sous-titre, même place
 * dans le menu. La STRUCTURE est en place ; le lot 10 branche les données et
 * les actions.
 */
import { PageHeader, PasEncore, Screen } from "@/ui";

export default function Rapports() {
  return (
    <Screen scroll>
      <PageHeader title="Rapports & Statistiques" subtitle="Analysez les performances de votre entreprise" />
      <PasEncore icon="BarChart3" lot={10} quoi="les huit onglets de statistiques et le rapport de créances" />
    </Screen>
  );
}
