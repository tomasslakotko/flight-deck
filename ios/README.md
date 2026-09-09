# Flight Deck — iPhone

Native iOS shell (SwiftUI + WKWebView) that opens the live web app, plus **Home Screen** and **Lock Screen** widgets.

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

### Home Screen

| Widget | Look |
|--------|------|
| **Duty pulse** | Dark atmospheric card with countdown + route progress (check-in / class / check-out) |
| **Route card** | Light/dark adaptive card with large airport codes |
| **Full day** | Timeline: Shift start → sectors → Shift end, plus flight number, registration, status |

Also when relevant: **Standby / Reserve** with **airBaltic (BT) departures from your SBY base** (BEG, RIX, …), **Day off**, **private note** snippet, **Live … min ago**.

### Lock Screen

| Style | Shows |
|-------|--------|
| **Circular** | Progress gauge + countdown (or SBY / RSV / OFF) |
| **Rectangular** | Flight · countdown · route · gate / note |
| **Inline** | One-line: `BT101 RIX→CPH · 1H12M` |

**Add Lock Screen widgets:** Lock Screen → customize → add widget → **Flight Deck** → **Lock Screen duty**.

**Add Home Screen widgets:** long-press Home Screen → **+** → **Flight Deck**.

Open the app once with a roster imported so widgets sync.

Widgets refresh when you open the app (roster → App Group → WidgetKit).

## Notifications (iPhone)

In **Import / Settings**, turn on alerts. The app asks for iOS permission, then schedules:

- Check-in −15 min and at report
- Boarding −30 min STD
- Delay bumps (while live data is refreshing)

These use **native local notifications** (not Safari web push), so they can fire after you leave the app — as long as you opened Flight Deck once with notifications on and a roster loaded.

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
