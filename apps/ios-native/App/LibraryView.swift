import PrayerTowerKit
import PrayerTowerScripture
import SwiftUI

/// Scripture and ancient writings search, as the Expo app's library.tsx. Off unless an admin
/// turns it on; the server decides which collections this member's community offers.
/// Where the Bible is offered, two more searches run on the phone, ported from Winstons Syndicate
/// (PrayerTowerScripture): "Who did what" (relationship search) and "A story I remember" (fuzzy search).
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
    @State private var mode = Mode.words
    @State private var scope = VerseSearchScope.automatic
    @State private var verseHits: [VerseSearchHit]?
    @State private var stories: [FuzzyMatch]?
    @State private var preparing: (done: Int, of: Int)?
    private var w: Words { model.words }
    private var bibleOffered: Bool { overview?.collections.contains { $0.id == Library.bible } ?? false }

    var body: some View {
        List {
            if let error { Section { Text(error).foregroundStyle(.red) } }
            if let overview {
                if !overview.enabled {
                    Text(w("library.closed"))
                } else {
                    if bibleOffered {
                        Picker("", selection: $mode) {
                            Text(w("library.modeWords")).tag(Mode.words)
                            Text(w("library.modeWho")).tag(Mode.who)
                            Text(w("library.modeStory")).tag(Mode.story)
                        }
                        .pickerStyle(.segmented)
                        .onChange(of: mode) { verseHits = nil; stories = nil; error = nil }
                    }
                    Section {
                        if mode == .who {
                            Text(w("library.whoHint")).font(.footnote).foregroundStyle(.secondary)
                            Picker(w("library.whoScope"), selection: $scope) {
                                ForEach(VerseSearchScope.allCases, id: \.self) { Text($0.title).tag($0) }
                            }
                        }
                        if mode == .story { Text(w("library.storyHint")).font(.footnote).foregroundStyle(.secondary) }
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
                        if let preparing {
                            ProgressView(w("library.preparing", ["done": String(preparing.done), "total": String(preparing.of)]),
                                         value: Double(preparing.done), total: Double(max(preparing.of, 1)))
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
                            Text(h.explanation).font(.caption).foregroundStyle(.secondary)
                        }
                        .accessibilityElement(children: .combine)
                    }
                } header: { Text(verseHits.isEmpty ? w("library.none") : w("library.results", count: verseHits.count)) }
            }
            if mode == .story, let stories {
                Section {
                    ForEach(stories, id: \.reference) { m in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(m.reference).font(.headline)
                            Text(m.group.text).textSelection(.enabled)
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
                    if !hits.isEmpty { Text(w("library.source", ["source": source])) }
                }
            }
        }
        .navigationTitle(w("library.title"))
        .task { await load() }
        .refreshable { await load() }
    }

    @ViewBuilder private func passage(_ h: LibraryHit) -> some View {
        let bible = collection == Library.bible
        VStack(alignment: .leading, spacing: 4) {
            Text(bible ? h.ref : h.work.title).font(.headline)
            if !bible && !h.ref.isEmpty { Text(h.ref).font(.caption).foregroundStyle(.secondary) }
            Text(h.text).textSelection(.enabled)
            if !h.complete { Text(w("library.near")).font(.caption).foregroundStyle(.secondary) }
        }
        .accessibilityElement(children: .combine)
    }

    private func load() async {
        do {
            let o = try await model.store.api.library()
            overview = o
            error = nil
            if o.enabled, !(o.collections.contains { $0.id == collection }) { collection = o.collections.first?.id }
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

    /// "A story I remember", on the phone: nearest six-verse passages by meaning.
    private func story() {
        let phrase = words.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !phrase.isEmpty else { return }
        busy = true
        error = nil
        Task {
            defer { busy = false; preparing = nil }
            do {
                stories = try await LibraryScripture.shared.search(phrase) { state in
                    Task { @MainActor in
                        if case let .preparing(done, of) = state { preparing = (done, of) } else { preparing = nil }
                    }
                }
            } catch {
                self.error = error.localizedDescription
            }
        }
    }

    private func choose(_ id: String) {
        collection = id
        hits = nil
        if !searched.isEmpty { run(0, searched) }
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
                total = r.total
                source = r.source
                hits = offset > 0 ? (hits ?? []) + r.hits : r.hits
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}

/// Admin: the library's switch, as the Expo admin screen's library section.
struct LibraryAdminSection: View {
    @Environment(AppModel.self) private var model
    @State private var on: Bool?
    @State private var error: String?

    var body: some View {
        let w = model.words
        Section {
            if let on {
                Toggle(isOn: Binding(get: { on }, set: { save($0) })) {
                    VStack(alignment: .leading) {
                        Text(w("library.adminToggle"))
                        Text(w("library.adminHint")).font(.caption).foregroundStyle(.secondary)
                    }
                }
            } else if error == nil {
                ProgressView()
            }
            if let error { Text(error).font(.footnote).foregroundStyle(.red) }
        } header: {
            Text(w("library.adminTitle"))
        }
        .task { on = try? await model.store.api.libraryOn() }
    }

    private func save(_ v: Bool) {
        Task {
            do {
                on = try await model.store.api.setLibrary(v)
                error = nil
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}

/// The phone's one fuzzy search, its index kept in Caches.
enum LibraryScripture {
    struct Unavailable: LocalizedError { var errorDescription: String? { "Fuzzy search needs Apple's English sentence embedding." } }

    static let shared = Holder()

    actor Holder {
        private var fuzzy: FuzzyScripture?

        func search(_ phrase: String, report: @escaping @Sendable (FuzzyScripture.State) -> Void) async throws -> [FuzzyMatch] {
            if fuzzy == nil {
                guard let embedder = AppleSentenceEmbedder() else { throw Unavailable() }
                let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
                fuzzy = FuzzyScripture(embedder: embedder, folder: caches.appendingPathComponent("scripture-fuzzy"))
            }
            await fuzzy!.prepare(try VerseLibrary.loadBundled(), report: report)
            if case let .failed(reason) = await fuzzy!.state { throw NSError(domain: "Library", code: 1, userInfo: [NSLocalizedDescriptionKey: reason]) }
            return await fuzzy!.search(phrase)
        }
    }
}
