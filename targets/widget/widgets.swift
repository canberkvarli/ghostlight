import AppIntents
import SwiftUI
import UIKit
import WidgetKit

// Tonight's speech, on the home screen.
//
// The widget fetches for itself. When iOS asks it for a timeline it calls the
// server's public "tonight" run (GET /api/monologues/tonight), a week of
// picks for the chosen house, keeps the answer and the day's poster in the
// shared App Group, and asks to be woken after midnight. Offline it shows
// what it kept; on a fresh install with no signal it shows a pick from the
// seed bundled here, so there is never an empty frame telling you to go and
// open the app. The app reads the same run, so the two never disagree.
//
// The stage is the app's warm near-black, the words are paper, the fonts are
// the app's own: Instrument Serif for names and quotes, Courier Prime for
// everything the widget itself says.

let appGroup = "group.com.actorrise.ghostlight"
let api = "https://api.actorrise.com/api/monologues/tonight"

let stage = Color(red: 0x13 / 255, green: 0x0b / 255, blue: 0x08 / 255)
let paper = Color(red: 0xf3 / 255, green: 0xee / 255, blue: 0xe6 / 255)
let muted = Color(red: 0xb3 / 255, green: 0xa6 / 255, blue: 0x9b / 255)
let gel = Color(red: 0xf2 / 255, green: 0xe2 / 255, blue: 0x2b / 255)
let glow = Color(red: 0xe0 / 255, green: 0x73 / 255, blue: 0x1f / 255)
let ink = Color(red: 0x1a / 255, green: 0x12 / 255, blue: 0x0c / 255)
let screenBlock = Color(red: 0x1f / 255, green: 0x13 / 255, blue: 0x32 / 255)
/// The bound-cloth colours a play's cover comes in, keyed to the title the
/// same way the app keys them (src/components/PieceCover.tsx).
let cloths: [Color] = [
    Color(red: 0x19 / 255, green: 0x3b / 255, blue: 0x26 / 255),
    Color(red: 0x53 / 255, green: 0x1b / 255, blue: 0x19 / 255),
    Color(red: 0x15 / 255, green: 0x2e / 255, blue: 0x4e / 255),
    Color(red: 0x4f / 255, green: 0x30 / 255, blue: 0x05 / 255),
    Color(red: 0x34 / 255, green: 0x2b / 255, blue: 0x44 / 255),
    Color(red: 0x12 / 255, green: 0x3b / 255, blue: 0x3c / 255),
]

func serif(_ size: CGFloat) -> Font { .custom("InstrumentSerif-Regular", size: size) }
func serifItalic(_ size: CGFloat) -> Font { .custom("InstrumentSerif-Italic", size: size) }
func courier(_ size: CGFloat) -> Font { .custom("CourierPrime-Regular", size: size) }
func courierItalic(_ size: CGFloat) -> Font { .custom("CourierPrime-Italic", size: size) }
func courierBold(_ size: CGFloat) -> Font { .custom("CourierPrime-Bold", size: size) }

// MARK: - The two houses, chosen on the widget's edit sheet

enum House: String, AppEnum {
    case stage
    case screen

    static var typeDisplayRepresentation = TypeDisplayRepresentation(name: "House")
    static var caseDisplayRepresentations: [House: DisplayRepresentation] = [
        .stage: "Stage",
        .screen: "Film & TV",
    ]
}

struct TonightIntent: WidgetConfigurationIntent {
    static var title: LocalizedStringResource = "Tonight's speech"
    static var description = IntentDescription("Which house tonight's speech comes from.")

    @Parameter(title: "House", default: .stage)
    var house: House
}

// MARK: - The piece

struct Piece: Codable, Hashable {
    let id: String
    let character: String
    let source: String
    let quote: String
    let text: String
    let seconds: Int
    let tone: String?
    let emotion: String?
    let sourceType: String?
    let posterUrl: String?

    var isScreen: Bool { sourceType == "film" || sourceType == "tv" }
}

struct Day: Codable {
    let day: String
    let piece: Piece
}

/// What the server sends. Decoded once, then kept as `Day`.
struct WireRun: Decodable {
    struct WireDay: Decodable {
        let day: String
        let quote: String
        let monologue: WireMonologue
    }

