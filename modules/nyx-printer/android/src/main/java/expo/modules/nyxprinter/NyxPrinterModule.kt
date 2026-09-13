package expo.modules.nyxprinter

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.graphics.Bitmap
import android.graphics.Color
import android.os.IBinder
import android.util.Base64
import android.util.Log
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import net.nyx.printerservice.print.IPrinterService
import net.nyx.printerservice.print.PrintTextFormat

/** Une ligne de ticket recue depuis JS. Miroir de `LigneImprimee` (render-text.ts). */
class ReceiptLine : Record {
  @Field var text: String = ""
  @Field var align: String = "left"   // left | center | right
  @Field var bold: Boolean = false
  @Field var scale: Int = 1            // 1 = normal, 2 = double (titre)
  /** Taille de police (textSize NYX). 0 = defaut du service. */
  @Field var size: Int = 0
  /** Interligne supplementaire en points. 0 = compact (defaut). */
  @Field var lineSpacing: Int = 0
}

/**
 * Pont vers l'imprimante thermique integree des terminaux NYX.
 *
 * +--------------------------------------------------------------------------+
 * | CE MODULE EST UN TRANSPORT, PLUS UN MOTEUR DE RENDU.                     |
 * |                                                                          |
 * | Il portait sa propre WebView pour rasteriser la page du ticket. Cette     |
 * | rasterisation a demenage dans `ticket-raster`, module a part et commun    |
 * | aux deux plateformes : le Bluetooth en a besoin exactement autant, et     |
 * | deux rasteriseurs, ce sont deux mises en page qui finissent par diverger. |
 * | Ici ne reste que ce qui parle AU MATERIEL : lier le service, declarer la  |
 * | largeur, la densite, envoyer les points.                                  |
 * +--------------------------------------------------------------------------+
 *
 * +--------------------------------------------------------------------------+
 * | LE SERVICE EST LE MEME, SON IDENTIFIANT D'APPLICATION NE L'EST PAS.      |
 * |                                                                          |
 * | Les classes du service sont toujours `net.nyx.printerservice.*`, mais    |
 * | les terminaux rebadges le publient sous un autre identifiant. Releve sur |
 * | un Noryox NB55 (Android 13) :                                            |
 * |                                                                          |
 * |   com.incar.printerservice.IPrinterService:                              |
 * |       com.incar.printerservice/net.nyx.printerservice.print.PrinterService|
 * |                                                                          |
 * | Un couple (paquet, action) en dur ne sert donc qu'un parc. On essaie une |
 * | LISTE, pour qu'un seul binaire couvre les deux familles.                 |
 * |                                                                          |
 * | ⚠ Chaque paquet liste ici doit AUSSI figurer dans le `<queries>` du      |
 * | manifeste du module : sans cela Android 11+ le cache, et `bindService`   |
 * | rend false sans lever et sans rien ecrire au journal.                    |
 * +--------------------------------------------------------------------------+
 */
class NyxPrinterModule : Module() {
  private var printerService: IPrinterService? = null
  private var bound = false
  /**
   * Relache des que le service repond.
   *
   * LA LIAISON EST ASYNCHRONE, et c'est ce qui rend ce verrou necessaire :
   * `bindService` rend la main avant `onServiceConnected`. Sans attente, le
   * premier ticket d'un demarrage a froid trouverait `printerService` a null,
   * `disponible()` rendrait false, et l'echelle de transports descendrait
   * jusqu'au PDF - c'est-a-dire la feuille de partage, precisement ce que
   * l'imprimante integree existe pour eviter. Le defaut ne se verrait qu'a
   * froid, et un rechargement a chaud le ferait disparaitre.
   */
  @Volatile private var connexion = CountDownLatch(1)

  private val ctx: Context
    get() = appContext.reactContext
      ?: throw CodedException("CONTEXT_UNAVAILABLE", "Contexte Android indisponible", null)

  private val connection = object : ServiceConnection {
    override fun onServiceConnected(name: ComponentName?, service: IBinder?) {
      printerService = IPrinterService.Stub.asInterface(service)
      bound = true
      Log.i(TAG, "Service imprimante connecte ($name)")
      // APRES le verrou : les allers-retours IPC du diagnostic, meme brefs,
      // n'ont pas a retarder le premier ticket d'un demarrage a froid.
      connexion.countDown()
      journaliserMateriel(printerService)
    }
    override fun onServiceDisconnected(name: ComponentName?) {
      printerService = null
      bound = false
      connexion = CountDownLatch(1)
      Log.w(TAG, "Service imprimante deconnecte ($name)")
    }
  }

