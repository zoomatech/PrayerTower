import Foundation

/// The six actions on a card (`ACTION_ORDER` in packages/shared). Every design shows them as ONE
/// row of icons (Steve, 2026-10-29); the name shows on a long press or pointer hover.
public enum CardAction: String, CaseIterable, Sendable, Codable {
    case prayingNow = "praying_now"
    case commit
    case encouragement
    case wellWishes = "well_wishes"
    case share
    case giftTokens = "gift_tokens"

    /// The same glyphs as `ACTION_ICONS` in apps/mobile/src/components/post-card.tsx.
    public var icon: String {
        switch self {
        case .prayingNow: "💜"
        case .commit: "🙏"
        case .encouragement: "✉️"
        case .wellWishes: "🤍"
        case .share: "↗"
        case .giftTokens: "🎁"
        }
    }

    /// `ACTION_LABELS` in packages/shared, with Open Circle's words from neutral.ts where they differ.
    public func name(_ wording: Wording) -> String {
        switch (self, wording) {
        case (.prayingNow, .faith): "Praying Now"
        case (.prayingNow, .neutral): "Thinking of You"
        case (.commit, .faith): "Commit to Pray"
        case (.commit, .neutral): "Promise to Check In"
        case (.encouragement, _): "Encourage"
        case (.wellWishes, _): "Well Wishes"
        case (.share, _): "Share"
        case (.giftTokens, _): "Gift Tokens"
        }
    }

    /// The emoji whose meanings ride on this action (`ACTION_EMOJI` in meaning-chooser.tsx).
    public var meaningEmoji: String? {
        switch self {
        case .prayingNow: "praying"
        case .wellWishes: "love"
        case .encouragement: "support"
        case .commit: "strength"
        case .share, .giftTokens: nil
        }
    }
}

/// "faith" = Prayer Tower's wording; "neutral" = Open Circle's, with no religious words.
public enum Wording: String, Sendable {
    case faith, neutral
    public init(_ community: Community?) { self = community?.wording == "neutral" ? .neutral : .faith }
}

/// An emoji and its up-to-five positive meanings (`GET /reaction-meanings`); the first is what a tap adds.
public struct MeaningEmoji: Codable, Sendable, Equatable, Identifiable {
    public let key: String
    public let emoji: String
    public let meanings: [Meaning]
    public var id: String { key }

    public struct Meaning: Codable, Sendable, Equatable, Identifiable {
        public let key: String
        public let label: String
        public let neutralLabel: String
        public var id: String { key }
        public func word(_ wording: Wording) -> String { wording == .neutral ? neutralLabel : label }
    }
}

/// A meaning someone chose on a post (`GET /posts/:id/meanings`).
public struct MeaningLeaf: Codable, Sendable, Equatable {
    public let emoji: String
    public let icon: String
    public let meaning: String
    public let label: String
    public let neutralLabel: String
    public let count: Int
    public let mine: Bool
}

/// One icon in the row: what it shows, what VoiceOver and the long-press tip say, and its meanings.
public struct ActionItem: Sendable, Equatable, Identifiable {
    public let action: CardAction
    public let icon: String
    public let name: String
    /// The emoji's meanings, only while both meaning switches are on.
    public let meanings: MeaningEmoji?
    public var id: String { action.rawValue }

    /// "💜 Praying · Holding you · …": the tip's second line.
    public func meaningWords(_ wording: Wording) -> String? {
        guard let m = meanings else { return nil }
        return "\(m.emoji) " + m.meanings.prefix(5).map { $0.word(wording) }.joined(separator: " · ")
    }
}

public enum ActionRow {
    /// The row for one card: the card's own actions in the server's order, never more than one row.
    /// Meanings join the icons only when `meaningReactions` and `meaningIconRow` are both on.
    public static func items(actions: [String], features: Features, tree: [MeaningEmoji], wording: Wording) -> [ActionItem] {
        let on = features["meaningReactions"] && features["meaningIconRow"]
        return actions.compactMap(CardAction.init(rawValue:)).map { a in
            ActionItem(action: a, icon: a.icon, name: a.name(wording), meanings: on ? tree.first { $0.key == a.meaningEmoji } : nil)
        }
    }
}

/// Which app a build is (Info.plist PTEdition), as the Expo app's EXPO_PUBLIC_EDITION: Prayer
/// Tower, or the separately branded, non-religious Open Circle, which always uses the neutral
/// words and signs new members up to the Open Circle community.
public enum Edition: String, Sendable {
    case prayerTower = "prayer-tower", openCircle = "open-circle"
    public init(_ info: [String: Any]?) { self = (info?["PTEdition"] as? String) == "open-circle" ? .openCircle : .prayerTower }
    /// Each edition's link scheme (prayertower://, opencircle://).
    public static let schemes: Set<String> = ["prayertower", "opencircle"]
    public var scheme: String { self == .openCircle ? "opencircle" : "prayertower" }
}
