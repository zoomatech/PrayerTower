import PrayerTowerKit
import SwiftUI

private func clock(_ iso: String) -> String {
    Keying.date(iso)?.formatted(date: .omitted, time: .shortened) ?? iso
}

private func when(_ iso: String?, _ w: Words) -> String {
    iso.flatMap(Keying.date)?.formatted(date: .abbreviated, time: .shortened) ?? w("admin.healthNever")
}

/// The console, as the Expo operator console (apps/mobile/src/app/operator-console.tsx), laid out
/// for a Mac window: problems and keying first, then the dish, ID timer, queue, relays, beacon,
/// station health (admins) and the log. Each part shows only while its switch is on.
struct ConsoleView: View {
    @Environment(ConsoleModel.self) private var model

    var body: some View {
        let w = model.words
        Form {
            if model.demo != nil {
                Section { Label(w("macConsole.demo"), systemImage: "info.circle") }
            }
            if model.notOperator {
                Section { Text(w("macConsole.notOperator")) }
            } else if model.off {
                Section { Text(w("operatorConsole.off")) }
            } else if let c = model.console {
                if !c.problems.isEmpty { ProblemsSection(problems: c.problems) }
                StatusSection(console: c)
                KeyingSection(console: c)
                if let sky = c.sky { SkySection(sky: sky) }
                if let ceaseless = c.ceaseless {
                    Section(w("operatorConsole.ceaseless")) {
                        Text(w("operatorConsole.ceaselessCounts", ["minutes": String(ceaseless.gapMinutes)], count: ceaseless.inRotation))
                        Text(w("operatorConsole.ceaselessSent", count: ceaseless.sentLastDay)).foregroundStyle(.secondary)
                    }
                }
                IDTimerSection(stations: c.stations)
                QueueSection(queue: c.queue)
                if !c.relays.isEmpty { RelaysSection(relays: c.relays) }
                if c.beacon.enabled { BeaconSection(beacon: c.beacon) }
                HealthSection(health: model.health)
                LogSection(log: c.log)
            } else if model.error == nil {
                ProgressView()
            }
            if let error = model.error {
                Section {
                    Text(error).foregroundStyle(.red)
                    Button(w("common.tryAgain")) { Task { await model.load() } }
                }
            }
        }
        .formStyle(.grouped)
        .navigationTitle(w("operatorConsole.title"))
        .navigationSubtitle(model.updatedAt.map { w("macConsole.updated", ["time": $0.formatted(date: .omitted, time: .standard)]) } ?? "")
        .toolbar {
            ToolbarItem {
                Button { Task { await model.load() } } label: { Label(w("macConsole.refresh"), systemImage: "arrow.clockwise") }
            }
        }
    }
}

private struct ProblemsSection: View {
    @Environment(ConsoleModel.self) private var model
    let problems: [StationAlert]

    var body: some View {
        let w = model.words
        Section {
            ForEach(problems) { p in
                Label {
                    Text(w("admin.stationAlert.\(p.kind)") + (p.callSign.map { " (\($0))" } ?? "") + " " + p.detail)
                } icon: {
                    Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.orange)
                }
            }
        } header: {
            Text(w("operatorConsole.problems"))
        } footer: {
            Text(w("operatorConsole.problemsHint"))
        }
    }
}

private struct StatusSection: View {
    @Environment(ConsoleModel.self) private var model
    let console: RadioConsole

    var body: some View {
        let w = model.words
        let c = console
        let status = c.paused ? w("operatorConsole.statusHeld")
            : c.windowOverrideUntil.map { w("operatorConsole.statusOverride", ["time": clock($0)]) }
            ?? w(c.onAirNow ? "operatorConsole.statusOnAir" : "operatorConsole.statusOutside")
        let zone = ["zone": c.schedule.timeZone]
        Section {
            Label {
                VStack(alignment: .leading, spacing: 4) {
                    Text(w(c.onAirNow ? "operatorConsole.mayTransmit" : "operatorConsole.mayNotTransmit")).font(.headline)
                    Text(status)
                    Text(!c.schedule.enabled ? w("operatorConsole.noWindows") : w(c.schedule.inWindow ? "operatorConsole.inWindow" : "operatorConsole.outsideWindow", zone))
                        .foregroundStyle(.secondary)
                }
            } icon: {
                Image(systemName: c.onAirNow ? "antenna.radiowaves.left.and.right" : "pause.circle")
                    .foregroundStyle(c.onAirNow ? .green : .orange)
                    .font(.title2)
            }
            .accessibilityElement(children: .combine)
        }
    }
}

