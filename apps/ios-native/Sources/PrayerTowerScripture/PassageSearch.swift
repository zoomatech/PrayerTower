import Foundation

// The passage word search, ported unchanged from Winstons Syndicate (Packages/SyndicateCore/Sources/ZoomaReference/
// VerseSearch.swift: PassageHit, PassageWords, VerseLibrary.passageSearch). Synonyms from the Moby Thesaurus II (Grady
// Ward, public domain), Resources/KJVSynonyms.txt, copied from Winstons Syndicate. No Apple frameworks, so it also runs on Linux.

/// A verse found by the passage search, and whether its passage holds every word searched for.
public struct PassageHit: Equatable, Sendable {
    public let verse: ScriptureVerse
    public let complete: Bool
}

/// The forms the passage search compares: the KJV's own forms of a word count as the word (owner, 28 October
/// 2026: "do both", of searching larger passages and ranking with the KJV's forms, who/whom, you/thee/ye,
/// people/men, says/saith), and endings are taken off so "loveth", "loved" and "love" are one word.
enum PassageWords {
    static let kept: [String: String] = {
        let families = ["who whom whoso whosoever", "you ye thee thou your yours thy thine yourself yourselves thyself",
                        "people men", "i me", "say said says saying saith sayest", "speak spake"]
        var map = ScriptureWords.irregular
        for family in families { let forms = family.split(separator: " ").map(String.init); for form in forms { map[form] = forms[0] } }
        return map
    }()

    static func stem(_ word: String) -> String {
        if let known = kept[word] { return known }
        var word = word
        for ending in ["eth", "est", "ing", "ed", "es", "s"] where word.hasSuffix(ending) && word.count - ending.count >= 3 {
            word = String(word.dropLast(ending.count))
            break
        }
        if word.hasSuffix("e"), word.count > 3 { word = String(word.dropLast()) }
        return word
    }

    static func pairs(_ words: [String]) -> Set<String> {
        Set(zip(words, words.dropFirst()).map { $0 + " " + $1 })
    }

    /// Each word's synonyms that the KJV uses, from the Moby Thesaurus (public domain), each pair listed both ways
    /// (`Resources/KJVSynonyms.txt`, made by `Scripts/make-kjv-synonyms.py`) (owner, 28 October 2026: "make sure it
    /// checks for synonyms in a word search. rod = staff").
    static let synonyms: [String: [String]] = {
        guard let url = Bundle.module.url(forResource: "KJVSynonyms", withExtension: "txt", subdirectory: "Resources"),
              let text = try? String(contentsOf: url, encoding: .utf8) else { return [:] }
        var table: [String: [String]] = [:]
        for line in text.split(separator: "\n") {
            let parts = line.split(separator: "\t")
            if parts.count == 2 { table[String(parts[0])] = parts[1].split(separator: " ").map(String.init) }
        }
        return table
    }()

    /// The stems of a word's synonyms, found under the word as typed or with an ending taken off ("rods" as "rod").
    static func synonymStems(_ word: String) -> Set<String> {
        var forms = [word]
        for ending in ["es", "s", "ed", "d", "ing", "eth"] where word.hasSuffix(ending) && word.count - ending.count >= 3 {
            forms.append(String(word.dropLast(ending.count)))
        }
        guard let found = forms.lazy.compactMap({ synonyms[$0] }).first else { return [] }
        return Set(found.map(stem))
    }
}

extension VerseLibrary {
    /// The verses whose passage, the verse with the verses either side of it in the same book, holds the words
    /// searched for, best first: passages holding every word, then those holding every word or a synonym of it, then
    /// those holding at least half the words' weight, a rarer word weighing more and a synonym less than the word. Among
    /// equals, the verse holding the searched words most nearly in the order typed comes first, then the verse holding
    /// most of them. A passage gives one verse: a verse is left out when the verse beside it was already given. A word
    /// in more than one verse in ten (say, that, lord) is not widened to its synonyms.
    public func passageSearch(_ text: String) -> [PassageHit] {
        let typed = ScriptureWords.words(text)
        let searched = typed.map(PassageWords.stem)
        let total = Double(verses.count)
        var alternatives: [String: Set<String>] = [:]
        for (word, form) in zip(typed, searched) where Double(verseCount[form] ?? 0) < total / 10 {
            alternatives[form, default: []].formUnion(PassageWords.synonymStems(word).subtracting([form]).filter { verseCount[$0] != nil })
        }
        let weight = Set(searched).reduce(into: [String: Double]()) { weight, form in
            if let count = verseCount[form] { weight[form] = log(total / Double(count)) }
            else if let count = alternatives[form]?.compactMap({ verseCount[$0] }).max() { weight[form] = log(total / Double(count)) }
        }
        let whole = weight.values.reduce(0, +)
        guard !weight.isEmpty else { return [] }
        /// How much of a word the set holds: all of it, as written; most of it, as a synonym; or none.
        func held(_ form: String, in words: Set<String>) -> Double {
            if words.contains(form) { return 1 }
            if let other = alternatives[form], !other.isDisjoint(with: words) { return 0.8 }
            return 0
        }
        let searchedPairs = PassageWords.pairs(searched)
        struct Candidate { let index: Int; let complete: Bool; let withSynonyms: Bool; let passage: Double; let inOrder: Int; let own: Double }
        var candidates: [Candidate] = []
        for i in verses.indices {
            let own = Set(stems[i])
            let ownWeight = weight.reduce(0) { $0 + $1.value * held($1.key, in: own) }
            guard ownWeight > 0 else { continue }
            var passage = own
            if i > 0, verses[i - 1].book == verses[i].book { passage.formUnion(stems[i - 1]) }
            if i + 1 < verses.count, verses[i + 1].book == verses[i].book { passage.formUnion(stems[i + 1]) }
            let passageWeight = weight.reduce(0) { $0 + $1.value * held($1.key, in: passage) }
            guard passageWeight >= whole * 0.5 else { continue }
            candidates.append(Candidate(index: i, complete: weight.keys.allSatisfy { passage.contains($0) },
                                        withSynonyms: weight.keys.allSatisfy { held($0, in: passage) > 0 }, passage: passageWeight,
                                        inOrder: PassageWords.pairs(stems[i]).intersection(searchedPairs).count, own: ownWeight))
        }
        candidates.sort {
            if $0.complete != $1.complete { return $0.complete }
            if $0.withSynonyms != $1.withSynonyms { return $0.withSynonyms }
            if $0.passage != $1.passage { return $0.passage > $1.passage }
            if $0.inOrder != $1.inOrder { return $0.inOrder > $1.inOrder }
            if $0.own != $1.own { return $0.own > $1.own }
            return $0.index < $1.index
        }
        var given = Set<Int>()
        var hits: [PassageHit] = []
        for candidate in candidates where !given.contains(candidate.index - 1) && !given.contains(candidate.index + 1) {
            given.insert(candidate.index)
            hits.append(PassageHit(verse: verses[candidate.index], complete: candidate.complete))
        }
        return hits
    }
}
