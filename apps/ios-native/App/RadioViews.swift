import PrayerTowerKit
import SwiftUI

// Radio for members, as the Expo app (docs/STATION_OPERATOR_GUIDE.md): on a post, send it on the
// air or amplified with Priestly tokens, keep it on the air, schedule a send and see where it was
// heard; on Me, My signal queue (Scheduled sends are in GiftViews). Each part follows its switch (Radio.offer).

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
    @State private var journey = false
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
            if journey, s.status == "sent", let sent = s.sentAt.flatMap(Keying.date) {
                SignalJourneyView(sentAt: sent, bestSnrDb: s.bestSnrDb, words: w)
            }
        }
    }

    private func details(_ s: SignalEntry) -> String {
        var parts = [w("signalQueue.status.\(s.status)")]
        if s.amplified { parts.append(w("signalQueue.amplified")) }
        if s.amplified, let copies = s.copies { parts.append(w("signalQueue.copies", count: copies)) }
        if s.kind == "thanksgiving" { parts.append(w("signalQueue.thanksgiving")) }
        if s.kind == "auto" { parts.append(w("signalQueue.auto")) }
        parts.append(shortTime(s.sentAt ?? s.queuedAt))
        parts += [s.callSign, s.preset].compactMap { $0 }
        return parts.joined(separator: " · ")
    }

    private func load() async {
        do {
            (items, journey) = try await model.store.api.signalQueueWithJourney()
            error = nil
        } catch let e as APIError where e.status == 404 {
            off = true
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// Signal journey (docs/STATION_OPERATOR_GUIDE.md): how far one sent wave has gone, on a log-scale track from
/// Earth to Proxima Centauri, with dots drifting out along it unless Reduce Motion is on.
struct SignalJourneyView: View {
    let sentAt: Date
    let bestSnrDb: Double?
    let words: Words
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        TimelineView(.periodic(from: .now, by: reduceMotion ? 1 : 1.0 / 30)) { context in
            content(SignalJourney.at(sentAt: sentAt, now: context.date), phase: reduceMotion ? nil : context.date.timeIntervalSinceReferenceDate)
        }
    }

    private func place(_ key: String) -> String { words("signalQueue.journey.place.\(key)") }

    private func time(_ seconds: Double) -> String {
        let (u, c) = SignalJourney.unit(seconds)
        let n = c >= 10 ? c.rounded() : (c * 10).rounded() / 10
        let s = n == n.rounded() ? String(Int(n)) : String(n)
        // Days and years have one and other forms; `count:` would print a whole number, so pick the form here.
        let key = "signalQueue.journey.time.\(u)" + (u == "day" || u == "year" ? (n == 1 ? ".one" : ".other") : "")
        return words(key, ["count": s])
    }

    private func big(_ km: Double) -> String {
        let one = { (v: Double) in ((v * 10).rounded() / 10).formatted(.number.locale(Locale(identifier: "en_US"))) }
        if km >= 1e12 { return words("signalQueue.journey.big.trillion", ["n": one(km / 1e12)]) }
        if km >= 1e9 { return words("signalQueue.journey.big.billion", ["n": one(km / 1e9)]) }
        if km >= 1e6 { return words("signalQueue.journey.big.million", ["n": one(km / 1e6)]) }
        return Int(km.rounded()).formatted(.number.locale(Locale(identifier: "en_US")))
    }

    @ViewBuilder private func content(_ j: SignalJourney.Point, phase: Double?) -> some View {
        let w = words
        let value = j.lightValue == j.lightValue.rounded() ? String(Int(j.lightValue)) : String(j.lightValue)
        VStack(alignment: .leading, spacing: 4) {
            Text(w("signalQueue.journey.title")).font(.subheadline.bold())
            Text(w("signalQueue.journey.now", ["value": value, "unit": w("signalQueue.journey.unit.\(j.lightUnit)", count: j.lightValue == 1 ? 1 : 2), "km": big(j.km)]))
                .font(.footnote)
            Canvas { ctx, size in
                let mid = size.height / 2
                let front = SignalJourney.track(j.km) * size.width
                ctx.fill(Path(CGRect(x: 0, y: mid - 1, width: size.width, height: 2)), with: .color(.secondary.opacity(0.3)))
                ctx.fill(Path(CGRect(x: 0, y: mid - 1, width: front, height: 2)), with: .color(.accentColor))
                for l in SignalJourney.landmarks {
                    let x = SignalJourney.track(l.km) * size.width
                    ctx.fill(Path(ellipseIn: CGRect(x: x - 3, y: mid - 3, width: 6, height: 6)), with: .color(j.passed.contains(l.key) ? .accentColor : .secondary.opacity(0.4)))
                }
                ctx.fill(Path(ellipseIn: CGRect(x: -6, y: mid - 6, width: 12, height: 12)), with: .color(.accentColor))
                if let phase {
                    for i in 0..<3 {
                        let f = (phase / 4 + Double(i) / 3).truncatingRemainder(dividingBy: 1)
                        ctx.fill(Path(ellipseIn: CGRect(x: f * front - 2, y: mid - 2, width: 4, height: 4)), with: .color(.accentColor.opacity(f > 0.85 ? 0.3 : 1)))
                    }
                }
                ctx.stroke(Path(ellipseIn: CGRect(x: front - 5, y: mid - 5, width: 10, height: 10)), with: .color(.accentColor), lineWidth: 2)
            }
            .frame(height: 24)
            .accessibilityElement()
            .accessibilityAddTraits(.isImage)
            .accessibilityLabel(j.next.map { w("signalQueue.journey.pictureLabel", ["percent": "\(Int(($0.fraction * 100).rounded()))", "place": place($0.key)]) } ?? w("signalQueue.journey.beyond"))
            if !j.passed.isEmpty { Text(w("signalQueue.journey.passed", ["places": j.passed.map(place).joined(separator: ", ")])).font(.footnote) }
            Text(j.next.map { w("signalQueue.journey.next", ["place": place($0.key), "time": time($0.inSeconds)]) } ?? w("signalQueue.journey.beyond")).font(.footnote)
            if let snr = bestSnrDb { Text(w("signalQueue.journey.strongest", ["snr": snr == snr.rounded() ? String(Int(snr)) : String(snr)])).font(.footnote) }
        }
        .padding(.top, 4)
    }
}
