import AVFoundation
import PrayerTowerKit
import SwiftUI

// More screens from Me, as the Expo app's awards, branch, podcasts, live, squire-board,
// reading-plan, church, churches and witness screens.

/// Runs a call and shows its error.
@MainActor private func run(_ failure: Binding<String?>, _ call: () async throws -> Void) async {
    do {
        try await call()
        failure.wrappedValue = nil
    } catch {
        failure.wrappedValue = error.localizedDescription
    }
}

private func day(_ iso: String?) -> String {
    guard let iso else { return "" }
    let d = (try? Date(iso, strategy: Date.ISO8601FormatStyle(includingFractionalSeconds: true))) ?? (try? Date(iso, strategy: .iso8601))
    return d?.formatted(date: .abbreviated, time: .omitted) ?? iso
}

/// The links on Me for these screens, each shown while its switch or role allows.
struct ExtrasSection: View {
    @Environment(AppModel.self) private var model
    @State private var canHost = false
    private var w: Words { model.words }

    var body: some View {
        let f = model.features
        let roles = model.me?.roles ?? []
        let faith = model.wording == .faith
        Section {
            NavigationLink(w("vine.branchLink")) { BranchView() }
            if f["podcasts"] && (model.me?.community?.shows("podcasts") ?? true) { NavigationLink(w("podcasts.title")) { PodcastsView() } }
            if canHost { NavigationLink(w("live.open")) { LiveView() } }
            if f["readingPlan"] && faith { NavigationLink(w("readingPlan.title")) { ReadingPlanView() } }
            if f["squireBoard"] { NavigationLink(w("squire.open")) { SquireBoardView() } }
            NavigationLink(w("award.hall")) { AwardHallView() }
            if faith { NavigationLink(w(roles.contains("pastor") ? "profile.myChurch" : "profile.churchApply")) { ChurchView() } }
            if roles.contains(where: { ["witness", "moderator", "admin"].contains($0) }) { NavigationLink(w("profile.witness")) { WitnessView() } }
            if Staff.isAdmin(roles) && faith { NavigationLink(w("admin.churches")) { ChurchReviewView() } }
        }
        .task {
            let live = try? await model.store.api.liveNow()
            canHost = live?.enabled == true && live?.canHost == true
        }
    }
}

// MARK: - Hall, branch, squire board

struct AwardHallView: View {
    @Environment(AppModel.self) private var model
    @State private var hall: AwardHall?
    private var w: Words { model.words }

    var body: some View {
        List {
            Section { Text(w("award.hallIntro")) }
            if let hall, hall.years.isEmpty { Text(w("award.none")).foregroundStyle(.secondary) }
            ForEach(hall?.years ?? []) { y in
                Section(String(y.year)) {
                    ForEach(y.winners, id: \.rank) { p in
                        Text(winner(p))
                    }
                }
            }
        }
        .navigationTitle(w("award.hall"))
        .task { hall = (try? await model.store.api.awardHall()) ?? AwardHall(enabled: false, years: []) }
    }

    private func winner(_ p: AwardHall.Winner) -> String {
        let name: String = p.name ?? w("award.anonymous")
        let line: String = w("award.line", ["people": String(p.peoplePrayedFor)], count: p.prayers)
        return "\(p.rank). \(name) · \(line)"
    }
}

/// Every request the member shared, newest first.
struct BranchView: View {
    @Environment(AppModel.self) private var model
    @State private var cards: [Card]?
    @State private var error: String?
    private var w: Words { model.words }

    var body: some View {
        List {
            Section { Text(w("vine.branchIntro")) }
            if let cards, cards.isEmpty { Text(w("vine.branchEmpty")).foregroundStyle(.secondary) }
            ForEach(cards ?? []) { c in
                NavigationLink { PostDetailView(postId: c.id) } label: {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(c.preview.isEmpty ? c.body : c.preview).lineLimit(4)
                        if c.counts.prayers > 0 { Text(w("card.praying", count: c.counts.prayers)).font(.caption).foregroundStyle(.secondary) }
                    }
                }
            }
            if let error { Text(error).foregroundStyle(.red) }
        }
        .navigationTitle(w("vine.branchTitle"))
        .task { await load() }
        .refreshable { await load() }
    }

    private func load() async { await run($error) { cards = try await model.store.api.myBranch() } }
}

