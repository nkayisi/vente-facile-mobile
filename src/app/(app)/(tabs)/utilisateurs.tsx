/**
 * Gestion des utilisateurs.
 *
 * Miroir de `app/dashboard/users/page.tsx` du back-office : même titre, même sous-titre, même place
 * dans le menu. La STRUCTURE est en place ; le lot 10 branche les données et
 * les actions.
 */
import { PageHeader, PasEncore, Screen } from "@/ui";

export default function Utilisateurs() {
  return (
    <Screen scroll>
      <PageHeader title="Gestion des utilisateurs" subtitle="Gérez les membres de votre organisation et leurs rôles" />
      <PasEncore icon="UserCog" lot={10} quoi="les membres, les rôles et les permissions individuelles" />
    </Screen>
  );
}
