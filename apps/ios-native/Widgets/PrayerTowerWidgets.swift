import ActivityKit
import PrayerTowerKit
import SwiftUI
import WidgetKit

// The widget extension: the Pray now home-screen widget and the Praying for you Live Activity
// (src/widgets in the Expo app). Both only show what the app or the server sent.

@main
struct PrayerTowerWidgets: WidgetBundle {
    var body: some Widget {
        PrayNowWidget()
        PrayedForLiveActivity()
    }
}

private let purple = Color(red: 0x5B / 255, green: 0x3E / 255, blue: 0x96 / 255)

struct PrayNowEntry: TimelineEntry {
    let date: Date
    let snapshot: PrayNowSnapshot
}

struct PrayNowProvider: TimelineProvider {
    func placeholder(in context: Context) -> PrayNowEntry { PrayNowEntry(date: .now, snapshot: .placeholder(Edition.current == .openCircle ? .neutral : .faith)) }
    func getSnapshot(in context: Context, completion: @escaping (PrayNowEntry) -> Void) { completion(entry()) }
    // The app reloads the timeline whenever it has new content, so one entry is enough.
    func getTimeline(in context: Context, completion: @escaping (Timeline<PrayNowEntry>) -> Void) {
        completion(Timeline(entries: [entry()], policy: .never))
    }
    private func entry() -> PrayNowEntry { PrayNowEntry(date: .now, snapshot: PrayNow.load() ?? .placeholder(Edition.current == .openCircle ? .neutral : .faith)) }
}

struct PrayNowView: View {
    @Environment(\.widgetFamily) private var family
    let s: PrayNowSnapshot

    var body: some View {
        let small = family == .systemSmall
        VStack(alignment: .leading, spacing: 6) {
            Text("🕊 \(s.heading)").font(.system(size: 13, weight: .bold)).foregroundStyle(purple)
            Text(s.text).font(.system(size: small ? 14 : 16, weight: .medium)).lineLimit(small ? 4 : 3)
            Spacer(minLength: 0)
            if !s.prayedFor.isEmpty { Text(s.prayedFor).font(.system(size: 12, weight: .semibold)).foregroundStyle(purple).lineLimit(1) }
            if !s.detail.isEmpty { Text(s.detail).font(.system(size: 12)).foregroundStyle(.secondary) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .containerBackground(for: .widget) { Color(red: 0xFB / 255, green: 0xF8 / 255, blue: 0xF3 / 255) }
        .widgetURL(URL(string: s.url))
    }
}

struct PrayNowWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "PrayNow", provider: PrayNowProvider()) { PrayNowView(s: $0.snapshot) }
            // Open Circle uses neutral words on the home screen too.
            .configurationDisplayName(Edition.current == .openCircle ? "Lift Someone Up" : "Pray Now")
            .description(Edition.current == .openCircle ? "The next request for support." : "The next prayer request to pray for.")
            .supportedFamilies([.systemSmall, .systemMedium])
    }
}

/// First names and a count only: a Lock Screen is seen by others.
struct PrayedForLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: PrayedForAttributes.self) { context in
            let p = props(context.state)
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text("💛 \(p.heading)").font(.system(size: 14, weight: .bold)).foregroundStyle(purple)
                    Spacer()
                    Text("\(p.count)").font(.system(size: 20, weight: .bold)).foregroundStyle(purple)
                }
                Text(p.line).font(.system(size: 15, weight: .medium)).lineLimit(2)
            }
            .padding()
            .widgetURL(URL(string: "\(Edition.current.scheme):///post/\(context.attributes.postId)"))
        } dynamicIsland: { context in
            let p = props(context.state)
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) { Text("💛 \(p.heading)").font(.system(size: 14, weight: .bold)).foregroundStyle(purple) }
                DynamicIslandExpandedRegion(.trailing) { Text("\(p.count)").font(.system(size: 18, weight: .bold)) }
                DynamicIslandExpandedRegion(.bottom) { Text(p.line).font(.system(size: 15)).lineLimit(2) }
            } compactLeading: {
                Text("💛")
            } compactTrailing: {
                Text("\(p.count)").font(.system(size: 14, weight: .bold))
            } minimal: {
                Text("💛")
            }
            .widgetURL(URL(string: "\(Edition.current.scheme):///post/\(context.attributes.postId)"))
        }
    }

    private func props(_ s: PrayedForState) -> PrayedForProps { s.decoded ?? PrayedForProps(heading: "💛", line: "", count: 0) }
}
