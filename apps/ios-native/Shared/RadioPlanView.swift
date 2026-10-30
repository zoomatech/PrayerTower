import PrayerTowerKit
import SwiftUI

// Admin → Radio on the iPhone and the Mac: the band plan and urgent prayers (the Expo app's
// radio-plan-admin.tsx, natively), the console's band and urgent rows, and the urgent button on a
// request. Each is off until switched on. With no server or account (`api` nil) each shows
// RadioPlanDemo, and changes stay on the sample.

private func clock(_ iso: String) -> String {
    Keying.date(iso)?.formatted(date: .omitted, time: .shortened) ?? iso
}

/// The band now, the space weather it came from, and the hours where it changes.
struct BandOutlookRows: View {
    let outlook: BandOutlook
    let words: Words

    var body: some View {
        let w = words
        if let now = outlook.now {
            Text(w("bandPlan.now", ["band": now.band.label, "mhz": now.band.mhz]) + (now.mufMhz.map { " · " + w("bandPlan.muf", ["muf": $0.formatted()]) } ?? ""))
                .bold()
        }
        if let sw = outlook.spaceWeather {
            Text(w("bandPlan.weather", ["sfi": sw.sfi.formatted(), "kp": sw.kp.formatted(), "at": clock(sw.fetchedAt)])).foregroundStyle(.secondary)
        } else {
            Text(w("bandPlan.noWeather")).foregroundStyle(.secondary)
        }
        ForEach(outlook.changes) { h in
            Text(w("bandPlan.from", ["time": clock(h.at), "band": h.band ?? ""]) + (h.onAir ? "" : " · " + w("bandPlan.offAir")))
                .font(.footnote)
        }
    }
}

/// Each urgent send: waiting, sent, confirmed by a listener. Waiting ones can be unflagged.
struct UrgentRows: View {
    let urgent: UrgentRadio
    let words: Words
    var unflag: ((String) -> Void)? = nil

    var body: some View {
        let w = words
        if let next = urgent.nextWindowAt {
            Text(w("urgentRadio.nextWindow", ["time": clock(next), "preset": urgent.presetNow ?? ""])).foregroundStyle(.secondary)
        }
        if urgent.prayers.isEmpty { Text(w("urgentRadio.none")).foregroundStyle(.secondary) }
        ForEach(urgent.prayers.prefix(10)) { p in
            VStack(alignment: .leading, spacing: 2) {
                Text(p.text).lineLimit(2)
                Text(status(p)).font(.footnote).foregroundStyle(.secondary)
                if p.status == "queued", let unflag {
                    Button(w("urgentRadio.unflag")) { unflag(p.id) }.buttonStyle(.borderless)
                }
            }
        }
    }

    private func status(_ p: UrgentPrayer) -> String {
        let w = words
        let base = p.confirmedAt.map { w("urgentRadio.confirmed", ["time": clock($0)]) }
            ?? (p.status == "transmitted" ? w("urgentRadio.sentWaiting", ["time": p.transmittedAt.map(clock) ?? ""]) : w("urgentRadio.waiting"))
        return p.retries > 0 ? base + " · " + w("urgentRadio.retries", count: p.retries) : base
    }
}

/// The bands the station may use; on HF the server picks one from NOAA space weather.
struct BandPlanView: View {
    let api: APIClient?
    let words: Words
    @State private var demo = RadioPlanDemo()
    @State private var data: BandPlan?
    @State private var text = ""
    @State private var note: String?

    var body: some View {
        let w = words
        Form {
            if api == nil { Section { Label(w("macConsole.demo"), systemImage: "info.circle") } }
            if let note { Section { Text(note).foregroundStyle(.red) } }
            if let d = data {
                Section {
                    Toggle(isOn: Binding(get: { d.enabled }, set: { v in Task { await save(enabled: v) } })) {
                        Text(w(d.enabled ? "bandPlan.on" : "bandPlan.off"))
                        Text(w("bandPlan.hint"))
                    }
                }
                if d.enabled {
                    Section(w("bandPlan.bands")) {
                        TextEditor(text: $text)
                            .font(.body.monospaced())
                            .frame(minHeight: 100)
                            .autocorrectionDisabled()
                            .accessibilityLabel(w("bandPlan.bands"))
                        Button(w("bandPlan.save")) { saveBands() }
                    }
                    if let o = d.outlook { Section { BandOutlookRows(outlook: o, words: w) } }
                }
            } else {
                ProgressView()
            }
        }
        .navigationTitle(w("bandPlan.title"))
        .task { await load() }
    }