    struct WireMonologue: Decodable {
        let id: LooseId
        let character_name: String
        let play_title: String
        let text: String
        let estimated_duration_seconds: Int
        let tone: String?
        let primary_emotion: String?
        let source_type: String?
        let poster_url: String?
    }

    let days: [WireDay]
}

/// The id arrives as a number; the deep link wants it as text.
struct LooseId: Decodable {
    let value: String
    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if let n = try? c.decode(Int.self) { value = String(n) } else { value = try c.decode(String.self) }
    }
}

func toDays(_ wire: WireRun) -> [Day] {
    wire.days.map { d in
        Day(day: d.day, piece: Piece(
            id: d.monologue.id.value,
            character: d.monologue.character_name,
            source: d.monologue.play_title,
            quote: d.quote,
            text: d.monologue.text,
            seconds: d.monologue.estimated_duration_seconds,
            tone: d.monologue.tone,
            emotion: d.monologue.primary_emotion,
            sourceType: d.monologue.source_type,
            posterUrl: d.monologue.poster_url
        ))
    }
}

// MARK: - Dates

func dayKey(_ date: Date) -> String {
    let f = DateFormatter()
    f.calendar = Calendar.current
    f.timeZone = TimeZone.current
    f.dateFormat = "yyyy-MM-dd"
    return f.string(from: date)
}

/// Days since the epoch of the local calendar date, the number the app and the
/// server both hash to choose a day's piece.
func dayNumber(_ date: Date) -> Int {
    let start = Calendar.current.startOfDay(for: date)
    let offset = TimeInterval(TimeZone.current.secondsFromGMT(for: start))
    return Int(((start.timeIntervalSince1970 + offset) / 86_400).rounded(.down))
}

/// Knuth's multiplicative hash of the day, so consecutive days do not walk the
/// pool in order. The same arithmetic as the app's `tonightIndex`.
func tonightIndex(_ day: Int, _ count: Int) -> Int {
    Int((UInt64(day) &* 2_654_435_761) % (1 << 32)) % count
}

func clock(_ seconds: Int) -> String {
    String(format: "%d:%02d", seconds / 60, seconds % 60)
}

func clothFor(_ key: String) -> Color {
    var h: Int32 = 0
    for u in key.utf16 { h = h &* 31 &+ Int32(u) }
    return cloths[Int(h.magnitude) % cloths.count]
}

// MARK: - The store: what the widget keeps between wakes

