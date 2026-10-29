import PrayerTowerKit
import SwiftUI

// Admin → Radio for the iPhone app (Me → Admin) and the Mac console, as the Expo admin screen's
// radio part. Built into both targets (project.yml), so it takes the API and words directly
// rather than either app's model. With no API it shows RadioAdminDemo and changes stay on it.

private func shortDate(_ iso: String) -> String {
    Keying.date(iso)?.formatted(date: .abbreviated, time: .shortened) ?? iso
}

struct RadioAdminView: View {
    /// nil: sample data (no server or account).
    let api: APIClient?
    let words: Words
    @State private var demo = RadioAdminDemo()
    @State private var settings: AdminRadioSettings?
    @State private var tokens: AdminTokenSettings?
    @State private var switches: [RadioSwitch: Bool] = [:]
    @State private var alerts: StationAlerts?
    @State private var health: StationHealthAdmin?
    @State private var nodes: RadioNodes?
    @State private var bursts: [StationBurst]?
    @State private var fairAir: FairAir?
    @State private var nodeName = ""
    @State private var newKey: NewRadioNode?
    @State private var error: String?

    private var w: Words { words }

    var body: some View {
        Form {
            if api == nil { Section { Label(w("macConsole.demo"), systemImage: "info.circle") } }
            if let error { Section { Text(error).foregroundStyle(.red) } }
            if let s = settings {
                transmitter(s)
                fund(s)
                switchesSection(s)
                if let f = fairAir { fairAirSection(f) }
                if s.station {
                    if let a = alerts { alertsSection(a) }
                    if let h = health { healthSection(h) }
                    if let n = nodes { nodesSection(n, burst: s.burst) }
                }
                if s.burst, let b = bursts { burstsSection(b) }
            } else if error == nil {
                ProgressView()
            }
        }
        .formStyle(.grouped)
        .navigationTitle(w("admin.radio"))
        .task { await load() }
    }

    // MARK: Sections

    private func transmitter(_ s: AdminRadioSettings) -> some View {
        Section(w("admin.radio")) {
            Picker(w("admin.radio"), selection: Binding(get: { s.radio_transmitter }, set: { v in save(["transmitter": .string(v)]) { $0.radio_transmitter = v } })) {
                Text(w("admin.logOnly")).tag("log")
                Text(w("admin.station")).tag("station")
            }
            .pickerStyle(.segmented)
            Toggle(isOn: Binding(get: { s.radio_station_requires_free }, set: { v in save(["stationRequiresFree": .bool(v)]) { $0.radio_station_requires_free = v } })) {
                Text(w("admin.toggle.stationFree"))
                Text(w("admin.toggle.stationFreeHint"))
            }
            Picker(w("admin.radioOrder"), selection: Binding(get: { s.radio_order }, set: { v in save(["order": .string(v)]) { $0.radio_order = v } })) {
                Text(w("admin.radioOldest")).tag("oldest")
                Text(w("admin.radioNeed")).tag("need")
            }
            if s.radio_order == "need" { Text(w("admin.radioNeedHint")).foregroundStyle(.secondary) }
            Toggle(isOn: Binding(get: { s.radio_urgent_first }, set: { v in save(["urgentFirst": .bool(v)]) { $0.radio_urgent_first = v } })) {
                Text(w("admin.radioUrgentFirst"))
                Text(w("admin.radioUrgentFirstHint"))
            }
            // Burst mode: how many prayers the station may send in one key-up.
            Picker(w("admin.radioBurst"), selection: Binding(get: { s.radio_batch_max }, set: { v in save(["batchMax": .int(v)]) { $0.radio_batch_max = v } })) {
                ForEach(RadioAdmin.burstSizes, id: \.self) { n in Text(n == 1 ? w("admin.radioBurstOne") : String(n)).tag(n) }
            }
            if s.burst {
                Text(w("admin.radioBurstHint")).foregroundStyle(.secondary)
                Toggle(isOn: Binding(get: { s.listen_page_enabled }, set: { v in save(["listenPage": .bool(v)]) { $0.listen_page_enabled = v } })) {
                    Text(w("admin.listenPageOn"))
                    Text(w("admin.listenPageHint"))
                }
            }
            Toggle(isOn: Binding(get: { s.radio_receipts_enabled }, set: { v in save(["receipts": .bool(v)]) { $0.radio_receipts_enabled = v } })) {
                Text(w("admin.receiptsOn"))
                Text(w("admin.receiptsHint"))
            }
            Toggle(isOn: Binding(get: { s.on_air_page_enabled }, set: { v in save(["onAirPage": .bool(v)]) { $0.on_air_page_enabled = v } })) {
                Text(w("admin.onAirOn"))
                Text(w("admin.onAirHint"))
            }
            Text(w("admin.amplify", count: s.radio_amplify_repeats)).foregroundStyle(.secondary)
        }
    }

