/**
 * Mouvements de stock.
 *
 * Miroir de `app/dashboard/stock/movements/page.tsx` du back-office : même titre, même sous-titre, même place
 * dans le menu. La STRUCTURE est en place ; le lot 7 branche les données et
 * les actions.
 */
import { PageHeader, PasEncore, Screen } from "@/ui";

export default function Mouvements() {
  return (
    <Screen scroll edges={[]}>
      <PageHeader title="Mouvements de stock" subtitle="Historique des entrées et sorties de stock" />
      <PasEncore icon="ClipboardList" lot={7} quoi="le journal des entrées et sorties, et la saisie d'un mouvement" />
    </Screen>
  );
}
