import WidgetKit
import SwiftUI

@main
struct FlightDeckWidgetBundle: WidgetBundle {
  var body: some Widget {
    NextDutyWidget()
    TodayFlightsWidget()
    DayTimelineWidget()
    LockScreenDutyWidget()
  }
}
