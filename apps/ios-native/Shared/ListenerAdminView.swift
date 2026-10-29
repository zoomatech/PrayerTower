import PrayerTowerKit
import SwiftUI

// Admin → Radio on the iPhone and the Mac: listener requests, thank-you cards and the weekly
// station report (the Expo app's listener-admin.tsx, natively). The station report is also in the
// Mac console for radio operators, read only. Each is off until switched on. With no server or
// account (`api` nil) each shows ListenerDemo, and changes stay on the sample.

/// People asking to run a listener node: approve (a one-use setup link), or decline.
struct ListenerRequestsView: View {
    let api: APIClient?
    let words: Words
    @State private var demo = ListenerDemo()
    @State private var data: ListenerSignups?
    @State private var link: String?
    @State private var note: String?

    var body: some View {
        let w = words
        Form {
            if api == nil { Section { Label(w("macConsole.demo"), systemImage: "info.circle") } }
            if let note { Section { Text(note) } }
            if let link {
                Section {
                    Text(link).font(.footnote.monospaced()).textSelection(.enabled)
                    ShareLink(item: w("listeners.shareMessage", ["url": link])) { Label(w("listeners.approve"), systemImage: "square.and.arrow.up") }
                }
            }
            if let d = data {
                Section {
                    Toggle(isOn: Binding(get: { d.enabled }, set: { v in Task { await setEnabled(v) } })) {
                        Text(w(d.enabled ? "listeners.on" : "listeners.off"))
                        Text(w("listeners.hint", ["url": "/listeners"]))
                    }
                }
                if d.enabled {
                    let pending = d.signups.filter { $0.status == "pending" }
                    Section(pending.isEmpty ? w("listeners.none") : w("listeners.waiting", count: pending.count)) {
                        ForEach(pending) { s in
                            VStack(alignment: .leading, spacing: 4) {
                                Text([s.name, s.place].filter { !$0.isEmpty }.joined(separator: ", ")).font(.headline)
                                Text(detail(s)).font(.footnote).foregroundStyle(.secondary)
                                if !s.note.isEmpty { Text(s.note).font(.footnote) }
                                HStack {
                                    Button(w("listeners.approve")) { Task { await approve(s) } }
                                    Button(w("listeners.decline"), role: .destructive) { Task { await decline(s) } }
                                }
                                .buttonStyle(.bordered)
                            }
                        }
                    }
                    let rest = d.signups.filter { $0.status != "pending" }
                    if !rest.isEmpty {
                        Section {
                            ForEach(rest) { s in Text("\(s.name): \(w("listeners.status.\(s.status)"))") }
                        }
                    }
                }
            } else {
                ProgressView()
            }
        }
        .navigationTitle(w("listeners.on"))
        .task { await load() }
    }

    private func detail(_ s: ListenerSignup) -> String {
        let w = words
        var line = w("listeners.detail", ["email": s.email, "receiver": w("listeners.receiver.\(s.receiver)"), "platform": w("listeners.platform.\(s.platform)")])
        if let call = s.callSign { line += " · \(call)" }
        if s.edition == "open-circle" { line += " · \(w("listeners.openCircle"))" }
        return line
    }

    private func load() async {
        guard let api else { data = demo.signups; return }
        do { data = try await api.listenerSignups() } catch { note = error.localizedDescription }
    }

    private func setEnabled(_ on: Bool) async {
        guard let api else { demo.signups.enabled = on; data = demo.signups; return }
        do { data = try await api.setListenerSignups(enabled: on) } catch { note = error.localizedDescription }
    }

    private func approve(_ s: ListenerSignup) async {
        guard let api else {
            demo.approve(s.id); data = demo.signups
            link = "https://api.example.org/listeners/setup/sample-link"
            note = words("listeners.sendLink", ["email": s.email])
            return
        }
        do {
            let r = try await api.approveListener(s.id)
            link = r.emailed ? nil : r.setupUrl
            note = words(r.emailed ? "listeners.emailed" : "listeners.sendLink", ["email": s.email])
            data = try await api.listenerSignups()
        } catch { note = error.localizedDescription }
    }

    private func decline(_ s: ListenerSignup) async {
        guard let api else { demo.decline(s.id); data = demo.signups; return }
        do {
            try await api.declineListener(s.id)
            data = try await api.listenerSignups()
        } catch { note = error.localizedDescription }
    }
}

/// Thank-you cards for confirmed reception: the switch and the newest cards.
struct ThankYouCardsView: View {
    let api: APIClient?
    let words: Words
    @State private var demo = ListenerDemo()
    @State private var data: QslCards?
    @State private var note: String?

