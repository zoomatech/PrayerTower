#if canImport(NaturalLanguage)
// Ported unchanged in behaviour from Winstons Syndicate (ZoomaReference/RelationQuery.swift). Apple platforms only.
import Foundation
import NaturalLanguage

public struct RelationQuery: Equatable, Sendable {
    public let subject: String
    public let action: String
    public let object: String?
    public let objectIsNamed: Bool
    public let objectIsPlace: Bool
    public let objectRole: RelationObjectRole?
    public var description: String { [subject, action + (objectRole.map { " " + $0.rawValue } ?? ""), object].compactMap { $0 }.joined(separator: " → ") }

    public enum ParseError: LocalizedError {
        case missingRelationship
        public var errorDescription: String? { "Enter a subject and verb, with an optional object or place." }
    }

    public static func parse(_ text: String) throws -> RelationQuery {
        let tokens = RelationLanguage.tokens(text)
        let ignored: Set<String> = ["what", "which", "who", "where", "when", "how", "verse", "verses", "passage", "passages", "reference", "references", "find", "show"]
        for i in tokens.indices where i > 0 {
            let verb = tokens[i]
            guard !RelationLanguage.auxiliaries.contains(verb.root), RelationLanguage.canBeVerb(verb) else { continue }
            var subjectEnd = i - 1
            while subjectEnd > 0, tokens[subjectEnd].tag == .adverb || RelationLanguage.auxiliaries.contains(tokens[subjectEnd].root) { subjectEnd -= 1 }
            let subjectToken = tokens[subjectEnd]
            guard subjectToken.isNoun, !ignored.contains(subjectToken.word), subjectToken.tag != .determiner else { continue }
            var start = subjectEnd
            // Proper names may have several words; a common noun remains its own subject.
            while start > 0, tokens[start].named, tokens[start - 1].named { start -= 1 }
            let subject = tokens[start...subjectEnd].map(\.surface).joined(separator: " ")
            let after = tokens.dropFirst(i + 1).filter { $0.isNoun && !ignored.contains($0.word) && !RelationLanguage.auxiliaries.contains($0.root) }
            let objectTokens: [RelationLanguage.Token]
            if let first = after.first {
                var values = [first]
                if first.named {
                    for t in after.dropFirst() { if t.named, t.index == values.last!.index + 1 { values.append(t) } else { break } }
                }
                objectTokens = values
            } else { objectTokens = [] }
            return RelationQuery(subject: subject, action: verb.root,
                                 object: objectTokens.isEmpty ? nil : objectTokens.map(\.surface).joined(separator: " "),
                                 objectIsNamed: objectTokens.contains(where: \.named),
                                 objectIsPlace: objectTokens.contains(where: { $0.nameType == .placeName }),
                                 objectRole: objectTokens.first.flatMap { first in
                                     RelationObjectRole.inWords(tokens[(i + 1)..<first.index].map(\.word))
                                 })
        }
        throw ParseError.missingRelationship
    }
}

/// Direction is retained when verbs are generalized: arriving at a place and leaving it
/// are different relationships, even though both are movement.
public enum RelationObjectRole: String, Equatable, Sendable {
    case to, from, inPlace = "in", through, against
    static func inWords(_ words: [String]) -> Self? {
        var role: Self?
        for word in words {
            switch word {
            case "to", "unto", "into", "toward", "towards": role = .to
            case "from", "out": role = .from
            case "in", "at", "within": role = .inPlace
            case "through": role = .through
            case "against": role = .against
            default: break
            }
        }
        return role
    }
}

