import PrayerTowerKit
import SwiftUI

// Radio for members, as the Expo app (docs/STATION_OPERATOR_GUIDE.md): on a post, send it on the
// air or amplified with Priestly tokens, keep it on the air, schedule a send and see where it was
// heard; on Me, My signal queue and Scheduled sends. Each part follows its switch (Radio.offer).

private func shortTime(_ iso: String, weekday: Bool = false) -> String {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    guard let d = f.date(from: iso) ?? ISO8601DateFormatter().date(from: iso) else { return iso }
    return weekday ? d.formatted(.dateTime.weekday(.abbreviated).month(.abbreviated).day().hour().minute()) : d.formatted(.dateTime.month(.abbreviated).day().hour().minute())
}

/// The radio part of a post: sections for the List in PostDetailView. Shows nothing when every switch is off.
struct RadioSection: View {
    @Environment(AppModel.self) private var model
    @Binding var card: Card
    @State private var tokens: TokenSummary?
    @State private var trail: [RadioTrailEntry] = []
    @State private var sent = false
    @State private var scheduling = false
    @State private var error: String?

    private var w: Words { model.words }
    private var radioOn: Bool { model.me?.community?.shows("radio") ?? true }
    private var offer: RadioOffer { Radio.offer(card: card, features: model.features, radioOn: radioOn, tokens: tokens) }

    var body: some View {
        let o = offer
        Group {
            if sent || o.sendCost != nil || o.amplify != nil || o.schedule || o.keepOnAir {
                Section {
                    if sent {
                        Text(w("post.radioSent")).font(.footnote)
                    } else {
                        if let cost = o.sendCost {
                            Button(cost == 0 ? w("post.radio") : w("post.radioCost", count: cost)) { Task { await send(amplify: false) } }
                        }
                        if let a = o.amplify {
                            Button(a.cost > 0 ? w("post.amplifyCost", ["cost": String(a.cost)], count: a.repeats) : w("post.amplify", count: a.repeats)) {
                                Task { await send(amplify: true) }
                            }
                        }
                    }
                    if o.schedule {
                        Button(w("scheduleRadio.open")) { scheduling = true }
                    }
                    if o.keepOnAir {
                        Toggle(isOn: Binding(get: { card.keepOnAir == true }, set: { on in Task { await keepOnAir(on) } })) {
                            Text(w("keepOnAir.toggle"))
                            Text(w("keepOnAir.hint"))
                        }
                    }
                    if let error { Text(error).foregroundStyle(.red) }
                }
            }
            if o.trail, !trail.isEmpty {
                Section(w("radioTrail.title")) {
                    ForEach(trail) { e in TrailRow(entry: e) }
                }
            }
        }
        .task(id: card.id) { await load() }
        .sheet(isPresented: $scheduling) {
            ScheduleRadioSheet(postId: card.id, canAmplify: o.scheduleCanAmplify)
        }
    }

    private func load() async {
        let api = model.store.api
        tokens = try? await api.tokens()
        trail = model.features["heardTrail"] ? ((try? await api.radioTrail(postId: card.id)) ?? []) : []
    }

