package expo.modules.lecteurcodes

import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.view.KeyCharacterMap
import android.view.KeyEvent
import android.view.Window
import android.widget.EditText
import java.lang.ref.WeakReference
import java.util.WeakHashMap

/**
 * La capture des lecteurs de codes intégrés.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE MODULE EST UN TUYAU : IL NE DÉCIDE PAS CE QU'EST UN SCAN.             │
 * │                                                                          │
 * │ La règle (quatre caractères à moins de quarante millisecondes, puis      │
 * │ Entrée) vit dans `@vente-facile/core`, la même que celle du back-office. │
 * │ Ici on ne fait que prendre les touches d'un clavier PHYSIQUE - un        │
 * │ lecteur en mode clavier en est un - et les transmettre à JavaScript,    │
 * │ avec l'instant où elles sont arrivées.                                   │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Deux portes, parce qu'une modale React Native est une AUTRE fenêtre :
 * - la fenêtre de l'activité : `FenetreEcoutee` voit chaque touche AVANT les
 *   vues, champ focalisé compris, et la consomme ;
 * - une modale (la saisie de quantité) : son `OnKeyListener` renvoie les
 *   touches RELÂCHÉES à `activity.onKeyUp` (`ReactModalHostView`), où
 *   `LecteurCodesPackage` les reçoit.
 */
object Capture {
  /** Lu sur le fil d'interface, écrit depuis JavaScript. */
  @Volatile private var actif = false
  @Volatile private var champRecherche: String? = null

  /** Émet un événement vers JavaScript : posé par le module, retiré à sa fin. */
  @Volatile var emetteur: ((String, Map<String, Any?>) -> Unit)? = null

  private val fenetres = WeakHashMap<Window, Boolean>()
  private var activite: WeakReference<Activity>? = null
  private var recepteur: BroadcastReceiver? = null
  private var contexteRecepteur: Context? = null

  fun activer(champ: String?, diffusions: List<Pair<String, String>>, contexte: Context?) {
    champRecherche = champ
    actif = true
    if (contexte != null) ecouterDiffusions(contexte, diffusions)
  }

  fun desactiver() {
    actif = false
    arreterDiffusions()
  }

  /**
   * Enveloppe la fenêtre de l'activité, une seule fois. Appelée à chaque
   * passage au premier plan : un autre composant (Sentry) peut avoir enveloppé
   * la fenêtre entre-temps, et l'envelopper de nouveau empilerait deux fois le
   * même travail.
   */
  fun envelopper(activity: Activity?) {
    val a = activity ?: return
    activite = WeakReference(a)
    val fenetre = a.window ?: return
    synchronized(fenetres) {
      if (fenetres.containsKey(fenetre)) return
      val base = fenetre.callback ?: return
      fenetre.callback = FenetreEcoutee(base)
      fenetres[fenetre] = true
    }
  }

  /** La fenêtre de l'activité : consomme et transmet, champ focalisé compris. */
  fun depuisLaFenetre(event: KeyEvent): Boolean {
    if (!actif || !physique(event) || modificateur(event)) return false
    val touche = toucheDe(event) ?: return false
    // Un AUTRE champ que la recherche garde ses touches : le web ignore lui
    // aussi tout champ de saisie qui n'est pas la recherche.
    if (autreChampFocalise()) return false
    when (event.action) {
      KeyEvent.ACTION_DOWN -> if (event.repeatCount == 0) emettre(touche, event.eventTime)
      KeyEvent.ACTION_UP -> Unit
      else -> return false
    }
    return true
  }

  /**
   * Une touche RELÂCHÉE renvoyée par une modale. On ne prend que celles qui
   * viennent réellement d'une modale : quand la fenêtre de l'activité a le
   * focus, c'est `depuisLaFenetre` qui a déjà décidé.
   */
  fun depuisUneModale(event: KeyEvent): Boolean {
    if (!actif || event.action != KeyEvent.ACTION_UP) return false
    if (!physique(event) || modificateur(event)) return false
    if (activite?.get()?.hasWindowFocus() == true) return false
    val touche = toucheDe(event) ?: return false
    emettre(touche, event.eventTime)
    // Consommée : son Entrée n'active pas le bouton qui aurait pris le focus.
    return true
  }

