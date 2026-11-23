package expo.modules.lecteurcodes

import android.content.Context
import android.view.KeyEvent
import expo.modules.core.interfaces.Package
import expo.modules.core.interfaces.ReactActivityHandler

/**
 * Reçoit les touches qu'une modale React Native renvoie à l'activité.
 *
 * ⚠ Le nom du fichier finit par `Package.kt` et l'import de
 * `expo.modules.core.interfaces.Package` est écrit en clair : c'est à ces deux
 * signes que l'autoliaison d'Expo trouve la classe. Sans eux, la saisie de
 * quantité ne verrait jamais le lecteur, sans la moindre erreur.
 */
class LecteurCodesPackage : Package {
  override fun createReactActivityHandlers(activityContext: Context?): List<ReactActivityHandler> =
    listOf(object : ReactActivityHandler {
      override fun onKeyUp(keyCode: Int, event: KeyEvent): Boolean = Capture.depuisUneModale(event)
    })
}
