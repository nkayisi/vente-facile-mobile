/**
 * Livre de caisse.
 *
 * Miroir de `app/dashboard/cashbook/page.tsx` du back-office : même titre, même sous-titre, même place
 * dans le menu. La STRUCTURE est en place ; le lot 9 branche les données et
 * les actions.
 */
import { PageHeader, PasEncore, Screen } from "@/ui";

export default function Caisse() {
  return (
    <Screen scroll>
      <PageHeader title="Livre de caisse" subtitle="Suivi des entrées et sorties de caisse" />
      <PasEncore icon="Wallet" lot={9} quoi="les mouvements par devise, les dépenses et les rapports de caisse" />
    </Screen>
  );
}