  /**
   * Un clavier physique : un lecteur en mode clavier en est un. Le clavier
   * LOGICIEL n'est jamais pris : il valide son texte sans événement de touche,
   * et son « Effacer » vient du clavier virtuel.
   */
  private fun physique(event: KeyEvent): Boolean {
    if (event.deviceId == KeyCharacterMap.VIRTUAL_KEYBOARD) return false
    val appareil = event.device ?: return false
    return !appareil.isVirtual
  }

  private fun modificateur(event: KeyEvent): Boolean =
    event.isCtrlPressed || event.isAltPressed || event.isMetaPressed

  /** Le caractère, « Enter » ou « Backspace » ; `null` pour tout le reste (Maj, flèches). */
  private fun toucheDe(event: KeyEvent): String? = when (event.keyCode) {
    KeyEvent.KEYCODE_ENTER, KeyEvent.KEYCODE_NUMPAD_ENTER -> "Enter"
    KeyEvent.KEYCODE_DEL -> "Backspace"
    else -> {
      val c = event.getUnicodeChar(event.metaState)
      if (c >= 0x20 && (c and KeyCharacterMap.COMBINING_ACCENT) == 0) String(Character.toChars(c)) else null
    }
  }

  private fun autreChampFocalise(): Boolean {
    val vue = activite?.get()?.currentFocus as? EditText ?: return false
    val id = vue.getTag(com.facebook.react.R.id.view_tag_native_id) as? String
    return id == null || id != champRecherche
  }

  private fun emettre(touche: String, instant: Long) {
    emetteur?.invoke("onTouche", mapOf("touche" to touche, "instant" to instant.toDouble()))
  }

  /**
   * Les lecteurs en mode MESSAGE (Sunmi, Urovo, Newland…) : chaque marque
   * diffuse le code sous sa propre action, avec sa propre clé. La table vient
   * de JavaScript, qui la tient et la teste.
   */
  private fun ecouterDiffusions(contexte: Context, diffusions: List<Pair<String, String>>) {
    arreterDiffusions()
    if (diffusions.isEmpty()) return
    val cles = diffusions.groupBy({ it.first }, { it.second })
    val filtre = IntentFilter().apply { cles.keys.forEach { addAction(it) } }
    val r = object : BroadcastReceiver() {
      override fun onReceive(context: Context?, intent: Intent?) {
        if (!actif || intent == null) return
        val code = cles[intent.action]?.firstNotNullOfOrNull { lireCode(intent, it) }?.trim()
        if (code.isNullOrEmpty()) return
        emetteur?.invoke("onCodeDiffuse", mapOf("code" to code))
      }
    }
    val app = contexte.applicationContext
    // Exporté : c'est l'application du lecteur qui diffuse.
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      app.registerReceiver(r, filtre, Context.RECEIVER_EXPORTED)
    } else {
      app.registerReceiver(r, filtre)
    }
    recepteur = r
    contexteRecepteur = app
  }

  private fun lireCode(intent: Intent, cle: String): String? {
    intent.getStringExtra(cle)?.let { return it }
    intent.getByteArrayExtra(cle)?.let { return String(it, Charsets.UTF_8) }
    return null
  }

  private fun arreterDiffusions() {
    val r = recepteur ?: return
    try {
      contexteRecepteur?.unregisterReceiver(r)
    } catch (_: IllegalArgumentException) {
      // Déjà retiré : rien à faire.
    }
    recepteur = null
    contexteRecepteur = null
  }
}

/** La fenêtre de l'activité, écoutée avant ses vues. */
private class FenetreEcoutee(private val base: Window.Callback) : Window.Callback by base {
  override fun dispatchKeyEvent(event: KeyEvent): Boolean =
    Capture.depuisLaFenetre(event) || base.dispatchKeyEvent(event)
}