struct SquireBoardView: View {
    @Environment(AppModel.self) private var model
    @State private var board: SquireBoard?
    @State private var error: String?
    private var w: Words { model.words }

    var body: some View {
        List {
            if let board, !board.enabled { Text(w("squire.off")) }
            if let board, board.enabled {
                Section {
                    Text(w("squire.intro", ["days": String(board.days ?? 30)]))
                    if board.canJoin == true {
                        Toggle(isOn: Binding(get: { board.onBoard == true }, set: { on in Task { await run($error) { self.board = try await model.store.api.setSquireBoard(on) } } })) {
                            LabelHint(w("squire.join"), w("squire.joinHint"))
                        }
                    } else {
                        Text(w("squire.anonymous")).font(.footnote)
                    }
                }
                Section {
                    let entries = board.entries ?? []
                    if entries.isEmpty { Text(w("squire.empty")).foregroundStyle(.secondary) }
                    ForEach(entries) { e in
                        NavigationLink { PersonView(id: e.personId) } label: {
                            HStack(spacing: 12) {
                                Text(String(e.rank)).font(.headline).frame(minWidth: 28)
                                VStack(alignment: .leading) {
                                    Text(e.you ? w("squire.you", ["name": e.name]) : e.name).bold()
                                    Text(w("squire.counts", ["people": String(e.peoplePrayedFor)], count: e.prayers)).font(.caption)
                                }
                            }
                        }
                        .listRowBackground(e.you ? Color.accentColor.opacity(0.12) : nil)
                    }
                }
            }
            if let error { Text(error).foregroundStyle(.red) }
        }
        .navigationTitle(w("squire.title"))
        .task { await run($error) { board = try await model.store.api.squireBoard() } }
    }
}

// MARK: - Podcasts and live video

struct PodcastsView: View {
    @Environment(AppModel.self) private var model
    @State private var shows: [PodcastShow]?
    @State private var playing: PodcastEpisode?
    @State private var player: AVPlayer?
    @State private var paused = false
    @State private var error: String?
    private var w: Words { model.words }

    var body: some View {
        List {
            if let playing, let player {
                Section(w("podcasts.nowPlaying")) {
                    Text(playing.title).bold()
                    HStack {
                        Button(w(paused ? "podcasts.resume" : "podcasts.pause")) {
                            if paused { player.play() } else { player.pause() }
                            paused.toggle()
                        }
                        Spacer()
                        Button(w("podcasts.back15")) {
                            let t = max(0, player.currentTime().seconds - 15)
                            player.seek(to: CMTime(seconds: t, preferredTimescale: 600))
                        }
                        Spacer()
                        Button(w("podcasts.close")) { stop() }
                    }
                    .buttonStyle(.borderless)
                }
            }
            if let shows, shows.isEmpty { Text(w("podcasts.empty")).foregroundStyle(.secondary) }
            ForEach(shows ?? []) { s in
                Section {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(s.title).font(.headline)
                        Text(s.author).font(.caption)
                        Text(s.description)
                    }
                    ForEach(s.episodes) { e in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(e.title).bold()
                            if !e.description.isEmpty { Text(e.description).lineLimit(4) }
                            Text([day(e.publishedAt), e.minutes.map { w("podcasts.minutes", count: $0) } ?? ""].filter { !$0.isEmpty }.joined(separator: " · "))
                                .font(.caption).foregroundStyle(.secondary)
                            Button(w("podcasts.play", ["title": e.title])) { play(e) }.buttonStyle(.borderless)
                        }
                    }
                }
            }
            if let error { Text(error).foregroundStyle(.red) }
        }
        .navigationTitle(w("podcasts.title"))
        .task { await run($error) { shows = try await model.store.api.podcasts() } }
        .onDisappear { stop() }
    }

    private func play(_ e: PodcastEpisode) {
        guard let url = URL(string: e.audioUrl) else { return }
        player?.pause()
        try? AVAudioSession.sharedInstance().setCategory(.playback)
        let p = AVPlayer(url: url)
        p.play()
        player = p
        playing = e
        paused = false
    }

    private func stop() {
        player?.pause()
        player = nil
        playing = nil
    }
}

