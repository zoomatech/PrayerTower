import PrayerTowerKit
import SwiftUI

private func staffDate(_ iso: String) -> String {
    let d = (try? Date(iso, strategy: Date.ISO8601FormatStyle(includingFractionalSeconds: true))) ?? (try? Date(iso, strategy: .iso8601))
    return d?.formatted(date: .abbreviated, time: .shortened) ?? iso
}

/// Runs a staff call, shows its error, and reloads on success.
@MainActor private func staffRun(_ failure: Binding<String?>, _ call: () async throws -> Void) async -> Bool {
    do {
        try await call()
        failure.wrappedValue = nil
        return true
    } catch {
        failure.wrappedValue = error.localizedDescription
        return false
    }
}

/// The staff links on Me: the moderation queue for moderators, and the admin screens for admins.
struct StaffSection: View {
    @Environment(AppModel.self) private var model
    private var w: Words { model.words }

    var body: some View {
        let roles = model.me?.roles ?? []
        if Staff.isModerator(roles) {
            Section(w("profile.admin")) {
                NavigationLink(w("profile.moderation")) { ModerationView() }
                if Staff.isAdmin(roles) {
                    NavigationLink(w("admin.metrics")) { AdminHubView() }
                    NavigationLink(w("radioAdmin.open")) { RadioAdminView(api: model.store.api, words: w) }
                    NavigationLink(w("profile.settings")) { AdminBoardsView() }
                    NavigationLink(w("admin.announcements")) { AnnouncementsAdminView() }
                    NavigationLink(w("admin.invites")) { InvitesView() }
                    NavigationLink(w("waitlist.title")) { WaitlistView() }
                    NavigationLink(w("admin.feedbackTriage")) { FeedbackTriageView() }
                    NavigationLink(w("pilotTools.openLog")) { ErrorLogView() }
                    NavigationLink(w("admin.auditLog")) { AuditLogView() }
                    NavigationLink(w("admin.ops")) { OpsView() }
                    NavigationLink(w("admin.surveys")) { SurveysAdminView() }
                    NavigationLink(w("admin.legal")) { LegalCasesView() }
                    NavigationLink(w("admin.podcasts")) { PodcastsAdminView() }
                    NavigationLink(w("invites.import")) { ImportView() }
                }
            }
        }
    }
}

// MARK: - Moderation

/// Appeals, prayer taps that look automated, then reported and flagged items with the decision
/// buttons. Every decision is logged on the server.
struct ModerationView: View {
    @Environment(AppModel.self) private var model
    @State private var items: [ModerationItem]?
    @State private var appeals: [Appeal] = []
    @State private var flags: [ActivityFlag] = []
    @State private var rules: [String: String] = [:]
    @State private var escalated: Set<String> = []
    @State private var error: String?

    private var w: Words { model.words }
    private func rule(_ r: String) -> String { w("enums.moderationRule.\(r)") }

    var body: some View {
        List {
            if let error { Section { Text(error).foregroundStyle(.red) } }
            if !flags.isEmpty {
                Section(w("moderation.flagsTitle")) {
                    ForEach(flags) { f in
                        VStack(alignment: .leading, spacing: 6) {
                            Text("\(f.name) · \(w(f.reason == "too_many" ? "moderation.tooMany" : "moderation.regular", count: f.details.taps))").font(.subheadline.bold())
                            Text(w("moderation.flagHint")).font(.footnote)
                            HStack {
                                Button(w("moderation.human")) { Task { await flag(f, "cleared") } }
                                Button(w("moderation.automated")) { Task { await flag(f, "confirmed") } }
                            }
                            .buttonStyle(.bordered)
                        }
                    }
                }
            }
            if !appeals.isEmpty {
                Section(w("moderation.appeals")) {
                    ForEach(appeals) { a in
                        VStack(alignment: .leading, spacing: 6) {
                            Text(appealLine(a)).font(.footnote)
                            Text(a.content ?? w("moderation.gone"))
                            Text(w("moderation.theirAppeal", ["message": a.message])).italic()
                            HStack {
                                Button(w("moderation.uphold")) { Task { await decideAppeal(a, "uphold") } }.buttonStyle(.bordered)
                                Button(w("moderation.overturn")) { Task { await decideAppeal(a, "overturn") } }.buttonStyle(.borderedProminent)
                            }
                        }
                    }
                }
            }
            Section(w("moderation.queue")) {
                if items?.isEmpty == true { Text(w("moderation.empty")).foregroundStyle(.secondary) }
                ForEach(items ?? []) { item in row(item) }
            }
        }
        .overlay { if items == nil && error == nil { ProgressView() } }
        .navigationTitle(w("profile.moderation"))
        .refreshable { await load() }
        .task { await load() }
    }

