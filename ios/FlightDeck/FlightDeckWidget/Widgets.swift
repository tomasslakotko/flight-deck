import WidgetKit
import SwiftUI

// MARK: - Theme

enum PulseTheme {
  static let accent = Color(red: 0.22, green: 0.58, blue: 1.0)
  static let title = Color.white
  static let muted = Color.white.opacity(0.55)
  static let track = Color.white.opacity(0.18)
}

enum RouteTheme {
  static let accent = Color(red: 0.55, green: 0.35, blue: 0.95)
  static let titleLight = Color(red: 0.08, green: 0.09, blue: 0.12)
  static let titleDark = Color.white
  static let mutedLight = Color(red: 0.45, green: 0.47, blue: 0.52)
  static let mutedDark = Color.white.opacity(0.55)
  static let trackLight = Color(red: 0.55, green: 0.35, blue: 0.95).opacity(0.22)
  static let trackDark = Color.white.opacity(0.14)
}

// MARK: - Timeline

struct DutyEntry: TimelineEntry {
  let date: Date
  let snapshot: WidgetSnapshot
}

struct DutyProvider: TimelineProvider {
  func placeholder(in context: Context) -> DutyEntry {
    DutyEntry(date: Date(), snapshot: .placeholder)
  }

  func getSnapshot(in context: Context, completion: @escaping (DutyEntry) -> Void) {
    let snap = WidgetStore.load()
      ?? (WidgetStore.isSharedContainerAvailable ? .placeholder : .needsAppGroup)
    completion(DutyEntry(date: Date(), snapshot: snap))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<DutyEntry>) -> Void) {
    let snap = WidgetStore.load()
      ?? (WidgetStore.isSharedContainerAvailable ? .placeholder : .needsAppGroup)
    let now = Date()
    var dates: [Date] = [now, now.addingTimeInterval(15 * 60)]
    if let report = snap.reportAt {
      let reportDate = Date(timeIntervalSince1970: report)
      if reportDate > now {
        dates.append(reportDate.addingTimeInterval(-15 * 60))
        dates.append(reportDate)
      }
    }
    if let checkout = snap.checkoutAt {
      let checkoutDate = Date(timeIntervalSince1970: checkout)
      if checkoutDate > now {
        dates.append(checkoutDate)
      }
    }
    let entries = dates
      .filter { $0 >= now.addingTimeInterval(-60) }
      .sorted()
      .map { DutyEntry(date: $0, snapshot: snap) }
    let refresh = now.addingTimeInterval(15 * 60)
    completion(Timeline(entries: entries.isEmpty ? [DutyEntry(date: now, snapshot: snap)] : entries, policy: .after(refresh)))
  }
}

// MARK: - Widgets

struct NextDutyWidget: Widget {
  let kind = "NextDutyWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: DutyProvider()) { entry in
      PulseDutyView(entry: entry)
        .containerBackground(for: .widget) {
          PulseBackground()
        }
    }
    .configurationDisplayName("Duty pulse")
    .description("Countdown, route progress, check-in / class / check-out.")
    .supportedFamilies([.systemSmall, .systemMedium])
  }
}

struct TodayFlightsWidget: Widget {
  let kind = "TodayFlightsWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: DutyProvider()) { entry in
      RouteCardView(entry: entry)
        .containerBackground(for: .widget) {
          Color(uiColor: .systemBackground)
        }
    }
    .configurationDisplayName("Route card")
    .description("Day route with progress bar and check-in / class / check-out.")
    .supportedFamilies([.systemSmall, .systemMedium])
  }
}

struct DayTimelineWidget: Widget {
  let kind = "DayTimelineWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: DutyProvider()) { entry in
      DayTimelineView(entry: entry)
        .containerBackground(for: .widget) {
          Color(uiColor: .systemBackground)
        }
    }
    .configurationDisplayName("Full day")
    .description("Shift start → sectors → shift end, with flight number, registration, and status.")
    .supportedFamilies([.systemMedium, .systemLarge])
  }
}

struct LockScreenDutyWidget: Widget {
  let kind = "LockScreenDutyWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: DutyProvider()) { entry in
      LockScreenDutyView(entry: entry)
        .containerBackground(for: .widget) {
          AccessoryWidgetBackground()
        }
    }
    .configurationDisplayName("Lock Screen duty")
    .description("Next report / sector on the Lock Screen.")
    .supportedFamilies([.accessoryCircular, .accessoryRectangular, .accessoryInline])
  }
}

// MARK: - Lock Screen

struct LockScreenDutyView: View {
  let entry: DutyEntry
  @Environment(\.widgetFamily) private var family

