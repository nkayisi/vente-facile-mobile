import ExpoModulesCore
import UIKit
import WebKit

/**
 La page du ticket, dessinee une fois, pour toutes les imprimantes.

 Miroir exact de `TicketRasterModule.kt` : meme entree, meme calcul d'echelle,
 meme format de sortie - 1 bit par point, MSB d'abord, 1 = noir, chaque rangee
 alignee sur l'octet. Deux plateformes, un seul document.

 ⚠ NON VERIFIE SUR MATERIEL. La compilation iOS est bloquee sur ce poste
 (composant « iOS platform support » absent d'Xcode), donc ce fichier est ecrit
 contre la documentation d'UIKit et de WebKit, pas contre un ecran. Ce qui reste
 a eprouver tient en deux points, et ce sont les deux memes qu'Android a payes :
 la vue doit etre DANS la hierarchie pour que WebKit compose, et il faut laisser
 la mise en page s'achever avant de mesurer.
 */
public class TicketRasterModule: Module {
  /// Les rendus en cours. Sans cette retenue, ARC libere la WebView et son
  /// delegue avant `didFinish`, et la promesse ne se regle jamais.
  private var rendus: [Rendu] = []

  public func definition() -> ModuleDefinition {
    Name("TicketRaster")

    AsyncFunction("rasteriser") {
      (html: String, widthPx: Int, pageWidthMm: Double, promise: Promise) in
      DispatchQueue.main.async {
        let rendu = Rendu(html: html, widthPx: widthPx, pageWidthMm: pageWidthMm)
        self.rendus.append(rendu)
        rendu.lancer { [weak self] resultat in
          self?.rendus.removeAll { $0 === rendu }
          switch resultat {
          case .success(let sortie):
            promise.resolve([
              "width": sortie.largeur,
              "height": sortie.hauteur,
              "data": sortie.points.base64EncodedString()
            ])
          case .failure(let erreur):
            promise.reject(
              "RENDER_FAILED",
              "Le ticket n'a pas pu etre dessine (\(erreur.localizedDescription)). "
                + "Reessayez ; si cela persiste, choisissez « PDF a partager » dans les reglages."
            )
          }
        }
      }
    }
  }
}

private struct SortieRaster {
  let largeur: Int
  let hauteur: Int
  let points: Data
}

private enum ErreurRaster: LocalizedError {
  case sansFenetre
  case pageVide
  case delaiDepasse

  var errorDescription: String? {
    switch self {
    case .sansFenetre: return "aucune fenetre pour heberger le rendu"
    case .pageVide: return "la page dessinee est vide"
    case .delaiDepasse: return "la page ne s'est pas chargee a temps"
    }
  }
}

/// Un rendu, du HTML aux points. Une instance par appel : la WebView, son
/// delegue et son filet de securite vivent et meurent ensemble.
private class Rendu: NSObject, WKNavigationDelegate {
  private let html: String
  private let widthPx: Int
  private let pageWidthMm: Double
  private var vue: WKWebView?
  private var suite: ((Result<SortieRaster, Error>) -> Void)?
  private var termine = false

  private static let millimetresParPouce = 25.4
  private static let pointsCssParPouce = 96.0
  /// Le temps que la mise en page s'acheve : mesurer trop tot rend une page
  /// encore vide, et le ticket sort blanc.
  private static let delaiMiseEnPage = 0.35
  private static let delaiMaximal = 8.0
  /// Le seuil d'une thermique : ce qui n'est pas clair marque.
  private static let seuil: UInt8 = 200

  init(html: String, widthPx: Int, pageWidthMm: Double) {
    self.html = html
    self.widthPx = widthPx
    self.pageWidthMm = pageWidthMm
  }

