/**
 * Ventes.
 *
 * Miroir de `app/dashboard/sales/page.tsx` du back-office : même titre, même sous-titre, même place
 * dans le menu. La STRUCTURE est en place ; le lot 6 branche les données et
 * les actions.
 */
import { PageHeader, PasEncore, Screen } from "@/ui";

export default function Ventes() {
  return (
    <Screen scroll>
      <PageHeader title="Ventes" />
      <PasEncore icon="ShoppingCart" lot={6} quoi="l'historique, le détail d'une vente, les règlements en attente et les caisses" />
    </Screen>
  );
}
