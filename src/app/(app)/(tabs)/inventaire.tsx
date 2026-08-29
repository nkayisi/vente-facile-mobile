/**
 * Inventaire. Miroir de `app/dashboard/inventory/page.tsx`.
 *
 * C'est le meilleur usage mobile du produit : on compte debout dans le rayon,
 * le terminal à la main. Il arrive au lot 8.
 *
 * **Rien n'est lisible ici pour l'instant, et c'est structurel** : la table
 * `inventory_sessions` n'est PAS au manifeste de tirage. L'écran le dit au
 * développeur en développement, et se contente d'annoncer au marchand.
 */
import { PageHeader, PasEncore, Screen } from "@/ui";

export default function Inventaire() {
  return (
    <Screen scroll edges={[]}>
      <PageHeader
        title="Inventaire"
        subtitle="Gérez vos sessions d'inventaire et comptages de stock"
      />
      <PasEncore
        icon="ClipboardList"
        lot={8}
        quoi="les sessions d'inventaire et la feuille de comptage, remplie debout dans le rayon"
        table="inventory_sessions"
      />
    </Screen>
  );
}
