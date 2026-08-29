/**
 * Mon profil.
 *
 * Miroir de `app/dashboard/profil/page.tsx` du back-office : même titre, même sous-titre, même place
 * dans le menu. La STRUCTURE est en place ; le lot 11 branche les données et
 * les actions.
 */
import { PageHeader, PasEncore, Screen } from "@/ui";

export default function Profil() {
  return (
    <Screen scroll edges={[]}>
      <PageHeader title="Mon profil" subtitle="Gérez vos informations personnelles et votre sécurité" />
      <PasEncore icon="User" lot={11} quoi="la photo, les informations personnelles et le changement de mot de passe" />
    </Screen>
  );
}
