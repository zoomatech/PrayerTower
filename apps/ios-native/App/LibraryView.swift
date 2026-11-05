import PrayerTowerKit
import PrayerTowerScripture
import SwiftUI

/// Scripture and ancient writings search, as the Expo app's library.tsx. Off unless an admin
/// turns it on; the server decides which collections this member's community offers.
/// Two more searches run on the phone, ported from Winstons Syndicate (PrayerTowerScripture): "Who did what"
/// (relationship search) where the Bible is offered, and "A story I remember" (the hybrid search) over every collection.
struct LibraryView: View {
    enum Mode: Hashable { case words, who, story }
    @Environment(AppModel.self) private var model
    @State private var overview: LibraryOverview?
    @State private var collection: String?
    @State private var words = ""
    @State private var searched = ""
    @State private var hits: [LibraryHit]?
    @State private var total = 0
    @State private var source = ""
    @State private var busy = false
    @State private var error: String?
    @State private var sharing: SharedPassage?
    @State private var marks = LibraryMarks()
    /// The last search ran on a downloaded copy because the server couldn't be reached.
    @State private var searchedOffline = false
    @State private var mode = Mode.words
    @State private var scope = VerseSearchScope.automatic
    @State private var verseHits: [VerseSearchHit]?
    @State private var stories: [StoryFound]?
    /// "A story I remember" searches everything offered unless set to the Bible only.
    @State private var bibleOnly = false
    /// What the meaning search's setup is doing, the first time only: "Downloading BSB", "Indexing KJV: 1200 of 9586 groups".
    @State private var preparing: String?
    private var w: Words { model.words }
    private var bibleOffered: Bool { overview?.collections.contains { $0.id == Library.bible } ?? false }
    @Environment(\.horizontalSizeClass) private var width
    /// The research desk (news, scholar feeds, the McClellan index) goes beside the Bible search: to its right on a wide
    /// screen, after it on a phone.
    private var deskShown: Bool { overview?.enabled == true && bibleOffered }

    var body: some View {
        HStack(spacing: 0) {
            search
            if deskShown, width == .regular {
                Divider()
                ResearchDeskView().frame(minWidth: 320, idealWidth: 400, maxWidth: 440)
            }
        }
        .navigationTitle(w("library.title"))
        .sheet(item: $sharing) { ComposeView(start: $0.post) }
        .task {
            await load()
            try? await marks.load(model)
        }
        .refreshable { await load() }
    }

