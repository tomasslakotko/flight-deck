import SwiftUI
import WebKit
import WidgetKit

/// Loads the Flight Deck web app (roster PWA) in a full-screen WKWebView.
struct ContentView: View {
  var body: some View {
    WebView(url: AppConfig.startURL)
      .ignoresSafeArea()
      .onAppear {
        // Seed a non-nil snapshot so the widget leaves the blank placeholder state.
        if WidgetStore.load() == nil {
          if WidgetStore.isSharedContainerAvailable {
            WidgetStore.save(.placeholder)
          } else {
            WidgetStore.save(.needsAppGroup)
          }
          WidgetCenter.shared.reloadAllTimelines()
        }
      }
  }
}

enum AppConfig {
  /// Production deployment. Change for local debugging if needed.
  static let startURL = URL(string: "https://er324322ertd.vercel.app")!
}

struct WebView: UIViewRepresentable {
  let url: URL

  func makeCoordinator() -> Coordinator {
    Coordinator()
  }

  func makeUIView(context: Context) -> WKWebView {
    let userContent = WKUserContentController()
    userContent.add(context.coordinator, name: "flightDeck")

    let bridge = """
    (function(){
      function post(payload){
        try {
          var body = typeof payload === 'string' ? payload : JSON.stringify(payload);
          window.webkit.messageHandlers.flightDeck.postMessage(body);
        } catch (e) {}
      }
      window.FlightDeckNative = { post: post };
      window.__flightDeckPostWidget = post;
      window.dispatchEvent(new Event('flightdeck-native-ready'));
      setTimeout(function(){ window.dispatchEvent(new Event('flightdeck-request-widget')); }, 400);
      setTimeout(function(){ window.dispatchEvent(new Event('flightdeck-request-widget')); }, 1500);
      setTimeout(function(){ window.dispatchEvent(new Event('flightdeck-request-widget')); }, 4000);
    })();
    """
    userContent.addUserScript(
      WKUserScript(source: bridge, injectionTime: .atDocumentStart, forMainFrameOnly: true)
    )

    let config = WKWebViewConfiguration()
    config.userContentController = userContent
    config.allowsInlineMediaPlayback = true
    config.defaultWebpagePreferences.allowsContentJavaScript = true

    let webView = WKWebView(frame: .zero, configuration: config)
    webView.navigationDelegate = context.coordinator
    webView.uiDelegate = context.coordinator
    webView.scrollView.contentInsetAdjustmentBehavior = .never
    webView.allowsBackForwardNavigationGestures = true
    webView.isOpaque = false
    webView.backgroundColor = UIColor(red: 0.94, green: 0.96, blue: 0.97, alpha: 1)
    context.coordinator.webView = webView
    webView.load(URLRequest(url: url))
    return webView
  }

  func updateUIView(_ uiView: WKWebView, context: Context) {}

  final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
    weak var webView: WKWebView?

    func userContentController(
      _ userContentController: WKUserContentController,
      didReceive message: WKScriptMessage
    ) {
      guard message.name == "flightDeck" else { return }
      let raw: String
      if let s = message.body as? String {
        raw = s
      } else if let dict = message.body as? [String: Any],
                let data = try? JSONSerialization.data(withJSONObject: dict),
                let s = String(data: data, encoding: .utf8)
      {
        raw = s
      } else {
        return
      }
      guard let data = raw.data(using: .utf8),
            let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            (json["type"] as? String) == "widget"
      else { return }

      let segments: [WidgetDaySegment]? = {
        guard let raw = json["segments"] as? [[String: Any]] else { return nil }
        return raw.map { item in
          WidgetDaySegment(
            kind: (item["kind"] as? String) ?? "flight",
            label: (item["label"] as? String) ?? "—",
            flightNumber: item["flightNumber"] as? String,
            registration: item["registration"] as? String,
            aircraftType: item["aircraftType"] as? String,
            gate: item["gate"] as? String,
            status: item["status"] as? String,
            delayed: item["delayed"] as? Bool,
            startTime: item["startTime"] as? String,
            endTime: item["endTime"] as? String
          )
        }
      }()

      let snapshot = WidgetSnapshot(
        updatedAt: (json["updatedAt"] as? Double) ?? Date().timeIntervalSince1970,
        headline: (json["headline"] as? String) ?? "Flight Deck",
        detail: (json["detail"] as? String) ?? "",
        reportAt: json["reportAt"] as? Double,
        checkoutAt: json["checkoutAt"] as? Double,
        route: json["route"] as? String,
        flightNumber: json["flightNumber"] as? String,
        flightCount: (json["flightCount"] as? Int) ?? 0,
        empty: (json["empty"] as? Bool) ?? true,
        dayKind: json["dayKind"] as? String,
        noteSnippet: json["noteSnippet"] as? String,
        liveUpdatedAt: json["liveUpdatedAt"] as? Double,
        depIata: json["depIata"] as? String,
        arrIata: json["arrIata"] as? String,
        depTime: json["depTime"] as? String,
        arrTime: json["arrTime"] as? String,
        checkInTime: json["checkInTime"] as? String,
        checkOutTime: json["checkOutTime"] as? String,
        cabinClass: json["cabinClass"] as? String,
        statusLabel: json["statusLabel"] as? String,
        countdown: json["countdown"] as? String,
        progress: json["progress"] as? Double,
        via: json["via"] as? [String],
        segments: segments
      )
      WidgetStore.save(snapshot)
      WidgetCenter.shared.reloadAllTimelines()
    }

    func webView(
      _ webView: WKWebView,
      decidePolicyFor navigationAction: WKNavigationAction,
      decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
      guard let url = navigationAction.request.url else {
        decisionHandler(.allow)
        return
      }
      if let scheme = url.scheme?.lowercased(),
         ["mailto", "tel", "sms", "itms-apps", "itms"].contains(scheme)
      {
        UIApplication.shared.open(url)
        decisionHandler(.cancel)
        return
      }
      decisionHandler(.allow)
    }

    func webView(
      _ webView: WKWebView,
      createWebViewWith configuration: WKWebViewConfiguration,
      for navigationAction: WKNavigationAction,
      windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
      if navigationAction.targetFrame == nil, let url = navigationAction.request.url {
        webView.load(URLRequest(url: url))
      }
      return nil
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
      webView.evaluateJavaScript(
        """
        window.dispatchEvent(new Event('flightdeck-native-ready'));
        window.dispatchEvent(new Event('flightdeck-request-widget'));
        """,
        completionHandler: nil
      )
    }
  }
}

#Preview {
  ContentView()
}