/// Hold, Resume, Send for N minutes and End override, under the rules in Keying: Hold is one
/// click; anything that lets the radio key asks first and is withheld while PTT has a problem.
private struct KeyingSection: View {
    @Environment(ConsoleModel.self) private var model
    let console: RadioConsole
    @State private var confirmResume = false
    @State private var confirmMinutes: Int?

    var body: some View {
        let w = model.words
        let k = Keying(console)
        Section {
            HStack {
                if console.paused {
                    Button(w("operatorConsole.resume")) { confirmResume = true }
                        .disabled(!k.canResume || model.busy)
                } else {
                    Button(role: .destructive) { Task { await model.hold() } } label: {
                        Label(w("operatorConsole.hold"), systemImage: "hand.raised.fill")
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.red)
                    .disabled(!k.canHold || model.busy)
                }
            }
            Text(w("operatorConsole.holdHint")).foregroundStyle(.secondary)
            Text(w("macConsole.holdShortcut")).foregroundStyle(.secondary)
            if console.schedule.enabled {
                HStack {
                    ForEach(Keying.sendForMinutes, id: \.self) { m in
                        Button(w("operatorConsole.sendFor", ["minutes": String(m)])) { confirmMinutes = m }
                            .disabled(!k.canSendFor || model.busy)
                    }
                    if k.canEndOverride {
                        Button(w("operatorConsole.endOverride")) { Task { await model.endOverride() } }.disabled(model.busy)
                    }
                }
                Text(w("operatorConsole.overrideHint")).foregroundStyle(.secondary)
            }
            ForEach(k.notes, id: \.self) { n in
                Label(w(n.key, n.vars), systemImage: "exclamationmark.circle").foregroundStyle(.orange)
            }
        } header: {
            Text(w("macConsole.keying"))
        }
        .confirmationDialog(w("macConsole.confirmResumeTitle"), isPresented: $confirmResume) {
            Button(w("macConsole.goAhead")) { Task { await model.resume() } }
            Button(w("common.cancel"), role: .cancel) {}
        } message: {
            Text(w("macConsole.confirmResume"))
        }
        .confirmationDialog(
            w("macConsole.confirmSendForTitle", ["minutes": String(confirmMinutes ?? 0)]),
            isPresented: Binding(get: { confirmMinutes != nil }, set: { if !$0 { confirmMinutes = nil } })
        ) {
            Button(w("macConsole.goAhead")) {
                if let m = confirmMinutes { Task { await model.sendFor(m) } }
            }
            Button(w("common.cancel"), role: .cancel) {}
        } message: {
            Text(w("macConsole.confirmSendFor"))
        }
    }
}

private struct SkySection: View {
    @Environment(ConsoleModel.self) private var model
    let sky: SkyNow

    var body: some View {
        let w = model.words
        let min = ["min": sky.minElevation.formatted()]
        let target = sky.name ?? w("operatorConsole.skyTarget.\(sky.target)")
        Section(w("operatorConsole.sky")) {
            Text(w("operatorConsole.skyPoint", ["target": target, "az": String(format: "%.1f", sky.az), "el": String(format: "%.1f", sky.el)]))
            Group {
                if sky.target == "zenith" {
                    Text(w("operatorConsole.skyZenith"))
                } else if let next = sky.next {
                    Text(w(next.rising ? "operatorConsole.skyRises" : "operatorConsole.skySets", min.merging(["time": clock(next.at)]) { a, _ in a }))
                } else {
                    Text(w(sky.aboveMinimum ? "operatorConsole.skyAlwaysUp" : "operatorConsole.skyNeverUp", min))
                }
                if !sky.aboveMinimum && sky.holdBelow { Text(w("operatorConsole.skyHeld")).foregroundStyle(.orange) }
            }
            .foregroundStyle(.secondary)
        }
    }
}

private struct IDTimerSection: View {
    @Environment(ConsoleModel.self) private var model
    let stations: [RadioConsole.Station]

