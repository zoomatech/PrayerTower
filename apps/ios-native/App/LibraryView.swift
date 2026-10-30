import PrayerTowerKit
import SwiftUI

/// Scripture and ancient writings search, as the Expo app's library.tsx. Off unless an admin
/// turns it on; the server decides which collections this member's community offers.
struct LibraryView: View {
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
    private var w: Words { model.words }

    var body: some View {
        List {
            if let error { Section { Text(error).foregroundStyle(.red) } }
            if model.features["libraryOffline"] {
                Section { NavigationLink(w("library.offlineTitle")) { OfflineTextsView() } }
            }
            if let overview {
                if !overview.enabled {
                    Text(w("library.closed"))
                } else {
                    Section {
                        if overview.collections.count > 1 {
                            Picker(w("library.title"), selection: Binding(get: { collection ?? "" }, set: { choose($0) })) {
                                ForEach(overview.collections) { Text($0.title).tag($0.id) }
                            }
                            .pickerStyle(.segmented)
                        }
                        TextField(w("library.placeholder"), text: $words)
                            .submitLabel(.search)
                            .onSubmit { run(0, words) }
                            .onChange(of: words) { _, v in if v.count > 200 { words = String(v.prefix(200)) } }
                            .accessibilityLabel(w("library.words"))
                        Button(w("library.search")) { run(0, words) }
                            .disabled(words.trimmingCharacters(in: .whitespaces).isEmpty || busy)
                    }
                }
            } else if error == nil {
                ProgressView()
            }
            if let hits {
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
        }
        .navigationTitle(w("library.title"))
        .sheet(item: $sharing) { ComposeView(start: $0.post) }
        .task {
            await load()
            try? await marks.load(model)
        }
        .refreshable { await load() }
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
                            Text(w("library.adminWordsHint")).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                    Toggle(isOn: Binding(get: { on.notesEnabled == true }, set: { save(LibrarySettings(notesEnabled: $0)) })) {
                        VStack(alignment: .leading) {
                            Text(w("library.adminNotes"))
                            Text(w("library.adminNotesHint")).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                    Toggle(isOn: Binding(get: { on.offlineEnabled == true }, set: { save(LibrarySettings(offlineEnabled: $0)) })) {
                        VStack(alignment: .leading) {
                            Text(w("library.adminOffline"))
                            Text(w("library.adminOfflineHint")).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
            } else if error == nil {
                ProgressView()
            }
            if let error { Text(error).font(.footnote).foregroundStyle(.red) }
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