    private func appealLine(_ a: Appeal) -> String {
        var s = w("moderation.removedFor", ["target": w("moderation.target.\(a.target_type)"), "rule": rule(a.rule ?? "other")])
        if let until = a.suspended_until { s += " · " + w("moderation.suspendedUntil", ["date": staffDate(until)]) }
        return s
    }

    @ViewBuilder private func row(_ item: ModerationItem) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("\(w("moderation.target.\(item.target_type)")) · \(w("moderation.source.\(item.source)")) · \(staffDate(item.created_at))")
                .font(.footnote.bold())
            Text(item.content ?? w("moderation.gone"))
            if let reason = item.reason { Text(w("moderation.why", ["reason": reason])).font(.footnote).foregroundStyle(.red) }
            if let h = item.history { Text(Moderation.goldfish(h, words: w)).font(.footnote) }
            if item.source == "crisis" {
                // Someone may be in danger: reach out and keep it up; remove only method details. Never suspend.
                AdaptiveStack {
                    Button(w("moderation.reachedOut")) { Task { await decide(item, .reachedOut) } }.buttonStyle(.bordered)
                    Button(w("moderation.removeMethod")) { Task { await decide(item, .removeMethod) } }.buttonStyle(.borderedProminent)
                }
            } else {
                Picker(w("moderation.ruleBroken"), selection: Binding(get: { rules[item.id] ?? "other" }, set: { rules[item.id] = $0 })) {
                    ForEach(Moderation.ruleChoices(features: model.features), id: \.self) { Text(rule($0)).tag($0) }
                }
                AdaptiveStack {
                    Button(w("moderation.keep")) { Task { await decide(item, .keep) } }.buttonStyle(.bordered)
                    Button(w("moderation.remove")) { Task { await decide(item, .remove(rules[item.id] ?? "other")) } }.buttonStyle(.borderedProminent)
                }
                Button(w("moderation.removeSuspend"), role: .destructive) { Task { await decide(item, .removeAndSuspend(rules[item.id] ?? "other")) } }
                    .buttonStyle(.bordered)
            }
            if model.features["legalReview"] {
                if escalated.contains(item.id) {
                    Text(w("moderation.escalated")).font(.footnote)
                } else {
                    Button(w("moderation.escalate")) { Task { if await staffRun($error, { _ = try await model.store.api.escalate(item) }) { escalated.insert(item.id) } } }
                        .font(.footnote)
                }
            }
        }
        .padding(.vertical, 4)
    }

    private func load() async {
        _ = await staffRun($error) {
            async let q = model.store.api.moderationQueue()
            async let a = model.store.api.appeals()
            async let f = model.store.api.activityFlags()
            let (queue, appealList, flagList) = try await (q, a, f)
            items = queue
            appeals = appealList
            flags = flagList
        }
    }

    private func decide(_ item: ModerationItem, _ d: ModerationDecision) async {
        if await staffRun($error, { _ = try await model.store.api.decide(item.id, d) }) { items?.removeAll { $0.id == item.id } }
    }

    private func decideAppeal(_ a: Appeal, _ action: String) async {
        if await staffRun($error, { _ = try await model.store.api.decideAppeal(a.id, action: action) }) { appeals.removeAll { $0.id == a.id } }
    }

    private func flag(_ f: ActivityFlag, _ status: String) async {
        if await staffRun($error, { _ = try await model.store.api.decideActivityFlag(f.id, status: status) }) { flags.removeAll { $0.id == f.id } }
    }
}