/// Start or join a live room (the video server's, or a pasted Zoom or Meet link).
struct LiveView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.openURL) private var openURL
    @State private var now: LiveNow?
    @State private var title = ""
    @State private var link = ""
    @State private var busy = false
    @State private var error: String?
    private var w: Words { model.words }

    var body: some View {
        Form {
            Section { Text(w("live.intro")) }
            if let now, now.canHost {
                Section {
                    TextField(w("live.roomTitle"), text: $title, prompt: Text(w("live.roomTitlePlaceholder")))
                    TextField(w("live.link"), text: $link).keyboardType(.URL).textInputAutocapitalization(.never)
                    Button(w("live.start")) { Task { await start() } }
                        .disabled(busy || title.trimmingCharacters(in: .whitespaces).isEmpty || (!now.canCreateRoom && link.trimmingCharacters(in: .whitespaces).isEmpty))
                } footer: { Text(w(now.canCreateRoom ? "live.linkHint" : "live.linkNeeded")) }
            }
            Section(w("live.now")) {
                ForEach(now?.rooms ?? []) { r in
                    HStack {
                        VStack(alignment: .leading) {
                            Text(r.title)
                            Text(w("live.by", ["name": r.hostName])).font(.caption)
                        }
                        Spacer()
                        Button(w("live.join")) { if let u = URL(string: r.roomUrl) { openURL(u) } }
                        if r.isMine {
                            Button(w("live.end"), role: .destructive) { Task { await run($error) { _ = try await model.store.api.endLive(r.id) }; await load() } }
                        }
                    }
                    .buttonStyle(.borderless)
                }
            }
            if let error { Text(error).foregroundStyle(.red) }
        }
        .navigationTitle(w("live.title"))
        .task { await load() }
    }

    private func load() async { await run($error) { now = try await model.store.api.liveNow() } }

    private func start() async {
        busy = true
        defer { busy = false }
        await run($error) {
            let url = try await model.store.api.startLive(title: title, link: link)
            title = ""
            link = ""
            if let url { openURL(url) }
        }
        await load()
    }
}

// MARK: - Reading plan

