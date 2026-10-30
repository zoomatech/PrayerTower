import PrayerTowerKit
import SwiftUI

/// Gift Tokens from a card's action row, as the Expo app's: give now, schedule for a set time
/// (once or weekly), or draw from a donated pool.
struct GiftSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let card: Card
    let done: (String) -> Void
    @State private var amount = ""
    /// "now", a preset key, or "custom".
    @State private var when = "now"
    @State private var custom = Date.now.addingTimeInterval(3600)
    @State private var repeatWeeks = 1
    @State private var pools: [TokenPool] = []
    @State private var busy = false
    @State private var error: String?

    private var w: Words { model.words }
    private var count: Int { Int(amount) ?? 0 }

    var body: some View {
        NavigationStack {
            Form {
                Section { Text(w("actions.giftNote")) }
                Section {
                    TextField(w("actions.howMany"), text: $amount)
                        .keyboardType(.numberPad)
                        .onChange(of: amount) { _, new in amount = String(new.filter(\.isNumber).prefix(5)) }
                }
                Section(w("actions.when")) {
                    Picker(w("actions.when"), selection: $when) {
                        Text(w("actions.now")).tag("now")
                        ForEach(GiftSchedule.whens) { Text(w("actions.whenOptions.\($0.key)")).tag($0.key) }
                        Text(w("actions.pickTime")).tag("custom")
                    }
                    .pickerStyle(.inline)
                    .labelsHidden()
                    if when == "custom" {
                        DatePicker(w("actions.pickTime"), selection: $custom, in: Date.now..., displayedComponents: [.date, .hourAndMinute])
                    }
                    if when != "now" {
                        Picker(w("actions.once"), selection: $repeatWeeks) {
                            ForEach(GiftSchedule.repeats, id: \.self) { weeks in
                                Text(weeks == 1 ? w("actions.once") : w("actions.weeklyFor", count: weeks)).tag(weeks)
                            }
                        }
                    }
                }
                Section {
                    Button(w(when == "now" ? "actions.give" : "actions.schedule")) { Task { await give() } }
                        .disabled(busy || count <= 0)
                }
                if !pools.isEmpty {
                    Section(w("actions.orPool")) {
                        ForEach(pools) { p in
                            Button(w("actions.poolGive", ["name": p.name], count: p.drawAmount)) { Task { await draw(p) } }.disabled(busy)
                        }
                    }
                }
                if let error { Section { Text(error).foregroundStyle(.red) } }
            }
            .navigationTitle(CardAction.giftTokens.name(model.wording))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button(w("common.cancel")) { dismiss() } } }
            .task { pools = GiftSchedule.offered((try? await model.store.api.tokenPools(postId: card.id)) ?? []) }
        }
    }

    private var at: Date {
        GiftSchedule.whens.first { $0.key == when }.map { GiftSchedule.next($0) } ?? custom
    }

    private func give() async {
        busy = true
        defer { busy = false }
        do {
            if when == "now" {
                _ = try await model.store.api.boost(postId: card.id, amount: count)
                finish(w("actions.giveDone"))
            } else {
                let at = self.at
                _ = try await model.store.api.scheduleSpend(postId: card.id, amount: count, at: at, repeatWeeks: repeatWeeks)
                let whenText = at.formatted(.dateTime.weekday(.wide).month(.abbreviated).day().hour().minute())
                finish(repeatWeeks > 1
                    ? w("actions.scheduledRepeat", ["when": whenText, "weeks": String(repeatWeeks)], count: count)
                    : w("actions.scheduledOnce", ["when": whenText], count: count))
            }
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func draw(_ p: TokenPool) async {
        busy = true
        defer { busy = false }
        do {
            _ = try await model.store.api.drawFromPool(p.id, postId: card.id)
            finish(w("actions.poolDone", ["name": p.name], count: p.drawAmount))
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func finish(_ message: String) {
        done(message)
        dismiss()
    }
}

/// Scheduled gifts on Me: what is set to go out, with cancel.
struct ScheduledGiftsView: View {
    @Environment(AppModel.self) private var model
    @State private var items: [ScheduledSpend]?
    @State private var opened: String?
    @State private var error: String?

    private var w: Words { model.words }

    var body: some View {
        List {
            Section { Text(w("scheduled.intro")) }
            if let error { Section { Text(error).foregroundStyle(.red) } }
            if items?.isEmpty == true { Section { Text(w("scheduled.empty")).foregroundStyle(Color.subtle) } }
            ForEach(items ?? []) { s in
                VStack(alignment: .leading, spacing: 6) {
                    Button("“\(s.excerpt)”") { opened = s.postId }.buttonStyle(.plain)
                    Text(line(s)).font(.caption).foregroundStyle(Color.subtle)
                    if let e = s.error { Text(e).font(.caption) }
                    if s.status == "active" {
                        Button(w("common.cancel"), role: .destructive) {
                            Task {
                                do {
                                    _ = try await model.store.api.cancelScheduledSpend(s.id)
                                    await load()
                                } catch {
                                    self.error = error.localizedDescription
                                }
                            }
                        }
                        .buttonStyle(.borderless)
                    }
                }
            }
        }
        .overlay { if items == nil && error == nil { ProgressView() } }
        .navigationTitle(w("profile.scheduled"))
        .navigationDestination(item: $opened) { PostDetailView(postId: $0) }
        .refreshable { await load() }
        .task { await load() }
    }

    private func line(_ s: ScheduledSpend) -> String {
        var parts = [w("scheduled.status.\(s.status)")]
        parts.append(s.action == "radio" || s.action == "amplify" ? w("scheduled.\(s.action!)") : w("scheduled.tokens", count: s.amount))
        if s.status == "active", let d = (try? Date(s.nextRunAt, strategy: Date.ISO8601FormatStyle(includingFractionalSeconds: true))) ?? (try? Date(s.nextRunAt, strategy: .iso8601)) {
            parts.append(d.formatted(.dateTime.weekday(.abbreviated).month(.abbreviated).day().hour().minute()))
        }
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
}

/// Notification settings: phone alerts on or off per kind, and quiet hours. Turning a kind off
/// only stops the phone alert; it still shows under Notices.
struct NotificationSettingsView: View {
    @Environment(AppModel.self) private var model
    @State private var error: String?

    private var w: Words { model.words }
    private var prefs: NotificationPrefs { model.me?.profile.notificationPrefs ?? NotificationPrefs() }

    var body: some View {
        Form {
            Section {
                ForEach(NotificationPrefs.categories, id: \.self) { c in
                    Toggle(isOn: Binding(get: { prefs.isOn(c) }, set: { on in Task { await save(prefs.setting(c, on: on)) } })) {
                        Text(w("notifySettings.\(c)"))
                        Text(w("notifySettings.\(c)Hint"))
                    }
                }
            } header: {
                Text(w("notifySettings.intro")).textCase(nil)
            } footer: {
                Text(w("notifySettings.safety"))
            }
            RadioPrefsSection(api: model.store.api, words: w)
            Section {
                Toggle(isOn: Binding(get: { prefs.quietHours != nil }, set: { on in Task { await save(prefs.quiet(on: on)) } })) {
                    Text(w("notifySettings.quiet"))
                    Text(w("notifySettings.quietHint"))
                }
                if let quiet = prefs.quietHours {
                    Picker(w("notifySettings.from"), selection: Binding(get: { quiet.start }, set: { s in Task { await save(prefs.quiet(on: true, start: s)) } })) {
                        ForEach(NotificationPrefs.starts, id: \.self) { Text($0).tag($0) }
                    }
                    Picker(w("notifySettings.until"), selection: Binding(get: { quiet.end }, set: { e in Task { await save(prefs.quiet(on: true, end: e)) } })) {
                        ForEach(NotificationPrefs.ends, id: \.self) { Text($0).tag($0) }
                    }
                    Text(quiet.timeZone).font(.footnote).foregroundStyle(Color.subtle)
                }
            }
            if let error { Section { Text(error).foregroundStyle(.red) } }
        }
        .navigationTitle(w("notifySettings.title"))
        .navigationBarTitleDisplayMode(.inline)
    }

    private func save(_ next: NotificationPrefs) async {
        guard let me = model.me else { return }
        do {
            let profile = try await model.store.api.updateMe(next.patch)
            model.me = Me(profile: profile, roles: me.roles, community: me.community)
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }
}
