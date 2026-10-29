import Foundation

/// The kind cloud's verdict on a draft (`POST /moderation/precheck`). It never blocks a post.
public struct KindVerdict: Codable, Sendable, Equatable {
    public let level: String  // "ok" | "nudge" | "strong"
    public let reason: String?
}

/// A gentle redirect for a request that wishes harm, with any helplines.
public struct HarmNote: Codable, Sendable, Equatable {
    public struct Resource: Codable, Sendable, Equatable {
        public let name: String?
        public let label: String?
        public let phone: String?
        public let url: String?
    }
    public let category: String
    public let message: String
    public let resources: [Resource]?
}

public struct Precheck: Codable, Sendable, Equatable {
    public let warn: Bool
    public let cloud: KindVerdict?
    public let harm: HarmNote?
}

/// What the kind cloud shows, in the same words as apps/mobile (locales en.ts and neutral.ts).
public struct KindCloudNote: Sendable, Equatable {
    public let prayer: String
    public let harm: HarmNote?
    public let ask: String
    public let strong: Bool
    /// VoiceOver reads this once when the cloud appears or changes.
    public var spoken: String { ([KindCloud.label, harm?.message, ask].compactMap { $0 }).joined(separator: ". ") }
}

public enum KindCloud {
    /// How long to wait after typing stops before asking the server (the Expo app waits 700 ms).
    public static let wait: Duration = .milliseconds(700)
    public static let label = "A gentle note about your words"

    public static func prayer(_ wording: Wording) -> String {
        wording == .neutral
            ? "Take a breath. Kind words travel far."
            : "Set a guard over my mouth, Lord; keep watch over the door of my lips. (Psalm 141:3)"
    }

    /// Nothing at all while the draft is fine; otherwise the cloud's words.
    public static func note(for check: Precheck?, wording: Wording) -> KindCloudNote? {
        guard let check else { return nil }
        let verdict = check.cloud.flatMap { $0.level == "ok" ? nil : $0 }
        guard verdict != nil || check.harm != nil else { return nil }
        let strong = verdict?.level == "strong"
        let ask = strong
            ? "Words like these can really hurt someone. Telling us how much it hurts is always welcome. Are you sure you want to put that out there?"
            : "Are you sure you want to put that out there?"
        return KindCloudNote(prayer: prayer(wording), harm: check.harm, ask: ask, strong: strong)
    }
}

/// Kind words practice (`empathyPractice`, kind-words-card.tsx): a private weekly card on Me with a
/// short made-up moment and three replies; tapping one shows gently how it might land. No scores,
/// no streaks, and nothing tapped leaves the phone.
public enum KindWords {
    public static let moments = 6

    /// The same moment all week, a new one each Monday (UTC), as `momentFor` in the Expo app.
    public static func moment(for now: Date) -> Int {
        let monday = Int(floor((now.timeIntervalSince1970 / 86_400 + 3) / 7))
        return ((monday % moments) + moments) % moments
    }

    /// The word keys for this week's moment: the situation, and each reply with its note.
    public static func keys(for now: Date) -> (situation: String, replies: [(reply: String, note: String)]) {
        let s = "kindWords.s\(moment(for: now))"
        return ("\(s).situation", (0..<3).map { ("\(s).r\($0)", "\(s).n\($0)") })
    }
}
