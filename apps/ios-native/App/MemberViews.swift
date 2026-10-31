import PrayerTowerKit
import SwiftUI

private func longDate(_ iso: String) -> String {
    let d = (try? Date(iso, strategy: Date.ISO8601FormatStyle(includingFractionalSeconds: true))) ?? (try? Date(iso, strategy: .iso8601))
        ?? (try? Date("\(iso)T12:00:00Z", strategy: .iso8601))
    return d?.formatted(date: .long, time: .omitted) ?? iso
}

private func shortDateTime(_ iso: String) -> String {
    let d = (try? Date(iso, strategy: Date.ISO8601FormatStyle(includingFractionalSeconds: true))) ?? (try? Date(iso, strategy: .iso8601))
    return d?.formatted(date: .abbreviated, time: .shortened) ?? iso
}

/// Runs a member call and shows its error.
@MainActor private func attempt(_ failure: Binding<String?>, _ call: () async throws -> Void) async -> Bool {
    do {
        try await call()
        failure.wrappedValue = nil
        return true
    } catch {
        failure.wrappedValue = error.localizedDescription
        return false
    }
}

/// The screen a notice or link opens.
struct RouteView: View {
    @Environment(AppModel.self) private var model
    let route: AppRoute

    var body: some View {
        switch route {
        case .post(let id): PostDetailView(postId: id)
        case .conversation(let id): ConversationScreen(id: id)
        case .event(let id): EventDetailView(id: id)
        case .circle(let id): CircleDetailView(id: id)
        case .person(let id): PersonView(id: id)
        case .care: CareView()
        case .helpStories: HelpStoriesView()
        case .highlights: HighlightsView()
        case .moderation: ModerationView()
        case .ops: OpsView()
        case .notificationSettings: NotificationSettingsView()
        case .accountSecurity: AccountSecurityView()
        case .prayerMinute: PrayerMinuteView()
        case .prayerList: PrayerListView()
        case .give: GiveView()
        case .me, .circles, .feed, .unsupported:
            ContentUnavailableView(model.words("notices.empty"), systemImage: "bell")
        }
    }
}

// MARK: - Welcome questions and tour

/// The first screen after sign-up: why the member is here, the support they want and offer, and
/// who they will pray for. Finishing it opens the app.
struct OnboardingView: View {
    @Environment(AppModel.self) private var model
    @State private var whyHere: [String] = []
    @State private var wanted: [String] = []
    @State private var offered: [String] = []
    @State private var scope: [String] = []
    @State private var traumaOptOut = false
    @State private var anonymous = false
    @State private var busy = false
    @State private var error: String?

    private var w: Words { model.words }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    let name = model.me?.profile.displayName ?? ""
                    Text(name.isEmpty ? w("onboarding.welcome") : w("onboarding.welcomeName", ["name": name])).font(.title2.bold())
                    Text(w("onboarding.intro"))
                }
                chips(w("onboarding.whyHere"), Onboarding.whyHere, $whyHere) { w("enums.whyHere.\($0)") }
                chips(w("onboarding.supportWanted"), Onboarding.support, $wanted) { w("onboarding.support.\($0)") }
                chips(w("onboarding.supportOffered"), Onboarding.support, $offered) { w("onboarding.support.\($0)") }
                chips(w("onboarding.scope"), Onboarding.scopes, $scope) { w("onboarding.scopes.\($0)") }
                Section {
                    Toggle(isOn: $traumaOptOut) { Text(w("settings.traumaOptOut")); Text(w("settings.traumaOptOutHint")) }
                    Toggle(isOn: $anonymous) { Text(w("settings.anonymous")); Text(w("settings.anonymousHint")) }
                }
                if let error { Section { Text(error).foregroundStyle(.red) } }
                Button(w("onboarding.start")) { Task { await save() } }.disabled(busy)
            }
            .onAppear {
                let p = model.me?.profile
                whyHere = p?.whyHere ?? []
                wanted = p?.supportWanted ?? []
                offered = p?.supportOffered ?? []
                scope = p?.prayForScope ?? []
                traumaOptOut = p?.traumaContentOptOut ?? false
                anonymous = p?.anonymousByDefault ?? false
            }
        }
    }

    private func chips(_ title: String, _ all: [String], _ picked: Binding<[String]>, label: @escaping (String) -> String) -> some View {
        Section(title) {
            ForEach(all, id: \.self) { item in
                Button {
                    picked.wrappedValue = Onboarding.toggled(picked.wrappedValue, item)
                } label: {
                    HStack {
                        Text(label(item)).foregroundStyle(.primary)
                        Spacer()
                        if picked.wrappedValue.contains(item) { Image(systemName: "checkmark").foregroundStyle(.tint) }
                    }
                }
                .accessibilityAddTraits(picked.wrappedValue.contains(item) ? .isSelected : [])
            }
        }
    }

    private func save() async {
        busy = true
        defer { busy = false }
        let patch = Onboarding.patch(whyHere: whyHere, wanted: wanted, offered: offered, scope: scope, traumaOptOut: traumaOptOut, anonymous: anonymous)
        if await attempt($error, { _ = try await model.store.api.updateMe(patch) }) { await model.loadSettings() }
    }
}

