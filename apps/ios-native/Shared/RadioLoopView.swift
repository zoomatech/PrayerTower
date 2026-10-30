import PrayerTowerKit
import SwiftUI

// "Sent by radio at 9:30 PM, heard by 4 listeners" with a small map, the member's own radio
// choices, and Admin → Radio → Members and listeners (the Expo app's radio-summary.tsx,
// natively). Each is off until switched on. With no server or account (`api` nil) the admin
// view shows RadioLoopDemo, and changes stay on the sample.

private func when(_ iso: String) -> String {
    Keying.date(iso)?.formatted(date: .abbreviated, time: .shortened) ?? iso
}

/// The station (filled) and the listener nodes that heard it (rings), north up, drawn on the device.
struct HeardMap: View {
    let summary: RadioSummary
    let label: String
    private let size = CGSize(width: 280, height: 150)

    var body: some View {
        let dots = HeardMapLayout.dots(summary, width: size.width, height: size.height)
        if !dots.isEmpty {
            Canvas { ctx, _ in
                if let st = dots.first(where: \.station) {
                    for d in dots where !d.station {
                        var line = Path()
                        line.move(to: CGPoint(x: st.x, y: st.y))
                        line.addLine(to: CGPoint(x: d.x, y: d.y))
                        ctx.stroke(line, with: .color(.secondary.opacity(0.4)), lineWidth: 1)
                    }
                }
                for d in dots {
                    let r = d.station ? 6.0 : 5.0
                    let circle = Path(ellipseIn: CGRect(x: d.x - r, y: d.y - r, width: 2 * r, height: 2 * r))
                    if d.station {
                        ctx.fill(circle, with: .color(.accentColor))
                    } else {
                        ctx.stroke(circle, with: .color(.accentColor), lineWidth: 2)
                        ctx.draw(Text(d.name).font(.caption2), at: CGPoint(x: d.x + 8, y: d.y), anchor: .leading)
                    }
                }
            }
            .frame(width: size.width, height: size.height)
            .background(.background.secondary, in: RoundedRectangle(cornerRadius: 8))
            .accessibilityElement()
            .accessibilityLabel(label)
        }
    }
}

/// On a request, for the member who sent it and the person who asked, while the switch is on.
struct RadioSummarySection: View {
    let api: APIClient
    let postId: String
    let words: Words
    @State private var summary: RadioSummary?

    var body: some View {
        let w = words
        Group {
            if let s = summary, let l = s.latest {
                Section(w("radioFollowup.title")) {
                    Text(l.heardBy > 0 ? w("radioFollowup.heard", ["time": when(l.sentAt)], count: l.heardBy) : w("radioFollowup.notYet", ["time": when(l.sentAt)]))
                    if s.sends > 1 { Text(w("radioFollowup.sends", count: s.sends)).font(.footnote).foregroundStyle(.secondary) }
                    HeardMap(summary: s, label: w("radioFollowup.mapLabel", ["places": l.places.map(\.name).joined(separator: ", ")]))
                    Toggle(isOn: Binding(get: { s.optedIn }, set: { v in Task { await notify(v) } })) {
                        Text(w("radioFollowup.notify"))
                        Text(w("radioFollowup.notifyHint"))
                    }
                }
            }
        }
        .task { summary = try? await api.radioSummary(postId: postId) }
    }

    private func notify(_ on: Bool) async {
        guard (try? await api.updateRadioPrefs(followup: on)) != nil else { return }
        summary = try? await api.radioSummary(postId: postId)
    }
}

/// Me → Notification settings: one notice per radio send, and names off the radio, each while its switch is on.
struct RadioPrefsSection: View {
    let api: APIClient
    let words: Words
    @State private var prefs: RadioPrefs?

    var body: some View {
        let w = words
        Group {
            if let p = prefs, p.followup != nil || p.namesPrivate != nil {
                Section {
                    if let on = p.followup {
                        Toggle(isOn: Binding(get: { on }, set: { v in Task { prefs = try? await api.updateRadioPrefs(followup: v) } })) {
                            Text(w("radioFollowup.notify"))
                            Text(w("radioFollowup.notifyHint"))
                        }
                    }
                    if let on = p.namesPrivate {
                        Toggle(isOn: Binding(get: { on }, set: { v in Task { prefs = try? await api.updateRadioPrefs(namesPrivate: v) } })) {
                            Text(w("namePrivacy.mine"))
                            Text(w("namePrivacy.mineHint"))
                        }
                    }
                }
            }
        }
        .task { prefs = try? await api.radioPrefs() }
    }
}

/// Admin → Radio → Members and listeners: the follow-up, reading aloud, and name privacy.
struct RadioLoopAdminView: View {
    let api: APIClient?
    let words: Words
    @State private var demo = RadioLoopDemo()
    @State private var data: RadioLoopSettings?
    @State private var note: String?

    var body: some View {
        let w = words
        Form {
            if api == nil { Section { Label(w("macConsole.demo"), systemImage: "info.circle") } }
            if let note { Section { Text(note).foregroundStyle(.red) } }
            if let d = data {
                Section {
                    Toggle(isOn: Binding(get: { d.followup }, set: { v in Task { await save(followup: v) } })) {
                        Text(w("radioFollowup.adminOn"))
                        Text(w("radioFollowup.adminHint"))
                    }
                    Toggle(isOn: Binding(get: { d.readAloud }, set: { v in Task { await save(readAloud: v) } })) {
                        Text(w("readAloud.adminOn"))
                        Text(w("readAloud.adminHint"))
                    }
                    Toggle(isOn: Binding(get: { d.namePrivacy }, set: { v in Task { await save(namePrivacy: v) } })) {
                        Text(w("namePrivacy.adminOn"))
                        Text(w("namePrivacy.adminHint"))
                    }
                }
                if api == nil {
                    // What a member sees on a request, from the sample.
                    Section(w("radioFollowup.title")) {
                        if let l = demo.summary.latest {
                            Text(w("radioFollowup.heard", ["time": when(l.sentAt)], count: l.heardBy))
                            HeardMap(summary: demo.summary, label: w("radioFollowup.mapLabel", ["places": l.places.map(\.name).joined(separator: ", ")]))
                        }
                    }
                }
            } else {
                ProgressView()
            }
        }
        .navigationTitle(w("radioFollowup.title"))
        .task { await load() }
    }

    private func load() async {
        guard let api else { data = demo.settings; return }
        do { data = try await api.radioLoop() } catch { note = error.localizedDescription }
    }

    private func save(followup: Bool? = nil, readAloud: Bool? = nil, namePrivacy: Bool? = nil) async {
        guard let api else {
            if let followup { demo.settings.followup = followup }
            if let readAloud { demo.settings.readAloud = readAloud }
            if let namePrivacy { demo.settings.namePrivacy = namePrivacy }
            data = demo.settings
            return
        }
        do { data = try await api.updateRadioLoop(followup: followup, readAloud: readAloud, namePrivacy: namePrivacy); note = nil } catch { note = error.localizedDescription }
    }
}
