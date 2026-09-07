import WidgetKit
import SwiftUI

enum WidgetTheme {
  static let background = Color(red: 0.96, green: 0.97, blue: 0.99)
  static let title = Color(red: 0.07, green: 0.11, blue: 0.17)
  static let body = Color(red: 0.32, green: 0.38, blue: 0.45)
  static let accent = Color(red: 0.00, green: 0.52, blue: 0.78)
}

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
    let entries = dates
      .filter { $0 >= now.addingTimeInterval(-60) }
      .sorted()
      .map { DutyEntry(date: $0, snapshot: snap) }
    let refresh = now.addingTimeInterval(30 * 60)
    completion(Timeline(entries: entries.isEmpty ? [DutyEntry(date: now, snapshot: snap)] : entries, policy: .after(refresh)))
  }
}

struct NextDutyWidget: Widget {
  let kind = "NextDutyWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: DutyProvider()) { entry in
      NextDutyView(entry: entry)
        .environment(\.colorScheme, .light)
        .containerBackground(for: .widget) {
          WidgetTheme.background
        }
    }
    .configurationDisplayName("Next duty")
    .description("Check-in time and next sector from Flight Deck.")
    .supportedFamilies([.systemSmall, .systemMedium])
  }
}

struct TodayFlightsWidget: Widget {
  let kind = "TodayFlightsWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: DutyProvider()) { entry in
      TodayFlightsView(entry: entry)
        .environment(\.colorScheme, .light)
        .containerBackground(for: .widget) {
          WidgetTheme.background
        }
    }
    .configurationDisplayName("Today’s flights")
    .description("How many sectors you have today and the active route.")
    .supportedFamilies([.systemSmall, .systemMedium])
  }
}

struct NextDutyView: View {
  let entry: DutyEntry
  @Environment(\.widgetFamily) private var family

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      Text("Flight Deck")
        .font(.caption2.weight(.semibold))
        .foregroundStyle(WidgetTheme.accent)
      Text(entry.snapshot.headline)
        .font(family == .systemSmall ? .headline : .title3.weight(.semibold))
        .foregroundStyle(WidgetTheme.title)
        .lineLimit(2)
        .minimumScaleFactor(0.8)
      if let route = entry.snapshot.route, !route.isEmpty {
        Text(route)
          .font(.subheadline.weight(.medium))
          .foregroundStyle(WidgetTheme.body)
      }
      Text(entry.snapshot.detail)
        .font(.caption)
        .foregroundStyle(WidgetTheme.body)
        .lineLimit(family == .systemSmall ? 2 : 3)
      Spacer(minLength: 0)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .padding(4)
  }
}

struct TodayFlightsView: View {
  let entry: DutyEntry

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text("Today")
        .font(.caption2.weight(.semibold))
        .foregroundStyle(WidgetTheme.accent)
      if entry.snapshot.empty {
        Text("No flights")
          .font(.title3.weight(.semibold))
          .foregroundStyle(WidgetTheme.title)
        Text("Open Flight Deck to import your roster")
          .font(.caption)
          .foregroundStyle(WidgetTheme.body)
      } else {
        Text("\(entry.snapshot.flightCount)")
          .font(.system(size: 42, weight: .bold, design: .rounded))
          .foregroundStyle(WidgetTheme.title)
        Text(entry.snapshot.flightCount == 1 ? "flight" : "flights")
          .font(.subheadline.weight(.medium))
          .foregroundStyle(WidgetTheme.body)
        if let fn = entry.snapshot.flightNumber {
          Text(fn)
            .font(.caption.weight(.semibold))
            .foregroundStyle(WidgetTheme.title)
        }
        if let route = entry.snapshot.route {
          Text(route)
            .font(.caption)
            .foregroundStyle(WidgetTheme.body)
        }
      }
      Spacer(minLength: 0)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .padding(4)
  }
}
