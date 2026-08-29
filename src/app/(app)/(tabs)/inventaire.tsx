/**
 * Inventaire.
 *
 * Miroir de `app/dashboard/inventory/page.tsx` du back-office : même titre, même sous-titre, même place
 * dans le menu. La STRUCTURE est en place ; le lot 8 branche les données et
 * les actions.
 */
import { PageHeader, PasEncore, Screen } from "@/ui";

export default function Inventaire() {
  return (
    <Screen scroll edges={[]}>
      <PageHeader title="Inventaire" subtitle="Gérez vos sessions d'inventaire et comptages de stock" />
      <PasEncore icon="ClipboardList" lot={8} quoi="les sessions d'inventaire et la feuille de comptage" table="inventory_sessions" />
    </Screen>
  );
}