// MARK: - Announcements

/// Post a banner (one line) or a notice (title and text) to every member, at the top of their
/// feed until they dismiss it.
struct AnnouncementsAdminView: View {
    @Environment(AppModel.self) private var model
    @State private var items: [Announcement]?
    @State private var kind = "banner"
    @State private var title = ""
    @State private var text = ""
    @State private var hours = ""
    @State private var busy = false
    @State private var notice: String?
    @State private var error: String?

    private var w: Words { model.words }
    private var ready: NewAnnouncement? { NewAnnouncement(kind: kind, title: title, body: text, hours: hours) }

    var body: some View {
        List {
            Section { Text(w("announcementsAdmin.intro")) }
            if let error { Section { Text(error).foregroundStyle(.red) } }
            if let notice { Section { Text(notice) } }
            Section(w("announcementsAdmin.new")) {
                Picker(w("announcementsAdmin.new"), selection: $kind) {
                    Text(w("announcementsAdmin.kind.banner")).tag("banner")
                    Text(w("announcementsAdmin.kind.notice")).tag("notice")
                }
                .pickerStyle(.segmented)
                Text(w("announcementsAdmin.kindHint.\(kind)")).font(.footnote)
                TextField(w("announcementsAdmin.titleEn"), text: $title)
                    .onChange(of: title) { _, new in if new.count > 120 { title = String(new.prefix(120)) } }
                if kind == "notice" {
                    TextField(w("announcementsAdmin.bodyEn"), text: $text, axis: .vertical)
                        .lineLimit(2...8)
                        .onChange(of: text) { _, new in if new.count > 1000 { text = String(new.prefix(1000)) } }
                }
                TextField(w("announcementsAdmin.hours"), text: $hours, prompt: Text(w("announcementsAdmin.untilEnded"))).keyboardType(.numberPad)
                Button(w("announcementsAdmin.post")) { Task { await post() } }.disabled(ready == nil || busy)
            }
            Section(w("announcementsAdmin.posts")) {
                if items?.isEmpty == true { Text(w("announcementsAdmin.empty")).foregroundStyle(.secondary) }
                ForEach(items ?? []) { a in
                    VStack(alignment: .leading, spacing: 4) {
                        Text("\(w("announcementsAdmin.kind.\(a.kind)")) · \(w(a.active == true ? "announcementsAdmin.live" : "announcementsAdmin.ended")) · \(w("announcementsAdmin.dismissals", count: a.dismissals ?? 0))")
                            .font(.footnote)
                        Text(a.title).bold()
                        if !a.body.isEmpty { Text(a.body) }
                        Text(staffDate(a.createdAt) + (a.endsAt.map { " · " + w(a.active == true ? "announcementsAdmin.endsAt" : "announcementsAdmin.endedAt", ["date": staffDate($0)]) } ?? ""))
                            .font(.footnote).foregroundStyle(.secondary)
                        if a.active == true {
                            Button(w("announcementsAdmin.end", ["title": a.title]), role: .destructive) { Task { await end(a) } }.font(.footnote)
                        }
                    }
                }
            }
        }
        .navigationTitle(w("announcementsAdmin.title"))
        .refreshable { await load() }
        .task { await load() }
    }

    private func load() async { _ = await staffRun($error) { items = try await model.store.api.announcements() } }

    private func post() async {
        guard let ready else { return }
        busy = true
        defer { busy = false }
        if await staffRun($error, { _ = try await model.store.api.createAnnouncement(ready) }) {
            notice = w("announcementsAdmin.posted")
            title = ""
            text = ""
            hours = ""
            await load()
        }
    }

    private func end(_ a: Announcement) async {
        if await staffRun($error, { _ = try await model.store.api.endAnnouncement(a.id) }) {
            notice = w("announcementsAdmin.endedNotice")
            await load()
        }
    }
}

// MARK: - Invite codes