    /// The Priestly token fund: free radio prayers paid from donated Priestly tokens, or a cost per prayer.
    @ViewBuilder private func fund(_ s: AdminRadioSettings) -> some View {
        if let t = tokens {
            Section(w("radioAdmin.fund")) {
                Toggle(isOn: Binding(get: { t.radio_funding == "free" }, set: { free in saveFunding(free) })) {
                    Text(w("admin.radioFree"))
                    Text(w("admin.radioFreeHint"))
                }
                LabeledContent(w("admin.field.cost"), value: String(t.radio_prayer_cost))
                LabeledContent(w("admin.field.perToken"), value: String(t.priestly_prayers_per_token))
                if s.station && s.radio_station_requires_free && t.radio_funding != "free" {
                    Text(w("admin.toggle.stationFreeHint")).foregroundStyle(.orange)
                }
            }
        }
    }

    private func switchesSection(_ s: AdminRadioSettings) -> some View {
        Section {
            ForEach(RadioSwitch.allCases.filter { (s.station || !$0.stationOnly) && switches[$0] != nil }) { sw in
                Toggle(isOn: Binding(get: { switches[sw] ?? false }, set: { on in setSwitch(sw, on) })) {
                    Text(w(sw.label))
                    Text(w(sw.hint))
                }
            }
        }
    }

    private func fairAirSection(_ f: FairAir) -> some View {
        Section {
            Toggle(isOn: Binding(get: { f.everyRequest }, set: { v in saveFairAir(everyRequest: v, dailyCap: nil) })) {
                Text(w("admin.everyRequest"))
                Text(w("admin.everyRequestHint"))
            }
            Picker(w("admin.dailyCap"), selection: Binding(get: { f.dailyCap }, set: { v in saveFairAir(everyRequest: nil, dailyCap: .some(v)) })) {
                ForEach(RadioAdmin.dailyCaps, id: \.self) { c in Text(c.map(String.init) ?? w("admin.dailyCapNone")).tag(c) }
            }
        }
    }

    private func alertsSection(_ a: StationAlerts) -> some View {
        Section {
            Toggle(isOn: Binding(get: { a.enabled }, set: { v in saveAlerts(enabled: v) })) {
                Text(w("admin.stationAlertsOn"))
                Text(w("admin.stationAlertsHint"))
            }
            if a.enabled {
                Picker(w("admin.stationOverdue"), selection: Binding(get: { a.overdueMinutes }, set: { v in saveAlerts(overdue: v) })) {
                    ForEach(RadioAdmin.overdueMinutes, id: \.self) { n in Text(w("admin.stationMinutes", count: n)).tag(n) }
                }
                if a.alerts.isEmpty { Text(w("admin.stationAlertsNone")).foregroundStyle(.secondary) }
                ForEach(Array(a.alerts.enumerated()), id: \.offset) { _, al in
                    Text(w("admin.stationAlert.\(al.kind)") + (al.callSign.map { " (\($0))" } ?? "") + (al.detail.isEmpty || al.kind == "queue_empty" ? "" : " \(al.detail)"))
                        .foregroundStyle(al.level == "problem" ? .red : .primary)
                }
            }
        }
    }