  override fun definition() = ModuleDefinition {
    Name("NyxPrinter")

    OnCreate { bindPrinter() }

    OnDestroy {
      try {
        if (bound) ctx.unbindService(connection)
      } catch (_: Exception) {
      }
      bound = false
      printerService = null
    }

    AsyncFunction("isAvailable") {
      attendreService() != null
    }

    /**
     * L'etat reel de l'imprimante, pas seulement celui du service.
     *
     * 0 = prete. Les autres valeurs disent un rouleau vide, un capot ouvert ou
     * une surchauffe - c'est-a-dire les trois raisons pour lesquelles un ticket
     * ne sort pas alors que tout le logiciel a reussi.
     */
    AsyncFunction("getStatus") {
      attendreService()?.printerStatus ?: -1
    }

    /**
     * Ce que cette machine dit d'elle-meme. Un DIAGNOSTIC, et rien de plus.
     *
     * +----------------------------------------------------------------------+
     * | LA LARGEUR DU PAPIER NE SE DETECTE PAS, ET C'EST MESURE.             |
     * |                                                                       |
     * | On a cru pouvoir la sonder : l'AIDL dit que `setPaperWidth` n'accepte  |
     * | que 384 sur une 58 mm, donc un 576 accepte devait signer une tete de   |
     * | 80. Releve sur le NB55 : `setPaperWidth(576)` rend 0, sur un terminal  |
     * | dont le papier fait 58 mm et dont les tickets sortent justes a 384.    |
     * |                                                                       |
     * | La relecture de l'AIDL dit pourquoi : « Primarily used for printing    |
     * | 58mm paper on 80mm printer ». C'est un REGLAGE de ce qui est charge,   |
     * | pas une question sur ce que la machine sait faire - et le papier       |
     * | charge n'est une propriete d'aucune machine. Seul le marchand le sait, |
     * | et la regle de calibration est le seul moyen de le verifier.           |
     * |                                                                       |
     * | Ce qui reste ici ne decide donc de RIEN : cela repond a « quelle est   |
     * | cette machine », quand un ticket sort de travers et qu'on cherche.     |
     * +----------------------------------------------------------------------+
     *
     * ⚠ CHAQUE LECTURE EST INDEPENDANTE. Groupees, la premiere qui leve
     * emportait les trois autres : releve sur le NB55, `getPrinterModel` rend
     * « bad array lengths » et le journal n'a jamais porte NI le modele, NI la
     * version, NI la densite - alors que deux d'entre elles repondent.
     */
    AsyncFunction("capacites") {
      val svc = attendreService()
      mapOf(
        "modele" to (svc?.let { texteSortant { t -> it.getPrinterModel(t) } } ?: ""),
        "version" to (svc?.let { texteSortant { t -> it.getPrinterVersion(t) } } ?: ""),
        "service" to (svc?.let { runCatching { it.serviceVersion }.getOrNull() } ?: ""),
        "densite" to (svc?.let { nombreSortant { d -> it.getPrinterDensity(d) } } ?: 0)
      )
    }

    /**
     * Les points du ticket, tels qu'ils ont ete dessines.
     *
     * +--------------------------------------------------------------------------+
     * | LE MODELE DU DOCUMENT NE TIENT PAS DANS `printText`.                     |
     * |                                                                          |
     * | L'API NYX n'a PAS de video inversee : le bandeau d'identite              |
     * | (« FACTURE PROFORMA » en blanc sur noir) retombait sur des filets. Elle   |
     * | n'a pas non plus de colonnes : un couple libelle/montant se cale a        |
     * | l'espace, donc a la chasse de SA police, et les montants sortent en       |
     * | escalier des que cette police n'est pas a chasse fixe. Le papier ne       |
     * | ressemblait pas au document que le client recoit en PDF.                  |
     * |                                                                          |
     * | `printBitmap` (11e position de l'AIDL du constructeur) resout les deux    |
     * | d'un coup : on envoie la page DESSINEE. Video inversee, police,           |
     * | interligne, alignements : tout est deja decide par la feuille de style,   |
     * | et le thermique se contente de la reproduire.                             |
     * +--------------------------------------------------------------------------+
     *
     * @param data    les points, en base64, 1 bit par point, MSB d'abord, 1 = noir
     * @param width   largeur en points de chauffe (58 mm = 384, 80 mm = 576)
     * @param height  hauteur en points
     * @param densite noirceur de chaque point, deja bornee par JS a ce que cette
     *                largeur accepte (58 mm : 80 a 130 ; 80 mm : 100 a 130)
     */
    AsyncFunction("printRaster") { data: String, width: Int, height: Int, densite: Int, promise: Promise ->
      val svc = attendreService()
      if (svc == null) {
        promise.reject(
          CodedException(
            "PRINTER_UNAVAILABLE",
            "Le service d'impression du terminal ne repond pas.",
            null
          )
        )
        return@AsyncFunction
      }

      try {
        val bitmap = decoder(data, width, height)
        Log.i(TAG, "printRaster: ${width}x$height")
        // +--------------------------------------------------------------+
        // | ON DECLARE LA LARGEUR DE PAPIER AU SERVICE.                  |
        // |                                                              |
        // | `setPaperWidth` existe pour cela, et l'AIDL du constructeur  |
        // | le dit : « primarily used for printing 58mm paper on 80mm    |
        // | printer ». Sans cet appel, le service compose dans SA largeur |
        // | configuree : un terminal a tete de 80 mm charge de papier de |
        // | 58 placerait notre image de 384 points dans une zone de 576, |
        // | et le ticket sortirait etroit, avec du blanc de part et      |
        // | d'autre - sans qu'aucun code de retour ne le signale.        |
        // |                                                              |
        // | ⚠ ON LUI DIT CE QU'ON A DESSINE, ON NE LUI DEMANDE RIEN.     |
        // | Le code de retour ne renseigne PAS sur la machine : releve sur |
        // | le NB55, `setPaperWidth(576)` rend 0 alors que son papier fait |
        // | 58 mm. C'est un reglage de ce qui est charge, et le papier     |
        // | charge n'est une propriete d'aucune machine.                   |
        // |                                                                |
        // | Toleree en echec : la methode date de PrinterService v2.0.5, et |
        // | un service plus ancien imprime tres bien sans elle.            |
        // +--------------------------------------------------------------+
        runCatching { svc.setPaperWidth(width) }
          .onFailure { Log.w(TAG, "setPaperWidth($width) indisponible : ${it.message}") }
        // +--------------------------------------------------------------+
        // | LA DENSITE N'AVAIT JAMAIS ETE ECRITE.                        |
        // |                                                              |
        // | `journaliserMateriel` la LIT depuis le portage ; rien ne      |
        // | l'ecrivait. Le terminal imprimait donc a la valeur laissee    |
        // | par le constructeur, et c'est elle qui decide de la noirceur  |
        // | de chaque point - donc de la survie d'un fut fin de 5,8       |
        // | points au seuillage. Symptome releve au comptoir : « le texte |
        // | qui n'est pas en gras n'est pas tres visible ».               |
        // +--------------------------------------------------------------+
        runCatching { svc.setPrinterDensity(densite) }
          .onSuccess { Log.i(TAG, "setPrinterDensity($densite)") }
          .onFailure { Log.w(TAG, "setPrinterDensity($densite) indisponible : ${it.message}") }
        // type 0 = noir et blanc : un ticket est du texte, pas une photo.
        // Le niveau de gris dithererait les filets et le bandeau.
        val ret = svc.printBitmap(bitmap, 0, 0)
        bitmap.recycle()
        if (ret != 0) {
          Log.e(TAG, "printBitmap a renvoye $ret")
          promise.reject(CodedException("PRINTER_ERROR", messageDEtat(ret), null))
          return@AsyncFunction
        }
        runCatching { svc.printEndAutoOut() }
        promise.resolve(true)
      } catch (e: Exception) {
        Log.e(TAG, "printRaster: echec", e)
        promise.reject(CodedException("PRINT_FAILED", e.message ?: "Echec de l'impression", e))
      }
    }

    /**
     * Le ticket, ligne par ligne.
     *
     * REPLI, et seulement repli : il n'a ni video inversee, ni colonnes, ni
     * hierarchie de police. Il sert quand le rasteriseur manque, parce qu'un
     * ticket qui ne sort pas du tout est le seul echec inacceptable.
     */
    AsyncFunction("printReceipt") { lines: List<ReceiptLine>, promise: Promise ->
      val svc = attendreService()
      if (svc == null) {
        Log.w(TAG, "printReceipt appele mais service non lie")
        promise.reject(
          CodedException(
            "PRINTER_UNAVAILABLE",
            "Le service d'impression du terminal ne repond pas.",
            null
          )
        )
        return@AsyncFunction
      }
      val etat = runCatching { svc.printerStatus }.getOrDefault(0)
      if (etat != 0) {
        // On le dit AVANT d'engager du papier : un demi-ticket coute un rouleau
        // et fait douter le client.
        Log.e(TAG, "printReceipt: imprimante en erreur, etat $etat")
        promise.reject(CodedException("PRINTER_ERROR", messageDEtat(etat), null))
        return@AsyncFunction
      }
      try {
        Log.i(TAG, "printReceipt: impression de ${lines.size} ligne(s)")
        for (line in lines) {
          val fmt = PrintTextFormat()
          fmt.align = when (line.align) { "center" -> 1; "right" -> 2; else -> 0 }
          fmt.style = if (line.bold) 1 else 0
          if (line.size > 0) fmt.textSize = line.size
          fmt.lineSpacing = line.lineSpacing.toFloat()
          if (line.scale >= 2) {
            fmt.textScaleX = 2.0f
            fmt.textScaleY = 2.0f
          }
          val ret = svc.printText(line.text + "\n", fmt)
          // +------------------------------------------------------------------+
          // | ON S'ARRETE A LA PREMIERE LIGNE REFUSEE.                         |
          // |                                                                  |
          // | Le code d'origine JOURNALISAIT le refus et CONTINUAIT la boucle, |
          // | puis resolvait `true`. Quand l'imprimante s'arretait - rouleau    |
          // | vide, capot, surchauffe - les lignes suivantes etaient refusees   |
          // | une a une, le client repartait avec un DEMI-TICKET, et l'ecran    |
          // | annoncait « ticket imprime ».                                     |
          // +------------------------------------------------------------------+
          if (ret != 0) {
            Log.e(TAG, "printText a renvoye $ret a la ligne « ${line.text} »")
            promise.reject(CodedException("PRINTER_ERROR", messageDEtat(ret), null))
            return@AsyncFunction
          }
        }
        // Le service sait avancer jusqu'a la decoupe : trois sauts de ligne
        // n'en etaient qu'une imitation, et sur un modele a massicot ils
        // laissaient le ticket coince sous la lame.
        runCatching { svc.printEndAutoOut() }
        Log.i(TAG, "printReceipt: termine avec succes")
        promise.resolve(true)
      } catch (e: Exception) {
        Log.e(TAG, "printReceipt: echec", e)
        promise.reject(CodedException("PRINT_FAILED", e.message ?: "Echec de l'impression", e))
      }
    }
  }

