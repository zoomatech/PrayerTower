import PrayerTowerKit
import SwiftUI

/// The admin's home: metrics, the weekly pilot report and its downloads, token and new-member
/// settings, tiers, milestone rules, and people with their roles. Radio settings are on the
/// radio screens.
struct AdminHubView: View {
    struct RuleDraft { var label = "", metric = "prayers_for_others", threshold = "", amount = "" }
    @Environment(AppModel.self) private var model
    @State private var days = 7
    @State private var metrics: AdminMetrics?
    @State private var weeks: [PilotWeek] = []
    @State private var tokens: AdminTokenSettings?
    @State private var tokenDraft: [String: String] = [:]
    @State private var safety: AdminSafetySettings?
    @State private var safetyDraft: [String: String] = [:]
    @State private var tiers: [AdminTier] = []
    @State private var tierDraft: [String: (min: String, weekly: String)] = [:]
    @State private var rules: [MilestoneRule] = []
    @State private var rule = RuleDraft()
    @State private var query = ""
    @State private var people: [AdminPerson]?
    @State private var resetAsk: String?
    @State private var file: ExportFile?
    @State private var saved: String?
    @State private var error: String?
    private var w: Words { model.words }

    var body: some View {
        Form {
            if let saved { Text(saved).foregroundStyle(.tint) }
            if let error { Text(error).foregroundStyle(.red) }
            metricsSection
            if !weeks.isEmpty { weeksSection }
            if tokens != nil { tokensSection }
            if let safety { safetySection(safety) }
            if !tiers.isEmpty { tiersSection }
            rulesSection
            peopleSection
        }
        .navigationTitle(w("profile.admin"))
        .task(id: days) { await load() }
        .sheet(item: $file) { f in ShareLink(item: f.url) { Label(f.url.lastPathComponent, systemImage: "square.and.arrow.up") }.padding() }
    }

    // MARK: Sections

    private var metricsSection: some View {
        Section(w("admin.metrics")) {
            Picker(w("admin.metrics"), selection: $days) {
                ForEach(AdminHub.periods, id: \.self) { Text(w("admin.days", count: $0)).tag($0) }
            }
            .pickerStyle(.segmented)
            ForEach(metrics?.groups ?? []) { g in
                Text(AdminHub.label(g.name, w)).font(.headline)
                ForEach(g.values, id: \.key) { k, v in LabeledContent(AdminHub.label(k, w), value: AdminHub.show(v)) }
            }
        }
    }

    private var weeksSection: some View {
        Section(w("admin.byWeek")) {
            Grid(alignment: .trailing) {
                GridRow {
                    Text(w("admin.weekOf")).gridColumnAlignment(.leading)
                    ForEach(AdminHub.trend, id: \.self) { Text(w("admin.trend.\($0)")) }
                }
                .font(.caption.bold())
                ForEach(weeks.reversed()) { wk in
                    GridRow {
                        Text(String(wk.week_start.dropFirst(5)))
                        ForEach(AdminHub.trend, id: \.self) { Text(String(wk.value($0))) }
                    }
                    .font(.caption.monospacedDigit())
                }
            }
            Button(w("admin.downloadCsv", ["weeks": String(AdminHub.reportWeeks)])) { save("prayer-tower-pilot.csv") { try await model.store.api.pilotCsv() } }
            Button(w("admin.downloadSponsor", ["weeks": String(AdminHub.reportWeeks)])) { save("prayer-tower-pilot-report.html") { try await model.store.api.pilotHtml() } }
        }
    }

