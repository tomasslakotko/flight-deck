import Foundation
import UserNotifications

enum NativeNotifications {
  static let idPrefix = "fd-"

  static func requestPermission(completion: @escaping (Bool) -> Void) {
    UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
      DispatchQueue.main.async { completion(granted) }
    }
  }

  static func clearScheduled() {
    let center = UNUserNotificationCenter.current()
    center.getPendingNotificationRequests { requests in
      let ids = requests.map(\.identifier).filter { $0.hasPrefix(idPrefix) }
      center.removePendingNotificationRequests(withIdentifiers: ids)
    }
  }

  /// Replace all Flight Deck scheduled local notifications.
  /// `at` is epoch milliseconds (or seconds if small).
  static func sync(notices: [[String: Any]]) {
    clearScheduled()
    let center = UNUserNotificationCenter.current()
    let now = Date().timeIntervalSince1970

    for item in notices {
      guard let title = item["title"] as? String,
            let body = item["body"] as? String
      else { continue }

      let rawId = (item["id"] as? String) ?? (item["tag"] as? String) ?? UUID().uuidString
      let id = sanitizeId(rawId)

      let atRaw: Double
      if let n = item["at"] as? Double {
        atRaw = n
      } else if let n = item["at"] as? Int {
        atRaw = Double(n)
      } else {
        continue
      }
      let fireAt = atRaw > 10_000_000_000 ? atRaw / 1000.0 : atRaw
      let wait = fireAt - now
      guard wait > 5, wait < 36 * 60 * 60 else { continue }

      let content = UNMutableNotificationContent()
      content.title = title
      content.body = body
      content.sound = .default
      if let url = item["url"] as? String {
        content.userInfo = ["url": url]
      }

      let trigger = UNTimeIntervalNotificationTrigger(timeInterval: wait, repeats: false)
      let request = UNNotificationRequest(identifier: id, content: content, trigger: trigger)
      center.add(request, withCompletionHandler: nil)
    }
  }

  static func deliverNow(title: String, body: String, id: String? = nil, url: String? = nil) {
    let content = UNMutableNotificationContent()
    content.title = title
    content.body = body
    content.sound = .default
    if let url {
      content.userInfo = ["url": url]
    }
    let request = UNNotificationRequest(
      identifier: sanitizeId(id ?? UUID().uuidString),
      content: content,
      trigger: nil
    )
    UNUserNotificationCenter.current().add(request, withCompletionHandler: nil)
  }

  private static func sanitizeId(_ raw: String) -> String {
    let cleaned = raw.replacingOccurrences(of: "[^A-Za-z0-9._-]", with: "-", options: .regularExpression)
    let clipped = String(cleaned.prefix(120))
    return idPrefix + (clipped.isEmpty ? UUID().uuidString : clipped)
  }
}

final class NotificationDelegate: NSObject, UNUserNotificationCenterDelegate {
  static let shared = NotificationDelegate()

  func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    willPresent notification: UNNotification,
    withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
  ) {
    completionHandler([.banner, .sound, .list])
  }
}