  /**
   * Le service, en laissant a la liaison le temps d'aboutir.
   *
   * Rend `null` si aucun candidat ne repond : l'appelant se rabat alors sur un
   * autre transport, il n'echoue pas.
   */
  private fun attendreService(): IPrinterService? {
    printerService?.let { return it }
    bindPrinter()
    return try {
      connexion.await(DELAI_LIAISON_MS, TimeUnit.MILLISECONDS)
      printerService
    } catch (_: InterruptedException) {
      Thread.currentThread().interrupt()
      null
    }
  }

  /**
   * Les points d'un ticket, vers un bitmap que `printBitmap` sait lire.
   *
   * Le format d'entree est celui de `ticket-raster` : 1 bit par point, MSB
   * d'abord, 1 = noir, chaque rangee alignee sur l'octet. C'est aussi, mot pour
   * mot, la charge utile de `GS v 0` : la meme page part au Bluetooth sans une
   * seule conversion.
   */
  private fun decoder(data: String, width: Int, height: Int): Bitmap {
    val points = Base64.decode(data, Base64.NO_WRAP)
    val octetsParRangee = (width + 7) / 8
    val attendu = octetsParRangee * height
    if (points.size < attendu) {
      throw CodedException(
        "RASTER_TRUNCATED",
        "Les points du ticket sont incomplets (${points.size} octets pour $attendu attendus).",
        null
      )
    }
    val pixels = IntArray(width * height)
    for (y in 0 until height) {
      val base = y * octetsParRangee
      val ligne = y * width
      for (x in 0 until width) {
        val bit = (points[base + (x shr 3)].toInt() shr (7 - (x and 7))) and 1
        pixels[ligne + x] = if (bit == 1) Color.BLACK else Color.WHITE
      }
    }
    return Bitmap.createBitmap(pixels, width, height, Bitmap.Config.ARGB_8888)
  }