/// Invite-only sign-up, new codes (optionally for a community), and each code's share, email
/// and revoke.
struct InvitesView: View {
    @Environment(AppModel.self) private var model
    @State private var list: InviteList?
    @State private var communities: [CommunityChoice] = []
    @State private var note = ""
    @State private var community = ""
    @State private var maxUses = "1"
    @State private var days = ""
    @State private var count = "1"
    @State private var emailing: Invite?
    @State private var busy = false
    @State private var notice: String?
    @State private var error: String?

    private var w: Words { model.words }
    private var ready: NewInvites? { NewInvites(note: note, community: community, maxUses: maxUses, days: days, count: count) }

    var body: some View {
        List {
            Section { Text(w("invites.intro")) }
            if let error { Section { Text(error).foregroundStyle(.red) } }
            if let notice { Section { Text(notice) } }
            if let list {
                Section {
                    Toggle(isOn: Binding(get: { list.inviteOnly }, set: { on in Task { await setInviteOnly(on) } })) {
                        Text(w("invites.inviteOnly"))
                        Text(w("invites.inviteOnlyHint"))
                    }
                }
            }
            Section(w("invites.new")) {
                TextField(w("invites.note"), text: $note, prompt: Text(w("invites.notePlaceholder")))
                if !communities.isEmpty {
                    Picker(w("invites.community"), selection: $community) {
                        Text(w("invites.communityDefault")).tag("")
                        ForEach(communities) { Text($0.name).tag($0.slug) }
                    }
                }
                LabeledContent(w("invites.maxUses")) { TextField("1", text: $maxUses).keyboardType(.numberPad).multilineTextAlignment(.trailing) }
                LabeledContent(w("invites.expiresInDays")) {
                    TextField(w("invites.never"), text: $days).keyboardType(.numberPad).multilineTextAlignment(.trailing)
                }
                LabeledContent(w("invites.count")) { TextField("1", text: $count).keyboardType(.numberPad).multilineTextAlignment(.trailing) }
                if ready == nil { Text(w("invites.limits")).font(.footnote) }
                Button(w("invites.create")) { Task { await create() } }.disabled(ready == nil || busy)
            }
            Section(w("invites.codes")) {
                if list?.invites.isEmpty == true { Text(w("invites.empty")).foregroundStyle(.secondary) }
                ForEach(list?.invites ?? []) { i in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(i.code).font(.body.monospaced().bold()).textSelection(.enabled)
                        if !i.note.isEmpty { Text(i.note) }
                        if let c = i.community { Text(w("invites.joins", ["name": c.name])).font(.footnote) }
                        Text(statusLine(i)).font(.footnote).foregroundStyle(.secondary)
                        if i.status == "active" {
                            HStack {
                                ShareLink(item: i.shareMessage(words: w)) { Text(w("invites.share")) }
                                Button(w("invites.email")) { emailing = i }
                                Spacer()
                                Button(w("invites.revokeCode", ["code": i.code]), role: .destructive) { Task { await revoke(i) } }
                            }
                            .buttonStyle(.borderless)
                            .font(.footnote)
                        }
                    }
                }
            }
        }
        .navigationTitle(w("invites.title"))
        .refreshable { await load() }
        .task { await load() }
        .sheet(item: $emailing) { i in
            EmailInviteSheet(invite: i) { email in
                notice = w("invites.sent", ["email": email])
                emailing = nil
            }
        }
    }

    private func statusLine(_ i: Invite) -> String {
        var s = "\(w("invites.status.\(i.status)")) · \(w("invites.used", ["uses": "\(i.uses)", "max": "\(i.maxUses)"]))"
        if let e = i.expiresAt { s += " · " + w("invites.expires", ["date": staffDate(e)]) }
        return s
    }

    private func load() async {
        _ = await staffRun($error) { list = try await model.store.api.invites() }
        communities = (try? await model.store.api.adminCommunities()) ?? []
    }

    private func setInviteOnly(_ on: Bool) async {
        if await staffRun($error, { _ = try await model.store.api.setInviteOnly(on) }) {
            notice = w(on ? "invites.nowOn" : "invites.nowOff")
            await load()
        }
    }

    private func create() async {
        guard let ready else { return }
        busy = true
        defer { busy = false }
        if await staffRun($error, { _ = try await model.store.api.createInvites(ready) }) {
            notice = w("invites.created", count: ready.count)
            note = ""
            await load()
        }
    }

    private func revoke(_ i: Invite) async {
        if await staffRun($error, { _ = try await model.store.api.revokeInvite(i.code) }) {
            notice = w("invites.revoked")
            await load()
        }
    }
}