  func lancer(_ suite: @escaping (Result<SortieRaster, Error>) -> Void) {
    self.suite = suite

    // ⚠ LA VUE DOIT ETRE DANS LA HIERARCHIE POUR QUE WEBKIT COMPOSE, et c'est
    // le defaut qu'Android a paye : detachee, elle lit et dispose le HTML - la
    // hauteur mesuree est juste - mais le rendu sort BLANC. On l'attache donc a
    // la fenetre, DECALEE HORS CHAMP plutot qu'en `alpha = 0` : une vue
    // totalement transparente peut etre ecartee du rendu.
    guard let fenetre = Self.fenetre() else {
      conclure(.failure(ErreurRaster.sansFenetre))
      return
    }

    let largeurCss = pageWidthMm / Self.millimetresParPouce * Self.pointsCssParPouce
    let config = WKWebViewConfiguration()
    let vue = WKWebView(frame: CGRect(x: 0, y: 0, width: largeurCss, height: 1), configuration: config)
    vue.isOpaque = true
    vue.backgroundColor = .white
    vue.scrollView.backgroundColor = .white
    vue.scrollView.isScrollEnabled = false
    // Les indicateurs de defilement sont dessines par le UIScrollView, donc
    // captures par `drawHierarchy` : sur Android, la meme barre laissait un
    // trait noir continu sur tout le bord droit du ticket. Le scroll est deja
    // coupe ci-dessus ; ceci coupe ce qui le REPRESENTE.
    vue.scrollView.showsVerticalScrollIndicator = false
    vue.scrollView.showsHorizontalScrollIndicator = false
    vue.navigationDelegate = self
    vue.transform = CGAffineTransform(translationX: -largeurCss * 2, y: 0)
    fenetre.addSubview(vue)
    self.vue = vue

    DispatchQueue.main.asyncAfter(deadline: .now() + Self.delaiMaximal) { [weak self] in
      guard let self = self, !self.termine else { return }
      self.conclure(.failure(ErreurRaster.delaiDepasse))
    }

    vue.loadHTMLString(html, baseURL: nil)
  }

  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    guard !termine else { return }
    DispatchQueue.main.asyncAfter(deadline: .now() + Self.delaiMiseEnPage) { [weak self] in
      guard let self = self, !self.termine else { return }
      self.dessiner(webView)
    }
  }

  func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
    conclure(.failure(error))
  }

  private func dessiner(_ webView: WKWebView) {
    let largeurCss = pageWidthMm / Self.millimetresParPouce * Self.pointsCssParPouce
    let hauteurCss = max(webView.scrollView.contentSize.height, 1)
    webView.frame = CGRect(x: 0, y: 0, width: largeurCss, height: hauteurCss)
    webView.layoutIfNeeded()

    // L'ECHELLE EST ABSOLUE : points de chauffe par point CSS. On ne rend pas
    // pour un ecran, on rend pour une tete d'impression, donc la densite de
    // l'appareil n'entre pas dans ce calcul.
    let echelle = Double(widthPx) / largeurCss
    let format = UIGraphicsImageRendererFormat()
    format.scale = CGFloat(echelle)
    format.opaque = true
    let taille = CGSize(width: largeurCss, height: hauteurCss)
    let image = UIGraphicsImageRenderer(size: taille, format: format).image { ctx in
      UIColor.white.setFill()
      ctx.fill(CGRect(origin: .zero, size: taille))
      // `drawHierarchy` et non `layer.render` : WebKit compose hors du calque
      // de la vue, et `layer.render` rend un rectangle blanc.
      webView.drawHierarchy(in: CGRect(origin: .zero, size: taille), afterScreenUpdates: true)
    }

    guard let points = Self.empaqueter(image, largeurVoulue: widthPx) else {
      conclure(.failure(ErreurRaster.pageVide))
      return
    }
    conclure(.success(points))
  }

  /**
   Les points d'une image, un bit chacun.

   L'image est redessinee dans un contexte en NIVEAUX DE GRIS a la largeur
   exacte de la tete : cela normalise l'arrondi de l'echelle, evite de lire un
   ordre d'octets qui depend du format d'origine, et divise par quatre la
   memoire d'une page longue.
   */
  private static func empaqueter(_ image: UIImage, largeurVoulue: Int) -> SortieRaster? {
    guard let source = image.cgImage else { return nil }
    let largeur = largeurVoulue
    let hauteur = max(Int((Double(source.height) * Double(largeur) / Double(source.width)).rounded()), 1)

    var gris = [UInt8](repeating: 255, count: largeur * hauteur)
    guard
      let contexte = CGContext(
        data: &gris,
        width: largeur,
        height: hauteur,
        bitsPerComponent: 8,
        bytesPerRow: largeur,
        space: CGColorSpaceCreateDeviceGray(),
        bitmapInfo: CGImageAlphaInfo.none.rawValue
      )
    else { return nil }

    contexte.setFillColor(gray: 1, alpha: 1)
    contexte.fill(CGRect(x: 0, y: 0, width: largeur, height: hauteur))
    contexte.draw(source, in: CGRect(x: 0, y: 0, width: largeur, height: hauteur))

    // La rangee est alignee sur l'octet, et la largeur ne l'est pas forcement.
    let octetsParRangee = (largeur + 7) / 8
    var out = [UInt8](repeating: 0, count: octetsParRangee * hauteur)
    var marque = false
    for y in 0..<hauteur {
      let base = y * octetsParRangee
      let ligne = y * largeur
      for x in 0..<largeur where gris[ligne + x] < seuil {
        out[base + (x >> 3)] |= UInt8(0x80 >> (x & 7))
        marque = true
      }
    }
    // ON NE FAIT PAS DEFILER DU PAPIER POUR RIEN : une page toute blanche coute
    // un ticket au marchand et ne dit rien au client.
    guard marque else { return nil }
    return SortieRaster(largeur: largeur, hauteur: hauteur, points: Data(out))
  }

  private func conclure(_ resultat: Result<SortieRaster, Error>) {
    guard !termine else { return }
    termine = true
    vue?.navigationDelegate = nil
    vue?.removeFromSuperview()
    vue = nil
    let suite = self.suite
    self.suite = nil
    suite?(resultat)
  }

  private static func fenetre() -> UIWindow? {
    UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap { $0.windows }
      .first { $0.isKeyWindow }
      ?? UIApplication.shared.connectedScenes
        .compactMap { $0 as? UIWindowScene }
        .flatMap { $0.windows }
        .first
  }
}