  /**
   * Ce qu'un code de retour non nul veut dire, pour le caissier.
   *
   * On NOMME les causes physiques sans pretendre deviner laquelle : le
   * constructeur ne publie pas la table des codes, et affirmer « rouleau vide »
   * sur une surchauffe enverrait chercher du papier pendant que la tete
   * refroidit. Le code brut est joint, il sert au diagnostic.
   */
  private fun messageDEtat(code: Int): String =
    "L'imprimante a refuse le ticket (code $code). " +
      "Verifiez le rouleau, le capot, et laissez refroidir si elle a beaucoup imprime."

  /**
   * Une lecture AIDL a parametre sortant, isolee de ses voisines.
   *
   * Le service ecrit dans le tableau qu'on lui passe, et certaines de ces
   * methodes levent `bad array lengths` sur un firmware rebadge. Les envelopper
   * une a une, c'est garder les reponses de celles qui marchent.
   */
  private fun texteSortant(lecture: (Array<String>) -> Unit): String =
    runCatching {
      val sortie = arrayOf("")
      lecture(sortie)
      sortie[0]
    }.getOrDefault("")

  private fun nombreSortant(lecture: (IntArray) -> Unit): Int =
    runCatching {
      val sortie = IntArray(1)
      lecture(sortie)
      sortie[0]
    }.getOrDefault(0)