struct EmailInviteSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let invite: Invite
    let sent: (String) -> Void
    @State private var email = ""
    @State private var message = ""
    @State private var busy = false
    @State private var error: String?

    private var w: Words { model.words }

    var body: some View {
        NavigationStack {
            Form {
                TextField(w("invites.emailTo"), text: $email)
                    .keyboardType(.emailAddress)
                    .textContentType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                TextField(w("invites.emailMessage"), text: $message, axis: .vertical).lineLimit(2...6)
                if let error { Text(error).foregroundStyle(.red) }
            }
            .navigationTitle(w("invites.emailCode", ["code": invite.code]))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(w("common.cancel")) { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(w("invites.send")) { Task { await send() } }.disabled(!email.contains("@") || busy)
                }
            }
        }
    }

    private func send() async {
        busy = true
        defer { busy = false }
        do {
            _ = try await model.store.api.emailInvite(invite.code, to: email, message: message)
            sent(email.trimmingCharacters(in: .whitespaces))
        } catch let e as APIError where e.status == 503 || e.code == "email_off" {
            error = w("invites.emailOff")
        } catch {
            self.error = error.localizedDescription
        }
    }
}

// MARK: - Waitlist

/// People who left an email on the public waitlist page. Invite makes a one-use code for them.
struct WaitlistView: View {
    @Environment(AppModel.self) private var model
    @State private var list: Waitlist?
    @State private var busy = false
    @State private var error: String?

    private var w: Words { model.words }

    var body: some View {
        List {
            Section { Text(w("waitlist.intro")) }
            if list?.enabled == false { Section { Text(w("waitlist.off")) } }
            if let error { Section { Text(error).foregroundStyle(.red) } }
            if list?.entries.isEmpty == true { Section { Text(w("waitlist.empty")).foregroundStyle(.secondary) } }
            ForEach(list?.entries ?? []) { e in
                VStack(alignment: .leading, spacing: 4) {
                    Text(e.email).bold().textSelection(.enabled)
                    if !e.name.isEmpty { Text(e.name) }
                    if !e.note.isEmpty { Text(e.note).font(.footnote) }
                    Text("\(w(e.edition == "open-circle" ? "waitlist.openCircle" : "waitlist.prayerTower")) · \(staffDate(e.createdAt))").font(.footnote)
                    if let code = e.inviteCode {
                        Text(w("waitlist.invited", ["code": code])).textSelection(.enabled)
                    } else {
                        HStack {
                            Button(w("waitlist.invite")) { Task { await run { _ = try await model.store.api.inviteFromWaitlist(e.id) } } }
                            Button(w("waitlist.remove"), role: .destructive) { Task { await run { _ = try await model.store.api.removeFromWaitlist(e.id) } } }
                        }
                        .buttonStyle(.bordered)
                        .disabled(busy)
                    }
                }
            }
        }
        .navigationTitle(w("waitlist.title"))
        .refreshable { await load() }
        .task { await load() }
    }

    private func load() async { _ = await staffRun($error) { list = try await model.store.api.waitlist() } }

    private func run(_ call: () async throws -> Void) async {
        busy = true
        defer { busy = false }
        if await staffRun($error, call) { await load() }
    }
}

// MARK: - Feedback

/// What testers sent from Me → Send feedback: tag each item by type, set how serious it is, add
/// a staff note and mark it handled.
struct FeedbackTriageView: View {
    @Environment(AppModel.self) private var model
    @State private var items: [FeedbackItem]?
    @State private var status = "open"
    @State private var tag = ""
    @State private var notes: [String: String] = [:]
    @State private var notice: String?
    @State private var error: String?

    private var w: Words { model.words }

