# Flight Deck — iPhone

Native iOS shell (SwiftUI + WKWebView) that opens the live web app, plus **Home Screen widgets**.

## Open in Xcode

```bash
cd ios/FlightDeck && xcodegen generate && open FlightDeck.xcodeproj
```

1. Select the **FlightDeck** target → **Signing & Capabilities**
2. Choose your **Team** (Apple ID)
3. Enable **App Groups** if Xcode asks — use `group.app.flightdeck.crew` (already in entitlements)
4. Do the same for **FlightDeckWidget**
5. Plug in your iPhone (or Simulator) → **Run** ▶

The app loads: https://er324322ertd.vercel.app

## Widgets

After installing the app:

1. Long-press Home Screen → **+** → search **Flight Deck**
2. Add **Next duty** and/or **Today’s flights**

Widgets update when you open the app (roster is synced from the web app into an App Group).

## Local web debugging

Edit `FlightDeck/ContentView.swift`:

```swift
static let startURL = URL(string: "http://127.0.0.1:43173")!
```

(For local HTTP you may need ATS exceptions in `Info.plist`.)

## Notes

- Thin native wrapper + WidgetKit — not a full native rewrite
- Vercel Authentication must stay off for the production URL
- App Groups require a signing Team; free Apple ID works for device install