  private var snap: WidgetSnapshot { entry.snapshot }
  private var dayKind: String { snap.dayKind ?? (snap.empty ? "empty" : "flight") }

  @ViewBuilder
  var body: some View {
    switch family {
    case .accessoryCircular:
      circularBody
    case .accessoryRectangular:
      rectangularBody
    case .accessoryInline:
      inlineBody
    default:
      rectangularBody
    }
  }

  private var circularBody: some View {
    ZStack {
      AccessoryWidgetBackground()
      if dayKind == "standby" || dayKind == "reserve" || dayKind == "off" {
        VStack(spacing: 1) {
          Image(systemName: dayKindIcon)
            .font(.caption.weight(.bold))
          Text(dayKindShort)
            .font(.system(size: 10, weight: .bold))
            .minimumScaleFactor(0.7)
            .lineLimit(1)
        }
      } else if snap.empty {
        Image(systemName: "airplane")
          .font(.title3.weight(.semibold))
      } else {
        Gauge(value: min(1, max(0, snap.progress ?? 0))) {
          Text(circularTop)
            .font(.system(size: 9, weight: .bold))
            .minimumScaleFactor(0.6)
            .lineLimit(1)
        } currentValueLabel: {
          Text(circularCountdown)
            .font(.system(size: 12, weight: .bold))
            .minimumScaleFactor(0.6)
            .lineLimit(1)
        }
        .gaugeStyle(.accessoryCircularCapacity)
      }
    }
  }