  /**
   * Ce que le materiel dit de lui-meme, une fois par liaison.
   *
   * Modele, version et densite ne changent rien a l'impression : ils repondent
   * a la seule question qu'aucun calcul ne tranche depuis un bureau - quelle
   * est la largeur REELLE de cette tete. Un ticket « trop etroit » n'a pas la
   * meme cause selon que la tete chauffe 384 points ou 576, et le marchand ne
   * peut pas la lire sur son papier.
   *
   * Tout est tolere en echec : un diagnostic ne doit jamais empecher de vendre.
   */
  private fun journaliserMateriel(svc: IPrinterService?) {
    if (svc == null) return
    Log.i(
      TAG,
      "materiel: modele=${texteSortant { svc.getPrinterModel(it) }} " +
        "version=${texteSortant { svc.getPrinterVersion(it) }} " +
        "densite=${nombreSortant { svc.getPrinterDensity(it) }} " +
        "service=${runCatching { svc.serviceVersion }.getOrDefault("?")}"
    )
  }

  private fun bindPrinter() {
    if (bound) return
    for ((paquet, action) in CANDIDATS) {
      try {
        val intent = Intent().apply {
          setPackage(paquet)
          this.action = action
        }
        val ok = ctx.bindService(intent, connection, Context.BIND_AUTO_CREATE)
        Log.i(TAG, "bindService($paquet) -> $ok")
        if (ok) return
        // Un bind refuse laisse quand meme la connexion enregistree cote
        // systeme : on la retire avant d'essayer le candidat suivant, sinon
        // le desabonnement final leverait sur une connexion inconnue.
        try {
          ctx.unbindService(connection)
        } catch (_: Exception) {
        }
      } catch (e: Exception) {
        Log.e(TAG, "bindService($paquet) a echoue", e)
      }
    }
    Log.w(TAG, "Aucun service d'impression integre n'a repondu")
  }

  companion object {
    private const val TAG = "NyxPrinter"
    private const val DELAI_LIAISON_MS = 1500L

    /**
     * Les couples (paquet, action) essayes dans l'ordre.
     *
     * Le rebadge d'abord : c'est le parc qu'on a sous la main. Un terminal NYX
     * d'origine paie alors un aller-retour de liaison refusee, une fois, au
     * demarrage - ce qui ne se voit pas.
     */
    private val CANDIDATS = listOf(
      "com.incar.printerservice" to "com.incar.printerservice.IPrinterService",
      "net.nyx.printerservice" to "net.nyx.printerservice.IPrinterService",
    )
  }
}
