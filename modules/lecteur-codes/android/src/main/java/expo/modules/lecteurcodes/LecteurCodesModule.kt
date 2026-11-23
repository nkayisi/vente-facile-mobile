package expo.modules.lecteurcodes

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

/** Une marque de lecteur en mode message : l'action diffusée, la clé du code. */
class Diffusion : Record {
  @Field val action: String = ""
  @Field val cle: String = ""
}

class OptionsCapture : Record {
  /** Le `nativeID` du champ de recherche, seul champ dont on prend les touches. */
  @Field val champRecherche: String? = null
  @Field val diffusions: List<Diffusion> = emptyList()
}

class LecteurCodesModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("LecteurCodes")
    Events("onTouche", "onCodeDiffuse")

    OnCreate {
      Capture.emetteur = { nom, corps -> sendEvent(nom, corps) }
    }

    OnActivityEntersForeground {
      Capture.envelopper(appContext.currentActivity)
    }

    Function("activer") { options: OptionsCapture ->
      Capture.envelopper(appContext.currentActivity)
      Capture.activer(
        options.champRecherche,
        options.diffusions.filter { it.action.isNotBlank() && it.cle.isNotBlank() }
          .map { it.action to it.cle },
        appContext.reactContext
      )
    }

    Function("desactiver") {
      Capture.desactiver()
    }

    OnDestroy {
      Capture.desactiver()
      Capture.emetteur = null
    }
  }
}
