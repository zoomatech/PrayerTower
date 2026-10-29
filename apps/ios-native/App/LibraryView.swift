import PrayerTowerKit
import PrayerTowerScripture
import SwiftUI

/// Search the texts (docs/LIBRARY_SEARCH.md), ported from Winstons Syndicate. Words search the server's collections
/// (the King James Bible for faith communities, the ancient writings for everyone). "Who did what" and "A story I
/// remember" search the King James Bible on the phone, with Apple's NaturalLanguage; Open Circle never sees them.
struct LibraryView: View {
    @Environment(AppModel.self) private var model
    @State private var mode = Mode.words
    @State private var overview: LibraryOverview?
    @State private var collection = ""
    @State private var text = ""
    @State private var scope = VerseSearchScope.automatic
    @State private var hits: [LibraryHit] = []
    @State private var total = 0
    @State private var source = ""
    @State private var verseHits: [VerseSearchHit] = []
    @State private var stories: [FuzzyMatch] = []
    @State private var preparing: (done: Int, of: Int)?
    @State private var searched = false
    @State private var busy = false
    @State private var error: String?

    private var w: Words { model.words }
    private var bibleOffered: Bool { overview?.collections?.contains { $0.id == "bible-kjv" } ?? false }

    enum Mode: Hashable { case words, who, story }

    var body: some View {
        List {
            if let overview, !overview.enabled {
                Text(w("library.closed"))
            } else if let overview {
                if bibleOffered {
                    Picker("", selection: $mode) {
                        Text(w("library.modeWords")).tag(Mode.words)
                        Text(w("library.modeWho")).tag(Mode.who)
                        Text(w("library.modeStory")).tag(Mode.story)
                    }
                    .pickerStyle(.segmented)
                    .onChange(of: mode) { clear() }
                }
                Section {
                    if mode == .words, let collections = overview.collections, collections.count > 1 {
                        Picker(w("library.title"), selection: $collection) {
                            ForEach(collections) { Text($0.title).tag($0.id) }
                        }
                        .onChange(of: collection) { if searched { Task { await run(offset: 0) } } }
                    }
                    if mode == .who {
                        Text(w("library.whoHint")).font(.footnote).foregroundStyle(.secondary)
                        Picker(w("library.whoScope"), selection: $scope) {
                            ForEach(VerseSearchScope.allCases, id: \.self) { Text($0.title).tag($0) }
                        }
                    }
                    if mode == .story { Text(w("library.storyHint")).font(.footnote).foregroundStyle(.secondary) }
                    TextField(w("library.words"), text: $text, prompt: Text(w("library.placeholder")))
                        .submitLabel(.search)
                        .onSubmit { Task { await run(offset: 0) } }
                    Button(w("library.search")) { Task { await run(offset: 0) } }
                        .disabled(text.trimmingCharacters(in: .whitespaces).isEmpty || busy)
                    if let preparing { ProgressView(w("library.preparing", ["done": String(preparing.done), "total": String(preparing.of)]), value: Double(preparing.done), total: Double(max(preparing.of, 1))) }
                }
                results
            } else if error == nil {
                ProgressView()
            }
            if let error { Text(error).foregroundStyle(.red) }
        }
        .navigationTitle(w("library.title"))
        .task { await load() }
    }

    @ViewBuilder private var results: some View {
        switch mode {
        case .words:
            if searched {
                Section {
                    ForEach(Array(hits.enumerated()), id: \.offset) { _, h in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(collection == "bible-kjv" ? h.ref : h.work.title).font(.headline)
                            if collection != "bible-kjv", !h.ref.isEmpty { Text(h.ref).font(.caption).foregroundStyle(.secondary) }
                            Text(h.text).textSelection(.enabled)
                            if !h.complete { Text(w("library.near")).font(.caption).foregroundStyle(.secondary) }
                        }
                    }
                    if hits.count < total { Button(w("library.more")) { Task { await run(offset: hits.count) } }.disabled(busy) }
                } header: {
                    Text(hits.isEmpty ? w("library.none") : w("library.results", count: total))
                } footer: {
                    if !hits.isEmpty { Text(w("library.source", ["source": source])) }
                }
            }
        case .who:
            if searched {
                Section {
                    ForEach(Array(verseHits.prefix(100).enumerated()), id: \.offset) { _, h in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(h.verse.id).font(.headline)
                            Text(h.verse.text).textSelection(.enabled)
                            Text(h.explanation).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                } header: { Text(verseHits.isEmpty ? w("library.none") : w("library.results", count: verseHits.count)) }
            }
        case .story:
            if searched {
                Section {
                    ForEach(stories, id: \.reference) { m in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(m.reference).font(.headline)
                            Text(m.group.text).textSelection(.enabled)
                        }
                    }
                } header: { Text(stories.isEmpty ? w("library.none") : w("library.results", count: stories.count)) }
            }
        }
    }

    private func clear() {
        searched = false
        hits = []
        verseHits = []
        stories = []
        error = nil
    }

    private func load() async {
        do {
            let o = try await model.store.api.library()
            overview = o
            if collection.isEmpty || !(o.collections ?? []).contains(where: { $0.id == collection }) { collection = o.collections?.first?.id ?? "" }
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func run(offset: Int) async {
        let phrase = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !phrase.isEmpty else { return }
        busy = true
        defer { busy = false }
        error = nil
        do {
            switch mode {
            case .words:
                let r = try await model.store.api.searchLibrary(phrase, collection: collection, offset: offset)
                hits = offset == 0 ? r.hits : hits + r.hits
                total = r.total
                source = r.source
            case .who:
                guard let query = try? RelationQuery.parse(phrase) else {
                    error = w("library.whoParseError")
                    return
                }
                let chosen = scope
                verseHits = try await Task.detached { try VerseLibrary.loadBundled().search(query, scope: chosen) }.value
            case .story:
                stories = try await LibraryScripture.shared.search(phrase) { state in
                    Task { @MainActor in
                        if case let .preparing(done, of) = state { preparing = (done, of) } else { preparing = nil }
                    }
                }
            }
            searched = true
        } catch {
            self.error = error.localizedDescription
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
            let library = try VerseLibrary.loadBundled()
            await fuzzy!.prepare(library, report: report)
            if case let .failed(reason) = await fuzzy!.state { throw NSError(domain: "Library", code: 1, userInfo: [NSLocalizedDescriptionKey: reason]) }
            return await fuzzy!.search(phrase)
        }
    }
}