    var body: some View {
        let w = model.words
        Section(w("operatorConsole.idTimer")) {
            if stations.isEmpty { Text(w("operatorConsole.noStations")).foregroundStyle(.secondary) }
            ForEach(stations) { s in
                VStack(alignment: .leading, spacing: 2) {
                    Text(s.callSign).bold()
                    TimelineView(.periodic(from: .now, by: 30)) { context in
                        let due = s.nextIdAt.flatMap { Keying.minutes(until: $0, now: context.date) }
                        Text((s.lastIdAt.map { w("operatorConsole.lastId", ["time": clock($0)]) } ?? w("operatorConsole.neverId"))
                            + (due.map { " · " + ($0 > 0 ? w("operatorConsole.nextIdIn", ["minutes": String($0)]) : w("operatorConsole.idDue")) } ?? ""))
                    }
                    Text(w("operatorConsole.heartbeat", ["time": clock(s.lastHeartbeat)])).foregroundStyle(.secondary)
                }
            }
        }
    }
}

private struct QueueSection: View {
    @Environment(ConsoleModel.self) private var model
    let queue: RadioConsole.Queue

    var body: some View {
        let w = model.words
        Section(w("operatorConsole.queue")) {
            Text(w("operatorConsole.queueCounts", ["queued": String(queue.queued), "sending": String(queue.sending)])
                + (queue.oldestMinutes.map { " · " + w("operatorConsole.oldest", ["minutes": String($0)]) } ?? ""))
            if queue.next.isEmpty { Text(w("operatorConsole.queueEmpty")).foregroundStyle(.secondary) }
            ForEach(queue.next) { r in
                VStack(alignment: .leading, spacing: 2) {
                    Text(r.text).lineLimit(3)
                    Text([w("operatorConsole.waiting", ["minutes": String(r.waitingMinutes)]),
                          r.urgency > 0 ? w("operatorConsole.urgency", ["level": String(r.urgency)]) : nil,
                          r.repeats > 1 ? w("operatorConsole.repeats", count: r.repeats) : nil].compactMap { $0 }.joined(separator: " · "))
                        .foregroundStyle(.secondary)
                }
            }
        }
    }
}

private struct RelaysSection: View {
    @Environment(ConsoleModel.self) private var model
    let relays: [RadioConsole.Relay]

    var body: some View {
        let w = model.words
        Section(w("operatorConsole.relays")) {
            ForEach(relays) { r in
                VStack(alignment: .leading, spacing: 2) {
                    Text("\(r.callSign) · \(r.node)").bold()
                    Text(w("operatorConsole.relayHour", ["seconds": r.secondsLastHour.formatted(), "budget": r.budgetSeconds.formatted()], count: r.relayedLastHour))
                    if !r.skipped.isEmpty {
                        let list = r.skipped.sorted { $0.key < $1.key }.map { "\(w("operatorConsole.relayReason.\($0.key)")) \($0.value)" }.joined(separator: ", ")
                        Text(w("operatorConsole.relaySkipped", ["list": list])).foregroundStyle(.secondary)
                    }
                }
            }
        }
    }
}

private struct BeaconSection: View {
    @Environment(ConsoleModel.self) private var model
    let beacon: RadioConsole.Beacon

    var body: some View {
        let w = model.words
        Section {
            if beacon.recent.isEmpty { Text(w("operatorConsole.beaconNone")).foregroundStyle(.secondary) }
            ForEach(beacon.recent) { b in
                VStack(alignment: .leading, spacing: 2) {
                    Text((b.sentAt.map(clock) ?? w("operatorConsole.beaconWaiting")) + (b.preset.map { " · \($0)" } ?? "")).foregroundStyle(.secondary)
                    Text(!b.heard.isEmpty
                        ? b.heard.map { w("operatorConsole.beaconHeardBy", ["by": $0.by, "snr": String(Int($0.snrDb.rounded()))]) }.joined(separator: ", ")
                        : w(b.status == "failed" ? "operatorConsole.beaconUnheard" : "operatorConsole.beaconListening"))
                }
            }
        } header: {
            Text(w("operatorConsole.beacon"))
        } footer: {
            Text(w("operatorConsole.beaconHint", ["minutes": String(beacon.minutes)]))
        }
    }
}

/// Admin → Radio → Station health, for admins while it is on (radio operators get a 403 and see the note).
private struct HealthSection: View {
    @Environment(ConsoleModel.self) private var model
    let health: StationHealth?

