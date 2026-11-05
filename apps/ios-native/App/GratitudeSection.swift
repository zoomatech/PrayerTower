import PrayerTowerKit
import SwiftUI

/// Me → "Three good things" (gratitude-card.tsx, `gratitudeCard`): up to three good things a week,
/// private unless the member shares them as praise or to one of their circles, with an optional
/// reminder day. A skipped week is never mentioned.
struct GratitudeSection: View {
    @Environment(AppModel.self) private var model
    @State private var g: Gratitude?
    @State private var boxes = ["", "", ""]
    @State private var circles: [CircleSummary] = []
    @State private var sharing = false
    @State private var note: String?
    @State private var error: String?
    @State private var busy = false

    private var w: Words { model.words }

    var body: some View {
        Group {
            if model.features["gratitudeCard"], let g, g.enabled {
                let filled = Gratitude.filled(boxes)
                Section {
                    Text(w("practices.gratitudeIntro")).font(.footnote)
                    if let n = g.weeks, n > 0 { Text(w("practices.gratitudeWeeks", ["n": String(n)])) }
                    ForEach(0..<3, id: \.self) { i in
                        TextField(w("practices.gratitudeItem", ["n": String(i + 1)]), text: $boxes[i], axis: .vertical)
                            .onChange(of: boxes[i]) { boxes[i] = String(boxes[i].prefix(280)) }
                    }
                    Button(w("practices.gratitudeSave")) {
                        Task { await run(w("practices.gratitudeSaved")) { try await model.store.api.saveGratitude(filled) } }
                    }
                    .disabled(busy)
                    if !filled.isEmpty {
                        Button(w("practices.gratitudeShare")) { sharing = true }
                        ForEach(circles) { c in
                            Button(w("circleUpdates.shareTo", ["name": c.name])) {
                                Task {
                                    await run(w("circleUpdates.shared", ["name": c.name])) {
                                        _ = try await model.store.api.circlePost(c.id, body: filled.joined(separator: "\n"))
                                        return g
                                    }
                                }
                            }
                        }
                    }
                    if let note { Text(note).font(.footnote) }
                    Picker(w("practices.gratitudeDay"), selection: Binding(get: { g.weekday ?? -1 }, set: { d in
                        Task { await run(nil) { try await model.store.api.setGratitudeDay(d < 0 ? nil : d) } }
                    })) {
                        Text(w("practices.gratitudeDayOff")).tag(-1)
                        ForEach(0..<7, id: \.self) { d in Text(w("practices.days.d\(d)")).tag(d) }
                    }
                    if let error { Text(error).foregroundStyle(Color.danger) }
                } header: {
                    Text(w("practices.gratitudeTitle"))
                }
                .sheet(isPresented: $sharing) { ComposeView(start: Gratitude.praise(boxes)) }
            }
        }
        .task(id: model.features["gratitudeCard"]) { await load() }
    }

    private func load() async {
        guard model.features["gratitudeCard"] else { return }
        // A card that can't load stays hidden, as in the Expo app.
        if let x = try? await model.store.api.gratitude() { show(x) }
        if model.features["circleUpdates"], let mine = try? await model.store.api.myCircles() { circles = mine.circles }
    }

    private func show(_ x: Gratitude) {
        g = x
        if x.enabled { boxes = x.boxes }
    }

    private func run(_ done: String?, _ call: () async throws -> Gratitude) async {
        busy = true
        defer { busy = false }
        do {
            show(try await call())
            note = done
            error = nil
            if let done { AccessibilityNotification.Announcement(done).post() }
        } catch { self.error = error.localizedDescription }
    }
}