    private func show(_ d: BandPlan) {
        data = d
        text = d.bands.map(\.line).joined(separator: "\n")
    }

    private func load() async {
        guard let api else { show(demo.plan); return }
        do { show(try await api.bandPlan()) } catch { note = error.localizedDescription }
    }

    private func saveBands() {
        guard let bands = RadioBand.parse(text) else { note = words("bandPlan.badLine"); return }
        Task { await save(bands: bands) }
    }

    private func save(enabled: Bool? = nil, bands: [RadioBand]? = nil) async {
        guard let api else {
            if let enabled { demo.plan.enabled = enabled }
            if let bands { demo.setBands(bands) }
            show(demo.plan); note = nil
            return
        }
        do { show(try await api.updateBandPlan(enabled: enabled, bands: bands)); note = nil } catch { note = error.localizedDescription }
    }
}

/// Urgent prayers: the switch, repeats and preset, and the last two days' urgent sends.
struct UrgentRadioView: View {
    let api: APIClient?
    let words: Words
    @State private var demo = RadioPlanDemo()
    @State private var data: UrgentRadio?
    @State private var note: String?

    var body: some View {
        let w = words
        Form {
            if api == nil { Section { Label(w("macConsole.demo"), systemImage: "info.circle") } }
            if let note { Section { Text(note).foregroundStyle(.red) } }
            if let d = data {
                Section {
                    Toggle(isOn: Binding(get: { d.enabled }, set: { v in Task { await save(enabled: v) } })) {
                        Text(w(d.enabled ? "urgentRadio.on" : "urgentRadio.off"))
                        Text(w("urgentRadio.hint"))
                    }
                    if d.enabled {
                        Picker(w("urgentRadio.title"), selection: Binding(get: { d.repeats }, set: { v in Task { await save(repeats: v) } })) {
                            ForEach(UrgentRadio.repeatChoices, id: \.self) { n in Text(w("urgentRadio.repeats", count: n)).tag(n) }
                        }
                        Picker(w("urgentRadio.autoPreset"), selection: Binding(get: { d.preset }, set: { v in Task { await save(preset: v) } })) {
                            ForEach(UrgentRadio.presetChoices, id: \.self) { p in Text(p == "auto" ? w("urgentRadio.autoPreset") : p).tag(p) }
                        }
                    }
                }
                if d.enabled {
                    Section { UrgentRows(urgent: d, words: w) { id in Task { await unflag(id) } } }
                }
            } else {
                ProgressView()
            }
        }
        .navigationTitle(w("urgentRadio.title"))
        .task { await load() }
    }

    private func load() async {
        guard let api else { data = demo.urgent; return }
        do { data = try await api.urgentRadio() } catch { note = error.localizedDescription }
    }

    private func save(enabled: Bool? = nil, repeats: Int? = nil, preset: String? = nil) async {
        guard let api else {
            if let enabled { demo.urgent.enabled = enabled }
            if let repeats { demo.urgent.repeats = repeats }
            if let preset { demo.urgent.preset = preset }
            data = demo.urgent
            return
        }
        do { data = try await api.updateUrgentRadio(enabled: enabled, repeats: repeats, preset: preset) } catch { note = error.localizedDescription }
    }

    private func unflag(_ id: String) async {
        guard let api else { demo.unflag(id); data = demo.urgent; return }
        do { data = try await api.unflagUrgent(id) } catch { note = error.localizedDescription }
    }
}

/// On a request, for admins and radio operators, while urgent prayers are on: send it in the next window.
struct UrgentRadioButton: View {
    let api: APIClient
    let postId: String
    let words: Words
    @State private var on = false
    @State private var note: String?

    var body: some View {
        Group {
            if on {
                Section {
                    Button(words("urgentRadio.send")) { Task { await flag() } }
                    if let note { Text(note).font(.footnote) }
                }
            }
        }
        .task { on = (try? await api.urgentRadio().enabled) ?? false }
    }

    private func flag() async {
        do {
            let r = try await api.flagUrgent(postId: postId)
            note = r.nextWindowAt.map { words("urgentRadio.flagged", ["time": clock($0)]) } ?? words("urgentRadio.flaggedNoWindow")
        } catch let e as APIError where e.status == 400 {
            note = words("urgentRadio.cantSend")
        } catch {
            note = error.localizedDescription
        }
    }
}
