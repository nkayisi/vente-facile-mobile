-- La fidélité devient une cagnotte en ARGENT : trois tables tirées changent de forme.
--
-- ⚠ CE QUE DRIZZLE AVAIT ENGENDRÉ NE POUVAIT PAS S'EXÉCUTER. Il émettait six
--   `ALTER TABLE ... ADD <colonne> NOT NULL` sans valeur par défaut, et SQLite
--   les REFUSE dès que la table porte une ligne (« Cannot add a NOT NULL column
--   with default value NULL ») - c'est-à-dire sur tout terminal en service. La
--   migration aurait échoué au démarrage, après l'installation de la mise à jour.
--   Le corps est donc réécrit à la main ; l'instantané `meta/0013_snapshot.json`,
--   lui, décrit bien la forme d'arrivée et n'est pas touché.
--
-- ⚠ ON RECRÉE LES DEUX TABLES DE FIDÉLITÉ PLUTÔT QUE DE RENOMMER, et c'est sans
--   perte : ce sont des CACHES du serveur, jamais écrites localement (doctrine
--   « les tables tirées ne sont écrites que par le TIRAGE »). Le tirage les
--   remplira.

DROP TABLE `loyalty_programs`;--> statement-breakpoint
CREATE TABLE `loyalty_programs` (
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`is_active` integer NOT NULL,
	`earn_percent` text NOT NULL,
	`max_redemption_percent` text NOT NULL,
	`only_registered_customers` integer NOT NULL,
	`legacy_point_value` text
);--> statement-breakpoint
DROP TABLE `customer_loyalty`;--> statement-breakpoint
CREATE TABLE `customer_loyalty` (
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`total_earned` text NOT NULL,
	`total_used` text NOT NULL,
	`balance` text NOT NULL,
	`tier` text NOT NULL,
	`last_earned_at` integer,
	`last_used_at` integer
);--> statement-breakpoint
CREATE INDEX `customer_loyalty_customer_id_idx` ON `customer_loyalty` (`customer_id`);--> statement-breakpoint

-- ⚠ CELLE-CI EST UN RENOMMAGE, PAS UNE RECRÉATION, et son curseur n'est donc pas
--   remis à zéro : `ALTER TABLE ... RENAME COLUMN` CONSERVE la valeur, et le
--   renommage côté serveur est une opération de schéma qui n'a touché aucune
--   ligne - donc `updated_at` n'a pas bougé et le tirage n'a rien à redescendre.
ALTER TABLE `organization_settings` RENAME COLUMN `show_loyalty_points_on_receipt` TO `show_loyalty_on_receipt`;--> statement-breakpoint

-- ⚠ SANS CETTE LIGNE, LA CAGNOTTE DE CHAQUE CLIENT RESTE VIDE POUR TOUJOURS.
--   Les deux tables viennent d'être recréées, donc elles sont vides - mais
--   `sync_state` dit encore « à jour ». La sonde `pull/changed/` répondrait
--   « rien de neuf », l'écran annoncerait « Complet, à l'instant », et le
--   comptoir accorderait du crédit sur un solde à zéro. Effacer le point de
--   reprise force le tirage à les reprendre EN ENTIER. C'est ce que `scope_token`
--   fait déjà lorsqu'un PÉRIMÈTRE change (vider la table + remettre son état à
--   zéro), transposé à un changement de FORME.
DELETE FROM `sync_state` WHERE "table" IN ('loyalty_programs', 'customer_loyalty');