struct ReadingPlanView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.openURL) private var openURL
    @State private var now: ReadingPlanToday?
    @State private var plans: [StaffReadingPlan]?
    @State private var title = ""
    @State private var startsOn = String(Date.now.ISO8601Format().prefix(10))
    @State private var refs = ""
    @State private var error: String?
    private var w: Words { model.words }

    var body: some View {
        Form {
            if model.wording == .neutral {
                Text(w("ai.chatUnavailable"))
            } else {
                if let now, !now.enabled { Text(w("readingPlan.closed")) }
                if let now, now.enabled, now.plan == nil { Text(w("readingPlan.none")) }
                if let plan = now?.plan {
                    Section {
                        Text(w("readingPlan.dayOf", ["title": plan.title, "day": String(plan.day), "days": String(plan.days)])).font(.footnote)
                        if let r = plan.reading {
                            Text(r.reference).font(.title3.bold())
                            Button(w("readingPlan.open")) { if let u = URL(string: r.url) { openURL(u) } }
                            if r.read {
                                Text(w("readingPlan.done"))
                            } else {
                                Button(w("readingPlan.markRead")) { Task { await run($error) { self.now = try await model.store.api.markReadingRead(plan.id) } } }
                            }
                            Text(w("readingPlan.readers", count: r.readers)).font(.caption).foregroundStyle(.secondary)
                        }
                        if let c = plan.conversationId {
                            NavigationLink(w("readingPlan.discuss")) { ConversationScreen(id: c) }
                        }
                    }
                }
                if let plans {
                    Section(w("readingPlan.staffTitle")) {
                        ForEach(plans) { p in
                            HStack {
                                Text("\(p.title) · \(w("readingPlan.planLine", ["startsOn": p.startsOn, "days": String(p.days), "readers": String(p.readers)]))\(p.archived ? " · " + w("readingPlan.archived") : "")")
                                if !p.archived {
                                    Spacer()
                                    Button(w("readingPlan.archive")) { Task { await run($error) { _ = try await model.store.api.archiveReadingPlan(p.id) }; await load() } }
                                        .buttonStyle(.borderless)
                                }
                            }
                        }
                        TextField(w("readingPlan.planTitle"), text: $title)
                        TextField(w("readingPlan.startsOn"), text: $startsOn)
                        TextField(w("readingPlan.references"), text: $refs, prompt: Text("John 1\nJohn 2\nJohn 3"), axis: .vertical).lineLimit(3...12)
                        let references = ReadingPlans.references(refs)
                        Button(w("readingPlan.create", count: references.count)) { Task { await create(references) } }
                            .disabled(title.trimmingCharacters(in: .whitespaces).isEmpty || references.isEmpty || !ReadingPlans.validDate(startsOn))
                    }
                }
            }
            if let error { Text(error).foregroundStyle(.red) }
        }
        .navigationTitle(w("readingPlan.title"))
        .task { await load() }
    }

    private func load() async {
        await run($error) { now = try await model.store.api.readingPlan() }
        // Only admins and pastors can list plans; for everyone else this fails quietly.
        plans = try? await model.store.api.staffReadingPlans()
    }

    private func create(_ references: [String]) async {
        await run($error) {
            _ = try await model.store.api.createReadingPlan(title: title, startsOn: startsOn, references: references)
            title = ""
            refs = ""
        }
        await load()
    }
}

// MARK: - Church partners

struct ChurchView: View {
    @Environment(AppModel.self) private var model
    @State private var church: Church?
    @State private var loaded = false
    @State private var editing = false
    @State private var form = ChurchForm()
    @State private var busy = false
    @State private var error: String?
    private var w: Words { model.words }

    var body: some View {
        Form {
            if model.wording == .neutral {
                Text(w("ai.chatUnavailable"))
            } else {
                Section { Text(w("church.intro")) }
                if loaded, let church, !editing {
                    Section {
                        Text(w("church.status.\(church.status)")).bold()
                        Text(church.name).font(.headline)
                        Text(church.line(withTitle: true))
                        if church.status == "pending" { Text(w("church.pendingHint")).font(.footnote) }
                        if church.status == "verified" { Text(w("church.verifiedHint", ["badge": "\(church.pastorTitle) · \(church.name)"])).font(.footnote) }
                        if church.status == "declined", let n = church.reviewNote { Text(w("church.note", ["note": n])) }
                        if church.status == "pending" {
                            Button(w("church.edit")) { form = ChurchForm(church); editing = true }
                            Button(w("church.withdraw"), role: .destructive) { Task { await run($error) { _ = try await model.store.api.withdrawChurch() }; await load() } }
                        }
                        if church.status == "declined" { Button(w("church.applyAgain")) { form = ChurchForm(church); editing = true } }
                    }
                }
                if loaded && editing {
                    Section {
                        TextField(w("church.name"), text: $form.name)
                        TextField(w("church.pastorTitle"), text: $form.pastorTitle, prompt: Text(w("church.pastorTitlePlaceholder")))
                        TextField(w("church.denomination"), text: $form.denomination)
                        TextField(w("church.city"), text: $form.city)
                        TextField(w("church.region"), text: $form.region)
                        TextField(w("church.country"), text: $form.country)
                        TextField(w("church.website"), text: $form.website, prompt: Text("https://")).keyboardType(.URL).textInputAutocapitalization(.never)
                        TextField(w("church.phone"), text: $form.phone).keyboardType(.phonePad)
                        TextField(w("church.about"), text: $form.about, axis: .vertical)
                    } footer: { Text(w("church.checkHint")) }
                    Section {
                        Button(w(church?.status == "pending" ? "church.save" : "church.submit")) { Task { await submit() } }
                            .disabled(!form.ready || busy)
                        if church != nil { Button(w("common.cancel")) { editing = false } }
                    }
                }
            }
            if let error { Text(error).foregroundStyle(.red) }
        }
        .navigationTitle(w("church.title"))
        .task { await load() }
    }