    var body: some View {
        List {
            Section { Text(w("feedbackTriage.intro")) }
            Section {
                Picker(w("feedbackTriage.show"), selection: $status) {
                    ForEach(["open", "closed", "all"], id: \.self) { Text(w("feedbackTriage.status.\($0)")).tag($0) }
                }
                .pickerStyle(.segmented)
                Picker(w("feedbackTriage.type"), selection: $tag) {
                    Text(w("feedbackTriage.anyTag")).tag("")
                    ForEach(FeedbackTriage.tags, id: \.self) { Text(w("feedbackTriage.tag.\($0)")).tag($0) }
                }
            }
            if let error { Section { Text(error).foregroundStyle(.red) } }
            if let notice { Section { Text(notice) } }
            if items?.isEmpty == true { Section { Text(w("feedbackTriage.empty")).foregroundStyle(.secondary) } }
            ForEach(items ?? []) { f in
                Section {
                    Text(w("admin.feedbackFrom", ["kind": f.kind, "name": f.name])).font(.footnote.bold())
                    Text(f.body).textSelection(.enabled)
                    Text([staffDate(f.createdAt), f.platform, f.appVersion].compactMap { $0 }.joined(separator: " · ")).font(.footnote).foregroundStyle(.secondary)
                    Menu {
                        ForEach(FeedbackTriage.tags, id: \.self) { g in
                            Button {
                                Task { await triage(f, .tags(FeedbackTriage.toggled(f.tags, g))) }
                            } label: {
                                if f.tags.contains(g) { Label(w("feedbackTriage.tag.\(g)"), systemImage: "checkmark") } else { Text(w("feedbackTriage.tag.\(g)")) }
                            }
                        }
                    } label: {
                        LabeledContent(w("feedbackTriage.type"), value: f.tags.map { w("feedbackTriage.tag.\($0)") }.joined(separator: ", "))
                    }
                    Picker(w("feedbackTriage.severity"), selection: Binding(get: { f.severity ?? "" }, set: { s in Task { await triage(f, .severity(s.isEmpty ? nil : s)) } })) {
                        Text("—").tag("")
                        ForEach(FeedbackTriage.severities, id: \.self) { Text(w("feedbackTriage.sev.\($0)")).tag($0) }
                    }
                    TextField(w("feedbackTriage.note"), text: Binding(get: { notes[f.id] ?? f.note ?? "" }, set: { notes[f.id] = $0 }), axis: .vertical)
                    if let n = notes[f.id], n != (f.note ?? "") {
                        Button(w("feedbackTriage.saveNote")) { Task { await triage(f, .note(n), done: w("feedbackTriage.saved")) } }
                    }
                    if f.status == "open" {
                        Button(w("admin.btn.handled")) {
                            Task { if await staffRun($error, { _ = try await model.store.api.closeFeedback(f.id) }) { notice = w("feedbackTriage.closed"); await load() } }
                        }
                    }
                }
            }
        }
        .navigationTitle(w("feedbackTriage.title"))
        .refreshable { await load() }
        .task(id: "\(status)|\(tag)") { await load() }
    }

    private func load() async {
        _ = await staffRun($error) { items = try await model.store.api.feedback(status: status, tag: tag.isEmpty ? nil : tag) }
    }

    private func triage(_ f: FeedbackItem, _ patch: FeedbackPatch, done: String? = nil) async {
        if await staffRun($error, { _ = try await model.store.api.triageFeedback(f.id, patch) }) {
            if case .note = patch { notes[f.id] = nil }
            notice = done
            await load()
        }
    }
}

// MARK: - Error log

/// App crashes and the server's unexpected failures, newest first.
struct ErrorLogView: View {
    @Environment(AppModel.self) private var model
    @State private var errors: [ErrorReport]?
    @State private var status = "open"
    @State private var open: Set<String> = []
    @State private var error: String?

    private var w: Words { model.words }

