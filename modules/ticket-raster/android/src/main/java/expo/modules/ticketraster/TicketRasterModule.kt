package expo.modules.ticketraster

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.os.Handler
import android.os.Looper
import android.util.Base64
import android.util.Log
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import android.webkit.WebViewClient
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * La page du ticket, dessinee une fois, pour toutes les imprimantes.
 *
 * +--------------------------------------------------------------------------+
 * | UN SEUL RASTERISEUR, PARCE QU'IL N'Y A QU'UN SEUL DOCUMENT.              |
 * |                                                                          |
 * | `render-html.ts` EST la mise en page du ticket : police, interligne,     |
 * | video inversee du bandeau, colonnes des couples libelle/montant. Le PDF   |
 * | la rend telle quelle. L'imprimante integree la rasterisait ici meme, et   |
 * | le Bluetooth, lui, recevait du TEXTE de 32 colonnes - un autre document,  |
 * | sans bandeau ni hierarchie de police, accents retires. Deux machines, un  |
 * | seul marchand, deux papiers differents pour la meme vente.                |
 * |                                                                          |
 * | Ce module rend donc la page en POINTS, et rien d'autre. Il ne sait ni ce  |
 * | qu'est une imprimante, ni comment on lui parle : `nyx-printer` en fait un |
 * | bitmap pour son service AIDL, le pilote Bluetooth en fait des commandes   |
 * | `GS v 0`. La mise en page, elle, n'est decidee qu'une fois.               |
 * +--------------------------------------------------------------------------+
 *
 * Le format de sortie est **1 bit par point, MSB d'abord, 1 = noir, chaque
 * rangee alignee sur l'octet**. Ce n'est pas un choix esthetique : c'est
 * exactement la charge utile que `GS v 0` attend, et c'est 48 Ko pour un ticket
 * long la ou du RGBA en ferait 1,8 Mo a faire traverser le pont.
 */
class TicketRasterModule : Module() {

  override fun definition() = ModuleDefinition {
    Name("TicketRaster")

    /**
     * Dessine une page HTML et rend ses points.
     *
     * @param html        la page produite par `rendreHtml`
     * @param widthPx     largeur IMPRIMABLE en points de chauffe (58 mm = 384, 80 mm = 576)
     * @param pageWidthMm largeur pour laquelle la page est dessinee, en millimetres
     * @return { width, height, data } - `data` en base64, 1 bit par point
     */
    AsyncFunction("rasteriser") { html: String, widthPx: Int, pageWidthMm: Double, promise: Promise ->
      Handler(Looper.getMainLooper()).post {
        try {
          rasteriser(html, widthPx, pageWidthMm.toFloat()) { bitmap ->
            if (bitmap == null) {
              promise.reject(
                CodedException(
                  "RENDER_FAILED",
                  "Le ticket n'a pas pu etre dessine. Reessayez ; si cela persiste, " +
                    "choisissez « PDF a partager » dans les reglages.",
                  null
                )
              )
              return@rasteriser
            }
            try {
              val points = empaqueter(bitmap)
              val largeur = bitmap.width
              val hauteur = bitmap.height
              bitmap.recycle()
              // ON NE FAIT PAS DEFILER DU PAPIER POUR RIEN. Une page toute
              // blanche coute un ticket au marchand et ne dit rien au client ;
              // mieux vaut un message qui nomme le probleme. Le controle se
              // fait sur les BITS : ils viennent d'etre comptes, la seconde
              // lecture pixel a pixel de l'ancien `estVierge` ne sert plus.
              if (points.all { it.toInt() == 0 }) {
                Log.e(TAG, "rasteriser: le rendu est vierge (${largeur}x$hauteur)")
                promise.reject(
                  CodedException("RENDER_BLANK", "La page dessinee est vide.", null)
                )
                return@rasteriser
              }
              promise.resolve(
                mapOf(
                  "width" to largeur,
                  "height" to hauteur,
                  "data" to Base64.encodeToString(points, Base64.NO_WRAP)
                )
              )
            } catch (e: Exception) {
              Log.e(TAG, "rasteriser: empaquetage impossible", e)
              promise.reject(CodedException("RENDER_FAILED", e.message ?: "Echec du rendu", e))
            }
          }
        } catch (e: Exception) {
          Log.e(TAG, "rasteriser: echec", e)
          promise.reject(CodedException("RENDER_FAILED", e.message ?: "Echec du rendu", e))
        }
      }
    }
  }