    private func load() async {
        await run($error) {
            church = try await model.store.api.myChurch()
            editing = church == nil
            if church?.status == "verified" { await model.loadSettings() }
        }
        loaded = true
    }

    private func submit() async {
        busy = true
        defer { busy = false }
        await run($error) {
            church = try await model.store.api.applyChurch(form, editing: church?.status == "pending")
            editing = false
        }
    }
}

/// Admins check each church before verifying it.
struct ChurchReviewView: View {
    @Environment(AppModel.self) private var model
    @State private var status = "pending"
    @State private var churches: [Church] = []
    @State private var notes: [String: String] = [:]
    @State private var error: String?
    private var w: Words { model.words }

    var body: some View {
        List {
            Section {
                Text(w("churchReview.intro"))
                Picker("", selection: $status) {
                    ForEach(Church.statuses, id: \.self) { Text(w("church.status.\($0)")).tag($0) }
                }
                .pickerStyle(.segmented)
            }
            if churches.isEmpty { Text(w("churchReview.empty")).foregroundStyle(.secondary) }
            ForEach(churches) { c in
                Section {
                    Text(c.name).font(.headline)
                    Text(c.line(withTitle: false))
                    if let a = c.applicant {
                        Text(w("churchReview.applicant", ["name": a.displayName, "title": c.pastorTitle]) + (a.email.map { " · \($0)" } ?? "")).font(.caption)
                    }
                    if let site = c.website, let url = URL(string: site) { Link(site, destination: url) }
                    if let phone = c.phone { Text(phone).font(.caption) }
                    if let about = c.about { Text(about) }
                    if let n = c.reviewNote { Text(w("church.note", ["note": n])).font(.caption) }
                    if c.status != "declined" {
                        TextField(w(c.status == "pending" ? "churchReview.notePlaceholder" : "churchReview.revokePlaceholder"),
                                  text: Binding(get: { notes[c.id] ?? "" }, set: { notes[c.id] = $0 }), axis: .vertical)
                    }
                    let noted = !(notes[c.id] ?? "").trimmingCharacters(in: .whitespaces).isEmpty
                    if c.status == "pending" {
                        Button(w("churchReview.verify")) { decide(c, "verify") }
                        Button(w("churchReview.decline")) { decide(c, "decline") }.disabled(!noted)
                    }
                    if c.status == "verified" {
                        Button(w("churchReview.revoke"), role: .destructive) { decide(c, "revoke") }.disabled(!noted)
                    }
                }
            }
            if let error { Text(error).foregroundStyle(.red) }
        }
        .navigationTitle(w("churchReview.title"))
        .task(id: status) { await load() }
    }

    private func load() async { await run($error) { churches = try await model.store.api.churchesForReview(status) } }

    private func decide(_ c: Church, _ decision: String) {
        Task {
            await run($error) { _ = try await model.store.api.decideChurch(c.id, decision, note: notes[c.id] ?? "") }
            await load()
        }
    }
}

// MARK: - Witness team

/// Staff only: needs marked as sincere, private notes, and a log of help sent.
struct WitnessView: View {
    @Environment(AppModel.self) private var model
    @State private var filter: String?
    @State private var cases: [WitnessCase] = []
    @State private var open: String?
    @State private var notes: [WitnessNote] = []
    @State private var note = ""
    @State private var helpKind = ""
    @State private var story = ""
    @State private var sent: String?
    @State private var error: String?
    private var w: Words { model.words }