  @ViewBuilder
  private var rectangularBody: some View {
    if dayKind == "standby" || dayKind == "reserve" || dayKind == "off" {
      VStack(alignment: .leading, spacing: 2) {
        Label(snap.headline, systemImage: dayKindIcon)
          .font(.headline)
          .lineLimit(1)
        Text(snap.noteSnippet ?? snap.detail)
          .font(.caption2)
          .foregroundStyle(.secondary)
          .lineLimit(2)
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    } else if snap.empty {
      VStack(alignment: .leading, spacing: 2) {
        Label("Flight Deck", systemImage: "airplane")
          .font(.headline)
        Text(snap.detail)
          .font(.caption2)
          .foregroundStyle(.secondary)
          .lineLimit(2)
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    } else {
      VStack(alignment: .leading, spacing: 2) {
        HStack(spacing: 4) {
          Image(systemName: "airplane")
            .font(.caption2.weight(.bold))
          Text(snap.flightNumber ?? "Duty")
            .font(.headline)
            .lineLimit(1)
          Spacer(minLength: 0)
          Text(snap.countdown ?? "—")
            .font(.headline.monospacedDigit())
            .lineLimit(1)
        }
        Text(routeLine)
          .font(.caption)
          .lineLimit(1)
        HStack(spacing: 6) {
          Text(snap.statusLabel?.capitalized ?? "On duty")
            .font(.caption2)
            .foregroundStyle(.secondary)
            .lineLimit(1)
          if let gate = primaryGate {
            Text("·")
              .font(.caption2)
              .foregroundStyle(.secondary)
            Text("G\(gate)")
              .font(.caption2.weight(.semibold))
              .lineLimit(1)
          }
          if let note = snap.noteSnippet, !note.isEmpty {
            Text("·")
              .font(.caption2)
              .foregroundStyle(.secondary)
            Text(note)
              .font(.caption2)
              .foregroundStyle(.secondary)
              .lineLimit(1)
          }
        }
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }
  }

  @ViewBuilder
  private var inlineBody: some View {
    if dayKind == "standby" || dayKind == "reserve" || dayKind == "off" {
      Text("\(dayKindShort) · \(snap.noteSnippet ?? snap.headline)")
    } else if snap.empty {
      Text("Flight Deck · \(snap.headline)")
    } else {
      Text(inlineFlightLine)
    }
  }

  private var inlineFlightLine: String {
    let fn = snap.flightNumber ?? "Duty"
    let route = [snap.depIata, snap.arrIata].compactMap { $0 }.joined(separator: "→")
    let cd = snap.countdown ?? "—"
    return "\(fn) \(route) · \(cd)"
  }

  private var circularTop: String {
    snap.flightNumber ?? snap.depIata ?? "FD"
  }

  private var circularCountdown: String {
    let raw = (snap.countdown ?? "—").replacingOccurrences(of: " ", with: "")
    if raw.count <= 5 { return raw }
    return String(raw.prefix(5))
  }

  private var routeLine: String {
    let dep = snap.depIata ?? "—"
    let arr = snap.arrIata ?? "—"
    let depT = snap.depTime ?? ""
    let arrT = snap.arrTime ?? ""
    if !depT.isEmpty && !arrT.isEmpty {
      return "\(dep) \(depT) → \(arr) \(arrT)"
    }
    return "\(dep) → \(arr)"
  }

  private var primaryGate: String? {
    snap.segments?
      .first(where: { $0.kind == "flight" && ($0.gate?.isEmpty == false) })?
      .gate
  }

  private var dayKindIcon: String {
    switch dayKind {
    case "standby": return "bell.fill"
    case "reserve": return "phone.fill"
    case "off": return "cup.and.saucer.fill"
    default: return "airplane"
    }
  }

  private var dayKindShort: String {
    switch dayKind {
    case "standby": return "SBY"
    case "reserve": return "RSV"
    case "off": return "OFF"
    default: return "FD"
    }
  }
}

// MARK: - Variation A: dark atmospheric pulse (screenshot 1)

struct PulseBackground: View {
  var body: some View {
    ZStack {
      Color.black
      RadialGradient(
        colors: [
          Color(red: 0.12, green: 0.42, blue: 0.85).opacity(0.55),
          Color(red: 0.02, green: 0.08, blue: 0.22).opacity(0.9),
          Color.black,
        ],
        center: .topTrailing,
        startRadius: 10,
        endRadius: 180
      )
      LinearGradient(
        colors: [
          Color(red: 0.0, green: 0.55, blue: 0.85).opacity(0.25),
          .clear,
        ],
        startPoint: .bottomLeading,
        endPoint: .topTrailing
      )
    }
  }
}

struct PulseDutyView: View {
  let entry: DutyEntry
  @Environment(\.widgetFamily) private var family

  private var snap: WidgetSnapshot { entry.snapshot }
  private var progress: CGFloat { CGFloat(min(1, max(0, snap.progress ?? 0))) }
  private var dayKind: String { snap.dayKind ?? (snap.empty ? "empty" : "flight") }

  var body: some View {
    if snap.statusLabel == "SETUP" {
      EmptyPulse(title: snap.headline, detail: snap.detail)
    } else if dayKind == "standby" || dayKind == "reserve" || dayKind == "off" || (snap.empty && dayKind != "flight") {
      DayTypeCard(
        kind: dayKind == "empty" ? "empty" : dayKind,
        headline: snap.headline,
        detail: snap.detail,
        note: snap.noteSnippet,
        liveUpdatedAt: snap.liveUpdatedAt,
        dark: true
      )
    } else if family == .systemSmall {
      smallBody
    } else {
      mediumBody
    }
  }

  private var smallBody: some View {
    VStack(alignment: .leading, spacing: 6) {
      HStack(spacing: 6) {
        Image(systemName: "airplane.departure")
          .font(.caption2.weight(.bold))
          .foregroundStyle(PulseTheme.accent)
        Text(snap.flightNumber ?? "Duty")
          .font(.caption.weight(.semibold))
          .foregroundStyle(PulseTheme.title)
          .lineLimit(1)
        Spacer(minLength: 0)
        if let age = WidgetFreshness.liveAgeLabel(snap.liveUpdatedAt) {
          Text(age.replacingOccurrences(of: "Live ", with: ""))
            .font(.system(size: 8, weight: .medium))
            .foregroundStyle(PulseTheme.muted)
            .lineLimit(1)
        }
      }

      VStack(alignment: .leading, spacing: 2) {
        Text(snap.statusLabel ?? "ON DUTY")
          .font(.system(size: 10, weight: .semibold))
          .tracking(0.6)
          .foregroundStyle(PulseTheme.muted)
        Text(snap.countdown ?? "—")
          .font(.system(size: 26, weight: .bold, design: .rounded))
          .foregroundStyle(PulseTheme.title)
          .minimumScaleFactor(0.7)
          .lineLimit(1)
      }

      Spacer(minLength: 2)

      HStack(alignment: .bottom) {
        airportBlock(time: snap.depTime, code: snap.depIata, align: .leading)
        Spacer(minLength: 4)
        Image(systemName: "airplane")
          .font(.caption2.weight(.semibold))
          .foregroundStyle(PulseTheme.title.opacity(0.85))
          .padding(.bottom, 2)
        Spacer(minLength: 4)
        airportBlock(time: snap.arrTime, code: snap.arrIata, align: .trailing)
      }

      ProgressRail(progress: progress, accent: PulseTheme.accent, track: PulseTheme.track, height: 4)

      if let note = snap.noteSnippet, !note.isEmpty {
        Text(note)
          .font(.system(size: 9, weight: .medium))
          .foregroundStyle(PulseTheme.muted)
          .lineLimit(1)
      }
    }
    .padding(2)
  }

  private var mediumBody: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(alignment: .firstTextBaseline) {
        HStack(spacing: 6) {
          Image(systemName: "airplane")
            .font(.caption.weight(.bold))
            .foregroundStyle(PulseTheme.accent)
          Text(snap.flightNumber ?? "Duty")
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(PulseTheme.title)
        }
        Spacer()
        Text("\(snap.flightCount) sector\(snap.flightCount == 1 ? "" : "s")")
          .font(.caption2.weight(.medium))
          .foregroundStyle(PulseTheme.muted)
      }

      HStack(alignment: .firstTextBaseline, spacing: 8) {
        Text(snap.statusLabel ?? "ON DUTY")
          .font(.caption.weight(.semibold))
          .tracking(0.8)
          .foregroundStyle(PulseTheme.muted)
        Text(snap.countdown ?? "—")
          .font(.system(size: 28, weight: .bold, design: .rounded))
          .foregroundStyle(PulseTheme.title)
          .minimumScaleFactor(0.7)
        Spacer(minLength: 0)
      }

      HStack(alignment: .bottom) {
        airportBlock(time: snap.depTime, code: snap.depIata, align: .leading, large: true)
        VStack(spacing: 4) {
          Image(systemName: "airplane")
            .font(.caption.weight(.semibold))
            .foregroundStyle(PulseTheme.title)
          ProgressRail(progress: progress, accent: PulseTheme.accent, track: PulseTheme.track, height: 5, showPlane: true)
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 8)
        .padding(.bottom, 4)
        airportBlock(time: snap.arrTime, code: snap.arrIata, align: .trailing, large: true)
      }

      MetaRow(
        items: [
          ("Check-in", snap.checkInTime ?? "—"),
          ("Class", snap.cabinClass ?? "—"),
          ("Check-out", snap.checkOutTime ?? "—"),
        ],
        label: PulseTheme.muted,
        value: PulseTheme.title
      )

      WidgetMetaFooter(
        note: snap.noteSnippet,
        liveUpdatedAt: snap.liveUpdatedAt,
        muted: PulseTheme.muted,
        accent: PulseTheme.accent
      )
    }
    .padding(2)
  }

  private func airportBlock(time: String?, code: String?, align: HorizontalAlignment, large: Bool = false) -> some View {
    VStack(alignment: align, spacing: 2) {
      Text(time ?? "—")
        .font(.system(size: large ? 11 : 10, weight: .medium))
        .foregroundStyle(PulseTheme.muted)
      Text(code ?? "—")
        .font(.system(size: large ? 22 : 16, weight: .bold, design: .rounded))
        .foregroundStyle(PulseTheme.title)
    }
  }
}

struct EmptyPulse: View {
  let title: String
  let detail: String

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text("Flight Deck")
        .font(.caption2.weight(.semibold))
        .foregroundStyle(PulseTheme.accent)
      Text(title)
        .font(.headline)
        .foregroundStyle(PulseTheme.title)
      Text(detail)
        .font(.caption)
        .foregroundStyle(PulseTheme.muted)
        .lineLimit(3)
      Spacer(minLength: 0)
    }
    .padding(2)
  }
}

