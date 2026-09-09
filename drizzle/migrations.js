// This file is required for Expo/React Native SQLite migrations - https://orm.drizzle.team/quick-sqlite/expo

import journal from './meta/_journal.json';
import m0000 from './0000_socle.sql';
import m0001 from './0001_paniers_en_attente.sql';
import m0002 from './0002_documents_imprimables.sql';
import m0003 from './0003_operations_de_stock.sql';
import m0004 from './0004_sessions_inventaire.sql';
import m0005 from './0005_personnes_et_appareils.sql';
import m0006 from './0006_retours_et_devis.sql';
import m0007 from './0007_index_inventaire.sql';

  export default {
    journal,
    migrations: {
      m0000,
m0001,
m0002,
m0003,
m0004,
m0005,
m0006,
m0007
    }
  }
  