    var body: some View {
        List {
            Section { Text(w("errorLog.intro")) }
            Section {
                Picker(w("errorLog.show"), selection: $status) {
                    ForEach(["open", "resolved", "all"], id: \.self) { Text(w("errorLog.status.\($0)")).tag($0) }
                }
                .pickerStyle(.segmented)
            }
            if let error { Section { Text(error).foregroundStyle(.red) } }
            if errors?.isEmpty == true { Section { Text(w("errorLog.none")).foregroundStyle(.secondary) } }
            ForEach(errors ?? []) { e in
                VStack(alignment: .leading, spacing: 4) {
                    Text(e.message).bold().textSelection(.enabled)
                    Text(w("errorLog.where", ["source": w("errorLog.source.\(e.source)"), "place": e.place, "count": "\(e.count)"])).font(.footnote)
                    Text(w("errorLog.seen", ["first": staffDate(e.firstSeen), "last": staffDate(e.lastSeen)])).font(.footnote).foregroundStyle(.secondary)
                    if let u = e.lastUser { Text(w("errorLog.lastUser", ["name": u.name])).font(.footnote) }
                    if let detail = e.detail {
                        Button(w(open.contains(e.id) ? "errorLog.hideDetail" : "errorLog.showDetail")) {
                            if open.contains(e.id) { open.remove(e.id) } else { open.insert(e.id) }
                        }
                        .font(.footnote)
                        if open.contains(e.id) { Text(detail).font(.caption.monospaced()).textSelection(.enabled) }
                    }
                    if e.resolvedAt == nil {
                        Button(w("errorLog.resolve")) {
                            Task { if await staffRun($error, { _ = try await model.store.api.resolveError(e.id) }) { await load() } }
                        }
                        .buttonStyle(.bordered)
                    } else {
                        Text(w("errorLog.resolved")).font(.footnote)
                    }
                }
                .buttonStyle(.borderless)
            }
        }
        .navigationTitle(w("errorLog.title"))
        .refreshable { await load() }
        .task(id: status) { await load() }
    }

    private func load() async { _ = await staffRun($error) { errors = try await model.store.api.errorReports(status: status) } }
}

// MARK: - Audit log

/// Every change staff made, newest first. Filters come with the moderation tools switch.
struct AuditLogView: View {
    @Environment(AppModel.self) private var model
    @State private var entries: [AuditEntry]?
    @State private var more = false
    @State private var words = ""
    @State private var moderationOnly = false
    @State private var lastWeek = false
    @State private var error: String?

    private var w: Words { model.words }
    private var filtering: Bool { model.features["moderationTools"] }

    var body: some View {
        List {
            Section { Text(w("auditLog.intro")) }
            if filtering {
                Section {
                    TextField(w("auditLog.filterSearch"), text: $words, prompt: Text(w("auditLog.filterHint")))
                        .onSubmit { Task { await load() } }
                    Toggle(w("auditLog.filterModeration"), isOn: $moderationOnly)
                    Toggle(w("auditLog.filterWeek"), isOn: $lastWeek)
                    Button(w("auditLog.filterApply")) { Task { await load() } }
                }
            }
            if let error { Section { Text(error).foregroundStyle(.red) } }
            if entries?.isEmpty == true { Section { Text(w("auditLog.empty")).foregroundStyle(.secondary) } }
            ForEach(entries ?? []) { e in
                VStack(alignment: .leading, spacing: 2) {
                    Text("\(staffDate(e.created_at)) · \(e.actor_name ?? w("auditLog.deleted"))").font(.footnote)
                    Text(AuditLog.describe(e.action, words: w)).bold()
                    if let t = e.target_id { Text(w("auditLog.target", ["id": String(t.suffix(8))])).font(.footnote).foregroundStyle(.secondary) }
                }
            }
            if more { Button(w("auditLog.more")) { Task { await load(after: entries?.last) } } }
        }
        .navigationTitle(w("auditLog.title"))
        .refreshable { await load() }
        .task { await load() }
    }

    private func load(after: AuditEntry? = nil) async {
        let q = filtering ? AuditLog.query(words: words, moderationOnly: moderationOnly, lastWeek: lastWeek, before: after)
            : AuditLog.query(words: "", moderationOnly: false, lastWeek: false, before: after)
        _ = await staffRun($error) {
            let page = try await model.store.api.auditLog(q)
            entries = after == nil ? page : (entries ?? []) + page
            more = page.count == AuditLog.page
        }
    }
}

