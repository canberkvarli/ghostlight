import ActivityKit
import SwiftUI
import WidgetKit

/// A self-tape counting down to its due time, on the lock screen and in the
/// Dynamic Island (CAN-33). Started by the app (modules/tape-activity) on the
/// day a self-tape is due and not yet sent; ended when it is marked sent or
/// the time has passed. "Tape it" opens the tape room on the audition.
///
/// This type must stay identical to the one in modules/tape-activity: the
/// system matches the two by name and shape.
struct TapeDueAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    var due: Date
    var sent: Bool
  }

  var project: String
  var role: String
  /// ghostlight://tape/<piece>?audition=<id>
  var url: String
}

/// The time left, counting down by itself; at zero, the due time as a clock.
struct DueClock: View {
  let due: Date
  var body: some View {
    if due > Date() {
      Text(timerInterval: Date()...due, countsDown: true)
        .monospacedDigit()
    } else {
      Text(due, style: .time)
    }
  }
}

struct TapeDueLockScreen: View {
  let context: ActivityViewContext<TapeDueAttributes>
  var body: some View {
    HStack(alignment: .center, spacing: 14) {
      ZStack {
        Circle().fill(glow).frame(width: 40, height: 40)
        Image(systemName: context.state.sent ? "checkmark" : "video.fill")
          .font(.system(size: 16, weight: .semibold))
          .foregroundColor(ink)
      }
      VStack(alignment: .leading, spacing: 2) {
        Text(context.attributes.project)
          .font(serif(22))
          .foregroundColor(paper)
          .lineLimit(1)
        Text(context.state.sent ? "(sent. break a leg.)" : (context.attributes.role.isEmpty ? "(tape due.)" : "(\(context.attributes.role.lowercased()). tape due.)"))
          .font(courierItalic(12))
          .foregroundColor(muted)
          .lineLimit(1)
      }
      Spacer(minLength: 8)
      if !context.state.sent {
        DueClock(due: context.state.due)
          .font(courierBold(20))
          .foregroundColor(paper)
          .multilineTextAlignment(.trailing)
          .frame(maxWidth: 110, alignment: .trailing)
      }
    }
    .padding(.horizontal, 18)
    .padding(.vertical, 14)
  }
}

struct TapeDueActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: TapeDueAttributes.self) { context in
      TapeDueLockScreen(context: context)
        .activityBackgroundTint(stage)
        .activitySystemActionForegroundColor(paper)
        .widgetURL(URL(string: context.attributes.url))
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          Image(systemName: "video.fill").foregroundColor(glow).padding(.leading, 6)
        }
        DynamicIslandExpandedRegion(.center) {
          Text(context.attributes.project).font(serif(18)).foregroundColor(paper).lineLimit(1)
        }
        DynamicIslandExpandedRegion(.trailing) {
          if !context.state.sent {
            DueClock(due: context.state.due).font(courierBold(15)).foregroundColor(paper).frame(maxWidth: 80, alignment: .trailing)
          }
        }
        DynamicIslandExpandedRegion(.bottom) {
          if let url = URL(string: context.attributes.url), !context.state.sent {
            Link(destination: url) {
              Text("Tape it")
                .font(.system(size: 15, weight: .semibold))
                .foregroundColor(ink)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 8)
                .background(Capsule().fill(glow))
            }
            .padding(.top, 4)
          }
        }
      } compactLeading: {
        Image(systemName: "video.fill").foregroundColor(glow)
      } compactTrailing: {
        if context.state.sent {
          Image(systemName: "checkmark").foregroundColor(glow)
        } else {
          DueClock(due: context.state.due).font(courierBold(13)).foregroundColor(paper).frame(maxWidth: 56)
        }
      } minimal: {
        Image(systemName: context.state.sent ? "checkmark" : "video.fill").foregroundColor(glow)
      }
      .widgetURL(URL(string: context.attributes.url))
      .keylineTint(glow)
    }
  }
}
