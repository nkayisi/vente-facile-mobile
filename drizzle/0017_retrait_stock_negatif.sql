-- Lot E10 : le stock negatif n'existe plus, `allow_negative_stock` ne decide
-- plus rien (lot E3). Le terminal retire la colonne de ses deux caches.
--
-- Le serveur la nomme ENCORE dans son manifeste, pour les terminaux anciens
-- (leur colonne est NOT NULL sans defaut : la retirer du manifeste ferait
-- echouer leur tirage). L'ingestion de ce terminal ignore desormais toute
-- colonne que son schema ne declare pas (`src/sync/colonnes.ts`). Le serveur
-- la retirera une fois le parc sur cette version (lot E10b, apres E9).
--
-- Aucune remise a zero du point de reprise : retirer une colonne ne rend
-- aucune ligne perimee.
ALTER TABLE `products` DROP COLUMN `allow_negative_stock`;--> statement-breakpoint
ALTER TABLE `warehouses` DROP COLUMN `allow_negative_stock`;