// MARK: - Operations

/// Is the background worker running, is the job queue moving, any server errors, and is the radio
/// station checking in. Refreshes every 30 seconds while open.
struct OpsView: View {
    @Environment(AppModel.self) private var model
    @State private var s: OpsStatus?
    @State private var error: String?

    private var w: Words { model.words }

    var body: some View {
        List {
            Section { Text(w("ops.intro")) }
            if let error { Section { Text(error).foregroundStyle(.red) } }
            if let s {
                Section {
                    if s.problems.isEmpty {
                        Label(w("ops.allGood"), systemImage: "checkmark.circle.fill").foregroundStyle(.green)
                    } else {
                        ForEach(s.problems, id: \.self) { Label(w("ops.problem.\($0)"), systemImage: "exclamationmark.triangle.fill").foregroundStyle(.red) }
                    }
                    Text(w("ops.checked", ["when": staffDate(s.checkedAt)])).font(.footnote)
                }
                .accessibilityElement(children: .combine)
                Section(w("ops.server")) { Text(w("ops.database", ["ms": "\(s.database.ms)"])) }
                Section(w("ops.worker")) {
                    Text(w(s.worker.ok ? "ops.ok" : "ops.down")).foregroundStyle(s.worker.ok ? Color.primary : .red)
                    seen(s.worker.lastSeen)
                }
                Section(w("ops.queue")) {
                    Text(w("ops.waiting", count: s.queue.waiting))
                    Text(w("ops.running", count: s.queue.running))
                    if s.queue.overdue > 0 { Text(w("ops.overdue", ["seconds": "\(s.queue.oldestOverdueSeconds)"], count: s.queue.overdue)).foregroundStyle(.red) }
                    if s.queue.failed > 0 { Text(w("ops.failed", count: s.queue.failed)).foregroundStyle(.red) }
                    if s.queue.retrying > 0 { Text(w("ops.retrying", count: s.queue.retrying)) }
                }
                Section(w("ops.errors")) {
                    if s.errors.last24h > 0 {
                        Text(w("ops.errorCounts", ["hour": "\(s.errors.lastHour)", "day": "\(s.errors.last24h)"])).foregroundStyle(s.errors.lastHour > 0 ? Color.red : Color.primary)
                        ForEach(Array(s.errors.recent.enumerated()), id: \.offset) { _, e in
                            Text("\(staffDate(e.at)) · \(e.status) · \(e.method) \(e.route)").font(.footnote)
                        }
                    } else {
                        Text(w("ops.noErrors"))
                    }
                }
                Section(w("ops.radio")) {
                    Text(w("ops.mode.\(s.radio.mode)"))
                    Text(w("ops.radioCounts", ["queued": "\(s.radio.queued)", "sending": "\(s.radio.sending)", "sent": "\(s.radio.sentToday)", "failed": "\(s.radio.failedToday)"]))
                    if let last = s.radio.lastSentAt { Text(w("ops.lastSent", ["when": staffDate(last)])).font(.footnote) }
                    LabeledContent(w("ops.station")) {
                        if let ok = s.radio.station.ok { Text(w(ok ? "ops.ok" : "ops.down")).foregroundStyle(ok ? Color.primary : .red) } else { Text(w("ops.stationNotUsed")) }
                    }
                    if s.radio.station.ok != nil { seen(s.radio.station.lastSeen) }
                }
            }
            Button(w("ops.refresh")) { Task { await load() } }
        }
        .navigationTitle(w("ops.title"))
        .refreshable { await load() }
        .task {
            while !Task.isCancelled {
                await load()
                try? await Task.sleep(for: .seconds(30))
            }
        }
    }

    private func seen(_ at: String?) -> some View {
        Text(at.map { w("ops.lastSeen", ["when": staffDate($0)]) } ?? w("ops.never")).font(.footnote)
    }

    private func load() async { _ = await staffRun($error) { s = try await model.store.api.ops() } }
}