    var body: some View {
        List {
            Section {
                Text(w("witness.intro"))
                ChoiceRow(options: ["open"] + WitnessCase.statuses, selected: filter ?? "open", label: { $0 == "open" ? w("witness.open") : w("witness.status.\($0)") }) {
                    filter = $0 == "open" ? nil : $0
                }
            }
            if cases.isEmpty { Text(w("witness.empty")).foregroundStyle(.secondary) }
            ForEach(cases) { c in
                Section {
                    Text(summary(c)).font(.caption)
                    NavigationLink { PostDetailView(postId: c.postId) } label: { Text(c.postBody).lineLimit(open == c.id ? nil : 3) }
                    if let last = c.lastNote, open != c.id { Text(w("witness.lastNote", ["note": last])).font(.caption) }
                    Button(w(open == c.id ? "witness.hideNotes" : "witness.notes")) { Task { await expand(c.id) } }
                    if c.status == "watching" {
                        Button(w("witness.reachOut")) { change { _ = try await model.store.api.updateWitnessCase(c.id, status: "reaching_out", assignToMe: true) } }
                    }
                    if c.status != "closed" {
                        Button(w("common.close")) { change { _ = try await model.store.api.updateWitnessCase(c.id, status: "closed") } }
                    }
                    if open == c.id {
                        ForEach(notes) { n in
                            Text("**\(n.author):** \(n.helpKind.map { "[\(w("witness.helpSent", ["kind": $0]))] " } ?? "")\(n.body)")
                        }
                        TextField(w("witness.notePlaceholder"), text: $note, axis: .vertical)
                        TextField(w("witness.helpPlaceholder"), text: $helpKind)
                        Button(w(helpKind.trimmingCharacters(in: .whitespaces).isEmpty ? "witness.addNote" : "witness.logHelp")) {
                            change {
                                _ = try await model.store.api.addWitnessNote(c.id, body: note, helpKind: helpKind)
                                note = ""
                                helpKind = ""
                            }
                        }
                        .disabled(note.trimmingCharacters(in: .whitespaces).isEmpty)
                        if c.status == "helped" && model.features["witnessStories"] {
                            Text(w("witness.storyTitle")).font(.headline)
                            Text(w("witness.storyHint")).font(.caption)
                            TextField(w("witness.storyPlaceholder"), text: $story, axis: .vertical)
                            Button(w("witness.storyAsk")) {
                                change {
                                    _ = try await model.store.api.draftWitnessStory(c.id, body: story)
                                    story = ""
                                    sent = c.id
                                }
                            }
                            .disabled(story.trimmingCharacters(in: .whitespaces).count < 20)
                            if sent == c.id { Text(w("witness.storySent")).font(.caption) }
                        }
                    }
                }
            }
            if let error { Text(error).foregroundStyle(.red) }
        }
        .navigationTitle(w("profile.witness"))
        .task(id: filter) { await load() }
    }

    private func summary(_ c: WitnessCase) -> String {
        var s = "\(w("witness.status.\(c.status)")) · \(c.posterName)"
        if c.anonymousPost { s += " " + w("witness.anonymous") }
        if let a = c.assignedTo { s += " · " + w("witness.with", ["name": a]) }
        if c.helpCount > 0 { s += " · " + w("witness.helpCount", count: c.helpCount) }
        return s
    }

    private func load() async { await run($error) { cases = try await model.store.api.witnessCases(filter) } }

    private func expand(_ id: String) async {
        if open == id { open = nil; return }
        open = id
        notes = (try? await model.store.api.witnessNotes(id)) ?? []
    }

    private func change(_ call: @escaping () async throws -> Void) {
        Task {
            await run($error, call)
            await load()
            if let open { notes = (try? await model.store.api.witnessNotes(open)) ?? [] }
        }
    }
}
