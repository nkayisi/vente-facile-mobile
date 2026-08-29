/**
 * Tableau de bord.
 *
 * Miroir de `app/dashboard/page.tsx` du back-office : même titre, même sous-titre, même place
 * dans le menu. La STRUCTURE est en place ; le lot 9 branche les données et
 * les actions.
 */
import { PageHeader, PasEncore, Screen } from "@/ui";

export default function TableauDeBord() {
  return (
    <Screen scroll edges={[]}>
      <PageHeader title="Tableau de bord" />
      <PasEncore icon="LayoutDashboard" lot={9} quoi="les relevés du jour, les alertes et les graphiques" />
    </Screen>
  );
}