  /**
   * Les points d'un bitmap, un bit chacun.
   *
   * Le seuil est celui d'une tete thermique : elle n'a qu'un etat par point, il
   * n'y a pas de gris a rendre. On lit par RANGEES plutot que pixel a pixel,
   * `getPixel` traversant le JNI a chaque appel.
   */
  private fun empaqueter(bitmap: Bitmap): ByteArray {
    val largeur = bitmap.width
    val hauteur = bitmap.height
    // La rangee est alignee sur l'octet, et la largeur ne l'est pas forcement :
    // une tete de 384 points tombe juste, une page mesuree peut ne pas le faire.
    val octetsParRangee = (largeur + 7) / 8
    val out = ByteArray(octetsParRangee * hauteur)
    val rangee = IntArray(largeur)

    for (y in 0 until hauteur) {
      bitmap.getPixels(rangee, 0, largeur, 0, y, largeur, 1)
      val base = y * octetsParRangee
      for (x in 0 until largeur) {
        val couleur = rangee[x]
        val luminance =
          (Color.red(couleur) * 299 + Color.green(couleur) * 587 + Color.blue(couleur) * 114) / 1000
        if (luminance < SEUIL) {
          val i = base + (x shr 3)
          out[i] = (out[i].toInt() or (0x80 shr (x and 7))).toByte()
        }
      }
    }
    return out
  }

