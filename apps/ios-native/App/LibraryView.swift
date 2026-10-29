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
    private var w: Words { model.words }

    var body: some View {
        List {
            if let error { Section { Text(error).foregroundStyle(.red) } }
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