    private func send(amplify: Bool) async {
        do {
            _ = try await model.store.api.sendRadioPrayer(postId: card.id, amplify: amplify)
            sent = true
            error = nil
            tokens = try? await model.store.api.tokens()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func keepOnAir(_ on: Bool) async {
        do {
            card.keepOnAir = try await model.store.api.setKeepOnAir(postId: card.id, on: on)
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// One time it went out: the listener nodes that decoded it by name, phones only counted. Nothing is estimated.
private struct TrailRow: View {
    @Environment(AppModel.self) private var model
    let entry: RadioTrailEntry

    var body: some View {
        let w = model.words
        VStack(alignment: .leading, spacing: 2) {
            Text(w(entry.amplified ? "radioTrail.sentAmplified" : "radioTrail.sent", ["time": shortTime(entry.sentAt)]) + (entry.callSign.map { " · \($0)" } ?? ""))
                .font(.footnote).foregroundStyle(.secondary)
            ForEach(entry.nodes, id: \.name) { n in
                Text(w("radioTrail.node", ["name": n.name, "snr": n.snrDb.formatted(.number.precision(.fractionLength(0...1)))]))
            }
            if entry.phones > 0 { Text(w("radioTrail.phones", count: entry.phones)) }
            if entry.nodes.isEmpty && entry.phones == 0 { Text(w("radioTrail.none")).font(.footnote).foregroundStyle(.secondary) }
        }
        .accessibilityElement(children: .combine)
    }
}

/// Send a request by radio, or amplified, at a set time, once or weekly. The radio prayer's own
/// price and rules apply when it runs.
struct ScheduleRadioSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let postId: String
    let canAmplify: Bool
    @State private var when = Radio.whenOptions[0].key
    @State private var custom = ""
    @State private var repeatWeeks = 1
    @State private var amplify = false
    @State private var busy = false
    @State private var done: String?
    @State private var error: String?

    private var w: Words { model.words }
    private var at: Date? {
        if when == "custom" { return Radio.parseLocal(custom) }
        return Radio.whenOptions.first { $0.key == when }.map { Radio.nextWeekday($0.weekday, hour: $0.hour) }
    }

    var body: some View {
        NavigationStack {
            Form {
                if let done {
                    Section { Text(done) }
                } else {
                    Section { Text(w("scheduleRadio.hint")).font(.footnote) }
                    Section {
                        Picker(w("scheduleRadio.title"), selection: $when) {
                            ForEach(Radio.whenOptions, id: \.key) { o in Text(w("actions.whenOptions.\(o.key)")).tag(o.key) }
                            Text(w("actions.pickTime")).tag("custom")
                        }
                        .pickerStyle(.inline)
                        .labelsHidden()
                        if when == "custom" {
                            TextField(w("actions.timeFormat"), text: $custom)
                                .keyboardType(.numbersAndPunctuation)
                                .autocorrectionDisabled()
                        }
                    }
                    Section {
                        Picker(w("actions.once"), selection: $repeatWeeks) {
                            ForEach(Radio.repeatOptions, id: \.self) { n in Text(n == 1 ? w("actions.once") : w("actions.weeklyFor", count: n)).tag(n) }
                        }
                        .pickerStyle(.inline)
                        .labelsHidden()
                    }
                    if canAmplify {
                        Section {
                            Picker(w("scheduleRadio.amplified"), selection: $amplify) {
                                Text(w("scheduleRadio.once")).tag(false)
                                Text(w("scheduleRadio.amplified")).tag(true)
                            }
                            .pickerStyle(.segmented)
                        }
                    }
                    if let error { Section { Text(error).foregroundStyle(.red) } }
                    Section {
                        Button(w("scheduleRadio.submit")) { Task { await submit() } }.disabled(busy || at == nil)
                    }
                }
            }
            .navigationTitle(w("scheduleRadio.title"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button(w(done == nil ? "common.cancel" : "common.done")) { dismiss() } } }
        }
    }

    private func submit() async {
        guard let at else { return }
        busy = true
        defer { busy = false }
        do {
            _ = try await model.store.api.scheduleSpend(postId: postId, NewScheduledSpend(amount: 1, runAt: Radio.iso(at), repeatWeeks: repeatWeeks, action: amplify ? "amplify" : "radio"))
            let whenText = at.formatted(.dateTime.weekday(.wide).month(.abbreviated).day().hour().minute())
            done = repeatWeeks > 1 ? w("scheduleRadio.doneRepeat", ["when": whenText, "weeks": String(repeatWeeks)]) : w("scheduleRadio.done", ["when": whenText])
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// My signal queue: the member's own radio prayers, where each one is and, once it went out, its
/// signal code (a listener who decodes it sees the same code on the Listen screen).
struct SignalQueueView: View {
    @Environment(AppModel.self) private var model
    @State private var items: [SignalEntry]?
    @State private var off = false
    @State private var error: String?

    private var w: Words { model.words }

    var body: some View {
        List {
            Section { Text(w(off ? "signalQueue.off" : "signalQueue.intro")) }
            if let error {
                Section {
                    Text(error).foregroundStyle(.red)
                    Button(w("common.tryAgain")) { Task { await load() } }
                }
            }
            if items?.isEmpty == true { Section { Text(w("signalQueue.empty")).foregroundStyle(.secondary) } }
            ForEach(items ?? []) { s in
                NavigationLink { PostDetailView(postId: s.postId) } label: { row(s) }
            }
        }
        .overlay { if items == nil && error == nil && !off { ProgressView() } }
        .navigationTitle(w("signalQueue.title"))
        .refreshable { await load() }
        .task { await load() }
    }

    private func row(_ s: SignalEntry) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("“\(s.excerpt)”")
            Text(details(s)).font(.footnote).foregroundStyle(.secondary)
            if let code = s.signalCode, let spoken = s.spokenCode {
                Text(code).font(.system(.headline, design: .monospaced)).tracking(2)
                    .accessibilityLabel(w("signalQueue.codeLabel", ["code": spoken]))
            }
            if s.heardCount > 0 { Text(w("signalQueue.heard", count: s.heardCount)).font(.footnote) }
        }
    }

    private func details(_ s: SignalEntry) -> String {
        var parts = [w("signalQueue.status.\(s.status)")]
        if s.amplified { parts.append(w("signalQueue.amplified")) }
        if s.kind == "thanksgiving" { parts.append(w("signalQueue.thanksgiving")) }
        if s.kind == "auto" { parts.append(w("signalQueue.auto")) }
        parts.append(shortTime(s.sentAt ?? s.queuedAt))
        parts += [s.callSign, s.preset].compactMap { $0 }
        return parts.joined(separator: " · ")
    }

    private func load() async {
        do {
            items = try await model.store.api.signalQueue()
            error = nil
        } catch let e as APIError where e.status == 404 {
            off = true
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// Scheduled sends: tokens or radio sends set for a later time, with Cancel while active.
struct ScheduledView: View {
    @Environment(AppModel.self) private var model
    @State private var items: [ScheduledSpend]?
    @State private var error: String?

    private var w: Words { model.words }

    var body: some View {
        List {
            Section { Text(w("scheduled.intro")) }
            if let error {
                Section {
                    Text(error).foregroundStyle(.red)
                    Button(w("common.tryAgain")) { Task { await load() } }
                }
            }
            if items?.isEmpty == true { Section { Text(w("scheduled.empty")).foregroundStyle(.secondary) } }
            ForEach(items ?? []) { s in
                VStack(alignment: .leading, spacing: 4) {
                    NavigationLink { PostDetailView(postId: s.postId) } label: { Text("“\(s.excerpt)”") }
                    Text(details(s)).font(.footnote).foregroundStyle(.secondary)
                    if let e = s.error { Text(e).font(.footnote).foregroundStyle(.red) }
                    if s.status == "active" {
                        Button(w("common.cancel"), role: .destructive) { Task { await cancel(s.id) } }.buttonStyle(.borderless)
                    }
                }
            }
        }
        .overlay { if items == nil && error == nil { ProgressView() } }
        .navigationTitle(w("profile.scheduled"))
        .refreshable { await load() }
        .task { await load() }
    }

    private func details(_ s: ScheduledSpend) -> String {
        var parts = [w("scheduled.status.\(s.status)"), s.isRadio ? w("scheduled.\(s.action ?? "radio")") : w("scheduled.tokens", count: s.amount)]
        if s.status == "active" { parts.append(shortTime(s.nextRunAt, weekday: true)) }
        if s.repeatWeeks > 1 { parts.append(w("scheduled.weeks", ["done": String(s.runs), "total": String(s.repeatWeeks)])) }
        return parts.joined(separator: " · ")
    }

    private func load() async {
        do {
            items = try await model.store.api.scheduledSpends()
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func cancel(_ id: String) async {
        do {
            _ = try await model.store.api.cancelScheduledSpend(id)
            await load()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
