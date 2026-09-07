import Foundation

enum WidgetStore {
  static let appGroupId = "group.app.flightdeck.crew"
  static let snapshotKey = "widget.snapshot.v1"
  static let snapshotFile = "widget-snapshot.json"

  /// Shared defaults only — never fall back to `.standard` (app vs widget would diverge).
  static var defaults: UserDefaults? {
    UserDefaults(suiteName: appGroupId)
  }

  static var containerURL: URL? {
    FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupId)
  }

  static var fileURL: URL? {
    containerURL?.appendingPathComponent(snapshotFile)
  }

  static func save(_ snapshot: WidgetSnapshot) {
    guard let data = try? JSONEncoder().encode(snapshot) else { return }
    defaults?.set(data, forKey: snapshotKey)
    defaults?.synchronize()
    if let fileURL {
      try? data.write(to: fileURL, options: [.atomic])
    }
  }

  static func load() -> WidgetSnapshot? {
    if let data = defaults?.data(forKey: snapshotKey),
       let snap = try? JSONDecoder().decode(WidgetSnapshot.self, from: data)
    {
      return snap
    }
    if let fileURL,
       let data = try? Data(contentsOf: fileURL),
       let snap = try? JSONDecoder().decode(WidgetSnapshot.self, from: data)
    {
      return snap
    }
    return nil
  }

  /// True when App Groups are provisioned for this install.
  static var isSharedContainerAvailable: Bool {
    containerURL != nil || defaults != nil
  }
}

struct WidgetSnapshot: Codable, Hashable {
  var updatedAt: Double
  var headline: String
  var detail: String
  var reportAt: Double?
  var route: String?
  var flightNumber: String?
  var flightCount: Int
  var empty: Bool

  static let placeholder = WidgetSnapshot(
    updatedAt: Date().timeIntervalSince1970,
    headline: "Flight Deck",
    detail: "Open Flight Deck once, then wait a second — widgets sync from the app",
    reportAt: nil,
    route: nil,
    flightNumber: nil,
    flightCount: 0,
    empty: true
  )

  static let needsAppGroup = WidgetSnapshot(
    updatedAt: Date().timeIntervalSince1970,
    headline: "Enable App Groups",
    detail: "In Xcode → Signing: turn on App Groups for app + widget (group.app.flightdeck.crew)",
    reportAt: nil,
    route: nil,
    flightNumber: nil,
    flightCount: 0,
    empty: true
  )
}