/// A bounded, inspectable local vocabulary. Related actions are candidates, never assertions
/// that two words mean the same thing. Named entities are never replaced by their category.
public enum RelationVocabulary {
    public static let actions: [[String]] = [
        ["come", "go", "arrive", "enter", "depart", "return", "travel", "journey", "walk", "flee"],
        ["slay", "kill", "murder", "destroy"], ["weep", "cry", "mourn", "lament"],
        ["love", "cherish"], ["speak", "say", "tell", "proclaim"],
        ["give", "bestow", "grant", "provide"], ["heal", "cure", "restore"],
        ["rule", "reign", "govern"], ["teach", "instruct"], ["eat", "consume", "feed"]
    ]
    public static let objects: [[String]] = [
        ["world", "mankind", "humanity", "people"], ["child", "son", "daughter", "offspring"],
        ["city", "town", "village"], ["country", "land", "region", "province"]
    ]
    public static func family(of root: String, in groups: [[String]]) -> Set<String> {
        Set(groups.first { $0.contains(root) } ?? [root])
    }
}

struct RelationLanguage {
    struct Token {
        let index: Int
        let surface: String
        let word: String
        let root: String
        let tag: NLTag?
        let nameType: NLTag?
        let named: Bool
        let clause: Int
        let segment: Int
        var isNoun: Bool { tag == .noun || tag == .pronoun || named }
    }
    static let auxiliaries: Set<String> = ["be", "have", "do", "will", "shall", "would", "should", "can", "could", "may", "might", "must"]
    static let irregular = ScriptureWords.irregular
    static func words(_ text: String) -> [String] { ScriptureWords.words(text) }
    static func probe(_ word: String) -> (NLTag?, String?) {
        let text = "They \(word)."
        let t = NLTagger(tagSchemes: [.lexicalClass, .lemma]); t.string = text
        t.setLanguage(.english, range: text.startIndex..<text.endIndex)
        let at = text.index(text.startIndex, offsetBy: 5)
        return (t.tag(at: at, unit: .word, scheme: .lexicalClass).0,
                t.tag(at: at, unit: .word, scheme: .lemma).0?.rawValue.lowercased())
    }
    static func root(_ word: String, lemma: String?) -> String {
        if let known = irregular[word] { return known }
        if word.hasSuffix("eth") || word.hasSuffix("est") {
            let stem = String(word.dropLast(3))
            for candidate in [stem + "e", stem] {
                let p = probe(candidate)
                if p.0 == .verb, let l = p.1 { return irregular[l] ?? l }
            }
        }
        return lemma?.lowercased() ?? word
    }
    static func canBeVerb(_ token: Token) -> Bool {
        if token.tag == .verb { return true }
        if irregular[token.word] != nil { return true }
        if token.word.hasSuffix("eth") || token.word.hasSuffix("est"), token.root != token.word { return true }
        let p = probe(token.word)
        return p.0 == .verb && p.1 != nil
    }
    static func tokens(_ text: String) -> [Token] {
        let t = NLTagger(tagSchemes: [.lexicalClass, .lemma, .nameType]); t.string = text
        t.setLanguage(.english, range: text.startIndex..<text.endIndex)
        var result: [Token] = []; var previous = text.startIndex; var clause = 0; var segment = 0
        t.enumerateTags(in: text.startIndex..<text.endIndex, unit: .word, scheme: .lexicalClass, options: [.omitPunctuation, .omitWhitespace]) { tag, range in
            if text[previous..<range.lowerBound].contains(where: { ".;:!?".contains($0) }) { clause += 1 }
            if text[previous..<range.lowerBound].contains(where: { ",.;:!?".contains($0) }) { segment += 1 }
            let surface = String(text[range]); let word = surface.lowercased()
            let lemma = t.tag(at: range.lowerBound, unit: .word, scheme: .lemma).0?.rawValue
            let name = t.tag(at: range.lowerBound, unit: .word, scheme: .nameType).0
            let named = name == .personalName || name == .placeName || name == .organizationName
                || (surface.first?.isUppercase == true && tag == .noun)
            result.append(Token(index: result.count, surface: surface, word: word, root: root(word, lemma: lemma), tag: tag, nameType: name, named: named, clause: clause, segment: segment))
            previous = range.upperBound; return true
        }
        return result
    }
}
#endif