// MARK: - Variation B: light/dark route card (screenshot 2)

struct RouteCardView: View {
  let entry: DutyEntry
  @Environment(\.widgetFamily) private var family
  @Environment(\.colorScheme) private var scheme

  private var snap: WidgetSnapshot { entry.snapshot }
  private var progress: CGFloat { CGFloat(min(1, max(0, snap.progress ?? 0))) }
  private var title: Color { scheme == .dark ? RouteTheme.titleDark : RouteTheme.titleLight }
  private var muted: Color { scheme == .dark ? RouteTheme.mutedDark : RouteTheme.mutedLight }
  private var track: Color { scheme == .dark ? RouteTheme.trackDark : RouteTheme.trackLight }
  private var dayKind: String { snap.dayKind ?? (snap.empty ? "empty" : "flight") }

  var body: some View {
    Group {
      if snap.statusLabel == "SETUP" {
        EmptyRoute(title: snap.headline, detail: snap.detail, titleColor: title, muted: muted)
      } else if dayKind == "standby" || dayKind == "reserve" || dayKind == "off" || (snap.empty && dayKind != "flight") {
        DayTypeCard(
          kind: dayKind == "empty" ? "empty" : dayKind,
          headline: snap.headline,
          detail: snap.detail,
          note: snap.noteSnippet,
          liveUpdatedAt: snap.liveUpdatedAt,
          dark: scheme == .dark
        )
      } else if family == .systemSmall {
        smallBody
      } else {
        mediumBody
      }
    }
    .padding(4)
    .frame(maxWidth: .infinity, maxHeight: .infinity)
  }

