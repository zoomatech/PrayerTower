import PrayerTowerKit
import SwiftUI

/// Me → "Your prayer life": the member's own counts (only while they keep them on), with
/// gentle rhythm, weeks of prayer, welcome back, fresh starts and the weekly intention
/// following their switches. Nothing here ever counts down or names a missed day.
struct PrayerLifeSection: View {
    @Environment(AppModel.self) private var model
    @State private var stats: PrayerStats?

    private var w: Words { model.words }

    var body: some View {
        Group {
            if let s = stats, s.enabled {
                let f = model.features, third = s.third(f, w)
                Section {
                    AdaptiveStack {
                        number(s.daysPrayed, w("stats.days"))
                        number(s.peoplePrayedFor, w("stats.people"))
                        number(third.value, third.label)
                    }
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel(s.summary(f, w))
                    Dots(days: s.week.map(\.prayed))
                    ForEach(s.gentleLines(f, w), id: \.self) { Text($0) }
                    if let i = s.intention { IntentionPicker(intention: i) { stats = $0 } }
                } header: {
                    Text(w("stats.title"))
                } footer: {
                    Text(s.note(f, w))
                }
            }
        }
        .task(id: model.features["weeklyIntention"]) { stats = try? await model.store.api.prayerStats() }
    }

    private func number(_ n: Int, _ label: String) -> some View {
        VStack {
            Text("\(n)").font(.title2.bold())
            Text(label).font(.caption).multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
    }
}

/// The week as dots that only fill in. The words beside them say the same, so VoiceOver skips them.
private struct Dots: View {
    let days: [Bool]
    var body: some View {
        HStack(spacing: 8) {
            ForEach(Array(days.enumerated()), id: \.offset) { _, on in
                Circle().strokeBorder(on ? Color.accentColor : .secondary, lineWidth: 1)
                    .background(Circle().fill(on ? Color.accentColor : .clear))
                    .frame(width: 14, height: 14)
            }
        }
        .accessibilityHidden(true)
    }
}

/// Weekly intention: 1 to 6 days a week, so rest is part of every week, or no aim.
private struct IntentionPicker: View {
    @Environment(AppModel.self) private var model
    let intention: PrayerStats.Intention
    let onChange: (PrayerStats) -> Void

    private var w: Words { model.words }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(w("intention.title"))
            Picker(w("intention.title"), selection: Binding(get: { intention.days ?? 0 }, set: { n in Task { await choose(n == 0 ? nil : n) } })) {
                Text(w("intention.noneChip")).tag(0)
                ForEach(1...6, id: \.self) { n in Text(w("intention.days", count: n)).tag(n) }
            }
            .pickerStyle(.menu)
            if intention.days != nil {
                Dots(days: intention.week.map(\.prayed))
                if let line = intention.line(w) { Text(line).font(.footnote) }
            }
            Text(w("intention.rest")).font(.footnote).foregroundStyle(Color.subtle)
        }
    }

    private func choose(_ days: Int?) async {
        guard let stats = try? await model.store.api.setWeeklyIntention(days) else { return }
        onChange(stats)
        AccessibilityNotification.Announcement(days.map { w("intention.chosen", count: $0) } ?? w("intention.none")).post()
    }
}
