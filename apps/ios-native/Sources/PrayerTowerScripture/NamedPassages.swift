import Foundation

// Popular names for passages whose words are not in the text itself ("the golden rule", "Noah's ark"), each leading
// straight to its Bible passages and to the older or other tellings in the library's collections, and sayings people
// misremember, each to its real source or a note that it is not in the Bible (Resources/NamedPassages.json; Steve,
// 5 November 2026: "Ok put em all in"). "A story I remember" shows them first, then its three searches as always.

public struct NamedPassage: Decodable, Sendable, Equatable {
    /// A passage of another collection: by its exact reference (with its work where references repeat) or by words it
    /// holds, and how many passages from there.
    public struct Side: Decodable, Sendable, Equatable {
        public let collection: String
        public let ref: String?
        public let find: String?
        public let workId: String?
        public let count: Int?
    }

    /// The names it is known by, in lower case, the first the usual one.
    public let names: [String]
    /// A short description, searched for when what was typed comes near a name without matching it.
    public let about: String
    /// Bible references: "Exodus 21:23-25".
    public let bible: [String]
    public let texts: [Side]
    /// Shown above the passages: where a saying really comes from, or how an older text tells it.
    public let note: String?
}

public enum NamedPassages {
    private struct File: Decodable { let format_version: Int; let entries: [NamedPassage] }

    public static let all: [NamedPassage] = {
        guard let url = Bundle.module.url(forResource: "NamedPassages", withExtension: "json", subdirectory: "Resources"),
              let data = try? Data(contentsOf: url),
              let file = try? JSONDecoder().decode(File.self, from: data), file.format_version == 1 else { return [] }
        return file.entries
    }()

    /// Lower case, apostrophes dropped ("Noah's" is "noahs"), everything but letters and digits a space.
    static func words(_ text: String) -> [String] {
        text.lowercased().replacingOccurrences(of: "'", with: "").replacingOccurrences(of: "\u{2019}", with: "")
            .split { !$0.isLetter && !$0.isNumber }.map(String.init)
    }

    /// The entries one of whose names was typed, its words together and in order, the one with the longest such name
    /// first; each entry once.
    public static func named(_ typed: String, in entries: [NamedPassage] = all) -> [NamedPassage] {
        let have = words(typed)
        guard !have.isEmpty else { return [] }
        var found: [(entry: NamedPassage, length: Int, order: Int)] = []
        for (order, entry) in entries.enumerated() {
            let longest = entry.names.map(words).filter { name in
                !name.isEmpty && name.count <= have.count
                    && (0...(have.count - name.count)).contains { Array(have[$0..<($0 + name.count)]) == name }
            }.map(\.count).max()
            if let longest { found.append((entry, longest, order)) }
        }
        return found.sorted { $0.length != $1.length ? $0.length > $1.length : $0.order < $1.order }.map(\.entry)
    }

    /// When no name was typed: the entry one of whose names of two words or more (not counting "the", "of" and the like)
    /// comes near what was typed, every word
    /// of it there as written, with an ending ("arks"), or with one letter wrong ("goliah"); its description is then
    /// searched for with what was typed.
    public static func near(_ typed: String, in entries: [NamedPassage] = all) -> NamedPassage? {
        let have = words(typed)
        func close(_ a: String, _ b: String) -> Bool {
            if a == b || CascadeIndex.stem(a) == CascadeIndex.stem(b) { return true }
            return min(a.count, b.count) >= 5 && distance(a, b) <= 1
        }
        var best: (entry: NamedPassage, words: Int)?
        for entry in entries {
            for name in entry.names.map(words) where name.filter({ !CascadeIndex.stop.contains($0) }).count >= 2
                && name.allSatisfy({ w in have.contains { close($0, w) } }) {
                if best == nil || name.count > best!.words { best = (entry, name.count) }
            }
        }
        return best?.entry
    }

    /// How many letters must change, be added or be taken away to make one word the other.
    static func distance(_ a: String, _ b: String) -> Int {
        let a = Array(a), b = Array(b)
        guard !a.isEmpty, !b.isEmpty else { return max(a.count, b.count) }
        var row = Array(0...b.count)
        for i in 1...a.count {
            var next = [i] + [Int](repeating: 0, count: b.count)
            for j in 1...b.count { next[j] = min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] == b[j - 1] ? 0 : 1)) }
            row = next
        }
        return row[b.count]
    }
}

#if canImport(Darwin)
extension HybridTextSearch {
    /// The collection a place among them all is in, and where it is there.
    public func collection(of place: Int) -> String { collections[self.place[place].collection].id }
    public func index(of place: Int) -> Int { self.place[place].index }

    /// Where a named side's passages are, as places among all the collections; none when its collection isn't searched.
    public func places(_ side: NamedPassage.Side) -> [Int] {
        guard let c = collections.firstIndex(where: { $0.id == side.collection }), let first = start[side.collection] else { return [] }
        let passages = collections[c].passages
        guard let at = passages.firstIndex(where: { p in
            (side.workId == nil || p.workId == side.workId)
                && (side.ref.map { p.ref == $0 } ?? false || side.find.map { p.text.contains($0) } ?? false)
        }) else { return [] }
        return (at..<min(at + (side.count ?? 1), passages.count)).map { first + $0 }
    }
}
#endif

extension VerseLibrary {
    /// A Bible reference's verses ("Exodus 21:23-25"), in order.
    public func verses(_ reference: String) -> [ScriptureVerse] {
        guard let ref = VerseReference(reference) else { return [] }
        let wanted = Set(ref.ids)
        return verses.filter { wanted.contains($0.id) }
    }
}