    private func healthSection(_ h: StationHealthAdmin) -> some View {
        Section(w("macConsole.health")) {
            Toggle(isOn: Binding(get: { h.enabled }, set: { v in saveHealth(enabled: v) })) {
                Text(w("admin.healthOn"))
                Text(w("admin.healthHint"))
            }
            if let o = h.health {
                ForEach(o.stations) { s in
                    Text(s.silent
                        ? w("admin.healthSilent", ["callSign": s.callSign, "when": s.lastHeartbeat.map(shortDate) ?? w("admin.healthNever")])
                        : w("admin.healthStation", ["callSign": s.callSign, "when": s.lastHeartbeat.map(shortDate) ?? w("admin.healthNever"),
                                                    "bursts": String(s.bursts24h), "prayers": String(s.prayers24h), "failed": String(s.failed24h)]))
                        .foregroundStyle(s.silent ? .red : .primary)
                }
                Text(w("admin.healthSnrTitle")).font(.headline)
                if o.snr.isEmpty { Text(w("admin.healthSnrNone")).foregroundStyle(.secondary) }
                ForEach(o.snr, id: \.lastAt) { r in
                    Text(w("admin.healthSnr", ["callSign": r.callSign, "preset": r.preset, "avg": r.avgDb.formatted(), "min": r.minDb.formatted(), "reports": String(r.reports)]))
                }
                if !o.failures.isEmpty {
                    Text(w("admin.healthFailuresTitle")).font(.headline)
                    ForEach(Array(o.failures.enumerated()), id: \.offset) { _, f in
                        Text(w("admin.healthFailure.\(f.kind)", ["when": shortDate(f.at), "callSign": f.callSign ?? "", "error": f.error])).foregroundStyle(.red)
                    }
                }
            }
            Toggle(isOn: Binding(get: { h.acks.enabled }, set: { v in saveHealth(acksEnabled: v) })) {
                Text(w("admin.acksOn"))
                Text(w("admin.acksHint"))
            }
            if h.acks.enabled {
                Picker(w("admin.acksTimeout"), selection: Binding(get: { h.acks.timeoutMinutes }, set: { v in saveHealth(ackTimeout: v) })) {
                    ForEach(RadioAdmin.ackTimeouts, id: \.self) { n in Text(w("admin.stationMinutes", count: n)).tag(n) }
                }
                Picker(w("admin.acksRetries"), selection: Binding(get: { h.acks.maxRetries }, set: { v in saveHealth(ackRetries: v) })) {
                    ForEach(RadioAdmin.ackRetries, id: \.self) { n in Text(String(n)).tag(n) }
                }
                Text(w("admin.acksStats", ["heard": String(h.acks.heard), "waiting": String(h.acks.waiting), "unheard": String(h.acks.unheard), "retried": String(h.acks.retried)]))
                    .foregroundStyle(.secondary)
            }
        }
    }

