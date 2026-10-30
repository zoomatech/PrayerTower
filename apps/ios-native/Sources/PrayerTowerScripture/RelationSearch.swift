#if canImport(NaturalLanguage)
import Foundation
import NaturalLanguage

// "Who did what" search, ported from Winstons Syndicate (ZoomaReference/VerseSearch.swift, VerseLibrary.search):
// a phrase such as "David slew Goliath" or "Jesus came unto Galilee" is read into subject, action and object with
// Apple's NaturalLanguage tagger, and verses are kept where that subject does that action to that object, in one
// clause, in the direction asked. Apple platforms only.

public enum VerseSearchScope: Int, CaseIterable, Sendable {
    case automatic = -1
    case relationship, related, subjectAction, subjectPlace
    public var title: String {
        switch self {
        case .automatic: "Automatic"
        case .relationship: "Full relationship"
        case .related: "Related actions / objects"
        case .subjectAction: "Subject + action"
        case .subjectPlace: "Subject + place"
        }
    }
}

public struct VerseSearchHit: Equatable, Sendable {
    public let verse: ScriptureVerse
    public let explanation: String
    public let expanded: Bool
}

public struct VerseBrowseSession: Sendable {
    public let query: RelationQuery
    public let hits: [VerseSearchHit]
    public private(set) var position = 0
    public var current: VerseSearchHit? { hits.indices.contains(position) ? hits[position] : nil }
    public var canPrevious: Bool { position > 0 }
    public var canNext: Bool { position + 1 < hits.count }
    public init(query: RelationQuery, hits: [VerseSearchHit]) { self.query = query; self.hits = hits }
    public mutating func move(_ delta: Int) {
        guard !hits.isEmpty else { return }
        position = min(hits.count - 1, max(0, position + delta))
    }
}