    private var search: some View {
        List {
            if let error { Section { Text(error).foregroundStyle(Color.danger) } }
            if model.features["libraryOffline"] {
                Section { NavigationLink(w("library.offlineTitle")) { OfflineTextsView() } }
            }
            if model.features["libraryListen"] {
                Section { NavigationLink(w("library.listeningTitle")) { ListeningRoomView() } }
            }
            if let overview {
                if !overview.enabled {
                    Text(w("library.closed"))
                } else {
                    if !overview.collections.isEmpty {
                        Picker("", selection: $mode) {
                            Text(w("library.modeWords")).tag(Mode.words)
                            if bibleOffered { Text(w("library.modeWho")).tag(Mode.who) }
                            Text(w("library.modeStory")).tag(Mode.story)
                        }
                        .pickerStyle(.segmented)
                        .onChange(of: mode) { verseHits = nil; stories = nil; error = nil }
                    }
                    Section {
                        if mode == .who {
                            Text(w("library.whoHint")).font(.footnote).foregroundStyle(Color.subtle)
                            Picker(w("library.whoScope"), selection: $scope) {
                                ForEach(VerseSearchScope.allCases, id: \.self) { Text($0.title).tag($0) }
                            }
                        }
                        if mode == .story {
                            Text(w(bibleOffered ? "library.storyHint" : "library.storyHintTexts")).font(.footnote).foregroundStyle(Color.subtle)
                            if bibleOffered, overview.collections.count > 1 {
                                Picker(w("library.title"), selection: $bibleOnly) {
                                    Text(w("library.storyEverything")).tag(false)
                                    Text(w("library.storyBibleOnly")).tag(true)
                                }
                                .pickerStyle(.segmented)
                                .onChange(of: bibleOnly) { stories = nil }
                            }
                        }
                        if mode == .words, overview.collections.count > 1 {
                            Picker(w("library.title"), selection: Binding(get: { collection ?? "" }, set: { choose($0) })) {
                                ForEach(overview.collections) { Text($0.title).tag($0.id) }
                            }
                            .pickerStyle(.segmented)
                        }
                        TextField(w("library.placeholder"), text: $words)
                            .submitLabel(.search)
                            .onSubmit { go() }
                            .onChange(of: words) { _, v in if v.count > 200 { words = String(v.prefix(200)) } }
                            .accessibilityLabel(w("library.words"))
                        Button(w("library.search")) { go() }
                            .disabled(words.trimmingCharacters(in: .whitespaces).isEmpty || busy)
                        if mode == .story, let preparing {
                            Text(w("library.preparing", ["step": preparing])).font(.footnote).foregroundStyle(Color.subtle)
                        }
                    }
                }
            } else if error == nil {
                ProgressView()
            }
            if mode == .who, let verseHits {
                Section {
                    ForEach(Array(verseHits.prefix(100).enumerated()), id: \.offset) { _, h in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(h.verse.id).font(.headline)
                            Text(h.verse.text).textSelection(.enabled)
                            Text(h.explanation).font(.caption).foregroundStyle(Color.subtle)
                        }
                        .accessibilityElement(children: .combine)
                    }
                } header: { Text(verseHits.isEmpty ? w("library.none") : w("library.results", count: verseHits.count)) }
            }
            if mode == .story, let stories {
                Section {
                    ForEach(stories) { found in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(found.title).font(.headline)
                            if let place = found.place { Text(place).font(.caption).foregroundStyle(Color.subtle) }
                            Text(found.text).textSelection(.enabled)
                            Text(found.explanation).font(.caption).foregroundStyle(Color.subtle)
                        }
                        .accessibilityElement(children: .combine)
                    }
                } header: { Text(stories.isEmpty ? w("library.none") : w("library.results", count: stories.count)) }
            }
            if mode == .words, let hits {
                Section {
                    ForEach(Array(hits.enumerated()), id: \.offset) { _, h in passage(h) }
                    if hits.count < total {
                        Button(w("library.more")) { run(hits.count) }.disabled(busy)
                    }
                    if busy { ProgressView() }
                } header: {
                    Text(hits.isEmpty ? w("library.none") : w("library.results", count: total))
                } footer: {
                    if searchedOffline { Text(w("library.offlineSearched")) }
                    if !hits.isEmpty { Text(w("library.source", ["source": source])) }
                }
            }
            if deskShown, width != .regular { ResearchDeskSections() }
        }
    }

    @ViewBuilder private func passage(_ h: LibraryHit) -> some View {
        let bible = collection == Library.bible
        VStack(alignment: .leading, spacing: 4) {
            Text(bible ? h.ref : h.work.title).font(.headline)
            if !bible && !h.ref.isEmpty { Text(h.ref).font(.caption).foregroundStyle(Color.subtle) }
            Text(h.text).textSelection(.enabled)
            if !h.complete { Text(w("library.near")).font(.caption).foregroundStyle(Color.subtle) }
        }
        .accessibilityElement(children: .combine)
        .listRowBackground(h.key.flatMap { noteFill(marks.marks[$0]?.color) })
        if model.features["libraryShare"] {
            Button(w("library.share")) { sharing = SharedPassage(post: Library.shared(h.text, citation: h.credit)) }
                .accessibilityLabel(w("library.shareOne", ["citation": h.credit]))
        }
        if bible, model.features["libraryWords"], !searchedOffline {
            NavigationLink(w("library.study.study")) { WordStudyView(ref: h.ref) }
                .accessibilityLabel(w("library.study.studyOne", ["ref": h.ref]))
        }
        if let key = h.key, let collection, !searchedOffline {
            ListenRow(collection: collection, key: key, text: h.text, citation: h.credit)
            StudyStartRow(subject: .passage(collection: collection, key: key), citation: h.credit)
        }
        if model.features["libraryNotes"], let key = h.key, let collection {
            PassageMarkRow(collection: collection, key: key, citation: h.credit, marks: marks)
        }
    }

    private func load() async {
        do {
            let o = try await model.store.api.library()
            overview = o
            error = nil
            if o.enabled, !(o.collections.contains { $0.id == collection }) { collection = o.collections.first?.id }
        } catch let e as OfflineError {
            // No signal: offer the downloaded copies, if any.
            let kept = OfflineLibrary().kept()
            if overview == nil, !kept.isEmpty {
                overview = LibraryOverview(enabled: true, collections: kept.map { LibraryCollection(id: $0.id, title: $0.title, faith: false) })
                collection = collection ?? kept.first?.id
            } else {
                self.error = e.localizedDescription
            }
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func go() {
        switch mode {
        case .words: run(0, words)
        case .who: who()
        case .story: story()
        }
    }

    /// "Who did what", on the phone: the phrase read into subject, action and object.
    private func who() {
        let phrase = words.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let query = try? RelationQuery.parse(phrase) else { error = w("library.whoParseError"); return }
        let chosen = scope
        busy = true
        error = nil
        Task {
            defer { busy = false }
            do {
                verseHits = try await Task.detached { try VerseLibrary.loadBundled().search(query, scope: chosen) }.value
            } catch {
                self.error = error.localizedDescription
            }
        }
    }

    /// "A story I remember", on the device: Winstons Syndicate's hybrid search, its three stages (meaning, cascade and
    /// word search, taking turns) every time, over everything offered: the Bible and every other collection, sliced as
    /// the Bible is, the Bible's passages and the others' taking turns; or over the Bible only when set so (Steve,
    /// 5 November 2026: "the whole 3 stage search should be done every time but unless it is set to bible only it should
    /// search EVERYTHING"). The meaning search's setup runs in the background the first time; until it is done the word
    /// search answers alone for the Bible, the cascade and the word search for the other collections.
    private func story() {
        let phrase = words.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !phrase.isEmpty, let overview else { return }
        let others = bibleOnly ? [] : overview.collections.map(\.id).filter { $0 != Library.bible }
        let bible = bibleOffered
        // A popular name typed ("the golden rule") leads straight to its passages, shown first; one typed nearly
        // ("noahs arks") has its short description searched for with it. The three searches run every time.
        let named = Array(NamedPassages.named(phrase).prefix(2))
        let near = named.isEmpty ? NamedPassages.near(phrase) : nil
        let searched = near.map { phrase + " " + $0.about } ?? phrase
        busy = true
        error = nil
        let api = model.store.api
        Task {
            defer { busy = false }
            do {
                let report: @Sendable (FuzzyBibleSearch.State) -> Void = { state in
                    Task { @MainActor in
                        if case let .preparing(step) = state { preparing = step } else { preparing = nil }
                    }
                }
                // The notes speak of the Bible, so only where it is offered.
                var first: [StoryFound] = bible ? named.compactMap(StoryFound.note) : []
                var bibleCovered = Set<String>()
                if bible {
                    let kjv = try VerseLibrary.loadBundled()
                    for entry in named {
                        for ref in entry.bible {
                            if let card = StoryFound.bible(ref, of: entry, in: kjv) { first.append(card) }
                            bibleCovered.formUnion(kjv.verses(ref).map(\.id))
                        }
                    }
                }
                let fromBible = bible
                    ? try await LibraryScripture.shared.search(searched, report: report).map(StoryFound.init).filter { !bibleCovered.contains($0.id) }
                    : []
                let (namedOthers, fromOthers) = others.isEmpty ? ([], [])
                    : try await LibraryScripture.shared.search(searched, in: others, named: named, api: api, report: report)
                var both = first + namedOthers
                for i in 0..<max(fromBible.count, fromOthers.count) {
                    if i < fromBible.count { both.append(fromBible[i]) }
                    if i < fromOthers.count { both.append(fromOthers[i]) }
                }
                stories = both
            } catch {
                self.error = error.localizedDescription
            }
        }
    }

    private func choose(_ id: String) {
        collection = id
        hits = nil
        stories = nil
        if mode == .words, !searched.isEmpty { run(0, searched) }
    }

    private func run(_ offset: Int, _ q: String? = nil) {
        let q = q ?? searched
        guard let from = collection, !q.trimmingCharacters(in: .whitespaces).isEmpty else { return }
        busy = true
        error = nil
        Task {
            defer { busy = false }
            do {
                let r = try await model.store.api.searchLibrary(q, collection: from, offset: offset)
                searched = q
                searchedOffline = false
                total = r.total
                source = r.source
                hits = offset > 0 ? (hits ?? []) + r.hits : r.hits
            } catch let e as OfflineError {
                // No signal: search the downloaded copy instead, plain words only.
                guard let file = OfflineLibrary().open(from) else { self.error = e.localizedDescription; return }
                let r = file.search(q)
                searched = q
                searchedOffline = true
                total = r.hits.count
                source = file.source
                hits = r.hits
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}

/// Admin: the library's switch, as the Expo admin screen's library section.
struct LibraryAdminSection: View {
    @Environment(AppModel.self) private var model
    @State private var on: LibrarySettings?
    @State private var error: String?

    var body: some View {
        let w = model.words
        Section {
            Text(w("library.adminAsk")).font(.footnote).foregroundStyle(.secondary)
            if let on {
                Toggle(isOn: Binding(get: { on.enabled == true }, set: { save(LibrarySettings(enabled: $0)) })) {
                    VStack(alignment: .leading) {
                        Text(w("library.adminToggle"))
                        Text(w("library.adminHint")).font(.caption).foregroundStyle(Color.subtle)
                    }
                }
                if on.enabled == true {
                    Toggle(isOn: Binding(get: { on.shareEnabled == true }, set: { save(LibrarySettings(shareEnabled: $0)) })) {
                        VStack(alignment: .leading) {
                            Text(w("library.adminShare"))
                            Text(w("library.adminShareHint")).font(.caption).foregroundStyle(Color.subtle)
                        }
                    }
                    Toggle(isOn: Binding(get: { on.dailyEnabled == true }, set: { save(LibrarySettings(dailyEnabled: $0)) })) {
                        VStack(alignment: .leading) {
                            Text(w("library.adminDaily"))
                            Text(w("library.adminDailyHint")).font(.caption).foregroundStyle(Color.subtle)
                        }
                    }
                    Toggle(isOn: Binding(get: { on.parallelsEnabled == true }, set: { save(LibrarySettings(parallelsEnabled: $0)) })) {
                        VStack(alignment: .leading) {
                            Text(w("library.adminParallels"))
                            Text(w("library.adminParallelsHint")).font(.caption).foregroundStyle(Color.subtle)
                        }
                    }
                    Toggle(isOn: Binding(get: { on.plansEnabled == true }, set: { save(LibrarySettings(plansEnabled: $0)) })) {
                        VStack(alignment: .leading) {
                            Text(w("library.adminPlans"))
                            Text(w("library.adminPlansHint")).font(.caption).foregroundStyle(Color.subtle)
                        }
                    }
                    Toggle(isOn: Binding(get: { on.wordsEnabled == true }, set: { save(LibrarySettings(wordsEnabled: $0)) })) {
                        VStack(alignment: .leading) {
                            Text(w("library.adminWords"))
                            Text(w("library.adminWordsHint")).font(.caption).foregroundStyle(Color.subtle)
                        }
                    }
                    Toggle(isOn: Binding(get: { on.notesEnabled == true }, set: { save(LibrarySettings(notesEnabled: $0)) })) {
                        VStack(alignment: .leading) {
                            Text(w("library.adminNotes"))
                            Text(w("library.adminNotesHint")).font(.caption).foregroundStyle(Color.subtle)
                        }
                    }
                    Toggle(isOn: Binding(get: { on.offlineEnabled == true }, set: { save(LibrarySettings(offlineEnabled: $0)) })) {
                        VStack(alignment: .leading) {
                            Text(w("library.adminOffline"))
                            Text(w("library.adminOfflineHint")).font(.caption).foregroundStyle(Color.subtle)
                        }
                    }
                    Toggle(isOn: Binding(get: { on.listenEnabled == true }, set: { save(LibrarySettings(listenEnabled: $0)) })) {
                        VStack(alignment: .leading) {
                            Text(w("library.adminListen"))
                            Text(w("library.adminListenHint")).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                    Toggle(isOn: Binding(get: { on.studiesEnabled == true }, set: { save(LibrarySettings(studiesEnabled: $0)) })) {
                        VStack(alignment: .leading) {
                            Text(w("library.adminStudies"))
                            Text(w("library.adminStudiesHint")).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
            } else if error == nil {
                ProgressView()
            }
            if let error { Text(error).font(.footnote).foregroundStyle(Color.danger) }
        } header: {
            Text(w("library.adminTitle"))
        }
        .task { on = try? await model.store.api.librarySettings() }
    }

    private func save(_ patch: LibrarySettings) {
        Task {
            do {
                on = try await model.store.api.setLibrary(patch)
                if let f = try? await model.store.api.features() { model.features = f }
                error = nil
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}

/// Today's passage at the top of the feed, as the Expo app's DailyPassage card. Off unless an admin turns it on.
struct DailyPassageCard: View {
    @Environment(AppModel.self) private var model
    @State private var daily: LibraryDaily?
    @State private var hidden: String?
    @State private var sharing: SharedPassage?

    var body: some View {
        let w = model.words
        Group {
            if model.features["libraryDaily"], let daily, daily.enabled, let p = daily.passage, hidden != daily.day {
                VStack(alignment: .leading, spacing: 6) {
                    Text(w("library.dailyTitle")).font(.caption).foregroundStyle(Color.subtle)
                    Text(p.text).textSelection(.enabled)
                    Text(p.credit).font(.caption).foregroundStyle(Color.subtle)
                    HStack {
                        if daily.share == true { Button(w("library.share")) { sharing = SharedPassage(post: Library.shared(p.text, citation: p.credit)) }.buttonStyle(.bordered) }
                        Button(w("feed.notNow")) { hidden = daily.day }.buttonStyle(.borderless)
                    }
                }
                .accessibilityLabel(w("library.dailyTitle"))
            }
        }
        .task(id: model.features["libraryDaily"]) {
            guard model.features["libraryDaily"] else { return }
            daily = try? await model.store.api.libraryDaily()
        }
        .sheet(item: $sharing) { ComposeView(start: $0.post) }
    }
}

/// A passage on its way into a new post.
struct SharedPassage: Identifiable {
    let id = UUID()
    let post: NewPost
}

/// The device's one hybrid Bible search, as Winstons Syndicate's (HybridBibleSearch): the five translations, the
/// EmbeddingGemma model (IBM granite small as its fallback) and the index are downloaded and made once, into
/// Application Support/Bible Search, and only loaded after that.
enum LibraryScripture {
    static let shared = Holder()

    actor Holder {
        private var hybrid: HybridBibleSearch?
        /// The meaning search's setup, started by the first search.
        private var setup: Task<Void, Never>?

        func search(_ phrase: String, report: @escaping @Sendable (FuzzyBibleSearch.State) -> Void) async throws -> [HybridBibleSearch.Found] {
            if hybrid == nil {
                let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
                let fuzzy = FuzzyBibleSearch(folder: support.appendingPathComponent("Bible Search")) { model, folder in
                    try await OnnxEmbedder(model: model, folder: folder)
                }
                hybrid = HybridBibleSearch(library: try VerseLibrary.loadBundled(), fuzzy: fuzzy)
            }
            let hybrid = hybrid!
            if setup == nil {
                setup = Task.detached(priority: .utility) { await hybrid.fuzzy.prepare(report: report) }
            } else if case let .preparing(step) = await hybrid.fuzzy.state {
                report(.preparing(step))
            }
            return await hybrid.search(phrase)
        }

        /// Each collection's file, fetched the first time it is searched, and the search over the collections asked for.
        private var files: [String: (collection: TextCollection, file: OfflineCollectionFile)] = [:]
        private var texts: (ids: [String], search: HybridTextSearch)?

        /// "A story I remember" over the other collections, all at once: the same meaning model and setup as the Bible's;
        /// each collection is sliced and its meaning index made once, in the background, after the Bible's.
        func search(_ phrase: String, in ids: [String], named: [NamedPassage] = [], api: APIClient,
                    report: @escaping @Sendable (FuzzyBibleSearch.State) -> Void) async throws -> (named: [StoryFound], found: [StoryFound]) {
            _ = try await search("", report: report)
            let hybrid = hybrid!
            for id in ids where files[id] == nil {
                let data: Data
                do {
                    data = try await api.searchableCollection(id)
                } catch let e as OfflineError {
                    // No signal: a downloaded copy will do; a collection with none is left out.
                    guard let kept = try? Data(contentsOf: OfflineLibrary().folder.appendingPathComponent("\(id).json")) else {
                        if files.isEmpty && id == ids.last { throw e }
                        continue
                    }
                    data = kept
                }
                files[id] = (try TextCollection(data: data), try JSONDecoder().decode(OfflineCollectionFile.self, from: data))
            }
            let have = ids.filter { files[$0] != nil }
            if texts?.ids != have {
                texts = (have, HybridTextSearch(collections: have.map { files[$0]!.collection }, fuzzy: hybrid.fuzzy))
            }
            let search = texts!.search
            var waiting: [TextCollection] = []
            for c in search.collections where await !search.fuzzy.isReady(c) { waiting.append(c) }
            if !waiting.isEmpty {
                let setup = setup
                Task.detached(priority: .utility) {
                    // After the Bible's setup, which chooses the model; a collection already being indexed is skipped.
                    await setup?.value
                    for c in waiting { try? await search.fuzzy.prepare(c, report: report) }
                }
            } else if case let .preparing(step) = await search.fuzzy.state {
                report(.preparing(step))
            }
            let works = Dictionary(have.flatMap { files[$0]!.file.works }.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
            func card(_ passage: TextPassage, id: String, text: String, explanation: String) -> StoryFound {
                let title = works[passage.workId]?.title ?? passage.workId
                let place = passage.ref.isEmpty || passage.ref == title ? nil : passage.ref
                return StoryFound(id: id, title: title, place: place, text: text, explanation: explanation)
            }
            // The named passages first, each side one card; a passage they show is not shown again.
            var covered = Set<String>()
            var cards: [StoryFound] = []
            for entry in named {
                for side in entry.texts {
                    let places = search.places(side)
                    guard let first = places.first else { continue }
                    let ids = places.map { "\(search.collection(of: $0)) \(search.index(of: $0))" }
                    guard covered.isDisjoint(with: ids) else { continue }
                    covered.formUnion(ids)
                    cards.append(card(search.passage(first), id: ids[0], text: places.map { search.passage($0).text }.joined(separator: " "),
                                      explanation: StoryFound.known(entry)))
                }
            }
            let found = await search.search(phrase).map { found in
                card(found.passage, id: "\(found.collection) \(found.index)", text: found.passage.text, explanation: found.explanation)
            }
            return (cards, found.filter { !covered.contains($0.id) })
        }
    }
}

/// A passage "A story I remember" found: a Bible verse, or a passage of another collection with its work and place.
struct StoryFound: Identifiable, Sendable {
    let id: String
    let title: String
    let place: String?
    let text: String
    let explanation: String

    init(id: String, title: String, place: String?, text: String, explanation: String) {
        self.id = id
        self.title = title
        self.place = place
        self.text = text
        self.explanation = explanation
    }

    init(_ found: HybridBibleSearch.Found) {
        self.init(id: found.verse.id, title: found.verse.id, place: nil, text: found.verse.text, explanation: found.explanation)
    }

    /// Why a named passage is shown: "Known as “the golden rule”".
    static func known(_ entry: NamedPassage) -> String { "Known as \u{201C}\(entry.names[0])\u{201D}" }

    /// A named entry's note, shown above its passages.
    static func note(_ entry: NamedPassage) -> StoryFound? {
        entry.note.map { StoryFound(id: "note \(entry.names[0])", title: entry.names[0].capitalized, place: nil, text: $0, explanation: known(entry)) }
    }

    /// A named entry's Bible passage, its verses on one card (the first eight, if it is longer).
    static func bible(_ ref: String, of entry: NamedPassage, in kjv: VerseLibrary) -> StoryFound? {
        let verses = kjv.verses(ref)
        guard !verses.isEmpty else { return nil }
        let text = verses.prefix(8).map(\.text).joined(separator: " ") + (verses.count > 8 ? " …" : "")
        return StoryFound(id: "named \(ref)", title: VerseReference.written(ref), place: nil, text: text, explanation: known(entry))
    }
}