    /// Listener nodes and extra stations, with each listener's latest report and its SNR.
    private func nodesSection(_ n: RadioNodes, burst: Bool) -> some View {
        Section {
            // The listener map: nodes, their signal and receivers (CoverageMap; off until switched on there).
            NavigationLink(w("coverage.title")) { ListenerMapView(api: api, words: w) }
            // Listener requests, thank-you cards and the weekly station report (ListenerAdminView; each off until switched on).
            NavigationLink(w("listeners.on")) { ListenerRequestsView(api: api, words: w) }
            NavigationLink(w("qsl.on")) { ThankYouCardsView(api: api, words: w) }
            NavigationLink(w("stationReport.title")) { StationReportView(api: api, words: w) }
            Toggle(isOn: Binding(get: { n.multiStation }, set: { v in saveNodes(multiStation: v) })) {
                Text(w("admin.multiStationOn"))
                Text(w("admin.multiStationHint"))
            }
            if n.multiStation {
                ForEach(n.stations, id: \.node) { s in
                    Text(w("admin.stationCount", ["name": s.node ?? w("admin.mainStation"), "sending": String(s.sending), "sent": String(s.sent)]))
                }
            }
            if burst {
                Toggle(isOn: Binding(get: { n.enabled }, set: { v in saveNodes(enabled: v) })) {
                    Text(w("admin.listenersOn"))
                    Text(w("admin.listenersHint"))
                }
                if n.enabled {
                    Toggle(isOn: Binding(get: { n.signaturesRequired }, set: { v in saveNodes(signatures: v) })) {
                        Text(w("admin.signedReports"))
                        Text(w("admin.signedReportsHint"))
                    }
                }
            }
            ForEach(n.shown) { node in
                HStack {
                    Text(w(node.role == "station" ? "admin.stationNodeLine" : "admin.listenerLine",
                           ["name": node.name, "seen": node.last_seen_at.map(shortDate) ?? w("admin.listenerNever")]))
                    Spacer()
                    Toggle(w(node.enabled ? "admin.listenerOn" : "admin.listenerOff"), isOn: Binding(get: { node.enabled }, set: { v in toggleNode(node, v) }))
                        .labelsHidden()
                    Button(w("admin.listenerRemove"), role: .destructive) { removeNode(node) }.buttonStyle(.borderless)
                }
            }
            if n.enabled {
                ForEach(n.reports, id: \.node) { r in
                    Text(w("admin.listenerHeard", ["name": r.node, "callSign": r.call_sign, "snr": r.snr_db.formatted(), "preset": r.preset, "when": shortDate(r.heard_at)]))
                        .foregroundStyle(.secondary)
                }
            }
            if n.enabled || n.multiStation {
                TextField(w("admin.listenerName"), text: $nodeName)
                HStack {
                    if n.enabled { Button(w("admin.listenerAdd")) { addNode("listener") }.disabled(nodeName.trimmingCharacters(in: .whitespaces).isEmpty) }
                    if n.multiStation { Button(w("admin.stationAdd")) { addNode("station") }.disabled(nodeName.trimmingCharacters(in: .whitespaces).isEmpty) }
                }
                if let k = newKey { Text(w("admin.listenerKey", ["name": k.node.name, "key": k.key])).textSelection(.enabled) }
            }
        }
    }

    private func burstsSection(_ b: [StationBurst]) -> some View {
        Section(w("admin.burstsTitle")) {
            if b.isEmpty { Text(w("admin.burstsNone")).foregroundStyle(.secondary) }
            ForEach(b.prefix(5)) { x in
                Text(w("admin.burstLine", ["when": shortDate(x.created_at), "prayers": String(x.prayers), "seconds": String(format: "%.2f", x.seconds),
                                           "bytes": String(x.bytes), "frames": String(x.frames), "preset": x.preset, "mode": x.mode])
                    + (x.decoded.map { " " + w("admin.burstDecoded", ["decoded": String($0), "prayers": String(x.prayers)]) } ?? "")
                    + (x.ok ? "" : " " + w("admin.burstFailed", ["error": x.error ?? ""])))
                    .foregroundStyle(x.troubled ? .red : .primary)
            }
        }
    }

    // MARK: Loading and saving

    private func load() async {
        guard let api else {
            settings = demo.settings; tokens = demo.tokens; switches = demo.switches; alerts = demo.alerts
            health = demo.health; nodes = demo.nodes; bursts = demo.bursts; fairAir = demo.fairAir
            return
        }
        do {
            settings = try await api.radioSettings()
            error = nil
        } catch {
            self.error = error.localizedDescription
            return
        }
        // Each part shows only once it loads; one that fails stays hidden.
        async let t = try? api.tokenSettings()
        async let a = try? api.radioAlerts()
        async let h = try? api.radioHealthAdmin()
        async let n = try? api.radioNodes()
        async let b = try? api.radioBursts()
        async let f = try? api.fairAir()
        var sw: [RadioSwitch: Bool] = [:]
        for s in RadioSwitch.allCases { if let on = try? await api.radioSwitch(s) { sw[s] = on } }
        tokens = await t; alerts = await a; health = await h; nodes = await n; bursts = await b; fairAir = await f
        switches = sw
    }