  private var smallBody: some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack(alignment: .firstTextBaseline) {
        Text(snap.depIata ?? "—")
          .font(.system(size: 22, weight: .bold, design: .rounded))
          .foregroundStyle(title)
        Spacer()
        Text(snap.arrIata ?? "—")
          .font(.system(size: 22, weight: .bold, design: .rounded))
          .foregroundStyle(title)
      }

      HStack(spacing: 4) {
        Text(snap.statusLabel?.capitalized ?? "Arrive in")
          .font(.caption2)
          .foregroundStyle(muted)
        Text(snap.countdown?.lowercased() ?? "—")
          .font(.caption.weight(.bold))
          .foregroundStyle(RouteTheme.accent)
      }

      ProgressRail(progress: progress, accent: RouteTheme.accent, track: track, height: 6, showPlane: true)

      MetaRow(
        items: [
          ("Check-in", snap.checkInTime ?? "—"),
          ("Class", snap.cabinClass ?? "—"),
          ("Out", snap.checkOutTime ?? "—"),
        ],
        label: muted,
        value: title,
        compact: true
      )

      WidgetMetaFooter(
        note: snap.noteSnippet,
        liveUpdatedAt: snap.liveUpdatedAt,
        muted: muted,
        accent: RouteTheme.accent
      )
    }
  }

  private var mediumBody: some View {
    VStack(alignment: .leading, spacing: 12) {
      HStack(alignment: .firstTextBaseline) {
        Text(snap.depIata ?? "—")
          .font(.system(size: 34, weight: .bold, design: .rounded))
          .foregroundStyle(title)
        Spacer()
        HStack(spacing: 6) {
          Text(friendlyStatus)
            .font(.subheadline)
            .foregroundStyle(muted)
          Text(snap.countdown?.lowercased() ?? "—")
            .font(.subheadline.weight(.bold))
            .foregroundStyle(RouteTheme.accent)
        }
        Spacer()
        Text(snap.arrIata ?? "—")
          .font(.system(size: 34, weight: .bold, design: .rounded))
          .foregroundStyle(title)
      }

      ViaProgressBar(
        progress: progress,
        via: snap.via ?? [],
        accent: RouteTheme.accent,
        track: track,
        viaColor: muted
      )

      MetaRow(
        items: [
          ("Check-in", snap.checkInTime ?? "—"),
          ("Class", snap.cabinClass ?? "—"),
          ("Check-out", snap.checkOutTime ?? "—"),
          ("Sectors", "\(snap.flightCount)"),
        ],
        label: muted,
        value: title
      )

      WidgetMetaFooter(
        note: snap.noteSnippet,
        liveUpdatedAt: snap.liveUpdatedAt,
        muted: muted,
        accent: RouteTheme.accent
      )
    }
  }

  private var friendlyStatus: String {
    switch snap.statusLabel {
    case "REPORT IN": return "Report in"
    case "DEPARTS IN": return "Departs in"
    case "LANDING IN": return "Landing in"
    case "ARRIVE IN": return "Arrive in"
    case "CHECK OUT": return "Check-out in"
    case "COMPLETED": return "Done"
    default: return "On duty"
    }
  }
}

struct EmptyRoute: View {
  let title: String
  let detail: String
  let titleColor: Color
  let muted: Color

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text("Today")
        .font(.caption2.weight(.semibold))
        .foregroundStyle(RouteTheme.accent)
      Text(title)
        .font(.headline)
        .foregroundStyle(titleColor)
      Text(detail)
        .font(.caption)
        .foregroundStyle(muted)
        .lineLimit(3)
      Spacer(minLength: 0)
    }
  }
}

// MARK: - Shared pieces

struct ProgressRail: View {
  var progress: CGFloat
  var accent: Color
  var track: Color
  var height: CGFloat = 5
  var showPlane: Bool = false

  var body: some View {
    GeometryReader { geo in
      let w = max(0, min(1, progress)) * geo.size.width
      ZStack(alignment: .leading) {
        Capsule().fill(track)
        Capsule()
          .fill(accent)
          .frame(width: max(height, w))
        if showPlane {
          Image(systemName: "airplane")
            .font(.system(size: 9, weight: .bold))
            .foregroundStyle(.white)
            .padding(3)
            .background(Circle().fill(accent))
            .offset(x: max(0, w - 12))
        }
      }
    }
    .frame(height: height + (showPlane ? 10 : 0))
  }
}