/// Five short cards on how Prayer Tower works. Shown once after the welcome questions, and any
/// time from Me.
struct TourView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var step = 0

    private var w: Words { model.words }

    var body: some View {
        let s = Tour.steps[step]
        let last = step == Tour.steps.count - 1
        VStack(spacing: 24) {
            HStack {
                Text(w("tour.progress", ["n": "\(step + 1)", "total": "\(Tour.steps.count)"])).font(.footnote)
                Spacer()
                if !last { Button(w("tour.skip")) { finish() } }
            }
            Spacer()
            VStack(alignment: .leading, spacing: 12) {
                Text(Tour.icon(s, wording: model.wording)).font(.largeTitle).accessibilityHidden(true)
                Text(w("tour.\(s.key)Title")).font(.title.bold()).accessibilityAddTraits(.isHeader)
                Text(w("tour.\(s.key)Body")).font(.title3)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding()
            .background(.background.secondary, in: .rect(cornerRadius: 16))
            Spacer()
            HStack {
                if step > 0 { Button(w("tour.back")) { step -= 1 }.buttonStyle(.bordered) }
                Spacer()
                Button(w(last ? "tour.start" : "tour.next")) { if last { finish() } else { step += 1 } }.buttonStyle(.borderedProminent)
            }
        }
        .padding()
    }

    private func finish() {
        if let id = model.me?.profile.id { Tour.markSeen(id) }
        model.showTour = false
        dismiss()
    }
}

// MARK: - Notices

struct NotificationsView: View {
    @Environment(AppModel.self) private var model
    @State private var items: [AppNotification]?
    @State private var route: AppRoute?
    @State private var appealing: Appealing?
    @State private var composing: Draft?
    @State private var commentDraft: CommentDraft?
    @State private var error: String?

    private struct Appealing: Hashable { let id: String; let held: Bool }
    private struct Draft: Identifiable { let id = UUID(); let post: NewPost }
    private struct CommentDraft: Hashable { let postId: String; let body: String }

    private var w: Words { model.words }

    /// false when pushed from Me, inside Me's own NavigationStack.
    var standalone = true

    var body: some View {
        if standalone { NavigationStack { content } } else { content }
    }

    private var content: some View {
        Group {
            List {
                if let error { Text(error).foregroundStyle(.red) }
                if items?.isEmpty == true { Text(w("notices.empty")).foregroundStyle(.secondary) }
                ForEach(items ?? []) { n in
                    VStack(alignment: .leading, spacing: 6) {
                        // A notice with nowhere to go is plain text, not a dimmed button VoiceOver reads as unavailable.
                        if let r = n.route {
                            Button { route = r } label: { noticeText(n).contentShape(.rect) }
                                .buttonStyle(.plain)
                        } else {
                            noticeText(n).accessibilityElement(children: .combine)
                        }
                        AdaptiveStack {
                            if let item = n.appealItem { Button(w("notices.appeal")) { appealing = Appealing(id: item, held: false) } }
                            if let item = n.pathBackItem { Button(w("pathBack.again")) { Task { await postAgain(item) } } }
                            if let item = n.explainItem { Button(w("notices.explain")) { appealing = Appealing(id: item, held: true) } }
                        }
                        .buttonStyle(.bordered)
                        .font(.footnote)
                    }
                }
            }
            .overlay { if items == nil && error == nil { ProgressView() } }
            .navigationTitle(w("tabs.notices"))
            .appLogo()
            .navigationDestination(item: $route) { RouteView(route: $0) }
            .navigationDestination(item: $appealing) { AppealView(itemId: $0.id, held: $0.held) }
            .navigationDestination(item: $commentDraft) { PostDetailView(postId: $0.postId, draft: $0.body) }
            .sheet(item: $composing) { d in ComposeView(start: d.post) }
            .refreshable { await load() }
            .task { await load() }
        }
    }