    private var tokensSection: some View {
        Section(w("admin.tokens")) {
            Toggle(isOn: Binding(get: { tokens?.radio_funding == "free" }, set: { free in
                act(w("admin.saved.funding")) { tokens = try await model.store.api.updateTokenSettings(["radioFunding": .string(free ? "free" : "tokens")]); fillTokens() }
            })) { LabelHint(w("admin.radioFree"), w("admin.radioFreeHint")) }
            number("admin.field.perToken", $tokenDraft, "priestlyPrayersPerToken")
            number("admin.field.gap", $tokenDraft, "verifiedPrayerMinGapSeconds")
            number("admin.field.cost", $tokenDraft, "radioPrayerCost")
            number("admin.field.verifiedPerDay", $tokenDraft, "verifiedPrayersPerDay")
            number("admin.field.amplifyCost", $tokenDraft, "amplifyPaidCost")
            Button(w("admin.btn.saveTokens")) {
                act(w("admin.saved.tokens")) {
                    var patch = [String: JSONValue].numbers(tokenDraft)
                    // A blank amplify cost means "no paid amplify".
                    if (tokenDraft["amplifyPaidCost"] ?? "").trimmingCharacters(in: .whitespaces).isEmpty { patch["amplifyPaidCost"] = .null }
                    tokens = try await model.store.api.updateTokenSettings(patch)
                    fillTokens()
                }
            }
        }
    }

    private func safetySection(_ s: AdminSafetySettings) -> some View {
        Section(w("admin.newMembers")) {
            Toggle(isOn: Binding(get: { s.new_member_limits_enabled }, set: { v in saveSafety(["newMemberLimitsEnabled": .bool(v)]) })) {
                LabelHint(w("admin.toggle.limitNew"), w("admin.toggle.limitNewHint"))
            }
            Toggle(w("admin.toggle.links"), isOn: Binding(get: { s.new_member_links_allowed }, set: { v in saveSafety(["newMemberLinksAllowed": .bool(v)]) }))
            number("admin.field.hours", $safetyDraft, "newMemberHours")
            number("admin.field.prayers", $safetyDraft, "newMemberMinPrayers")
            number("admin.field.posts", $safetyDraft, "newMemberPostsPerDay")
            number("admin.field.comments", $safetyDraft, "newMemberCommentsPerDay")
            Text(w("admin.everyoneLimits")).font(.caption)
            number("admin.field.postsHour", $safetyDraft, "postsPerHour")
            number("admin.field.commentsHour", $safetyDraft, "commentsPerHour")
            number("admin.field.messagesMinute", $safetyDraft, "messagesPerMinute")
            Button(w("admin.btn.saveSafety")) { saveSafety([:]) }
        }
    }

    private var tiersSection: some View {
        Section {
            ForEach(tiers) { t in
                Text(w.server(t.label)).font(.headline)
                TextField(w("admin.field.tierMin"), text: Binding(get: { tierDraft[t.tier]?.min ?? "" }, set: { tierDraft[t.tier] = ($0, tierDraft[t.tier]?.weekly ?? "") }))
                    .keyboardType(.numberPad)
                TextField(w("admin.field.tierWeekly"), text: Binding(get: { tierDraft[t.tier]?.weekly ?? "" }, set: { tierDraft[t.tier] = (tierDraft[t.tier]?.min ?? "", $0) }))
                    .keyboardType(.numberPad)
            }
            Button(w("admin.btn.saveTiers")) { saveTiers() }
        } header: { Text(w("admin.tiers")) } footer: { Text(w("admin.tiersHint")) }
    }

    private var rulesSection: some View {
        Section {
            ForEach(rules) { r in
                Toggle(isOn: Binding(get: { r.enabled }, set: { on in
                    act(w(on ? "admin.saved.ruleOn" : "admin.saved.ruleOff")) {
                        let updated = try await model.store.api.setMilestone(r.id, enabled: on)
                        rules = rules.map { $0.id == r.id ? updated : $0 }
                    }
                })) { LabelHint(w.server(r.label), ruleHint(r)) }
            }
            Text(w("admin.addRuleTitle")).font(.headline)
            ChoiceRow(options: AdminHub.ruleMetrics, selected: rule.metric, label: { w("admin.ruleMetric.\($0)") }) { rule.metric = $0 }
            TextField(w("admin.field.ruleName"), text: $rule.label)
            TextField(w("admin.field.ruleAt"), text: $rule.threshold).keyboardType(.numberPad)
            TextField(w("admin.field.ruleAmount"), text: $rule.amount).keyboardType(.numberPad)
            Button(w("admin.btn.addRule")) {
                guard let at = Staff.whole(rule.threshold), let amount = Staff.whole(rule.amount) else { return }
                act(w("admin.saved.ruleAdded")) {
                    rules.append(try await model.store.api.addMilestone(label: rule.label, metric: rule.metric, threshold: at, amount: amount))
                    rule = RuleDraft(metric: rule.metric)
                }
            }
            .disabled(rule.label.trimmingCharacters(in: .whitespaces).isEmpty || (Staff.whole(rule.threshold) ?? 0) <= 0 || (Staff.whole(rule.amount) ?? 0) <= 0)
        } header: { Text(w("admin.milestones")) } footer: { Text(w("admin.milestonesHint")) }
    }

