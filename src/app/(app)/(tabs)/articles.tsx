/**
 * Produits.
 *
 * Miroir de `app/dashboard/products/page.tsx` du back-office : même titre, même sous-titre, même place
 * dans le menu. La STRUCTURE est en place ; le lot 8 branche les données et
 * les actions.
 */
import { PageHeader, PasEncore, Screen } from "@/ui";

export default function Articles() {
  return (
    <Screen scroll>
      <PageHeader title="Produits" />
      <PasEncore icon="Package" lot={8} quoi="le catalogue, les quatre prix par canal, les catégories, marques et unités" />
    </Screen>
  );
}
