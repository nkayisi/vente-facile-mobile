/**
 * Clients & Fournisseurs.
 *
 * Miroir de `app/dashboard/contacts/page.tsx` du back-office : même titre, même sous-titre, même place
 * dans le menu. La STRUCTURE est en place ; le lot 6 branche les données et
 * les actions.
 */
import { PageHeader, PasEncore, Screen } from "@/ui";

export default function Contacts() {
  return (
    <Screen scroll>
      <PageHeader title="Clients & Fournisseurs" subtitle="Gérez vos clients, fournisseurs et leurs informations" />
      <PasEncore icon="Users" lot={6} quoi="la fiche client, les règlements, avances et ajustements de solde, et les fournisseurs" />
    </Screen>
  );
}