    var body: some View {
        let w = model.words
        Section(w("macConsole.health")) {
            if let h = health?.health {
                ForEach(h.stations) { s in
                    VStack(alignment: .leading, spacing: 2) {
                        Text(s.silent
                            ? w("admin.healthSilent", ["callSign": s.callSign, "when": when(s.lastHeartbeat, w)])
                            : w("admin.healthStation", ["callSign": s.callSign, "when": when(s.lastHeartbeat, w), "bursts": String(s.bursts24h),
                                                        "prayers": String(s.prayers24h), "failed": String(s.failed24h)]))
                            .foregroundStyle(s.silent ? .red : .primary)
                        ForEach(s.checks.filter { !$0.ok }, id: \.name) { c in
                            Text(w("admin.healthCheck", ["name": c.name, "detail": c.detail])).foregroundStyle(.red)
                        }
                        if let e = s.lastError { Text(w("admin.healthLastError", ["error": e])).foregroundStyle(.red) }
                    }
                }
                Text(w("admin.healthQueue", ["queued": String(h.queue.queued), "sending": String(h.queue.sending)])
                    + (h.queue.oldestMinutes.map { " " + w("admin.healthOldest", ["minutes": String($0)]) } ?? ""))
                LabeledContent(w("admin.healthSnrTitle")) {
                    VStack(alignment: .trailing) {
                        if h.snr.isEmpty { Text(w("admin.healthSnrNone")) }
                        ForEach(h.snr, id: \.lastAt) { r in
                            Text(w("admin.healthSnr", ["callSign": r.callSign, "preset": r.preset, "avg": r.avgDb.formatted(), "min": r.minDb.formatted(), "reports": String(r.reports)]))
                        }
                    }
                }
                LabeledContent(w("admin.healthListenersTitle")) {
                    VStack(alignment: .trailing) {
                        ForEach(h.listeners) { l in
                            Text(w(l.silent ? "admin.healthListenerSilent" : "admin.healthListener", ["name": l.name, "when": when(l.lastHeartbeat, w)]))
                                .foregroundStyle(l.silent ? .red : .primary)
                        }
                    }
                }
                LabeledContent(w("admin.healthHeardTitle")) {
                    VStack(alignment: .trailing) {
                        if h.lastHeard.isEmpty { Text(w("admin.healthHeardNone")) }
                        ForEach(Array(h.lastHeard.enumerated()), id: \.offset) { _, r in
                            Text(w("admin.healthHeard", ["when": when(r.at, w), "node": r.node, "callSign": r.callSign, "preset": r.preset, "snr": r.snrDb.formatted()]))
                        }
                    }
                }
                LabeledContent(w("admin.healthFailuresTitle")) {
                    VStack(alignment: .trailing) {
                        if h.failures.isEmpty { Text(w("admin.healthFailuresNone")) }
                        ForEach(Array(h.failures.enumerated()), id: \.offset) { _, f in
                            Text(w("admin.healthFailure.\(f.kind)", ["when": when(f.at, w), "callSign": f.callSign ?? "", "error": f.error])).foregroundStyle(.red)
                        }
                    }
                }
            } else {
                Text(w("macConsole.healthOff")).foregroundStyle(.secondary)
            }
        }
    }
}

private struct LogSection: View {
    @Environment(ConsoleModel.self) private var model
    let log: [RadioConsole.LogRow]

    var body: some View {
        let w = model.words
        Section(w("operatorConsole.log")) {
            if log.isEmpty { Text(w("operatorConsole.logEmpty")).foregroundStyle(.secondary) }
            ForEach(Array(log.enumerated()), id: \.offset) { _, l in
                VStack(alignment: .leading, spacing: 2) {
                    let status = ["transmitted", "failed", "sending"].contains(l.status) ? l.status : "other"
                    Text([clock(l.at), l.callSign, l.preset, w("operatorConsole.status.\(status)"), l.heard ? w("operatorConsole.heard") : nil]
                        .compactMap { $0 }.joined(separator: " · "))
                        .foregroundStyle(.secondary)
                    Text(l.text).lineLimit(2)
                    if let e = l.error { Text(e).foregroundStyle(.red) }
                }
            }
        }
    }
}