struct ViaProgressBar: View {
  var progress: CGFloat
  var via: [String]
  var accent: Color
  var track: Color
  var viaColor: Color

  var body: some View {
    VStack(spacing: 4) {
      ProgressRail(progress: progress, accent: accent, track: track, height: 8, showPlane: true)
      if let mid = via.first {
        Text(mid)
          .font(.caption2.weight(.semibold))
          .foregroundStyle(viaColor)
          .frame(maxWidth: .infinity)
      }
    }
  }
}

struct MetaRow: View {
  let items: [(String, String)]
  var label: Color
  var value: Color
  var compact: Bool = false

  var body: some View {
    HStack(alignment: .top) {
      ForEach(Array(items.enumerated()), id: \.offset) { _, item in
        VStack(alignment: .leading, spacing: compact ? 1 : 2) {
          Text(item.0)
            .font(.system(size: compact ? 9 : 10, weight: .medium))
            .foregroundStyle(label)
          Text(item.1)
            .font(.system(size: compact ? 12 : 14, weight: .bold, design: .rounded))
            .foregroundStyle(value)
            .lineLimit(1)
            .minimumScaleFactor(0.75)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
      }
    }
  }
}

struct WidgetMetaFooter: View {
  var note: String?
  var liveUpdatedAt: Double?
  var muted: Color
  var accent: Color

  var body: some View {
    let age = WidgetFreshness.liveAgeLabel(liveUpdatedAt)
    if (note?.isEmpty == false) || age != nil {
      HStack(alignment: .firstTextBaseline, spacing: 6) {
        if let note, !note.isEmpty {
          Image(systemName: "note.text")
            .font(.system(size: 9, weight: .semibold))
            .foregroundStyle(accent)
          Text(note)
            .font(.system(size: 10, weight: .medium))
            .foregroundStyle(muted)
            .lineLimit(1)
        }
        Spacer(minLength: 0)
        if let age {
          Text(age)
            .font(.system(size: 9, weight: .medium))
            .foregroundStyle(muted)
            .lineLimit(1)
        }
      }
    }
  }
}

struct DayTypeCard: View {
  let kind: String
  let headline: String
  let detail: String
  var note: String?
  var liveUpdatedAt: Double?
  var dark: Bool

  private var accent: Color {
    switch kind {
    case "standby": return Color(red: 0.95, green: 0.62, blue: 0.22)
    case "reserve": return Color(red: 0.55, green: 0.45, blue: 0.95)
    case "off": return Color(red: 0.35, green: 0.75, blue: 0.55)
    default: return Color(red: 0.45, green: 0.72, blue: 0.95)
    }
  }

  private var title: Color { dark ? .white : Color(red: 0.1, green: 0.12, blue: 0.16) }
  private var muted: Color { dark ? Color.white.opacity(0.6) : Color(red: 0.45, green: 0.48, blue: 0.55) }

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text(kindLabel)
        .font(.caption2.weight(.bold))
        .tracking(0.8)
        .foregroundStyle(accent)
      Text(headline)
        .font(.title2.weight(.bold))
        .foregroundStyle(title)
        .minimumScaleFactor(0.8)
        .lineLimit(1)
      Text(detail)
        .font(.caption)
        .foregroundStyle(muted)
        .lineLimit(3)
      Spacer(minLength: 0)
      WidgetMetaFooter(note: note, liveUpdatedAt: liveUpdatedAt, muted: muted, accent: accent)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .padding(2)
  }

  private var kindLabel: String {
    switch kind {
    case "standby": return "STANDBY"
    case "reserve": return "RESERVE"
    case "off": return "DAY OFF"
    default: return "TODAY"
    }
  }
}

// MARK: - Variation C: full-day timeline

enum DayTheme {
  static let startBar = Color(red: 0.20, green: 0.72, blue: 0.40)
  static let flightBar = Color(red: 0.45, green: 0.72, blue: 0.95)
  static let endBar = Color(red: 0.72, green: 0.74, blue: 0.78)
  static let delayedBar = Color(red: 0.95, green: 0.62, blue: 0.22)
  static let titleLight = Color(red: 0.18, green: 0.20, blue: 0.24)
  static let titleDark = Color.white
  static let mutedLight = Color(red: 0.55, green: 0.57, blue: 0.62)
  static let mutedDark = Color.white.opacity(0.55)
}