    private func run(_ live: @escaping @MainActor (APIClient) async throws -> Void, demo local: () -> Void) {
        guard let api else { local(); return }
        Task {
            do {
                try await live(api)
                error = nil
            } catch {
                self.error = error.localizedDescription
            }
        }
    }

    private func save(_ patch: [String: JSONValue], local: @escaping (inout AdminRadioSettings) -> Void) {
        run({ settings = try await $0.updateRadioSettings(patch) }) {
            local(&demo.settings)
            settings = demo.settings
        }
    }

    private func saveFunding(_ free: Bool) {
        run({ tokens = try await $0.updateTokenSettings(["radioFunding": .string(free ? "free" : "tokens")]) }) {
            demo.setFunding(free: free)
            tokens = demo.tokens
        }
    }

    private func setSwitch(_ s: RadioSwitch, _ on: Bool) {
        run({ switches[s] = try await $0.setRadioSwitch(s, on) }) {
            demo.switches[s] = on
            switches = demo.switches
        }
    }

    private func saveFairAir(everyRequest: Bool?, dailyCap: Int??) {
        run({ fairAir = try await $0.updateFairAir(everyRequest: everyRequest, dailyCap: dailyCap) }) {
            if let everyRequest { demo.fairAir.everyRequest = everyRequest }
            if let dailyCap { demo.fairAir.dailyCap = dailyCap }
            fairAir = demo.fairAir
        }
    }

    private func saveAlerts(enabled: Bool? = nil, overdue: Int? = nil) {
        run({ alerts = try await $0.updateRadioAlerts(enabled: enabled, overdueMinutes: overdue) }) {
            if let enabled { demo.alerts.enabled = enabled }
            if let overdue { demo.alerts.overdueMinutes = overdue }
            alerts = demo.alerts
        }
    }

    private func saveHealth(enabled: Bool? = nil, acksEnabled: Bool? = nil, ackTimeout: Int? = nil, ackRetries: Int? = nil) {
        run({ health = try await $0.updateRadioHealth(enabled: enabled, acksEnabled: acksEnabled, ackTimeout: ackTimeout, ackRetries: ackRetries) }) {
            if let enabled { demo.health.enabled = enabled }
            if let acksEnabled { demo.health.acks.enabled = acksEnabled }
            if let ackTimeout { demo.health.acks.timeoutMinutes = ackTimeout }
            if let ackRetries { demo.health.acks.maxRetries = ackRetries }
            health = demo.health
        }
    }

    private func saveNodes(enabled: Bool? = nil, multiStation: Bool? = nil, signatures: Bool? = nil) {
        run({ api in
            _ = try await api.updateRadioNodes(enabled: enabled, multiStation: multiStation, signaturesRequired: signatures)
            nodes = try await api.radioNodes()
        }) {
            if let enabled { demo.nodes.enabled = enabled }
            if let multiStation { demo.nodes.multiStation = multiStation }
            if let signatures { demo.nodes.signaturesRequired = signatures }
            nodes = demo.nodes
        }
    }

    private func toggleNode(_ node: RadioNode, _ on: Bool) {
        run({ api in
            _ = try await api.setRadioNode(node.id, enabled: on)
            nodes = try await api.radioNodes()
        }) {
            if let i = demo.nodes.nodes.firstIndex(where: { $0.id == node.id }) { demo.nodes.nodes[i].enabled = on }
            nodes = demo.nodes
        }
    }

    private func removeNode(_ node: RadioNode) {
        run({ api in
            _ = try await api.removeRadioNode(node.id)
            nodes = try await api.radioNodes()
        }) {
            demo.nodes.nodes.removeAll { $0.id == node.id }
            nodes = demo.nodes
        }
    }

    private func addNode(_ role: String) {
        let name = nodeName
        run({ api in
            newKey = try await api.addRadioNode(name: name, role: role)
            nodeName = ""
            nodes = try await api.radioNodes()
        }) {
            demo.addNode(name: name, role: role)
            nodeName = ""
            nodes = demo.nodes
        }
    }
}
