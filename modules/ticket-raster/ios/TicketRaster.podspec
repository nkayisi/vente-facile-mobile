Pod::Spec.new do |s|
  s.name           = 'TicketRaster'
  s.version        = '0.1.0'
  s.summary        = 'Rasterise la page du ticket, pour toutes les imprimantes.'
  s.description    = 'Dessine la page HTML du ticket et rend ses points, 1 bit par point.'
  s.license        = 'MIT'
  s.author         = 'Vente Facile'
  s.homepage       = 'https://ventefacile.app'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: 'https://github.com/nkayisi/vente-facile.git' }
  s.static_framework = true
  s.swift_version  = '5.9'

  s.dependency 'ExpoModulesCore'

  s.source_files = "**/*.{h,m,swift}"
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES'
  }
end