enum Store {
    static var folder: URL {
        let group = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup)
        let base = group ?? FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        let dir = base.appendingPathComponent("tonight", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    static func runURL(_ house: House) -> URL { folder.appendingPathComponent("run-\(house.rawValue).json") }
    static func posterURL(_ piece: Piece) -> URL { folder.appendingPathComponent("poster-\(piece.id).jpg") }

    static func save(_ days: [Day], _ house: House) {
        if let data = try? JSONEncoder().encode(days) { try? data.write(to: runURL(house), options: .atomic) }
    }

    static func load(_ house: House) -> [Day]? {
        guard let data = try? Data(contentsOf: runURL(house)) else { return nil }
        return try? JSONDecoder().decode([Day].self, from: data)
    }

    static func poster(_ piece: Piece) -> UIImage? {
        guard piece.posterUrl != nil else { return nil }
        return UIImage(contentsOfFile: posterURL(piece).path)
    }

    /// Fetches and keeps a small copy of the poster if there is not one already.
    /// Small, because a widget has a little memory and a poster is a big file.
    static func ensurePoster(_ piece: Piece) async {
        // The catalogue stores the 300 pixel poster; the thumbnail below is 400 across. The same
        // link with a larger size tag is the same poster, so ask for one bigger than we keep.
        guard let raw = piece.posterUrl,
              let url = URL(string: raw.replacingOccurrences(of: "._V1_SX300.", with: "._V1_SX600.")) else { return }
        let dest = posterURL(piece)
        if FileManager.default.fileExists(atPath: dest.path) { return }
        guard let (data, _) = try? await URLSession.shared.data(from: url),
              let image = UIImage(data: data) else { return }
        let w: CGFloat = 400
        let size = CGSize(width: w, height: w * image.size.height / max(1, image.size.width))
        let small = await image.byPreparingThumbnail(ofSize: size) ?? image
        if let jpg = small.jpegData(compressionQuality: 0.82) { try? jpg.write(to: dest, options: .atomic) }
    }

    /// Posters for other days are not kept past the week they were for.
    static func sweep(keeping days: [Day]) {
        let keep = Set(days.map { posterURL($0.piece).lastPathComponent })
        guard let files = try? FileManager.default.contentsOfDirectory(atPath: folder.path) else { return }
        for f in files where f.hasPrefix("poster-") && !keep.contains(f) {
            try? FileManager.default.removeItem(at: folder.appendingPathComponent(f))
        }
    }
}

// MARK: - The network

func fetchRun(_ house: House) async -> [Day]? {
    guard let url = URL(string: "\(api)?house=\(house.rawValue)&days=8") else { return nil }
    var req = URLRequest(url: url)
    req.timeoutInterval = 15
    req.setValue("ghostlight-widget", forHTTPHeaderField: "X-Client")
    req.setValue("application/json", forHTTPHeaderField: "Accept")
    guard let (data, resp) = try? await URLSession.shared.data(for: req),
          (resp as? HTTPURLResponse)?.statusCode == 200,
          let wire = try? JSONDecoder().decode(WireRun.self, from: data) else { return nil }
    let days = toDays(wire)
    return days.isEmpty ? nil : days
}

// MARK: - The seed: a few pieces bundled with the widget, for the day it has nothing else

struct Seed: Decodable {
    let stage: [Piece]
    let screen: [Piece]
}

func seedPieces(_ house: House) -> [Piece] {
    guard let url = Bundle.main.url(forResource: "seed", withExtension: "json"),
          let data = try? Data(contentsOf: url),
          let seed = try? JSONDecoder().decode(Seed.self, from: data) else { return [] }
    return house == .stage ? seed.stage : seed.screen
}

func seedPiece(_ house: House, _ date: Date) -> Piece? {
    let pool = seedPieces(house)
    guard !pool.isEmpty else { return nil }
    return pool[tonightIndex(dayNumber(date), pool.count)]
}

func pieceFor(_ date: Date, in days: [Day]?, house: House) -> Piece? {
    let key = dayKey(date)
    return days?.first { $0.day == key }?.piece ?? seedPiece(house, date)
}

// MARK: - The timeline

struct TonightEntry: TimelineEntry {
    let date: Date
    let house: House
    let piece: Piece?
    let poster: UIImage?
}

struct TonightProvider: AppIntentTimelineProvider {
    func placeholder(in context: Context) -> TonightEntry {
        TonightEntry(date: Date(), house: .stage, piece: seedPiece(.stage, Date()), poster: nil)
    }

    func snapshot(for configuration: TonightIntent, in context: Context) async -> TonightEntry {
        let now = Date()
        let house = configuration.house
        let piece = pieceFor(now, in: Store.load(house), house: house)
        return TonightEntry(date: now, house: house, piece: piece, poster: piece.flatMap(Store.poster))
    }

