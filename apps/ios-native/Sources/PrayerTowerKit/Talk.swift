import Foundation

/// Conversation helpers (docs/CONVERSATION_HELPERS.md), the same rules as apps/mobile/src/lib/talk.ts,
/// worked out on the device so nothing a member reads or types is sent anywhere for them.
public enum Talk {
    public enum Move: String, Sendable, Codable, CaseIterable {
        case greeting, howAreYou, thanks, trouble, goodNews, farewell
    }

    public static let packs = ["chinese", "korean", "arabic", "yoruba", "hebrew", "hawaiian"]
    public static let closingKeys = ["talk.closing1", "talk.closing2"]

    // Checked in this order: a message that thanks and says goodbye gets the thanks answered.
    private static let patterns: [(Move, String)] = [
        (.trouble, #"\b(pray(ers?)? for|please pray|struggl\w*|surgery|hospital|diagnos\w*|sick|scared|afraid|worried|anxious|hurting|lost (my|our) |grie\w*|depress\w*|lonely|can't cope|hard time|rough (day|week))\b"#),
        (.goodNews, #"\b(good news|great news|answered|got the job|healed|cancer[- ]free|it worked|praise (god|the lord)|thank god|we did it|so happy|engaged|the baby (is|was) born)\b"#),
        (.thanks, #"\b(thanks|thank you|thx|ty|grateful|appreciate)\b"#),
        (.howAreYou, #"\b(how are (you|u)|how're you|how have you been|how('s| is) it going|how are things)\b"#),
        (.farewell, #"\b(bye|goodbye|good night|goodnight|talk (soon|later)|see (you|ya)|gotta go|take care)\b"#),
        (.greeting, #"^\s*(hi|hello|hey|hiya|good (morning|afternoon|evening)|greetings|peace be with you|shalom|aloha|blessings)\b"#),
    ]
    private static let moves: [(Move, NSRegularExpression)] = patterns.map { ($0.0, try! NSRegularExpression(pattern: $0.1, options: .caseInsensitive)) }

    // A short, downbeat answer, the kind that often comes before a trouble is told.
    private static let downbeat = try! NSRegularExpression(
        pattern: #"^\s*(oh+|eh|meh|well|hmm+|ugh)\b[\s,.…]|\b(okay i guess|ok i guess|fine i guess|not (great|good|so good|too good)|could be better|been better|hanging in( there)?|so-so|not really|i don't know|idk|tired|exhausted|rough)\b"#,
        options: .caseInsensitive
    )

    private static func matches(_ re: NSRegularExpression, _ text: String) -> Bool {
        re.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)) != nil
    }

    /// The kind of move a message makes, or nil when no single reply fits.
    public static func move(of text: String?) -> Move? {
        guard let text, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
        return moves.first { matches($0.1, text) }?.0
    }

    /// The words key of the one reply that fits, or nil.
    public static func suggestionKey(lastFromOther: String?, empty: Bool) -> String? {
        guard let m = empty ? .greeting : move(of: lastFromOther) else { return nil }
        let names: [Move: String] = [
            .greeting: "Greeting", .howAreYou: "HowAreYou", .thanks: "Thanks", .trouble: "Trouble", .goodNews: "GoodNews", .farewell: "Farewell",
        ]
        return "talk.suggest\(names[m]!)"
    }

    /// The reply that pairs with the kind of post being answered. A lament gets presence, never advice.
    public static func pairKey(postType: String?, lament: Bool = false) -> String? {
        if lament { return "talk.pairs.lament" }
        return postType.map { "talk.pairs.\($0)" }
    }

    public static func isDownbeat(_ text: String?) -> Bool {
        guard let text, text.count <= 200 else { return false }
        return matches(downbeat, text)
    }

    /// A greeting → reply → follow-up chain for Counting patterns, as move labels only.
    public static func chain(_ first: String?, _ reply: String?, _ followup: String) -> [String]? {
        guard let opening = move(of: first), reply != nil else { return nil }
        return [opening.rawValue, move(of: reply)?.rawValue ?? "other", move(of: followup)?.rawValue ?? "other"]
    }

    /// The chips under a composer, as the Expo app's ReplyHelpers: each needs its Admin switch and
    /// the member's own choice. A tap only fills the box.
    public static func chips(
        features: Features, prefs: ConversationPrefs, words: Words, lastFromOther: String?, empty: Bool, postType: String? = nil
    ) -> [(label: String, hint: String?)] {
        var out: [(String, String?)] = []
        if features["replySuggestions"] && prefs.replySuggestions {
            let key = (features["typePrompts"] ? pairKey(postType: postType) : nil) ?? suggestionKey(lastFromOther: lastFromOther, empty: empty)
            if let key, words(key) != key { out.append((words(key), nil)) }
        }
        if features["greetingPacks"], let pack = prefs.greetingPack, empty {
            out.append((words("talk.packs.\(pack).greeting"), words("talk.packNote", ["pack": words("talk.packs.\(pack).name"), "note": words("talk.packs.\(pack).note")])))
        }
        if features["troubleNudge"] && prefs.troubleNudge && isDownbeat(lastFromOther) { out.append((words("talk.careAsk"), nil)) }
        if features["kindClosings"] && prefs.kindClosings && !empty { for k in closingKeys { out.append((words(k), nil)) } }
        return out
    }

    /// Whether any helper is switched on, so the member's choices are worth loading.
    public static func anyOn(_ f: Features) -> Bool {
        ["replySuggestions", "troubleNudge", "kindClosings", "greetingPacks", "ownWords", "meaningPrefs", "talkCounts"].contains { f[$0] }
    }
}

/// The member's own choices for the helpers (`GET /me/conversation-prefs`).
public struct ConversationPrefs: Codable, Sendable, Equatable {
    public var replySuggestions: Bool
    public var troubleNudge: Bool
    public var kindClosings: Bool
    public var greetingPack: String?
    public var shareCounts: Bool

    public init(replySuggestions: Bool = false, troubleNudge: Bool = false, kindClosings: Bool = false, greetingPack: String? = nil, shareCounts: Bool = false) {
        self.replySuggestions = replySuggestions
        self.troubleNudge = troubleNudge
        self.kindClosings = kindClosings
        self.greetingPack = greetingPack
        self.shareCounts = shareCounts
    }

    /// The PATCH body for one change.
    public static func patch(_ field: String, _ value: JSONValue) -> [String: JSONValue] { [field: value] }
}

private struct PrefsWrapper: Decodable { let prefs: ConversationPrefs }
private struct ChainCount: Encodable { let kind = "chain"; let moves: [String] }

extension APIClient {
    public func conversationPrefs() async throws -> ConversationPrefs { try await (get("/me/conversation-prefs") as PrefsWrapper).prefs }
    public func updateConversationPrefs(_ patch: [String: JSONValue]) async throws -> ConversationPrefs {
        try await (send(body(request("PATCH", "/me/conversation-prefs"), patch)) as PrefsWrapper).prefs
    }
    /// Move labels only: never words, never who.
    public func talkCount(chain moves: [String]) async throws -> Ignored { try await post("/talk-counts", body: ChainCount(moves: moves)) }
}
