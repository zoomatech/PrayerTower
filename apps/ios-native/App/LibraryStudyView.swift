import PrayerTowerKit
import SwiftUI

/// A King James verse word by word, as the Expo app's word-study.tsx: tap a word for its Hebrew or Greek root.
struct WordStudyView: View {
    @Environment(AppModel.self) private var model
    let ref: String
    @State private var verse: WordVerse?
    @State private var error: String?
    private var w: Words { model.words }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                if let error { Text(error).foregroundStyle(.red) }
                if let verse {
                    Text(w("library.study.tap"))
                    FlowLayout(spacing: 6) {
                        ForEach(Array(verse.words.enumerated()), id: \.offset) { _, word in
                            if word.strongs.isEmpty {
                                Text(word.text).padding(.vertical, 6)
                            } else {
                                NavigationLink { WordEntryView(id: word.strongs[0]) } label: {
                                    VStack(spacing: 0) {
                                        Text(word.text).fontWeight(.semibold)
                                        Text(word.strongs.map { verse.roots[$0]?.translit ?? $0 }.joined(separator: " · ")).font(.caption2)
                                    }
                                    .padding(.horizontal, 6)
                                    .padding(.vertical, 4)
                                    .frame(minHeight: 44)
                                    .background(Color.accentColor.opacity(0.12), in: RoundedRectangle(cornerRadius: 8))
                                }
                                .accessibilityLabel(verse.spoken(word))
                            }
                        }
                    }
                    Text(w("library.study.source")).font(.caption).foregroundStyle(.secondary)
                } else if error == nil {
                    ProgressView()
                }
            }
            .padding()
        }
        .navigationTitle(verse?.citation ?? w("library.study.title"))
        .task { await load() }
    }

    private func load() async {
        do {
            verse = try await model.store.api.wordVerse(ref)
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// One Strong's number: its word, meaning, and the verses that use it, a page at a time.
struct WordEntryView: View {
    @Environment(AppModel.self) private var model
    let id: String
    @State private var entry: WordEntry?
    @State private var busy = false
    @State private var error: String?
    private var w: Words { model.words }

    var body: some View {
        List {
            if let error { Section { Text(error).foregroundStyle(.red) } }
            if let entry {
                Section {
                    Text(w("library.study.number", ["language": w(entry.language == "Hebrew" ? "library.study.hebrew" : "library.study.greek"), "id": entry.id, "pron": entry.pron]))
                        .font(.caption).foregroundStyle(.secondary)
                    Text(entry.definition).textSelection(.enabled)
                    if !entry.derivation.isEmpty { Text(entry.derivation).font(.caption).foregroundStyle(.secondary) }
                    if !entry.kjv.isEmpty { Text(w("library.study.kjv", ["words": entry.kjv])).font(.caption).foregroundStyle(.secondary) }
                } header: {
                    Text(w("library.study.meaning"))
                }
                Section {
                    ForEach(entry.verses) { v in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(v.ref).font(.headline)
                            Text(v.text).textSelection(.enabled)
                            if !v.as.isEmpty {
                                Text(w("library.study.as", ["words": Array(NSOrderedSet(array: v.as)).compactMap { $0 as? String }.joined(separator: ", ")]))
                                    .font(.caption).foregroundStyle(.secondary)
                            }
                        }
                        NavigationLink(w("library.study.study")) { WordStudyView(ref: v.ref) }
                            .accessibilityLabel(w("library.study.studyOne", ["ref": v.ref]))
                    }
                    if entry.verses.count < entry.total {
                        Button(w("library.more")) { Task { await more() } }.disabled(busy)
                    }
                } header: {
                    Text(w("library.study.uses", count: entry.total))
                } footer: {
                    Text(w("library.study.source"))
                }
            } else if error == nil {
                ProgressView()
            }
        }
        .navigationTitle(entry.map { "\($0.lemma) · \($0.translit)" } ?? w("library.study.title"))
        .task { await load() }
    }

    private func load() async {
        do {
            entry = try await model.store.api.wordEntry(id)
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func more() async {
        guard let current = entry else { return }
        busy = true
        defer { busy = false }
        do {
            var next = try await model.store.api.wordEntry(id, offset: current.verses.count)
            next.verses = current.verses + next.verses
            entry = next
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// Lays words out in lines, wrapping like text.
struct FlowLayout: Layout {
    var spacing: CGFloat = 6

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let rows = arrange(proposal.width ?? .infinity, subviews)
        return CGSize(width: proposal.width ?? rows.map(\.width).max() ?? 0, height: rows.last.map { $0.y + $0.height } ?? 0)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        for row in arrange(bounds.width, subviews) {
            var x = bounds.minX
            for i in row.items {
                let size = subviews[i].sizeThatFits(.unspecified)
                subviews[i].place(at: CGPoint(x: x, y: bounds.minY + row.y), proposal: ProposedViewSize(size))
                x += size.width + spacing
            }
        }
    }

    private struct Row { var items: [Int] = []; var width: CGFloat = 0; var height: CGFloat = 0; var y: CGFloat = 0 }

    private func arrange(_ maxWidth: CGFloat, _ subviews: Subviews) -> [Row] {
        var rows = [Row()]
        for i in subviews.indices {
            let size = subviews[i].sizeThatFits(.unspecified)
            if !rows[rows.count - 1].items.isEmpty, rows[rows.count - 1].width + spacing + size.width > maxWidth {
                let last = rows[rows.count - 1]
                rows.append(Row(y: last.y + last.height + spacing))
            }
            var row = rows[rows.count - 1]
            row.width += (row.items.isEmpty ? 0 : spacing) + size.width
            row.height = max(row.height, size.height)
            row.items.append(i)
            rows[rows.count - 1] = row
        }
        return rows
    }
}

// MARK: - Highlights and notes

/// The member's marks, by passage, and the circles a note can be shared with.
@MainActor @Observable final class LibraryMarks {
    var marks: [String: LibraryNote] = [:]
    var circles: [LibraryNote.Circle] = []

    func load(_ model: AppModel) async throws {
        guard model.features["libraryNotes"] else { return }
        if model.features["prayerCircles"], let mine = try? await model.store.api.myCircles() {
            circles = mine.circles.map { LibraryNote.Circle(id: $0.id, name: $0.name) }
        }
        let notes = try await model.store.api.libraryNotes()
        marks = Dictionary(notes.map { ($0.key, $0) }, uniquingKeysWith: { a, _ in a })
    }

    func saved(_ key: String, _ note: LibraryNote?) { marks[key] = note }
}

/// A soft fill for each highlight colour.
func noteFill(_ color: String?) -> Color? {
    switch color {
    case "yellow": Color(red: 1, green: 0.95, blue: 0.69)
    case "green": Color(red: 0.87, green: 0.95, blue: 0.85)
    case "blue": Color(red: 0.86, green: 0.92, blue: 0.98)
    case "pink": Color(red: 0.98, green: 0.88, blue: 0.92)
    default: nil
    }
}

/// The mark on one passage (its note, if any) and a button that opens the editor.
struct PassageMarkRow: View {
    @Environment(AppModel.self) private var model
    let collection: String
    let key: String
    let citation: String
    let marks: LibraryMarks
    @State private var editing = false

    var body: some View {
        let w = model.words
        let mark = marks.marks[key]
        if let note = mark?.note {
            VStack(alignment: .leading, spacing: 2) {
                Text(mark?.circle.map { w("library.noteSharedWith", ["circle": $0.name]) } ?? w("library.notePrivate")).font(.caption).foregroundStyle(.secondary)
                Text(note)
            }
            .padding(8)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(noteFill(mark?.color) ?? Color.softBackground, in: RoundedRectangle(cornerRadius: 8))
        }
        Button(mark == nil ? w("library.noteAdd") : w("library.noteEdit")) { editing = true }
            .accessibilityLabel(w(mark == nil ? "library.noteAddOne" : "library.noteEditOne", ["citation": citation]))
            .sheet(isPresented: $editing) {
                NavigationStack { PassageMarkEditor(collection: collection, key: key, citation: citation, marks: marks) }
            }
    }
}

struct PassageMarkEditor: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let collection: String
    let key: String
    let citation: String
    let marks: LibraryMarks
    @State private var color: String?
    @State private var note = ""
    @State private var circleId: String?
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        let w = model.words
        Form {
            Section { Text(citation).font(.headline) }
            Picker(w("library.noteColor"), selection: $color) {
                Text(w("library.noteColorNone")).tag(String?.none)
                ForEach(NoteColors.all, id: \.self) { Text(w("library.noteColors.\($0)")).tag(String?.some($0)) }
            }
            Section(w("library.noteLabel")) {
                TextEditor(text: $note)
                    .frame(minHeight: 100)
                    .accessibilityLabel(w("library.noteLabel"))
                    .onChange(of: note) { _, v in if v.count > 2000 { note = String(v.prefix(2000)) } }
            }
            if !note.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, !marks.circles.isEmpty {
                Picker(w("library.noteWho"), selection: $circleId) {
                    Text(w("library.noteOnlyMe")).tag(String?.none)
                    ForEach(marks.circles, id: \.id) { Text($0.name).tag(String?.some($0.id)) }
                }
            }
            if let error { Text(error).foregroundStyle(.red) }
            if marks.marks[key] != nil {
                Button(w("library.noteRemove"), role: .destructive) { save(clear: true) }.disabled(busy)
            }
        }
        .navigationTitle(w("library.noteAdd"))
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button(w("common.cancel")) { dismiss() } }
            ToolbarItem(placement: .confirmationAction) { Button(w("library.noteSave")) { save() }.disabled(busy) }
        }
        .onAppear {
            let mark = marks.marks[key]
            color = mark?.color
            note = mark?.note ?? ""
            circleId = mark?.circle?.id
        }
    }

    private func save(clear: Bool = false) {
        busy = true
        Task {
            defer { busy = false }
            do {
                let input = clear
                    ? LibraryNoteInput(collection: collection, key: key, color: nil, note: nil, circleId: nil)
                    : LibraryNoteInput(collection: collection, key: key, color: color, note: note, circleId: circleId)
                marks.saved(key, try await model.store.api.saveLibraryNote(input))
                dismiss()
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}

/// My highlights and notes, as the Expo app's my-notes.tsx.
struct MyNotesView: View {
    @Environment(AppModel.self) private var model
    @State private var marks = LibraryMarks()
    @State private var loaded = false
    @State private var error: String?
    private var w: Words { model.words }

    var body: some View {
        let notes = marks.marks.values.sorted { $0.updatedAt > $1.updatedAt }
        List {
            if let error { Section { Text(error).foregroundStyle(.red) } }
            Section { Text(w("library.notesIntro")) }
            if !marks.circles.isEmpty {
                Section {
                    ForEach(marks.circles, id: \.id) { c in
                        NavigationLink(w("library.notesInCircle", ["circle": c.name])) { CircleNotesView(circle: c) }
                    }
                }
            }
            if loaded && notes.isEmpty { Text(w("library.notesNone")) }
            ForEach(notes) { n in
                Section {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(n.citation).font(.headline)
                        Text(n.quote).textSelection(.enabled)
                    }
                    .listRowBackground(noteFill(n.color))
                    PassageMarkRow(collection: n.collection, key: n.key, citation: n.citation, marks: marks)
                    if n.collection == Library.bible, model.features["libraryWords"] {
                        NavigationLink(w("library.study.study")) { WordStudyView(ref: n.ref) }
                            .accessibilityLabel(w("library.study.studyOne", ["ref": n.ref]))
                    }
                }
            }
            if !loaded && error == nil { ProgressView() }
        }
        .navigationTitle(w("library.notesTitle"))
        .task { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        do {
            try await marks.load(model)
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
        loaded = true
    }
}

/// Notes shared in one of the member's circles, with who wrote them.
struct CircleNotesView: View {
    @Environment(AppModel.self) private var model
    let circle: LibraryNote.Circle
    @State private var notes: [LibraryNote]?
    @State private var error: String?
    private var w: Words { model.words }

    var body: some View {
        List {
            if let error { Section { Text(error).foregroundStyle(.red) } }
            if let notes {
                if notes.isEmpty { Text(w("library.notesCircleNone")) }
                ForEach(notes) { n in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(n.mine == true ? w("library.notesYou") : (n.author ?? "")).font(.caption).foregroundStyle(.secondary)
                        Text(n.note ?? "")
                        Text("“\(n.quote)”").italic()
                        Text(n.citation).font(.caption).foregroundStyle(.secondary)
                    }
                    .listRowBackground(noteFill(n.color))
                }
            } else if error == nil {
                ProgressView()
            }
        }
        .navigationTitle(w("library.notesInCircle", ["circle": circle.name]))
        .task {
            do {
                notes = try await model.store.api.circleLibraryNotes(circle.id)
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}

// MARK: - Offline texts

/// Download the collections this member's community is offered, to search with no signal.
struct OfflineTextsView: View {
    @Environment(AppModel.self) private var model
    @State private var list: OfflineCollections?
    @State private var kept: [OfflineLibrary.Kept] = OfflineLibrary().kept()
    @State private var working: String?
    @State private var error: String?
    private var w: Words { model.words }

    var body: some View {
        List {
            if let error { Section { Text(error).foregroundStyle(.red) } }
            Section { Text(w("library.offlineIntro")) }
            if let list {
                if !list.enabled {
                    Text(w("library.offlineOff"))
                } else {
                    ForEach(list.collections) { c in
                        let have = kept.first { $0.id == c.id }
                        VStack(alignment: .leading, spacing: 4) {
                            Text(c.title).font(.headline)
                            Text(w("library.offlineSize", ["size": ByteCountFormatter.string(fromByteCount: Int64(c.bytes), countStyle: .file), "passages": String(c.passages)]))
                                .font(.caption).foregroundStyle(.secondary)
                            if have != nil { Text(have?.version == c.version ? w("library.offlineKept") : w("library.offlineOld")).font(.caption) }
                        }
                        if working == c.id {
                            ProgressView()
                        } else if have == nil || have?.version != c.version {
                            Button(have == nil ? w("library.offlineDownload") : w("library.offlineUpdate")) { download(c) }
                                .accessibilityLabel("\(have == nil ? w("library.offlineDownload") : w("library.offlineUpdate")): \(c.title)")
                                .disabled(working != nil)
                        }
                        if have != nil {
                            Button(w("library.offlineRemove"), role: .destructive) { remove(c.id) }
                                .accessibilityLabel("\(w("library.offlineRemove")): \(c.title)")
                        }
                    }
                }
            } else if error == nil {
                ProgressView()
            }
        }
        .navigationTitle(w("library.offlineTitle"))
        .task { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        do {
            list = try await model.store.api.offlineCollections()
            // A copy of a collection no longer offered here is removed.
            if let list, list.enabled {
                for k in kept where !list.collections.contains(where: { $0.id == k.id }) { try? OfflineLibrary().remove(k.id) }
                kept = OfflineLibrary().kept()
            }
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func download(_ c: OfflineCollections.Item) {
        working = c.id
        Task {
            defer { working = nil }
            do {
                let data = try await model.store.api.downloadCollection(c.id)
                try OfflineLibrary().keep(c, data: data)
                kept = OfflineLibrary().kept()
                error = nil
            } catch {
                self.error = error.localizedDescription
            }
        }
    }

    private func remove(_ id: String) {
        try? OfflineLibrary().remove(id)
        kept = OfflineLibrary().kept()
    }
}