    func timeline(for configuration: TonightIntent, in context: Context) async -> Timeline<TonightEntry> {
        let house = configuration.house
        let now = Date()
        let cal = Calendar.current

        let fetched = await fetchRun(house)
        if let fetched {
            Store.save(fetched, house)
            Store.sweep(keeping: fetched)
            // Today's picture and the next two, so a midnight turn is never blank.
            let today = dayKey(now)
            if let i = fetched.firstIndex(where: { $0.day == today }) {
                for d in fetched[i..<min(fetched.count, i + 3)] { await Store.ensurePoster(d.piece) }
            }
        }
        let days = fetched ?? Store.load(house)

        var entries: [TonightEntry] = []
        for k in 0...7 {
            let when = k == 0 ? now : cal.date(byAdding: .day, value: k, to: cal.startOfDay(for: now)) ?? now
            let piece = pieceFor(when, in: days, house: house)
            entries.append(TonightEntry(date: when, house: house, piece: piece, poster: piece.flatMap(Store.poster)))
        }

        // Ask again after midnight when the run came; sooner when it did not.
        let midnight = cal.date(byAdding: .day, value: 1, to: cal.startOfDay(for: now)) ?? now.addingTimeInterval(86_400)
        let retry = now.addingTimeInterval(45 * 60)
        return Timeline(entries: entries, policy: .after(fetched != nil ? midnight.addingTimeInterval(120) : retry))
    }
}

// MARK: - The pieces of the picture

struct Lamp: View {
    var body: some View {
        Circle()
            .fill(glow)
            .frame(width: 6, height: 6)
            .shadow(color: glow.opacity(0.9), radius: 5)
    }
}

/// The poster for the screen, the bound cloth for a play: the cover of the
/// thing the speech came out of, lit by the gel block behind it.
struct Cover: View {
    let piece: Piece
    let poster: UIImage?
    let width: CGFloat
    let height: CGFloat

    var body: some View {
        ZStack(alignment: .topLeading) {
            RoundedRectangle(cornerRadius: 3)
                .fill(gel)
                .frame(width: width, height: height)
                .offset(x: 4, y: 4)
            Group {
                if let poster {
                    Image(uiImage: poster)
                        .resizable()
                        .aspectRatio(contentMode: .fill)
                } else if piece.isScreen {
                    ZStack {
                        screenBlock
                        Text(piece.sourceType == "tv" ? "TV" : "FILM")
                            .font(courier(max(8, width * 0.14)))
                            .tracking(2)
                            .foregroundStyle(Color(red: 0xbd / 255, green: 0x8b / 255, blue: 1))
                    }
                } else {
                    ZStack {
                        clothFor(piece.source)
                        Text(piece.source.uppercased())
                            .font(courier(max(7, width * 0.11)))
                            .tracking(1)
                            .multilineTextAlignment(.center)
                            .lineLimit(3)
                            .foregroundStyle(paper.opacity(0.9))
                            .padding(6)
                    }
                }
            }
            .frame(width: width, height: height)
            .clipShape(RoundedRectangle(cornerRadius: 3))
            .overlay(RoundedRectangle(cornerRadius: 3).stroke(ink, lineWidth: 1))
        }
        .frame(width: width + 4, height: height + 4, alignment: .topLeading)
    }
}

/// A word in a chip: a tone, an emotion, a length.
struct Tag: View {
    let word: String
    var body: some View {
        Text(word.lowercased())
            .font(courier(9))
            .tracking(0.6)
            .foregroundStyle(paper.opacity(0.85))
            .padding(.horizontal, 7)
            .padding(.vertical, 3)
            .overlay(RoundedRectangle(cornerRadius: 9).stroke(muted.opacity(0.5), lineWidth: 1))
    }
}

struct Direction: View {
    let line: String
    var body: some View {
        Text(line)
            .font(courierItalic(9))
            .tracking(0.6)
            .foregroundStyle(muted)
    }
}

// MARK: - The three sizes

struct SmallTonight: View {
    let piece: Piece
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 6) {
                Lamp()
                Direction(line: "(tonight.)")
                Spacer(minLength: 0)
            }
            Spacer(minLength: 6)
            Text("\u{201C}\(piece.quote)\u{201D}")
                .font(serif(15))
                .foregroundStyle(paper)
                .lineSpacing(1)
                .lineLimit(5)
                .minimumScaleFactor(0.78)
            Spacer(minLength: 6)
            Text(piece.character)
                .font(courierBold(10))
                .foregroundStyle(paper)
                .lineLimit(1)
            Text(piece.source)
                .font(courierItalic(9))
                .foregroundStyle(muted)
                .lineLimit(1)
        }
    }
}