    private func noticeText(_ n: AppNotification) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(n.title).font(n.read_at == nil ? .body.bold() : .body)
            Text(n.body)
            Text(shortDateTime(n.created_at)).font(.footnote).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func load() async {
        _ = await attempt($error) {
            let list = try await model.store.api.notifications()
            items = list
            let unread = list.filter { $0.read_at == nil }.map(\.id)
            if !unread.isEmpty { _ = try? await model.store.api.markRead(unread) }
        }
    }

    /// A path back after a removal: the author's own words open to change and share again.
    private func postAgain(_ itemId: String) async {
        _ = await attempt($error) {
            let r = try await model.store.api.removedWords(itemId)
            if r.target == "post" {
                var p = NewPost()
                p.body = r.body
                if r.postType == "praise" { p.postType = "praise" }
                composing = Draft(post: p)
            } else if let postId = r.postId {
                commentDraft = CommentDraft(postId: postId, body: r.body)
            }
        }
    }
}

// MARK: - Appeals and feedback

/// Appeal a moderation decision on your own content, or explain a post waiting for review.
struct AppealView: View {
    @Environment(AppModel.self) private var model
    let itemId: String
    var held = false
    @State private var message = ""
    @State private var sent = false
    @State private var busy = false
    @State private var error: String?

    private var w: Words { model.words }

