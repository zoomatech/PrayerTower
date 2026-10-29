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
/// The cream behind the widget and the Lock Screen activity, so the purple keeps 4.5:1 in dark mode too.
private let cream = Color(red: 0xFB / 255, green: 0xF8 / 255, blue: 0xF3 / 255)
/// Purple light enough for the Dynamic Island's black (the dark purple is under 3:1 there).
private let lilac = Color(red: 0xC9 / 255, green: 0xB6 / 255, blue: 0xF2 / 255)

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
            Text("🕊 \(s.heading)").font(.footnote.bold()).foregroundStyle(purple)
            Text(s.text).font((small ? Font.subheadline : .callout).weight(.medium)).lineLimit(small ? 4 : 3).minimumScaleFactor(0.8)
            Spacer(minLength: 0)
            if !s.prayedFor.isEmpty { Text(s.prayedFor).font(.caption.weight(.semibold)).foregroundStyle(purple).lineLimit(1).minimumScaleFactor(0.8) }
            if !s.detail.isEmpty { Text(s.detail).font(.caption).foregroundStyle(.secondary).lineLimit(2).minimumScaleFactor(0.8) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .containerBackground(for: .widget) { cream }
        .environment(\.colorScheme, .light)
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
                    Text("💛 \(p.heading)").font(.subheadline.bold()).foregroundStyle(purple)
                    Spacer()
                    Text("\(p.count)").font(.title3.bold()).foregroundStyle(purple)
                }
                Text(p.line).font(.subheadline.weight(.medium)).lineLimit(2).minimumScaleFactor(0.8)
            }
            .padding()
            .activityBackgroundTint(cream)
            .environment(\.colorScheme, .light)
            .widgetURL(URL(string: "\(Edition.current.scheme):///post/\(context.attributes.postId)"))
        } dynamicIsland: { context in
            let p = props(context.state)
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) { Text("💛 \(p.heading)").font(.subheadline.bold()).foregroundStyle(lilac) }
                DynamicIslandExpandedRegion(.trailing) { Text("\(p.count)").font(.headline) }
                DynamicIslandExpandedRegion(.bottom) { Text(p.line).font(.subheadline).lineLimit(2).minimumScaleFactor(0.8) }
            } compactLeading: {
                Text("💛")
            } compactTrailing: {
                Text("\(p.count)").font(.subheadline.bold())
            } minimal: {
                Text("💛")
            }
            .widgetURL(URL(string: "\(Edition.current.scheme):///post/\(context.attributes.postId)"))
        }
    }

    private func props(_ s: PrayedForState) -> PrayedForProps { s.decoded ?? PrayedForProps(heading: "💛", line: "", count: 0) }
}