  /**
   * Dessine une page HTML dans un bitmap de `widthPx` de large.
   *
   * LA PAGE EST CONCUE EN MILLIMETRES, le papier se compte en POINTS DE CHAUFFE
   * (384 sur 58 mm, 576 sur 80 mm). Sans mise a l'echelle, la WebView rendrait la
   * page a la densite de l'ecran - 658 points pour 58 mm sur ce terminal - et le
   * ticket sortirait tronque a droite. On calcule donc le rapport une fois, depuis
   * la definition meme du millimetre CSS (96 points par pouce), plutot que de le
   * deviner. La largeur de la page vient de l'appelant : la figer a 58 rendait le
   * 80 mm inatteignable.
   */
  private fun rasteriser(
    html: String,
    widthPx: Int,
    pageWidthMm: Float,
    suite: (Bitmap?) -> Unit
  ) {
    // +------------------------------------------------------------------------+
    // | UNE WEBVIEW DOIT ETRE ATTACHEE POUR COMPOSER SON CONTENU.              |
    // |                                                                        |
    // | Detachee, elle LIT et DISPOSE le HTML - la hauteur mesuree etait juste |
    // | - mais Chromium ne compose jamais : `draw(Canvas)` rend un rectangle   |
    // | blanc. Mesure sur le terminal : « le rendu est vierge (384x278) ». Le  |
    // | papier defilait sans rien marquer, alors que le test du constructeur   |
    // | imprimait.                                                             |
    // |                                                                        |
    // | On l'attache donc a la vue racine de l'activite, DECALEE HORS CHAMP    |
    // | plutot qu'en `alpha = 0` : une vue totalement transparente peut etre   |
    // | ecartee du rendu, ce qui ramenerait le rectangle blanc.                |
    // +------------------------------------------------------------------------+
    val activite = appContext.activityProvider?.currentActivity
    val racine = activite?.findViewById<ViewGroup>(android.R.id.content)
    if (racine == null) {
      Log.e(TAG, "rasteriser: aucune activite pour heberger le rendu")
      suite(null)
      return
    }

    val vue = WebView(activite)
    vue.settings.javaScriptEnabled = false
    vue.settings.loadWithOverviewMode = false
    vue.settings.useWideViewPort = false
    vue.setBackgroundColor(Color.WHITE)
    // +------------------------------------------------------------------------+
    // | UNE WEBVIEW ACCELEREE MATERIELLEMENT NE SE DESSINE PAS DANS UN BITMAP. |
    // |                                                                        |
    // | `View.draw(Canvas)` sur un canevas LOGICIEL ne capture rien quand la   |
    // | vue rend par le GPU : la mise en page est bonne - la hauteur mesuree    |
    // | vaut 899 px, donc le HTML a bien ete lu et dispose - mais le canevas    |
    // | reste vierge. Il ne sort alors qu'un rectangle blanc, et l'imprimante   |
    // | fait defiler le papier sans rien marquer. C'est exactement le symptome  |
    // | « une feuille blanche sort » alors que le test du constructeur imprime. |
    // +------------------------------------------------------------------------+
    vue.setLayerType(View.LAYER_TYPE_SOFTWARE, null)
    // +------------------------------------------------------------------------+
    // | UNE VUE HORS CHAMP NE DOIT DESSINER QUE LA PAGE.                       |
    // |                                                                        |
    // | `View.draw(Canvas)` ne dessine pas que le contenu : il appelle aussi    |
    // | `onDrawScrollBars`. Une WebView a ses barres de defilement ACTIVES par  |
    // | defaut, en mode « inside overlay », et Chromium appelle                 |
    // | `awakenScrollBars()` au chargement de la page. Elles restent visibles   |
    // | 300 ms (`ViewConfiguration.getScrollDefaultDelay`) puis s'estompent sur |
    // | 250 ms de plus - or on capture 350 ms apres `onPageFinished`, donc en   |
    // | pleine fenetre. La barre verticale se retrouvait DANS le bitmap, et le  |
    // | ticket sortait avec un trait noir continu sur tout son bord droit.      |
    // |                                                                        |
    // | ⚠ NE PAS « CORRIGER » EN ALLONGEANT LE DELAI. Attendre que la barre     |
    // | s'efface marcherait aujourd'hui et retarderait chaque ticket ; le jour  |
    // | ou un appareil garde ses barres visibles - le systeme laisse ce reglage |
    // | a l'utilisateur - le trait reviendrait sans que rien ne le signale.     |
    // | Ce qu'on veut n'est pas qu'elles aient disparu, c'est qu'elles          |
    // | n'existent pas : cette vue n'est jamais touchee, elle est rendue.       |
    // +------------------------------------------------------------------------+
    vue.isVerticalScrollBarEnabled = false
    vue.isHorizontalScrollBarEnabled = false
    // L'effet de rebond laisse lui aussi une trace sur le canevas quand la mise
    // en page bouge encore au moment de la capture.
    vue.overScrollMode = View.OVER_SCROLL_NEVER
    racine.addView(vue, ViewGroup.LayoutParams(widthPx, ViewGroup.LayoutParams.WRAP_CONTENT))
    vue.translationX = -(widthPx * 2).toFloat()

    /** Retire la vue de la hierarchie. A appeler sur TOUTES les sorties. */
    fun retirer() {
      runCatching { racine.removeView(vue) }
      runCatching { vue.destroy() }
    }

    // +------------------------------------------------------------------------+
    // | `setInitialScale` EST UNE ECHELLE ABSOLUE, PAS UN POURCENTAGE DE LA     |
    // | DENSITE DE L'ECRAN.                                                     |
    // |                                                                        |
    // | Elle vaut `points de l'appareil / point CSS`. Le code d'origine         |
    // | multipliait la largeur naturelle par `displayMetrics.density`, comme si |
    // | les 100 % designaient l'echelle par defaut de la WebView. Sur un        |
    // | terminal de densite 3, 58 mm donnaient alors 58 % au lieu de 175 %, et  |
    // | la fenetre de mise en page valait 662 points CSS pour une page large de |
    // | 219 : le ticket occupait UN TIERS du rouleau, le reste sortant blanc.   |
    // |                                                                        |
    // | Le rapport juste est donc celui de la largeur de chauffe a la largeur   |
    // | de la page, exprimee dans la definition meme du millimetre CSS          |
    // | (96 points par pouce). La densite de l'ecran n'y entre pas : on ne rend |
    // | pas pour l'ecran, on rend pour une tete d'impression.                   |
    // +------------------------------------------------------------------------+
    val largeurPageCss = pageWidthMm / MM_PAR_POUCE * POINTS_CSS_PAR_POUCE
    val echelle = Math.round(widthPx / largeurPageCss * 100f).coerceIn(1, 1000)
    // Journalise : c'est le seul nombre qui explique un ticket trop etroit ou
    // tronque, et il ne se lit sur aucun papier.
    Log.i(TAG, "rasteriser: page ${pageWidthMm}mm -> ${widthPx}pt, echelle ${echelle}%")
    vue.setInitialScale(echelle)

    var rendu = false
    // UN SEUL Handler, et il est partage. `removeCallbacks` ne retire que les
    // messages postes par CETTE instance : en fabriquer un second pour annuler
    // le filet le laisserait courir, et il detruirait la WebView en plein rendu.
    val principal = Handler(Looper.getMainLooper())
    // UNE PROMESSE QUI NE SE REGLE PAS EST PIRE QU'UN ECHEC : l'ecran tourne
    // sans fin, le caissier ne sait ni que c'est rate, ni pourquoi, et il finit
    // par reappuyer. Si la page ne se charge pas - WebView indisponible, HTML
    // refuse - ce filet rend la main avec un motif.
    val filet = Runnable {
      if (!rendu) {
        rendu = true
        Log.e(TAG, "rasteriser: la page ne s'est pas chargee a temps")
        retirer()
        suite(null)
      }
    }
    principal.postDelayed(filet, DELAI_MAXIMAL_MS)

    vue.webViewClient = object : WebViewClient() {
      override fun onPageFinished(view: WebView, url: String?) {
        if (rendu) return
        rendu = true
        principal.removeCallbacks(filet)
        // La mise en page ne s'acheve pas avec le chargement : sans ce delai,
        // la hauteur mesuree est celle d'une page encore vide et le ticket sort
        // blanc. Le defaut ne se voit pas sur un document court.
        // +----------------------------------------------------------------+
        // | `view.postDelayed` NE S'EXECUTE JAMAIS SUR UNE VUE DETACHEE.   |
        // |                                                                |
        // | Android met le runnable dans la file d'attente de la VUE       |
        // | (`mRunQueue`) et ne la vide qu'au rattachement a une fenetre.  |
        // | Notre WebView est deliberement hors ecran : le runnable restait |
        // | en file pour toujours, la promesse ne se reglait NI dans un     |
        // | sens NI dans l'autre, et l'ecran restait a tourner.             |
        // +----------------------------------------------------------------+
        principal.postDelayed({
          try {
            view.measure(
              View.MeasureSpec.makeMeasureSpec(widthPx, View.MeasureSpec.EXACTLY),
              View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED)
            )
            view.layout(0, 0, widthPx, view.measuredHeight)
            val hauteur = view.measuredHeight.coerceAtLeast(1)
            val bitmap = Bitmap.createBitmap(widthPx, hauteur, Bitmap.Config.ARGB_8888)
            Canvas(bitmap).apply {
              drawColor(Color.WHITE)
              view.draw(this)
            }
            retirer()
            suite(bitmap)
          } catch (e: Exception) {
            Log.e(TAG, "rasteriser: echec", e)
            retirer()
            suite(null)
          }
        }, DELAI_MISE_EN_PAGE_MS)
      }
    }
    vue.loadDataWithBaseURL(null, html, "text/html", "utf-8", null)
  }

  companion object {
    private const val TAG = "TicketRaster"
    private const val DELAI_MISE_EN_PAGE_MS = 350L
    /** Au-dela, on rend la main avec un motif plutot que de tourner sans fin. */
    private const val DELAI_MAXIMAL_MS = 8000L
    private const val MM_PAR_POUCE = 25.4f
    private const val POINTS_CSS_PAR_POUCE = 96f
    /** Le seuil d'une thermique : ce qui n'est pas clair marque. */
    private const val SEUIL = 200
  }
}