    private var peopleSection: some View {
        Section(w("admin.people")) {
            TextField(w("admin.search"), text: $query).textInputAutocapitalization(.never).onSubmit { search() }
            Button(w("admin.btn.find")) { search() }.disabled(query.trimmingCharacters(in: .whitespaces).isEmpty)
            if people?.isEmpty == true { Text(w("admin.noMatch")).font(.caption) }
            ForEach(people ?? []) { p in
                VStack(alignment: .leading, spacing: 6) {
                    Text(p.display_name).bold()
                    if let e = p.email { Text(e).font(.caption) }
                    ChoiceRow(options: AdminHub.roles, selected: nil, label: { r in (p.roles.contains(r) ? "✓ " : "") + w("admin.role.\(r)") }) { r in
                        act(nil) {
                            let roles = try await model.store.api.setRole(p.id, r, on: !p.roles.contains(r))
                            people = people?.map { var x = $0; if x.id == p.id { x.roles = roles }; return x }
                        }
                    }
                    if model.features["twoStep"] || model.features["backupCodes"] {
                        Button(w(resetAsk == p.id ? "backupCodes.adminResetSure" : "backupCodes.adminReset")) {
                            if resetAsk == p.id {
                                act(w("backupCodes.adminResetDone", ["name": p.display_name])) {
                                    _ = try await model.store.api.resetTwoStep(p.id)
                                    resetAsk = nil
                                }
                            } else {
                                resetAsk = p.id
                            }
                        }
                        .buttonStyle(.borderless)
                    }
                }
            }
        }
    }

    // MARK: Helpers

    private func number(_ label: String, _ draft: Binding<[String: String]>, _ key: String) -> some View {
        LabeledContent(w(label)) {
            TextField(w(label), text: Binding(get: { draft.wrappedValue[key] ?? "" }, set: { draft.wrappedValue[key] = $0 }))
                .keyboardType(.numberPad)
                .multilineTextAlignment(.trailing)
                .frame(maxWidth: 100)
        }
    }

    private func ruleHint(_ r: MilestoneRule) -> String {
        let amount = w(r.currency == "priestly" ? "admin.priestlyTokens" : "admin.regularTokens", count: r.amount)
        return "\(w("admin.ruleMetric.\(r.metric)")): \(r.threshold) → \(amount) · \(w("admin.given", count: r.awarded ?? 0))"
    }

    private func fillTokens() {
        guard let t = tokens else { return }
        tokenDraft = [
            "priestlyPrayersPerToken": String(t.priestly_prayers_per_token), "verifiedPrayerMinGapSeconds": String(t.verified_prayer_min_gap_seconds),
            "radioPrayerCost": String(t.radio_prayer_cost), "verifiedPrayersPerDay": String(t.verified_prayers_per_day),
            "amplifyPaidCost": t.amplify_paid_cost.map(String.init) ?? "",
        ]
    }

    private func fillSafety() {
        guard let s = safety else { return }
        safetyDraft = [
            "newMemberHours": String(s.new_member_hours), "newMemberMinPrayers": String(s.new_member_min_prayers),
            "newMemberPostsPerDay": String(s.new_member_posts_per_day), "newMemberCommentsPerDay": String(s.new_member_comments_per_day),
            "postsPerHour": String(s.posts_per_hour), "commentsPerHour": String(s.comments_per_hour), "messagesPerMinute": String(s.messages_per_minute),
        ]
    }

    private func fillTiers() {
        tierDraft = Dictionary(uniqueKeysWithValues: tiers.map { ($0.tier, ($0.min_prayer_events.map(String.init) ?? "", $0.weekly_allotment.map(String.init) ?? "")) })
    }

