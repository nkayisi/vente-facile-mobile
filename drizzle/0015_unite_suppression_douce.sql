-- Une unité supprimée au back-office redescend désormais en pierre tombale.
--
-- ⚠ `DEFAULT false`, ET C'EST OBLIGATOIRE : SQLite refuse d'ajouter une colonne
--   NOT NULL sans valeur par défaut à une table qui porte déjà des lignes - donc
--   sur tout terminal en service. Ce que drizzle-kit engendrait ici aurait fait
--   échouer la migration AU DÉMARRAGE, après l'installation de la mise à jour :
--   le piège déjà payé par 0013. Les lignes présentes sont toutes vivantes (le
--   serveur ne supprimait pas en douceur), d'où faux.
--
-- ⚠ Le curseur de `units` n'est PAS remis à zéro : les lignes présentes restent
--   justes, et les pierres tombales partent désormais d'elles-mêmes. Les unités
--   supprimées AVANT ce changement, elles, n'ont jamais laissé de pierre tombale
--   et resteront sur les terminaux qui les ont : effacer la table pour les
--   chasser priverait le comptoir des noms d'unité jusqu'au prochain réseau,
--   tickets compris.
ALTER TABLE `units` ADD `is_deleted` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `units` ADD `deleted_at` integer;
