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
import m0008 from './0008_photos_articles.sql';
import m0009 from './0009_jeton_de_perimetre.sql';
import m0010 from './0010_requisitions.sql';
import m0011 from './0011_devise_par_ligne.sql';
import m0012 from './0012_seuils_decimaux.sql';
import m0013 from './0013_cagnotte_en_argent.sql';
import m0014 from './0014_registre_cagnotte.sql';
import m0015 from './0015_unite_suppression_douce.sql';
import m0016 from './0016_fonds_par_devise.sql';
import m0017 from './0017_retrait_stock_negatif.sql';

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
m0007,
m0008,
m0009,
m0010,
m0011,
m0012,
m0013,
m0014,
m0015,
m0016,
m0017
    }
  }
  