    var body: some View {
        let w = words
        Form {
            if api == nil { Section { Label(w("macConsole.demo"), systemImage: "info.circle") } }
            if let note { Section { Text(note).foregroundStyle(.red) } }
            if let d = data {
                Section {
                    Toggle(isOn: Binding(get: { d.enabled }, set: { v in Task { await setEnabled(v) } })) {
                        Text(w(d.enabled ? "qsl.on" : "qsl.off"))
                        Text(w("qsl.hint"))
                    }
                }
                if d.enabled {
                    Section {
                        ForEach(d.cards) { c in
                            Text(w("qsl.row", ["serial": String(c.serial), "node": c.node, "call": c.callSign, "day": c.day, "count": String(c.prayers), "snr": String(format: "%.1f", c.bestSnrDb)]))
                                .font(.footnote)
                                .accessibilityLabel(w("qsl.rowLabel", ["node": c.node, "call": c.callSign, "day": c.day, "count": String(c.prayers)]))
                        }
                    }
                }
            } else {
                ProgressView()
            }
        }
        .navigationTitle(w("qsl.on"))
        .task { await load() }
    }

    private func load() async {
        guard let api else { data = demo.cards; return }
        do { data = try await api.qslCards() } catch { note = error.localizedDescription }
    }

    private func setEnabled(_ on: Bool) async {
        guard let api else { demo.cards.enabled = on; data = demo.cards; return }
        do { data = try await api.setQslCards(enabled: on) } catch { note = error.localizedDescription }
    }
}

/// Last week next to this week so far. `operatorView`: read only (the Mac console).
struct StationReportView: View {
    let api: APIClient?
    let words: Words
    var operatorView = false
    @State private var demo = ListenerDemo()
    @State private var data: StationReportOverview?
    @State private var note: String?

    var body: some View {
        let w = words
        Form {
            if api == nil { Section { Label(w("macConsole.demo"), systemImage: "info.circle") } }
            if let note { Section { Text(note).foregroundStyle(.red) } }
            if let d = data {
                if !operatorView {
                    Section {
                        Toggle(isOn: Binding(get: { d.enabled }, set: { v in Task { await update(enabled: v) } })) {
                            Text(w(d.enabled ? "stationReport.on" : "stationReport.off"))
                            Text(w("stationReport.hint"))
                        }
                        if d.enabled {
                            Toggle(w("stationReport.emailOn"), isOn: Binding(get: { d.email }, set: { v in Task { await update(email: v) } }))
                        }
                    }
                }
                if operatorView && !d.enabled { Text(w("stationReport.off")) }
                if d.enabled {
                    if let r = d.lastWeek { week(r, title: w("stationReport.lastWeek", ["week": r.weekStart])) }
                    if let r = d.thisWeek { week(r, title: w("stationReport.thisWeek")) }
                }
            } else {
                ProgressView()
            }
        }
        .navigationTitle(w("stationReport.title"))
        .task { await load() }
    }

    @ViewBuilder
    private func week(_ r: StationReport, title: String) -> some View {
        let w = words
        Section(title) {
            LabeledContent(w("stationReport.bursts"), value: String(r.bursts.sent))
            LabeledContent(w("stationReport.airTime"), value: r.airTime)
            LabeledContent(w("stationReport.delivered"), value: String(r.prayers.delivered))
            LabeledContent(w("stationReport.heard"), value: String(r.prayers.heard))
            LabeledContent(w("stationReport.waiting"), value: String(r.prayers.waiting))
            LabeledContent(w("stationReport.listeners"), value: w("stationReport.reportingOf", ["reporting": String(r.listeners.reporting), "nodes": String(r.listeners.nodes)]))
            LabeledContent(w("stationReport.newListeners"), value: String(r.listeners.joined))
            LabeledContent(w("stationReport.cards"), value: String(r.listeners.cards))
            LabeledContent(w("stationReport.problems"), value: String(r.problems.total))
            if !r.listeners.quiet.isEmpty { Text(w("stationReport.quiet", ["names": r.listeners.quiet.joined(separator: ", ")])).font(.footnote) }
            ForEach(r.problems.burstErrors, id: \.error) { e in
                Text(w("stationReport.burstError", ["count": String(e.count), "error": e.error])).font(.footnote)
            }
        }
    }

    private func load() async {
        guard let api else { data = demo.report; return }
        do { data = try await api.stationReport() } catch { note = error.localizedDescription }
    }

    private func update(enabled: Bool? = nil, email: Bool? = nil) async {
        guard let api else {
            if let enabled { demo.report.enabled = enabled }
            if let email { demo.report.email = email }
            data = demo.report
            return
        }
        do { data = try await api.updateStationReport(enabled: enabled, email: email) } catch { note = error.localizedDescription }
    }
}
