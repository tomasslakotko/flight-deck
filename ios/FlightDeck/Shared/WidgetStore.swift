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

struct WidgetDaySegment: Codable, Hashable {
  var kind: String
  var label: String
  var flightNumber: String?
  var registration: String?
  var aircraftType: String?
  var gate: String?
  var status: String?
  var delayed: Bool?
  var startTime: String?
  var endTime: String?
}

struct WidgetTomorrowPreview: Codable, Hashable {
  var kind: String
  var title: String
  var detail: String
  var route: String?
  var flights: String?
  var checkInTime: String?
  var flightCount: Int?
}

struct WidgetSnapshot: Codable, Hashable {
  var updatedAt: Double
  var headline: String
  var detail: String
  var reportAt: Double?
  var checkoutAt: Double?
  var route: String?
  var flightNumber: String?
  var flightCount: Int
  var empty: Bool
  var dayKind: String?
  var noteSnippet: String?
  var liveUpdatedAt: Double?
  var tomorrow: WidgetTomorrowPreview?
  var depIata: String?
  var arrIata: String?
  var depTime: String?
  var arrTime: String?
  var checkInTime: String?
  var checkOutTime: String?
  var cabinClass: String?
  var statusLabel: String?
  var countdown: String?
  var progress: Double?
  var via: [String]?
  var segments: [WidgetDaySegment]?

  static let placeholder = WidgetSnapshot(
    updatedAt: Date().timeIntervalSince1970,
    headline: "Flight Deck",
    detail: "Open Flight Deck once — widgets sync from the app",
    reportAt: nil,
    checkoutAt: nil,
    route: "BEG–OSL",
    flightNumber: "JU420",
    flightCount: 2,
    empty: false,
    dayKind: "flight",
    noteSnippet: "call OPS",
    liveUpdatedAt: Date().timeIntervalSince1970 - 120,
    tomorrow: WidgetTomorrowPreview(
      kind: "flight",
      title: "Tomorrow",
      detail: "JU430 / JU431 · BEG→IST→BEG · CI 05:50 · 2 sectors",
      route: "BEG→IST→BEG",
      flights: "JU430 / JU431",
      checkInTime: "05:50",
      flightCount: 2
    ),
    depIata: "BEG",
    arrIata: "OSL",
    depTime: "18:01",
    arrTime: "21:05",
    checkInTime: "16:20",
    checkOutTime: "00:52",
    cabinClass: "CA",
    statusLabel: "REPORT IN",
    countdown: "1H 12M",
    progress: 0.18,
    via: ["OSL"],
    segments: [
      WidgetDaySegment(kind: "start", label: "Shift start", flightNumber: nil, registration: nil, aircraftType: nil, gate: nil, status: nil, delayed: nil, startTime: "16:20", endTime: nil),
      WidgetDaySegment(kind: "flight", label: "BEG → OSL", flightNumber: "JU420", registration: "YU-APA", aircraftType: "A319", gate: "A12", status: "On time", delayed: false, startTime: "18:01", endTime: "21:05"),
      WidgetDaySegment(kind: "flight", label: "OSL → BEG", flightNumber: "JU421", registration: "YU-APB", aircraftType: "A319", gate: "32", status: "Delayed +25m", delayed: true, startTime: "21:51", endTime: "00:22"),
      WidgetDaySegment(kind: "end", label: "Shift end", flightNumber: nil, registration: nil, aircraftType: nil, gate: nil, status: nil, delayed: nil, startTime: "00:52", endTime: nil),
    ]
  )

  static let needsAppGroup = WidgetSnapshot(
    updatedAt: Date().timeIntervalSince1970,
    headline: "Enable App Groups",
    detail: "In Xcode → Signing: turn on App Groups for app + widget (group.app.flightdeck.crew)",
    reportAt: nil,
    checkoutAt: nil,
    route: nil,
    flightNumber: nil,
    flightCount: 0,
    empty: true,
    dayKind: "off",
    noteSnippet: nil,
    liveUpdatedAt: nil,
    tomorrow: nil,
    depIata: nil,
    arrIata: nil,
    depTime: nil,
    arrTime: nil,
    checkInTime: nil,
    checkOutTime: nil,
    cabinClass: nil,
    statusLabel: "SETUP",
    countdown: "—",
    progress: 0,
    via: nil,
    segments: nil
  )
}

enum WidgetFreshness {
  static func liveAgeLabel(_ epochSec: Double?, now: Date = Date()) -> String? {
    guard let epochSec, epochSec > 0 else { return nil }
    let age = now.timeIntervalSince1970 - epochSec
    if age < 0 { return "Live just now" }
    if age < 45 { return "Live just now" }
    if age < 3600 { return "Live \(max(1, Int(age / 60))) min ago" }
    if age < 86400 { return "Live \(max(1, Int(age / 3600)))h ago" }
    return "Live stale"
  }
}
