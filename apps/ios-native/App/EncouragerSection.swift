import PrayerTowerKit
import SwiftUI

/// Me → Encourager (encourager-card.tsx, `encourager`): ask for a welcoming volunteer, or volunteer,
/// and end a match with one tap and no reason. With `encouragerCheckin`, a one-time
/// "How is it going?" for each side.
struct EncouragerSection: View {
    @Environment(AppModel.self) private var model
    @State private var s: EncouragerState?
    @State private var agree = false
    @State private var note: String?
    @State private var error: String?
    @State private var busy = false

    private var w: Words { model.words }

    var body: some View {
        Group {
            if model.features["encourager"], let s, s.enabled {
                Section {
                    ForEach(s.matches) { m in match(m) }
                    if s.canAsk {
                        Text(w("practices.encNewcomerIntro")).font(.footnote)
                        Button(w("practices.encAsk")) { Task { await run { try await model.store.api.askForEncourager() } } }.disabled(busy)
                    }
                    if s.volunteer {
                        Text(w("practices.encVolunteering")).font(.footnote)
                        Button(w("practices.encStop")) { Task { await run { try await model.store.api.setVolunteer(false) } } }
                    } else {
                        Text(w("practices.encVolunteerIntro")).font(.footnote)
                        Toggle(w("practices.encVolunteerAgree"), isOn: $agree)
                        Button(w("practices.encVolunteer")) { Task { await run { try await model.store.api.setVolunteer(true) } } }.disabled(!agree || busy)
                    }
                    if let note { Text(note).font(.footnote) }
                    if let error { Text(error).foregroundStyle(.red) }
                } header: {
                    Text(w("practices.encTitle"))
                }
            }
        }
        .task(id: model.features["encourager"]) {
            // A card that can't load stays hidden, as in the Expo app.
            if model.features["encourager"] { s = try? await model.store.api.encourager() }
        }
    }

    @ViewBuilder private func match(_ m: EncouragerMatch) -> some View {
        let l = m.lines(w, endDate: monthDay(m.endsAt))
        VStack(alignment: .leading, spacing: 4) {
            Text(l.title)
            Text(l.hint).font(.footnote).foregroundStyle(Color.subtle)
        }
        .accessibilityElement(children: .combine)
        if m.checkInDue == true {
            VStack(alignment: .leading, spacing: 6) {
                Text(w("encCheck.title"))
                Text(w("encCheck.hint")).font(.footnote)
                HStack {
                    ForEach(CheckInAnswer.allCases, id: \.self) { a in
                        Button(w("encCheck.\(a.rawValue)")) {
                            Task {
                                await run {
                                    let next = try await model.store.api.encouragerCheckIn(m.id, a)
                                    AccessibilityNotification.Announcement(w(a == .change ? "encCheck.changed" : "encCheck.thanks")).post()
                                    return next
                                }
                            }
                        }
                        .buttonStyle(.bordered)
                    }
                }
            }
            .accessibilityElement(children: .contain)
            .accessibilityLabel(w("encCheck.title"))
        }
        Button(w("practices.encEnd")) { Task { await run { try await model.store.api.endEncouragerMatch(m.id) } } }
    }

    private func run(_ call: () async throws -> EncouragerState) async {
        busy = true
        defer { busy = false }
        note = nil
        do {
            let next = try await call()
            s = next
            if next.enabled, next.matched == false { note = w("practices.encNone") }
            error = nil
        } catch { self.error = error.localizedDescription }
    }
}
