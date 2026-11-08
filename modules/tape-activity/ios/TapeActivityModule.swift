import ActivityKit
import ExpoModulesCore

/// Must stay identical to the one in targets/widget/tape-activity.swift: the
/// system matches the app's and the widget's by name and shape.
struct TapeDueAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    var due: Date
    var sent: Bool
  }

  var project: String
  var role: String
  var url: String
}

struct TapeActivityStart: Record {
  @Field var project: String = ""
  @Field var role: String = ""
  @Field var url: String = ""
  @Field var dueMs: Double = 0
}

/// The self-tape countdown on the lock screen (CAN-33). One at a time: the
/// soonest self-tape due today and not yet sent.
public class TapeActivityModule: Module {
  public func definition() -> ModuleDefinition {
    Name("TapeActivity")

    Function("isAvailable") { () -> Bool in
      ActivityAuthorizationInfo().areActivitiesEnabled
    }

    /// The URL of the countdown running now, if any.
    Function("running") { () -> String? in
      Activity<TapeDueAttributes>.activities.first?.attributes.url
    }

    AsyncFunction("start") { (o: TapeActivityStart) async throws -> String in
      let due = Date(timeIntervalSince1970: o.dueMs / 1000)
      let state = TapeDueAttributes.ContentState(due: due, sent: false)
      for activity in Activity<TapeDueAttributes>.activities {
        if activity.attributes.url == o.url {
          // The same audition: only the time may have moved.
          await activity.update(ActivityContent(state: state, staleDate: due))
          return activity.id
        }
        await activity.end(nil, dismissalPolicy: .immediate)
      }
      let attributes = TapeDueAttributes(project: o.project, role: o.role, url: o.url)
      let activity = try Activity.request(attributes: attributes, content: ActivityContent(state: state, staleDate: due), pushType: nil)
      return activity.id
    }

    /// Sent: it says so for half an hour, then goes. Otherwise it goes at once.
    AsyncFunction("end") { (sent: Bool) async in
      for activity in Activity<TapeDueAttributes>.activities {
        let state = TapeDueAttributes.ContentState(due: activity.content.state.due, sent: sent)
        await activity.end(ActivityContent(state: state, staleDate: nil),
                           dismissalPolicy: sent ? .after(Date().addingTimeInterval(30 * 60)) : .immediate)
      }
    }
  }
}
