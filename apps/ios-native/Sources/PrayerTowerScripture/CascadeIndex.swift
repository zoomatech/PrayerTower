import Foundation

// Ported unchanged from Winstons Syndicate (Packages/ZoomaBibleSearch/Sources/ZoomaBiblePassages/CascadeIndex.swift).

/// The owner's cascading text search over a translation's groups, with no model, as his test measured it
/// (~/Downloads/bible-search-test, run_cascade.py and run_hybrid_cascade.py, 29 October 2026): each group falls in the
/// first of four tiers it fits, and gets one number, `(5 - tier) * 1000` plus its score within the tier (at most 999):
/// 1. the whole question as a phrase, scored by how often;
/// 2. every essential word, scored by their occurrences;
/// 3. any essential word, scored 100 × the distinct words held (at most 9) + their occurrences (at most 99);
/// 4. every essential word's stem at the start of a word ("stab" in "stabbed"), scored by occurrences.
/// A group in no tier scores 0.
public struct CascadeIndex: Sendable {
    /// Each group's words, a space before and after each.
    let joined: [String]
    /// How often each word is in each group.
    let counts: [[String: Int]]
    /// The groups each word is in.
    let postings: [String: Set<Int>]

    public init(_ texts: [String]) {
        var joined: [String] = []
        var counts: [[String: Int]] = []
        var postings: [String: Set<Int>] = [:]
        for (i, text) in texts.enumerated() {
            let words = Self.words(text)
            joined.append(" " + words.joined(separator: " ") + " ")
            let count = words.reduce(into: [String: Int]()) { $0[$1, default: 0] += 1 }
            counts.append(count)
            for word in count.keys { postings[word, default: []].insert(i) }
        }
        self.joined = joined
        self.counts = counts
        self.postings = postings
    }

    /// Lower case, everything but a-z, 0-9 and white space made a space, split on white space.
    static func words(_ text: String) -> [String] {
        let kept = text.lowercased().unicodeScalars.map { scalar -> Character in
            switch scalar {
            case "a"..."z", "0"..."9": Character(scalar)
            default: scalar.properties.isWhitespace ? Character(scalar) : " "
            }
        }
        return String(kept).split(whereSeparator: \.isWhitespace).map(String.init)
    }

    /// The question's words that are neither stop words nor filler, each once, in order.
    static func essential(_ question: String) -> [String] {
        var seen: [String] = []
        for word in words(question) where !stop.contains(word) && !seen.contains(word) { seen.append(word) }
        return seen
    }

    static let suffixes = ["ing", "ed", "es", "er", "ly", "s"]

    static func stem(_ word: String) -> String {
        for suffix in suffixes where word.hasSuffix(suffix) && word.count - suffix.count >= 3 {
            return String(word.dropLast(suffix.count))
        }
        return word
    }

    /// How often `part` is in `text`, not overlapping.
    static func occurrences(of part: String, in text: String) -> Int {
        var count = 0
        var from = text.startIndex
        while let found = text.range(of: part, range: from..<text.endIndex) {
            count += 1
            from = found.upperBound
        }
        return count
    }

    /// Each group's one number for the question, in the groups' order.
    public func scores(_ question: String) -> [Float] {
        var tier = [Int](repeating: 0, count: joined.count)
        var within = [Int](repeating: 0, count: joined.count)
        func put(_ i: Int, _ t: Int, _ w: Int) {
            if tier[i] == 0 { tier[i] = t; within[i] = min(w, 999) }
        }
        let typed = Self.words(question)
        if !typed.isEmpty {
            let phrase = " " + typed.joined(separator: " ") + " "
            for (i, text) in joined.enumerated() where text.contains(phrase) {
                put(i, 1, Self.occurrences(of: phrase, in: text))
            }
        }
        let essential = Self.essential(question)
        if !essential.isEmpty {
            let sets = essential.map { postings[$0] ?? [] }
            for i in sets.dropFirst().reduce(sets[0], { $0.intersection($1) }).sorted() {
                put(i, 2, essential.reduce(0) { $0 + (counts[i][$1] ?? 0) })
            }
            for i in sets.reduce(Set<Int>(), { $0.union($1) }).sorted() {
                let distinct = essential.filter { counts[i][$0] != nil }.count
                let total = essential.reduce(0) { $0 + (counts[i][$1] ?? 0) }
                put(i, 3, 100 * min(distinct, 9) + min(total, 99))
            }
            let stems = essential.map { " " + Self.stem($0) }
            for (i, text) in joined.enumerated() where tier[i] == 0 && stems.allSatisfy({ text.contains($0) }) {
                put(i, 4, stems.reduce(0) { $0 + Self.occurrences(of: $1, in: text) })
            }
        }
        return tier.indices.map { tier[$0] > 0 ? Float((5 - tier[$0]) * 1000 + within[$0]) : 0 }
    }

    /// Scaled to run from 0 to 1 over the groups, as the owner's test does before blending.
    public static func minMax(_ values: [Float]) -> [Float] {
        guard let low = values.min(), let high = values.max() else { return values }
        return values.map { ($0 - low) / (high - low + 1e-12) }
    }

    /// Words a person puts round what they remember (the owner's test: "Question and filler words a person puts round
    /// what they remember, beyond the usual stop words"), and scikit-learn 1.9.1's English stop words.
    static let stop: Set<String> = Set(("who whom whose what where when which why how part one ones guy guys story stories thing things stuff really like know remember verse verses bible passage talks tells says got get "
        + "a about above across after afterwards again against all almost alone along already also although always am among amongst amoungst amount an and another any anyhow anyone anything anyway anywhere are around as at back be became because become becomes becoming been before beforehand behind being below beside besides between beyond bill both bottom but by call can cannot cant co con could couldnt cry de describe detail do done down due during each eg eight either eleven else elsewhere empty enough etc even ever every everyone everything everywhere except few fifteen fifty fill find fire first five for former formerly forty found four from front full further get give go had has hasnt have he hence her here hereafter hereby herein hereupon hers herself him himself his how however hundred i ie if in inc indeed interest into is it its itself keep last latter latterly least less ltd made many may me meanwhile might mill mine more moreover most mostly move much must my myself name namely neither never nevertheless next nine no nobody none noone nor not nothing now nowhere of off often on once one only onto or other others otherwise our ours ourselves out over own part per perhaps please put rather re same see seem seemed seeming seems serious several she should show side since sincere six sixty so some somehow someone something sometime sometimes somewhere still such system take ten than that the their them themselves then thence there thereafter thereby therefore therein thereupon these they thick thin third this those though three through throughout thru thus to together too top toward towards twelve twenty two un under until up upon us very via was we well were what whatever when whence whenever where whereafter whereas whereby wherein whereupon wherever whether which while whither who whoever whole whom whose why will with within without would yet you your yours yourself yourselves")
        .split(separator: " ").map(String.init))
}