struct DayTimelineView: View {
  let entry: DutyEntry
  @Environment(\.widgetFamily) private var family
  @Environment(\.colorScheme) private var scheme

  private var snap: WidgetSnapshot { entry.snapshot }
  private var title: Color { scheme == .dark ? DayTheme.titleDark : DayTheme.titleLight }
  private var muted: Color { scheme == .dark ? DayTheme.mutedDark : DayTheme.mutedLight }
  private var dayKind: String { snap.dayKind ?? (snap.empty ? "empty" : "flight") }
  private var segments: [WidgetDaySegment] {
    if let segs = snap.segments, !segs.isEmpty { return segs }
    return fallbackSegments
  }

  var body: some View {
    Group {
      if snap.statusLabel == "SETUP" {
        VStack(alignment: .leading, spacing: 6) {
          Text("Full day")
            .font(.caption2.weight(.semibold))
            .foregroundStyle(DayTheme.flightBar)
          Text(snap.headline)
            .font(.headline)
            .foregroundStyle(title)
          Text(snap.detail)
            .font(.caption)
            .foregroundStyle(muted)
            .lineLimit(3)
          Spacer(minLength: 0)
        }
      } else if dayKind == "standby" || dayKind == "reserve" || dayKind == "off" || (snap.empty && dayKind != "flight") {
        DayTypeCard(
          kind: dayKind == "empty" ? "empty" : dayKind,
          headline: snap.headline,
          detail: snap.detail,
          note: snap.noteSnippet,
          liveUpdatedAt: snap.liveUpdatedAt,
          dark: scheme == .dark
        )
      } else if family == .systemLarge {
        largeBody
      } else {
        mediumBody
      }
    }
    .padding(4)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
  }

  private var mediumBody: some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack {
        Text("Today")
          .font(.caption2.weight(.semibold))
          .foregroundStyle(DayTheme.flightBar)
        Spacer()
        if let age = WidgetFreshness.liveAgeLabel(snap.liveUpdatedAt) {
          Text(age)
            .font(.caption2)
            .foregroundStyle(muted)
        } else {
          Text("\(snap.flightCount) sector\(snap.flightCount == 1 ? "" : "s")")
            .font(.caption2)
            .foregroundStyle(muted)
        }
      }

      HStack(alignment: .top, spacing: 8) {
        ForEach(Array(segments.enumerated()), id: \.offset) { _, seg in
          TimelineSegmentCell(segment: seg, title: title, muted: muted, compact: true)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
      }

      WidgetMetaFooter(
        note: snap.noteSnippet,
        liveUpdatedAt: nil,
        muted: muted,
        accent: DayTheme.flightBar
      )
    }
  }

  private var largeBody: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack {
        Text("Duty day")
          .font(.caption.weight(.semibold))
          .foregroundStyle(DayTheme.flightBar)
        Spacer()
        if let age = WidgetFreshness.liveAgeLabel(snap.liveUpdatedAt) {
          Text(age)
            .font(.caption2)
            .foregroundStyle(muted)
        } else if let ci = snap.checkInTime, let co = snap.checkOutTime {
          Text("CI \(ci) · CO \(co)")
            .font(.caption2)
            .foregroundStyle(muted)
        }
      }

      HStack(alignment: .top, spacing: 8) {
        ForEach(Array(segments.enumerated()), id: \.offset) { _, seg in
          TimelineSegmentCell(segment: seg, title: title, muted: muted, compact: false)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
      }

      Spacer(minLength: 4)

      VStack(alignment: .leading, spacing: 6) {
        ForEach(Array(flightSegments.enumerated()), id: \.offset) { _, seg in
          HStack(spacing: 8) {
            Text(seg.flightNumber ?? "—")
              .font(.caption.weight(.bold))
              .foregroundStyle(title)
              .frame(width: 52, alignment: .leading)
            Text(seg.label)
              .font(.caption.weight(.semibold))
              .foregroundStyle(title)
              .lineLimit(1)
            Spacer(minLength: 4)
            Text(seg.registration ?? seg.aircraftType ?? "—")
              .font(.caption2.monospaced())
              .foregroundStyle(muted)
            Text(seg.gate.map { "G\($0)" } ?? "G—")
              .font(.caption2.weight(.medium))
              .foregroundStyle(muted)
            Text(seg.status ?? "On time")
              .font(.caption2.weight(.semibold))
              .foregroundStyle((seg.delayed ?? false) ? DayTheme.delayedBar : DayTheme.startBar)
              .lineLimit(1)
          }
        }
      }

      WidgetMetaFooter(
        note: snap.noteSnippet,
        liveUpdatedAt: snap.liveUpdatedAt,
        muted: muted,
        accent: DayTheme.flightBar
      )
    }
  }

  private var flightSegments: [WidgetDaySegment] {
    segments.filter { $0.kind == "flight" }
  }

  private var fallbackSegments: [WidgetDaySegment] {
    var list: [WidgetDaySegment] = []
    if let t = snap.checkInTime {
      list.append(WidgetDaySegment(kind: "start", label: "Shift start", flightNumber: nil, registration: nil, aircraftType: nil, gate: nil, status: nil, delayed: nil, startTime: t, endTime: nil))
    }
    if let dep = snap.depIata, let arr = snap.arrIata {
      list.append(
        WidgetDaySegment(
          kind: "flight",
          label: "\(dep) → \(arr)",
          flightNumber: snap.flightNumber,
          registration: nil,
          aircraftType: nil,
          gate: nil,
          status: "On time",
          delayed: false,
          startTime: snap.depTime,
          endTime: snap.arrTime
        )
      )
    }
    if let t = snap.checkOutTime {
      list.append(WidgetDaySegment(kind: "end", label: "Shift end", flightNumber: nil, registration: nil, aircraftType: nil, gate: nil, status: nil, delayed: nil, startTime: t, endTime: nil))
    }
    return list
  }
}