struct MediumTonight: View {
    let piece: Piece
    let poster: UIImage?
    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            Cover(piece: piece, poster: poster, width: 76, height: 112)
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 6) {
                    Lamp()
                    Direction(line: "(tonight.)")
                    Spacer(minLength: 0)
                    Text(clock(piece.seconds))
                        .font(courier(9))
                        .foregroundStyle(muted)
                }
                Text(piece.character)
                    .font(serif(22))
                    .foregroundStyle(paper)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                    .padding(.top, 6)
                Text("from \(piece.source)")
                    .font(courierItalic(10))
                    .foregroundStyle(muted)
                    .lineLimit(1)
                Spacer(minLength: 4)
                Text("\u{201C}\(piece.quote)\u{201D}")
                    .font(serifItalic(14))
                    .foregroundStyle(paper.opacity(0.94))
                    .lineLimit(3)
                    .minimumScaleFactor(0.85)
            }
        }
    }
}

struct LargeTonight: View {
    let piece: Piece
    let poster: UIImage?
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // The picture at the head of the page, fading down into the stage.
            ZStack(alignment: .bottomLeading) {
                Group {
                    if let poster {
                        Image(uiImage: poster)
                            .resizable()
                            .aspectRatio(contentMode: .fill)
                    } else if piece.isScreen {
                        screenBlock
                    } else {
                        clothFor(piece.source)
                    }
                }
                .frame(maxWidth: .infinity)
                .frame(height: 132)
                .clipped()
                LinearGradient(colors: [stage.opacity(0), stage.opacity(0.85), stage], startPoint: .top, endPoint: .bottom)
                    .frame(height: 80)
                if poster == nil {
                    Text(piece.source.uppercased())
                        .font(courier(10))
                        .tracking(2)
                        .foregroundStyle(paper.opacity(0.75))
                        .padding(.bottom, 10)
                }
            }
            .frame(height: 132)
            .clipShape(RoundedRectangle(cornerRadius: 4))
            .padding(.bottom, 10)

            HStack(spacing: 6) {
                Lamp()
                Direction(line: "(tonight.)")
                Spacer(minLength: 0)
            }
            Text(piece.character)
                .font(serif(26))
                .foregroundStyle(paper)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .padding(.top, 4)
            Text("from \(piece.source)")
                .font(courierItalic(10))
                .foregroundStyle(muted)
                .lineLimit(1)
            Text("\u{201C}\(piece.quote)\u{201D}")
                .font(serifItalic(16))
                .foregroundStyle(paper.opacity(0.94))
                .lineSpacing(1)
                .lineLimit(3)
                .minimumScaleFactor(0.85)
                .padding(.top, 8)
            Spacer(minLength: 6)
            HStack(spacing: 6) {
                if let t = piece.tone, !t.isEmpty { Tag(word: t) }
                if let e = piece.emotion, !e.isEmpty, e.lowercased() != piece.tone?.lowercased() { Tag(word: e) }
                Tag(word: clock(piece.seconds))
                Spacer(minLength: 0)
                Text("GHOST LIGHT")
                    .font(courier(8))
                    .tracking(2.2)
                    .foregroundStyle(muted)
            }
        }
    }
}

struct TonightView: View {
    @Environment(\.widgetFamily) var family
    var entry: TonightEntry

    var link: URL? {
        guard let p = entry.piece else { return URL(string: "ghostlight://") }
        let medium = entry.house == .screen ? "?medium=screen" : ""
        return URL(string: "ghostlight://read/\(p.id)\(medium)")
    }

    var body: some View {
        Group {
            if let p = entry.piece {
                switch family {
                case .systemSmall: SmallTonight(piece: p)
                case .systemMedium: MediumTonight(piece: p, poster: entry.poster)
                default: LargeTonight(piece: p, poster: entry.poster)
                }
            } else {
                VStack(alignment: .leading, spacing: 8) {
                    Lamp()
                    Spacer(minLength: 0)
                    Text("Ghost Light")
                        .font(serif(18))
                        .foregroundStyle(paper)
                    Direction(line: "(the house is dark. it will be lit by morning.)")
                }
            }
        }
        .widgetURL(link)
        .containerBackground(stage, for: .widget)
    }
}

struct TonightWidget: Widget {
    let kind: String = "Tonight"

    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: kind, intent: TonightIntent.self, provider: TonightProvider()) { entry in
            TonightView(entry: entry)
        }
        .configurationDisplayName("Tonight's speech")
        .description("One monologue a day, on the stage. Tap to read it.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}