    var body: some View {
        Form {
            if sent {
                Text(w(held ? "appeal.heldSent" : "appeal.sent"))
            } else {
                Text(w(held ? "appeal.heldIntro" : "appeal.intro"))
                TextField(w("appeal.reason"), text: $message, axis: .vertical)
                    .lineLimit(3...10)
                    .onChange(of: message) { _, new in if new.count > 1000 { message = String(new.prefix(1000)) } }
                if let error { Text(error).foregroundStyle(.red) }
                Button(w("appeal.send")) {
                    Task {
                        busy = true
                        sent = await attempt($error) { _ = try await model.store.api.appeal(itemId, message: message) }
                        busy = false
                    }
                }
                .disabled(busy || message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
            NavigationLink(w("appeal.rules")) { RulesView() }
        }
        .navigationTitle(w(held ? "appeal.heldTitle" : "appeal.title"))
    }
}

/// Tell us what's broken, confusing or worth adding. Admins read it in Feedback.
struct FeedbackView: View {
    @Environment(AppModel.self) private var model
    @State private var kind = "bug"
    @State private var text = ""
    @State private var sent = false
    @State private var busy = false
    @State private var error: String?

    private var w: Words { model.words }

    var body: some View {
        Form {
            Text(w("feedback.intro"))
            Picker(w("feedback.label"), selection: $kind) {
                ForEach(["bug", "idea", "other"], id: \.self) { Text(w("feedback.kinds.\($0)")).tag($0) }
            }
            .pickerStyle(.segmented)
            TextField(w(kind == "bug" ? "feedback.bugPlaceholder" : "feedback.placeholder"), text: $text, axis: .vertical)
                .lineLimit(4...12)
                .accessibilityLabel(w("feedback.label"))
                .onChange(of: text) { _, new in
                    sent = false
                    if new.count > 2000 { text = String(new.prefix(2000)) }
                }
            if let error { Text(error).foregroundStyle(.red) }
            if sent { Text(w("feedback.sent")).foregroundStyle(.tint) }
            Button(w("actions.send")) { Task { await send() } }
                .disabled(busy || text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
        .navigationTitle(w("profile.feedback"))
    }

    private func send() async {
        busy = true
        defer { busy = false }
        let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String
        if await attempt($error, { _ = try await model.store.api.sendFeedback(kind: kind, body: text, appVersion: version) }) {
            sent = true
            text = ""
        }
    }
}

// MARK: - Rules, legal links and safety

struct RulesView: View {
    @Environment(AppModel.self) private var model
    private var w: Words { model.words }

    var body: some View {
        List {
            ForEach(0..<9, id: \.self) { i in rule("rulesPage.items.\(i)") }
            if model.features["pressureRule"] { rule("rulesPage.pressure") }
            if model.features["misleadingRule"] { rule("rulesPage.misleading") }
            if model.features["automationRule"] { rule("rulesPage.automation") }
            Section {
                Text(w("rulesPage.howTo"))
                LegalLinksView(prefix: w("rulesPage.partOf"))
            }
        }
        .navigationTitle(w("profile.rules"))
    }

    private func rule(_ key: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(w("\(key).title")).font(.headline)
            Text(w("\(key).body"))
        }
    }
}

/// The terms of use, privacy policy and contact address (Config.xcconfig: PT_TERMS_URL, …).
struct LegalLinksView: View {
    @Environment(AppModel.self) private var model
    let prefix: String

    var body: some View {
        let info = Bundle.main.infoDictionary ?? [:]
        let terms = (info["PTTermsURL"] as? String).flatMap(URL.init(string:))
        let privacy = (info["PTPrivacyURL"] as? String).flatMap(URL.init(string:))
        let email = (info["PTSupportEmail"] as? String) ?? ""
        VStack(alignment: .leading, spacing: 6) {
            Text(prefix).font(.footnote)
            if let terms, terms.scheme != nil { Link(model.words("legal.terms"), destination: terms).font(.footnote) }
            if let privacy, privacy.scheme != nil { Link(model.words("legal.privacy"), destination: privacy).font(.footnote) }
            if !email.isEmpty, let mail = URL(string: "mailto:\(email)") { Link(email, destination: mail).font(.footnote) }
        }
    }
}

/// How to report, block, mute and hide; who and what the member blocked, muted or hid (each with
/// an undo); their reports; and where to get help.
struct SafetyCenterView: View {
    @Environment(AppModel.self) private var model
    @State private var s: SafetyCenter?
    @State private var error: String?

    private var w: Words { model.words }

    var body: some View {
        List {
            Section { Text(w("safetyCenter.intro")) }
            if let error { Section { Text(error).foregroundStyle(.red) } }
            Section(w("safetyCenter.toolsTitle")) {
                ForEach(SafetyCenter.tools, id: \.self) { k in
                    VStack(alignment: .leading, spacing: 2) {
                        Text(w("safetyCenter.tools.\(k).name"))
                        Text(w("safetyCenter.tools.\(k).how")).font(.footnote)
                    }
                }
            }
            if let s {
                Section(w("safetyCenter.blocked")) {
                    if s.blocks.isEmpty { Text(w("safetyCenter.noneBlocked")).font(.footnote) }
                    ForEach(s.blocks) { b in undoRow(b.displayName, w("safetyCenter.unblock")) { _ = try await model.store.api.unblock(b.id) } }
                }
                Section(w("safetyCenter.muted")) {
                    if s.mutes.isEmpty { Text(w("safetyCenter.noneMuted")).font(.footnote) }
                    ForEach(s.mutes) { m in undoRow(m.displayName, w("safetyCenter.unmute")) { _ = try await model.store.api.unmute(m.id) } }
                }
                Section(w("safetyCenter.hidden")) {
                    if s.hidden.isEmpty { Text(w("safetyCenter.noneHidden")).font(.footnote) }
                    ForEach(s.hidden) { h in undoRow(h.excerpt, w("safetyCenter.unhide")) { _ = try await model.store.api.unhidePost(h.id) } }
                }
                Section(w("safetyCenter.reports")) {
                    if s.reports.isEmpty { Text(w("safetyCenter.noneReports")).font(.footnote) }
                    ForEach(s.reports) { r in
                        Text(w("safetyCenter.reportRow", [
                            "what": w("safetyCenter.kinds.\(r.targetType)"),
                            "when": longDate(r.createdAt),
                            "status": w(r.reviewed ? "safetyCenter.reviewed" : "safetyCenter.waiting"),
                        ]))
                        .font(.footnote)
                    }
                }
            }
            Section(w("safetyCenter.helpTitle")) {
                Text(w("safetyCenter.danger"))
                CrisisBox()
            }
        }
        .overlay { if s == nil && error == nil { ProgressView() } }
        .navigationTitle(w("safetyCenter.title"))
        .refreshable { await load() }
        .task { await load() }
    }

    private func undoRow(_ label: String, _ action: String, _ call: @escaping () async throws -> Void) -> some View {
        HStack {
            Text(label).lineLimit(2)
            Spacer()
            Button(action) { Task { if await attempt($error, call) { await load() } } }.buttonStyle(.bordered)
        }
    }

    private func load() async { _ = await attempt($error) { s = try await model.store.api.safetyCenter() } }
}

// MARK: - Someone's profile

/// Who they are, follow, message, block or mute, and the requests they posted under their name.
struct PersonView: View {
    @Environment(AppModel.self) private var model
    let id: String
    @State private var page: PersonPage?
    @State private var writing = false
    @State private var message = ""
    @State private var blocked = false
    @State private var muted = false
    @State private var conversation: String?
    @State private var opened: String?
    @State private var error: String?

    private var w: Words { model.words }

    var body: some View {
        List {
            if let error { Text(error).foregroundStyle(.red) }
            if let p = page?.person {
                Section {
                    Text(p.displayName).font(.title2.bold())
                    if let pastor = p.pastor { Text("✝ \(pastor.title) · \(pastor.church)").font(.subheadline) }
                    if p.squire == true { Text(w("squire.badge")).font(.subheadline) }
                    if !p.whyHere.isEmpty { Text(p.whyHere.map { w("enums.whyHere.\($0)") }.joined(separator: " · ")) }
                    Text("\(p.followers) \(p.followers == 1 ? "follower" : "followers")").font(.footnote)
                    Button(w(p.following ? "person.following" : "person.follow")) {
                        Task { if await attempt($error, { _ = try await (p.following ? model.store.api.unfollow(p.id) : model.store.api.follow(p.id)) }) { await load() } }
                    }
                    if writing {
                        TextField(w("person.writeTo", ["name": p.displayName]), text: $message, axis: .vertical).lineLimit(2...6)
                        HStack {
                            Button(w("actions.send")) { Task { await send(p) } }.disabled(message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                            Button(w("common.cancel")) { writing = false }
                        }
                        .buttonStyle(.bordered)
                    } else {
                        Button(w("person.message")) { writing = true }
                    }
                }
                Section {
                    Button(w(blocked ? "person.unblock" : "person.block", ["name": p.displayName]), role: blocked ? nil : .destructive) {
                        Task {
                            if await attempt($error, { _ = try await (blocked ? model.store.api.unblock(id) : model.store.api.block(id)) }) {
                                blocked.toggle()
                                await load()
                            }
                        }
                    }
                    if blocked { Text(w("person.blockedNote")).font(.footnote) }
                    if model.features["safetyCenter"] && !blocked {
                        Button(w(muted ? "safetyCenter.unmuteName" : "safetyCenter.muteName", ["name": p.displayName])) {
                            Task { if await attempt($error, { _ = try await (muted ? model.store.api.unmute(id) : model.store.api.mute(id)) }) { muted.toggle() } }
                        }
                        if muted { Text(w("safetyCenter.mutedNote")).font(.footnote) }
                    }
                }
                Section {
                    if page?.posts.isEmpty == true { Text(w("person.noPosts", ["name": p.displayName])).foregroundStyle(.secondary) }
                    ForEach(page?.posts ?? []) { c in
                        Button { opened = c.id } label: {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(w("enums.postType.\(c.postType)")).font(.footnote)
                                Text(c.preview)
                            }
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
        .overlay { if page == nil && error == nil { ProgressView() } }
        .navigationTitle(page?.person.displayName ?? "")
        .navigationDestination(item: $opened) { PostDetailView(postId: $0) }
        .navigationDestination(item: $conversation) { ConversationScreen(id: $0) }
        .refreshable { await load() }
        .task {
            await load()
            if model.features["safetyCenter"] { muted = (try? await model.store.api.isMuted(id)) ?? false }
        }
    }

    private func load() async { _ = await attempt($error) { page = try await model.store.api.person(id) } }

    private func send(_ p: Person) async {
        _ = await attempt($error) {
            conversation = try await model.store.api.messagePerson(p.id, body: message)
            message = ""
            writing = false
        }
    }
}

// MARK: - Look-backs

/// Answered & remembered: the member's own answered requests with a grateful word, opened when
/// they choose. Any item can be hidden.
struct RememberedView: View {
    @Environment(AppModel.self) private var model
    @State private var items: [RememberedItem]?
    @State private var opened: String?
    @State private var error: String?

    private var w: Words { model.words }

    var body: some View {
        List {
            Section { Text(w("practices.rememberedIntro")) }
            if let error { Text(error).foregroundStyle(.red) }
            if items?.isEmpty == true { Text(w("practices.rememberedEmpty")).foregroundStyle(.secondary) }
            ForEach(items ?? []) { i in
                VStack(alignment: .leading, spacing: 6) {
                    Text(w("practices.rememberedAnswered", ["date": longDate(i.answeredAt)])).font(.footnote)
                    Button(i.body) { opened = i.id }.buttonStyle(.plain)
                    if let t = i.testimony { Text(t).italic() }
                    Button(w("practices.rememberedHide")) {
                        Task { _ = await attempt($error) { items = try await model.store.api.hideRemembered(i.id) } }
                    }
                    .font(.footnote)
                    .buttonStyle(.borderless)
                }
            }
        }
        .overlay { if items == nil && error == nil { ProgressView() } }
        .navigationTitle(w("practices.rememberedTitle"))
        .navigationDestination(item: $opened) { PostDetailView(postId: $0) }
        .task { _ = await attempt($error) { items = try await model.store.api.remembered() } }
    }
}

/// This week's and last week's examples of members lifting each other up, and anything the
/// member was asked to share.
struct HighlightsView: View {
    @Environment(AppModel.self) private var model
    @State private var h: KindnessHighlights?
    @State private var asks: HighlightAsks?
    @State private var error: String?

    private var w: Words { model.words }

    var body: some View {
        List {
            Section { Text(w("highlightsKind.intro")) }
            if let error { Text(error).foregroundStyle(.red) }
            if h?.enabled == true && h?.weeks.isEmpty == true { Text(w("highlightsKind.empty")).foregroundStyle(.secondary) }
            ForEach(h?.weeks ?? []) { week in
                Section(w("highlightsKind.weekOf", ["date": longDate(week.week)])) {
                    ForEach(week.items) { Text("“\($0.text)”").italic() }
                }
            }
            if let asks, !asks.asks.isEmpty {
                Section(w("highlightsKind.askedTitle")) {
                    ForEach(asks.asks) { a in
                        VStack(alignment: .leading, spacing: 6) {
                            Text("“\(a.body)”").italic()
                            if a.status == "asked" {
                                Text(w("highlightsKind.askedQuestion")).font(.footnote)
                                HStack {
                                    Button(w("highlightsKind.yes")) { act { try await model.store.api.answerHighlightAsk(a.id, yes: true) } }.buttonStyle(.borderedProminent)
                                    Button(w("highlightsKind.no")) { act { try await model.store.api.answerHighlightAsk(a.id, yes: false) } }.buttonStyle(.bordered)
                                }
                            } else {
                                Text(w(a.status == "picked" ? "highlightsKind.picked" : "highlightsKind.consented")).font(.footnote)
                                Button(w("highlightsKind.withdraw")) { act { try await model.store.api.withdrawHighlight(a.id) } }.buttonStyle(.borderless)
                            }
                        }
                    }
                }
            }
        }
        .overlay { if h == nil && error == nil { ProgressView() } }
        .navigationTitle(w("highlightsKind.title"))
        .task { await load() }
    }

    private func load() async {
        _ = await attempt($error) {
            async let a = model.store.api.kindnessHighlights()
            async let b = model.store.api.highlightAsks()
            let (x, y) = try await (a, b)
            h = x
            asks = y
        }
    }

    private func act(_ call: @escaping () async throws -> HighlightAsks) {
        Task { _ = await attempt($error) { asks = try await call() } }
    }
}

/// Stories of help: what the Witness team did, shared only after the person helped approved the
/// exact words, never with their name.
struct HelpStoriesView: View {
    @Environment(AppModel.self) private var model
    @State private var mine: [WitnessStory] = []
    @State private var shown: HelpStories?
    @State private var error: String?

    private var w: Words { model.words }

    var body: some View {
        List {
            if let error { Text(error).foregroundStyle(.red) }
            if !mine.isEmpty {
                Section {
                    ForEach(mine) { s in
                        VStack(alignment: .leading, spacing: 6) {
                            Text(s.body)
                            Text(w("helpStories.status.\(s.status)")).font(.footnote)
                            HStack {
                                if s.status == "awaiting_consent" { Button(w("helpStories.approve")) { decide(s, true) }.buttonStyle(.borderedProminent) }
                                if s.status != "declined" {
                                    Button(w(s.status == "approved" ? "helpStories.takeBack" : "helpStories.decline")) { decide(s, false) }.buttonStyle(.bordered)
                                }
                            }
                        }
                    }
                } header: {
                    Text(w("helpStories.aboutYou"))
                } footer: {
                    Text(w("helpStories.aboutYouHint"))
                }
            }
            if let shown {
                if shown.enabled {
                    Section {
                        Text(w("helpStories.intro"))
                        if shown.stories.isEmpty { Text(w("helpStories.none")).foregroundStyle(.secondary) }
                        ForEach(shown.stories) { Text($0.body) }
                    }
                } else if mine.isEmpty {
                    Text(w("helpStories.off")).foregroundStyle(.secondary)
                }
            }
        }
        .overlay { if shown == nil && error == nil { ProgressView() } }
        .navigationTitle(w("helpStories.title"))
        .task { await load() }
    }

    private func load() async {
        mine = (try? await model.store.api.myWitnessStories()) ?? []
        _ = await attempt($error) { shown = try await model.store.api.helpStories() }
    }

    private func decide(_ s: WitnessStory, _ approve: Bool) {
        Task { if await attempt($error, { _ = try await model.store.api.decideWitnessStory(s.id, approve: approve) }) { await load() } }
    }
}

// MARK: - Password and email

struct AccountSecurityView: View {
    @Environment(AppModel.self) private var model
    @State private var password = ""
    @State private var again = ""
    @State private var email = ""
    @State private var notice: String?
    @State private var busy = false
    @State private var error: String?

    private var w: Words { model.words }

    var body: some View {
        Form {
            if let current = model.store.email { Text(w("accountSecurity.signedInAs", ["email": current])) }
            if let error { Text(error).foregroundStyle(.red) }
            if let notice { Text(notice) }
            NewPasswordSection(password: $password, again: $again) {
                Task {
                    busy = true
                    if await attempt($error, { try await model.store.setPassword(password) }) {
                        notice = w("accountSecurity.passwordSaved")
                        password = ""
                        again = ""
                    }
                    busy = false
                }
            }
            Section(w("accountSecurity.changeEmail")) {
                TextField(w("accountSecurity.newEmail"), text: $email)
                    .keyboardType(.emailAddress)
                    .textContentType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                Text(w("accountSecurity.emailHint")).font(.footnote)
                Button(w("accountSecurity.saveEmail")) {
                    Task {
                        busy = true
                        if await attempt($error, { try await model.store.changeEmail(email) }) {
                            notice = w("accountSecurity.emailSent")
                            email = ""
                        }
                        busy = false
                    }
                }
                .disabled(busy || !email.contains("@"))
            }
        }
        .navigationTitle(w("accountSecurity.title"))
    }
}

/// A new password typed twice, at least 8 characters.
struct NewPasswordSection: View {
    @Environment(AppModel.self) private var model
    @Binding var password: String
    @Binding var again: String
    let save: () -> Void

    var body: some View {
        let w = model.words
        Section(w("accountSecurity.changePassword")) {
            SecureField(w("accountSecurity.newPassword"), text: $password).textContentType(.newPassword)
            SecureField(w("accountSecurity.passwordAgain"), text: $again).textContentType(.newPassword)
            Text(w("accountSecurity.passwordHint", ["count": "8"])).font(.footnote)
            if !again.isEmpty && again != password { Text(w("accountSecurity.mismatch")).foregroundStyle(.red) }
            Button(w("accountSecurity.savePassword"), action: save).disabled(password.count < 8 || password != again)
        }
    }
}
