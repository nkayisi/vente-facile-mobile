package expo.modules.imprimantecablee

import android.app.Activity
import android.os.Bundle

/**
 * Le gestionnaire déclaré des imprimantes USB (voir le manifeste du module).
 *
 * Il n'a rien à faire : c'est sa DÉCLARATION qui compte, parce qu'elle permet
 * à Android de proposer « Toujours » quand l'application demande l'accès à
 * l'imprimante. Ouverte au branchement de l'imprimante (au démarrage du
 * terminal, pour une imprimante interne), elle se ferme aussitôt.
 */
class UsbAttacheeActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    finish()
  }
}
