/**
 * Gestion de stock.
 *
 * Miroir de `app/dashboard/stock/page.tsx` du back-office : même titre, même sous-titre, même place
 * dans le menu. La STRUCTURE est en place ; le lot 7 branche les données et
 * les actions.
 */
import { PageHeader, PasEncore, Screen } from "@/ui";

export default function Stock() {
  return (
    <Screen scroll>
      <PageHeader title="Gestion de stock" subtitle="Vue d'ensemble de vos entrepôts, niveaux de stock et mouvements" />
      <PasEncore icon="Boxes" lot={7} quoi="les niveaux, les entrepôts, les transferts et les ajustements" />
    </Screen>
  );
}