    private func load() async {
        do {
            metrics = try await model.store.api.adminMetrics(days: days)
            weeks = try await model.store.api.pilotReport()
            tokens = try await model.store.api.tokenSettings()
            safety = try await model.store.api.safetySettings()
            tiers = try await model.store.api.tiers()
            rules = try await model.store.api.milestones()
            fillTokens()
            fillSafety()
            fillTiers()
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func act(_ done: String?, _ call: @escaping () async throws -> Void) {
        Task {
            do {
                error = nil
                try await call()
                saved = done
            } catch {
                saved = nil
                self.error = error.localizedDescription
            }
        }
    }

    private func saveSafety(_ extra: [String: JSONValue]) {
        act(w("admin.saved.safety")) {
            safety = try await model.store.api.updateSafetySettings([String: JSONValue].numbers(safetyDraft).merging(extra) { _, new in new })
            fillSafety()
        }
    }

    private func saveTiers() {
        act(w("admin.saved.tiers")) {
            for t in tiers {
                guard let d = tierDraft[t.tier] else { continue }
                let min = Staff.whole(d.min), weekly = Staff.whole(d.weekly)
                if min != t.min_prayer_events || weekly != t.weekly_allotment {
                    _ = try await model.store.api.updateTier(t.tier, min: min, weekly: weekly)
                }
            }
            tiers = try await model.store.api.tiers()
            fillTiers()
        }
    }

    private func search() {
        act(nil) { people = try await model.store.api.adminPeople(query) }
    }

    private func save(_ name: String, _ make: @escaping () async throws -> Data) {
        act(nil) {
            let url = FileManager.default.temporaryDirectory.appendingPathComponent(name)
            try await make().write(to: url, options: .completeFileProtection)
            file = ExportFile(url: url)
        }
    }
}

/// Admin → Settings: each switchboard from the Expo admin screen.
struct AdminBoardsView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        List {
            ForEach(AdminBoard.all) { b in
                NavigationLink(model.words(b.title)) { AdminBoardView(board: b) }
            }
            LibraryAdminSection()
        }
        .navigationTitle(model.words("profile.settings"))
    }
}

struct AdminBoardView: View {
    @Environment(AppModel.self) private var model
    let board: AdminBoard
    @State private var settings: [String: JSONValue]?
    @State private var numbers: [String: String] = [:]
    @State private var note: String?
    @State private var error: String?
    private var w: Words { model.words }

    var body: some View {
        Form {
            if let intro = board.intro { Section { Text(w(intro)) } }
            if let note { Text(note).foregroundStyle(.tint) }
            if let error { Text(error).foregroundStyle(.red) }
            if let settings {
                Section {
                    ForEach(board.toggles, id: \.patch) { t in
                        Toggle(isOn: Binding(get: { settings[t.field] == .bool(true) }, set: { save([t.patch: .bool($0)]) })) {
                            if let hint = t.hint { LabelHint(w(t.label), w(hint)) } else { Text(w(t.label)) }
                        }
                    }
                }
                if !board.numbers.isEmpty {
                    Section {
                        ForEach(board.numbers, id: \.patch) { n in
                            LabeledContent(w(n.label)) {
                                TextField(w(n.label), text: Binding(get: { numbers[n.patch] ?? "" }, set: { numbers[n.patch] = $0 }))
                                    .keyboardType(.numberPad).multilineTextAlignment(.trailing).frame(maxWidth: 100)
                            }
                        }
                        Button(w("goldfish.adminSave")) { save([String: JSONValue].numbers(numbers)) }
                    }
                }
            }
        }
        .navigationTitle(w(board.title))
        .task {
            do {
                show(try await model.store.api.boardSettings(board))
            } catch {
                self.error = error.localizedDescription
            }
        }
    }

    private func show(_ s: [String: JSONValue]) {
        settings = s
        numbers = Dictionary(uniqueKeysWithValues: board.numbers.map { ($0.patch, AdminHub.show(s[$0.field] ?? .null).replacingOccurrences(of: "—", with: "")) })
    }

    private func save(_ patch: [String: JSONValue]) {
        Task {
            do {
                show(try await model.store.api.updateBoard(board, patch))
                await model.loadSettings()
                note = w("givingSplit.adminSaved")
                error = nil
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}