struct TimelineSegmentCell: View {
  let segment: WidgetDaySegment
  var title: Color
  var muted: Color
  var compact: Bool

  private var barColor: Color {
    switch segment.kind {
    case "start": return DayTheme.startBar
    case "end": return DayTheme.endBar
    default: return (segment.delayed ?? false) ? DayTheme.delayedBar : DayTheme.flightBar
    }
  }

  private var barHeight: CGFloat {
    segment.kind == "flight" ? (compact ? 6 : 7) : (compact ? 10 : 12)
  }

  var body: some View {
    VStack(alignment: .leading, spacing: compact ? 3 : 5) {
      Text(segment.label)
        .font(.system(size: compact ? 10 : 11, weight: .semibold))
        .foregroundStyle(title)
        .lineLimit(1)
        .minimumScaleFactor(0.75)

      if segment.kind == "flight" {
        Text(flightHeadline)
          .font(.system(size: compact ? 8 : 9, weight: .bold))
          .foregroundStyle((segment.delayed ?? false) ? DayTheme.delayedBar : muted)
          .lineLimit(1)
          .minimumScaleFactor(0.7)
      }

      Capsule()
        .fill(barColor)
        .frame(height: barHeight)
        .frame(maxWidth: .infinity)

      if segment.kind == "flight" {
        HStack {
          Text(segment.startTime ?? "—")
            .font(.system(size: compact ? 8 : 10, weight: .medium))
            .foregroundStyle(muted)
          Spacer(minLength: 2)
          Text(segment.endTime ?? "—")
            .font(.system(size: compact ? 8 : 10, weight: .medium))
            .foregroundStyle(muted)
        }
        Text(planeLine)
          .font(.system(size: compact ? 8 : 9, weight: .medium).monospaced())
          .foregroundStyle(muted)
          .lineLimit(1)
          .minimumScaleFactor(0.7)
        Text(gateStatusLine)
          .font(.system(size: compact ? 8 : 9, weight: .semibold))
          .foregroundStyle((segment.delayed ?? false) ? DayTheme.delayedBar : DayTheme.startBar)
          .lineLimit(1)
          .minimumScaleFactor(0.7)
      } else {
        Text(segment.startTime ?? "—")
          .font(.system(size: compact ? 9 : 10, weight: .medium))
          .foregroundStyle(muted)
          .frame(maxWidth: .infinity)
      }
    }
  }

  private var flightHeadline: String {
    let fn = segment.flightNumber ?? "—"
    let status = segment.status ?? "On time"
    return "\(fn) · \(status)"
  }

  private var planeLine: String {
    let reg = segment.registration?.trimmingCharacters(in: .whitespacesAndNewlines)
    let type = segment.aircraftType?.trimmingCharacters(in: .whitespacesAndNewlines)
    if let reg, !reg.isEmpty, let type, !type.isEmpty { return "\(reg) · \(type)" }
    if let reg, !reg.isEmpty { return reg }
    if let type, !type.isEmpty { return type }
    return "Reg —"
  }

  private var gateStatusLine: String {
    if let gate = segment.gate?.trimmingCharacters(in: .whitespacesAndNewlines), !gate.isEmpty {
      return "Gate \(gate)"
    }
    return "Gate —"
  }
}
