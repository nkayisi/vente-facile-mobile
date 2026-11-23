package expo.modules.imprimantecablee

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.usb.UsbConstants
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbEndpoint
import android.hardware.usb.UsbInterface
import android.hardware.usb.UsbManager
import android.os.Build
import android.util.Base64
import android.util.Log
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.net.InetSocketAddress
import java.net.Socket

/**
 * Les imprimantes câblées : USB (hôte USB d'Android) et réseau (port 9100).
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE MODULE ÉCRIT DES OCTETS, ET RIEN D'AUTRE.                             │
 * │                                                                          │
 * │ Le ticket est mis en page et rastérisé en JavaScript, comme pour toutes  │
 * │ les imprimantes (`src/printing/octets-escpos.ts`) : la même page sort    │
 * │ sur le Bluetooth, l'USB et le réseau. Ici on ne fait que la porter       │
 * │ jusqu'à la machine.                                                      │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
class ImprimanteCableeModule : Module() {
  private val contexte: Context
    get() = appContext.reactContext ?: throw CodedException("CONTEXTE", "Contexte Android indisponible.", null)

  private val usb: UsbManager?
    get() = contexte.getSystemService(Context.USB_SERVICE) as? UsbManager

  /** Une seule demande d'autorisation à la fois : la boîte d'Android est modale. */
  @Volatile private var demandeEnCours: Promise? = null

  override fun definition() = ModuleDefinition {
    Name("ImprimanteCablee")

    AsyncFunction("listerUsb") {
      val gestionnaire = usb ?: return@AsyncFunction emptyList<Map<String, Any?>>()
      gestionnaire.deviceList.values.mapNotNull { appareil ->
        val voie = voieDe(appareil) ?: return@mapNotNull null
        mapOf(
          "cle" to cleDe(appareil),
          "nom" to nomDe(appareil),
          "classeImprimante" to voie.classeImprimante,
          "autorisee" to gestionnaire.hasPermission(appareil),
        )
      }
    }

    AsyncFunction("demanderPermissionUsb") { cle: String, promise: Promise ->
      val gestionnaire = usb
      val appareil = gestionnaire?.let { trouver(it, cle) }
      if (gestionnaire == null || appareil == null) {
        promise.resolve(false)
        return@AsyncFunction
      }
      if (gestionnaire.hasPermission(appareil)) {
        promise.resolve(true)
        return@AsyncFunction
      }
      if (demandeEnCours != null) {
        promise.reject(CodedException("DEMANDE_EN_COURS", "Une demande d'autorisation est déjà ouverte.", null))
        return@AsyncFunction
      }
      demanderPermission(gestionnaire, appareil, promise)
    }

    AsyncFunction("envoyerUsb") { cle: String, base64: String ->
      envoyerUsb(cle, Base64.decode(base64, Base64.DEFAULT))
    }

    AsyncFunction("envoyerTcp") { hote: String, port: Int, base64: String ->
      envoyerTcp(hote, port, Base64.decode(base64, Base64.DEFAULT))
    }
  }

  /** La voie d'écriture d'un appareil : une interface et son point de sortie « bulk ». */
  private class Voie(val interfaceUsb: UsbInterface, val sortie: UsbEndpoint, val classeImprimante: Boolean)

  /**
   * ⚠ Trois classes, et une seule est sûre. La classe « imprimante » (7) est
   * celle de la norme ; beaucoup d'imprimantes de caisse se déclarent pourtant
   * « propres au fabricant » (255), et certaines passent par un port série
   * virtuel (données CDC, 10). Ces deux-là ne sont proposées qu'au CHOIX du
   * marchand, jamais prises d'office (`classeImprimante` le dit à JavaScript).
   */
  private fun voieDe(appareil: UsbDevice): Voie? {
    var repli: Voie? = null
    for (i in 0 until appareil.interfaceCount) {
      val intf = appareil.getInterface(i)
      val classe = intf.interfaceClass
      if (classe != UsbConstants.USB_CLASS_PRINTER &&
        classe != UsbConstants.USB_CLASS_VENDOR_SPEC &&
        classe != UsbConstants.USB_CLASS_CDC_DATA
      ) continue
      val sortie = (0 until intf.endpointCount)
        .map { intf.getEndpoint(it) }
        .firstOrNull { it.type == UsbConstants.USB_ENDPOINT_XFER_BULK && it.direction == UsbConstants.USB_DIR_OUT }
        ?: continue
      val voie = Voie(intf, sortie, classe == UsbConstants.USB_CLASS_PRINTER)
      if (voie.classeImprimante) return voie
      if (repli == null) repli = voie
    }
    return repli
  }

  /**
   * « vid:pid » en hexadécimal. Stable d'un démarrage à l'autre, là où le nom
   * Android (/dev/bus/usb/007/002) change ; le numéro de série, lui, ne se lit
   * pas sans autorisation.
   */
  private fun cleDe(appareil: UsbDevice): String =
    "%04x:%04x".format(appareil.vendorId, appareil.productId)

  private fun nomDe(appareil: UsbDevice): String {
    val produit = appareil.productName?.trim().orEmpty()
    val fabricant = appareil.manufacturerName?.trim().orEmpty()
    return when {
      produit.isNotEmpty() && fabricant.isNotEmpty() && !produit.contains(fabricant, ignoreCase = true) -> "$fabricant $produit"
      produit.isNotEmpty() -> produit
      fabricant.isNotEmpty() -> fabricant
      else -> "Imprimante USB"
    }
  }

  private fun trouver(gestionnaire: UsbManager, cle: String): UsbDevice? =
    gestionnaire.deviceList.values.firstOrNull { cleDe(it) == cle && voieDe(it) != null }

  private fun demanderPermission(gestionnaire: UsbManager, appareil: UsbDevice, promise: Promise) {
    val ctx = contexte.applicationContext
    val action = "${ctx.packageName}.AUTORISATION_IMPRIMANTE_USB"
    demandeEnCours = promise
    val recepteur = object : BroadcastReceiver() {
      override fun onReceive(context: Context?, intent: Intent?) {
        if (intent?.action != action) return
        try {
          ctx.unregisterReceiver(this)
        } catch (_: IllegalArgumentException) {
        }
        val accordee = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false)
        demandeEnCours = null
        promise.resolve(accordee)
      }
    }
    val filtre = IntentFilter(action)
    // Le système renvoie NOTRE PendingIntent : la diffusion vient de nous.
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      ctx.registerReceiver(recepteur, filtre, Context.RECEIVER_NOT_EXPORTED)
    } else {
      ctx.registerReceiver(recepteur, filtre)
    }
    // ⚠ MUTABLE, et c'est obligatoire : Android y ajoute la réponse
    // (EXTRA_PERMISSION_GRANTED). Le paquet est nommé, ce que exige un
    // PendingIntent mutable depuis Android 14.
    val drapeaux = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0
    val demande = PendingIntent.getBroadcast(ctx, 0, Intent(action).setPackage(ctx.packageName), drapeaux)
    gestionnaire.requestPermission(appareil, demande)
  }

  private fun envoyerUsb(cle: String, octets: ByteArray) {
    val gestionnaire = usb ?: throw CodedException("ABSENTE", "Ce terminal n'a pas d'hôte USB.", null)
    val appareil = trouver(gestionnaire, cle)
      ?: throw CodedException("ABSENTE", "L'imprimante USB n'est pas branchée.", null)
    if (!gestionnaire.hasPermission(appareil)) {
      throw CodedException("PERMISSION", "Android n'autorise pas encore l'accès à l'imprimante USB.", null)
    }
    val voie = voieDe(appareil) ?: throw CodedException("VOIE", "Aucune voie d'écriture sur cet appareil.", null)
    val connexion = gestionnaire.openDevice(appareil)
      ?: throw CodedException("OUVERTURE", "L'imprimante USB n'a pas pu être ouverte.", null)
    try {
      // `force` détache le pilote du noyau (usblp), qui tient l'imprimante
      // sous /dev/usb/lp0 : sans cela, l'interface est déjà prise.
      if (!connexion.claimInterface(voie.interfaceUsb, true)) {
        throw CodedException("OUVERTURE", "L'imprimante USB est occupée.", null)
      }
      try {
        var position = 0
        while (position < octets.size) {
          val longueur = minOf(MORCEAU, octets.size - position)
          val ecrits = connexion.bulkTransfer(voie.sortie, octets, position, longueur, DELAI_MS)
          if (ecrits <= 0) {
            throw CodedException("ECRITURE", "L'imprimante USB n'a pas accepté le ticket (papier, capot ?).", null)
          }
          position += ecrits
        }
        Log.i(TAG, "envoyerUsb: ${octets.size} octets vers $cle")
      } finally {
        connexion.releaseInterface(voie.interfaceUsb)
      }
    } finally {
      connexion.close()
    }
  }

  private fun envoyerTcp(hote: String, port: Int, octets: ByteArray) {
    try {
      Socket().use { prise ->
        prise.connect(InetSocketAddress(hote, port), CONNEXION_MS)
        prise.soTimeout = DELAI_MS
        prise.getOutputStream().apply {
          write(octets)
          flush()
        }
      }
      Log.i(TAG, "envoyerTcp: ${octets.size} octets vers $hote:$port")
    } catch (e: Exception) {
      throw CodedException("RESEAU", "L'imprimante réseau $hote:$port ne répond pas.", e)
    }
  }

  private companion object {
    const val TAG = "ImprimanteCablee"
    /** Bien des contrôleurs refusent une écriture « bulk » de plus de 16 Ko. */
    const val MORCEAU = 16384
    const val DELAI_MS = 5000
    const val CONNEXION_MS = 4000
  }
}