extension VerseLibrary {
    private func tokens(for verse: ScriptureVerse) -> [RelationLanguage.Token] {
        lock.lock(); let cached = tokenCache[verse.id] as? [RelationLanguage.Token]; lock.unlock()
        if let cached { return cached }
        let tokens = RelationLanguage.tokens(verse.text)
        lock.lock(); tokenCache[verse.id] = tokens; lock.unlock()
        return tokens
    }
    public func search(_ query: RelationQuery, scope requested: VerseSearchScope) -> [VerseSearchHit] {
        let scope: VerseSearchScope = requested == .automatic ? .relationship : requested
        let subject = RelationLanguage.words(query.subject)
        let object = query.object.map(RelationLanguage.words) ?? []
        let actions = scope == .related ? RelationVocabulary.family(of: query.action, in: RelationVocabulary.actions) : [query.action]
        let actionForms = actions.reduce(into: Set<String>()) { $0.formUnion(Self.forms(of: $1)) }
        let objectRoots: Set<String> = scope == .related && !query.objectIsNamed && object.count == 1
            ? RelationVocabulary.family(of: object[0], in: RelationVocabulary.objects) : Set(object)
        let objectForms = objectRoots.reduce(into: Set<String>()) { $0.formUnion(Self.forms(of: $1)) }
        var hits: [VerseSearchHit] = []
        for i in verses.indices {
            let vocabulary = words[i]
            guard subject.allSatisfy(vocabulary.contains) else { continue }
            if scope == .subjectPlace {
                guard !object.isEmpty, object.allSatisfy(vocabulary.contains) else { continue }
                hits.append(VerseSearchHit(verse: verses[i], explanation: "\(query.subject) + \(query.object!) · action unrestricted", expanded: true))
                continue
            }
            guard !vocabulary.isDisjoint(with: actionForms) else { continue }
            if scope != .subjectAction, !object.isEmpty, vocabulary.isDisjoint(with: objectForms) { continue }
            let ts = tokens(for: verses[i])
            var match: VerseSearchHit?
            for verb in ts where actionForms.contains(verb.word) {
                // Noun uses such as “God is love” are not a love-action match.
                guard verb.tag == .verb || verb.root != verb.word || RelationLanguage.irregular[verb.word] != nil else { continue }
                for start in ts.indices where start + subject.count <= ts.count {
                    let subjectTokens = Array(ts[start..<(start + subject.count)])
                    guard subjectTokens.map(\.word) == subject, let last = subjectTokens.last,
                          last.index < verb.index, last.clause == verb.clause else { continue }
                    let intervening = Array(ts[(last.index + 1)..<verb.index])
                    // A coordinated action can retain its subject across its previous objects:
                    // “David ... smote the Philistine, and slew him”. A new explicit subject cannot.
                    let possessives: Set<String> = ["his", "her", "their", "its", "my", "our", "thy", "your"]
                    let tail = intervening.lastIndex(where: { $0.word == "and" || $0.word == "but" }).map { Array(intervening.dropFirst($0 + 1)) } ?? intervening
                    guard !tail.contains(where: { $0.isNoun && !possessives.contains($0.word) && !RelationLanguage.auxiliaries.contains($0.root) }) else { continue }
                    let prior = ts[..<start].reversed().prefix { $0.clause == verb.clause && $0.segment == subjectTokens[0].segment && $0.word != "and" && $0.word != "but" }
                    guard !prior.contains(where: { ($0.tag == .verb || RelationLanguage.irregular[$0.word] != nil) && !RelationLanguage.auxiliaries.contains($0.root) }) else { continue }
                    let remaining = ts.filter { $0.index > verb.index && $0.clause == verb.clause }
                    var matchedObject = ""
                    var expandedObject = false
                    if scope != .subjectAction, !object.isEmpty {
                        if query.objectIsNamed || object.count > 1 {
                            guard let at = remaining.indices.first(where: { at in at + object.count <= remaining.count && Array(remaining[at..<(at + object.count)]).map(\.word) == object }) else { continue }
                            // In “the sea of Galilee”, Galilee modifies the head “sea”; it is
                            // not the direct object/destination named by a query for Galilee.
                            guard remaining[..<at].last(where: { $0.tag == .preposition })?.word != "of" else { continue }
                            if let role = query.objectRole {
                                guard RelationObjectRole.inWords(remaining[..<at].map(\.word)) == role else { continue }
                            }
                            matchedObject = remaining[at..<(at + object.count)].map(\.surface).joined(separator: " ")
                        } else {
                            guard let found = remaining.first(where: { objectForms.contains($0.word) }) else { continue }
                            let beforeObject = remaining.prefix { $0.index < found.index }
                            guard beforeObject.last(where: { $0.tag == .preposition })?.word != "of" else { continue }
                            if let role = query.objectRole {
                                guard RelationObjectRole.inWords(beforeObject.map(\.word)) == role else { continue }
                            }
                            matchedObject = found.surface
                            expandedObject = !Self.forms(of: object[0]).contains(found.word)
                        }
                    }
                    let expandedAction = !Self.forms(of: query.action).contains(verb.word)
                    var reason = "\(query.subject) → \(verb.surface)" + (scope == .subjectAction ? "" : query.objectRole.map { " " + $0.rawValue } ?? "") + (matchedObject.isEmpty ? "" : " → \(matchedObject)")
                    if intervening.contains(where: { ["not", "never", "neither"].contains($0.word) }) { reason += " · negated action" }
                    if expandedAction { reason += " · related action: \(query.action)" }
                    if expandedObject { reason += " · related object: \(query.object!)" }
                    match = VerseSearchHit(verse: verses[i], explanation: reason, expanded: expandedAction || expandedObject)
                    break
                }
                if match != nil { break }
            }
            if let match { hits.append(match) }
        }
        return hits.filter { !$0.expanded } + hits.filter(\.expanded)
    }
    static func forms(of root: String) -> Set<String> {
        var forms: Set<String> = [root, root + "s", root + "es", root + "ed", root + "ing", root + "eth", root + "est"]
        for (form, lemma) in RelationLanguage.irregular where lemma == root { forms.insert(form) }
        if root.hasSuffix("e") { let stem = String(root.dropLast()); forms.formUnion([root + "d", stem + "ing", stem + "eth", stem + "est"]) }
        if root.hasSuffix("y") { let stem = String(root.dropLast()); forms.formUnion([stem + "ies", stem + "ied"]) }
        if let last = root.last, !"aeiouwxy".contains(last), root.count > 2 { forms.formUnion([root + String(last) + "ed", root + String(last) + "ing", root + String(last) + "eth", root + String(last) + "est"]) }
        return forms
    }
}

#endif
