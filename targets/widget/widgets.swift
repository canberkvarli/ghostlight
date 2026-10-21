import WidgetKit
import SwiftUI

// Tonight's speech, on the home screen.
//
// The app writes a week of picks to the shared App Group each time it has the
// shelf (src/lib/widget.ts): one piece per local day, the same piece the
// ticket and the evening knock name. The widget reads that, shows today's, and
// asks to be redrawn at each midnight so it turns over on its own even if the
// app is not opened. Nothing is fetched here; a widget with no data says so
// and sends you to the app.
//
// The stage is the app's warm near-black; the words are paper. Type is the
// system serif and monospace rather than the app's own fonts, which would
// need bundling into this target; the shapes match and nothing is said twice.

let appGroup = "group.com.actorrise.ghostlight"
let stage = Color(red: 0x13 / 255, green: 0x0b / 255, blue: 0x08 / 255)
let paper = Color(red: 0xf3 / 255, green: 0xee / 255, blue: 0xe6 / 255)
let muted = Color(red: 0xb3 / 255, green: 0xa6 / 255, blue: 0x9b / 255)
let gel = Color(red: 0xf2 / 255, green: 0xc1 / 255, blue: 0x4e / 255)
let glow = Color(red: 0xe0 / 255, green: 0x73 / 255, blue: 0x1f / 255)

struct Piece: Codable {
    let day: String
    let id: String
    let character: String
    let source: String
    let excerpt: String
    let seconds: Int
    let house: String

    static let sample = Piece(
        day: "",
        id: "",
        character: "Nora",
        source: "A Doll's House",
        excerpt: "I have been your doll-wife, just as at home I was papa's doll-child; and here the children have been my dolls.",
        seconds: 95,
        house: "theatre"
    )
}

struct Shelf: Codable {
    let days: [Piece]
}

func loadShelf() -> Shelf? {
    guard let defaults = UserDefaults(suiteName: appGroup),
          let raw = defaults.string(forKey: "tonight"),
          let data = raw.data(using: .utf8) else { return nil }
    return try? JSONDecoder().decode(Shelf.self, from: data)
}

func dayKey(_ date: Date) -> String {
    let f = DateFormatter()
    f.calendar = Calendar.current
    f.timeZone = TimeZone.current
    f.dateFormat = "yyyy-MM-dd"
    return f.string(from: date)
}

func pieceFor(_ date: Date) -> Piece? {
    loadShelf()?.days.first { $0.day == dayKey(date) }
}

func clock(_ seconds: Int) -> String {
    let m = seconds / 60
    let s = seconds % 60
    return String(format: "%d:%02d", m, s)
}

struct TonightEntry: TimelineEntry {
    let date: Date
    let piece: Piece?
}

struct TonightProvider: TimelineProvider {
    func placeholder(in context: Context) -> TonightEntry {
        TonightEntry(date: Date(), piece: Piece.sample)
    }

    func getSnapshot(in context: Context, completion: @escaping (TonightEntry) -> Void) {
        let now = Date()
        completion(TonightEntry(date: now, piece: pieceFor(now) ?? (context.isPreview ? Piece.sample : nil)))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<TonightEntry>) -> Void) {
        let cal = Calendar.current
        let now = Date()
        var entries = [TonightEntry(date: now, piece: pieceFor(now))]
        // One entry per midnight for the week the app wrote, so the page turns
        // over on its own.
        for k in 1...7 {
            if let midnight = cal.date(byAdding: .day, value: k, to: cal.startOfDay(for: now)) {
                entries.append(TonightEntry(date: midnight, piece: pieceFor(midnight)))
            }
        }
        completion(Timeline(entries: entries, policy: .atEnd))
    }
}

struct Lamp: View {
    var body: some View {
        Circle()
            .fill(gel)
            .frame(width: 6, height: 6)
            .shadow(color: glow.opacity(0.9), radius: 5)
    }
}

struct TonightView: View {
    @Environment(\.widgetFamily) var family
    var entry: TonightEntry

    var body: some View {
        if let p = entry.piece {
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 6) {
                    Lamp()
                    Text("(tonight.)")
                        .font(.system(size: 10, design: .monospaced))
                        .italic()
                        .foregroundStyle(muted)
                    Spacer(minLength: 0)
                    if family != .systemSmall {
                        Text(clock(p.seconds))
                            .font(.system(size: 10, design: .monospaced))
                            .foregroundStyle(muted)
                    }
                }
                Spacer(minLength: 6)
                Text(p.character)
                    .font(.system(size: family == .systemSmall ? 19 : 24, weight: .regular, design: .serif))
                    .foregroundStyle(paper)
                    .lineLimit(2)
                    .minimumScaleFactor(0.8)
                Text("from \(p.source)")
                    .font(.system(size: 11, design: .monospaced))
                    .italic()
                    .foregroundStyle(muted)
                    .lineLimit(1)
                    .padding(.top, 2)
                if family != .systemSmall {
                    Rectangle()
                        .fill(muted.opacity(0.35))
                        .frame(height: 1)
                        .padding(.top, 8)
                    Text(p.excerpt)
                        .font(.system(size: 12, design: .monospaced))
                        .foregroundStyle(paper.opacity(0.92))
                        .lineLimit(family == .systemLarge ? 9 : 3)
                        .lineSpacing(3)
                        .padding(.top, 8)
                }
                Spacer(minLength: 0)
            }
            .widgetURL(URL(string: "ghostlight://read/\(p.id)"))
            .containerBackground(stage, for: .widget)
        } else {
            VStack(alignment: .leading, spacing: 8) {
                Lamp()
                Spacer(minLength: 0)
                Text("Ghost Light")
                    .font(.system(size: 18, design: .serif))
                    .foregroundStyle(paper)
                Text("(open the app once, and tonight's speech will be here.)")
                    .font(.system(size: 10, design: .monospaced))
                    .italic()
                    .foregroundStyle(muted)
                    .lineLimit(3)
            }
            .widgetURL(URL(string: "ghostlight://"))
            .containerBackground(stage, for: .widget)
        }
    }
}

struct TonightWidget: Widget {
    let kind: String = "Tonight"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: TonightProvider()) { entry in
            TonightView(entry: entry)
        }
        .configurationDisplayName("Tonight's speech")
        .description("One monologue a day, on the stage. Tap to read it.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}
