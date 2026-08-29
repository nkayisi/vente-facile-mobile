/**
 * Rapports & Statistiques. Miroir de `app/dashboard/reports/page.tsx`.
 *
 * Le back-office a HUIT onglets. En rendu étroit il les replie sur trois ou
 * quatre lignes, ce qui mange la moitié de l'écran avant le premier chiffre ;
 * `Segmented` les fait défiler horizontalement, en laissant le dernier
 * partiellement visible pour que la coupe se voie. Écart au web assumé, et il
 * va dans le bon sens.
 *
 * Les libellés et leur ordre sont ceux du web, mot pour mot.
 *
 * Le contenu attend le lot 10, qui étend le socle d'export serveur
 * (`ReportSpec` + `render_report_pdf`) aux endpoints `/reports/statistics/*`.
 * C'est la bonne dépendance : recalculer ces agrégats sur le terminal les
 * ferait diverger de ceux du back-office, ce que ce lot existe pour éviter.
 */
import { useState } from "react";
import { View } from "react-native";

import { PageHeader, PasEncore, Screen, Segmented } from "@/ui";

type Onglet =
  | "overview" | "daily-cash" | "sales" | "products"
  | "customers" | "stock" | "profits" | "user-activity";

const ONGLETS: { valeur: Onglet; label: string; quoi: string }[] = [
  { valeur: "overview", label: "Vue d'ensemble", quoi: "le flux de trésorerie et les meilleurs clients" },
  { valeur: "daily-cash", label: "Rapport journalier", quoi: "le rapport de caisse d'une journée" },
  { valeur: "sales", label: "Ventes", quoi: "les ventes par article et par catégorie" },
  { valeur: "products", label: "Produits", quoi: "le détail des produits vendus" },
  { valeur: "customers", label: "Clients", quoi: "les meilleurs clients et leurs achats" },
  { valeur: "stock", label: "Stock", quoi: "le résumé des mouvements et l'état du stock" },
  { valeur: "profits", label: "Bénéfices", quoi: "les bénéfices et les marges par produit" },
  { valeur: "user-activity", label: "Par utilisateur", quoi: "l'activité de chaque utilisateur" },
];

export default function Rapports() {
  const [onglet, setOnglet] = useState<Onglet>("overview");
  const courant = ONGLETS.find((o) => o.valeur === onglet) ?? ONGLETS[0];

  return (
    <Screen scroll edges={[]} padded={false}>
      <View className="px-4 pt-2">
        <PageHeader
          title="Rapports & Statistiques"
          subtitle="Analysez les performances de votre entreprise"
        />
      </View>
      <View className="mt-4">
        <Segmented
          options={ONGLETS.map((o) => ({ valeur: o.valeur, label: o.label }))}
          valeur={onglet}
          onChange={(v) => setOnglet(v as Onglet)}
        />
      </View>
      <PasEncore icon="BarChart3" lot={10} quoi={courant.quoi} />
    </Screen>
  );
}
